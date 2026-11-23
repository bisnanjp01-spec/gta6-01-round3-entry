// traffic.js — ambient life for Port Azura: cars driving the road grid and
// pedestrians strolling the sidewalks. Traffic cars follow avenues and streets,
// turn at intersections, and brake when something is right in front of them.
const TRAFFIC_CAR_NAMES = ["Comet", "Sundown", "Vela", "Tortoise", "Palm Runner",
  "Azura GT", "Mule", "Harbor Van", "Cortez", "Breeze"];

function makeTrafficCar(city, nearX, nearY) {
  const horizontal = randChance(0.5);
  let x, y, angle;
  if (horizontal) {
    y = randPick(STREET_Y) + randPick([-24, 24]);
    x = nearX !== undefined ? clampValue(nearX + randRange(-500, 500), 60, CITY_WIDTH - 60) : randRange(60, CITY_WIDTH - 60);
    angle = randChance(0.5) ? 0 : Math.PI;
  } else {
    x = randPick(AVENUE_X) + randPick([-24, 24]);
    y = nearY !== undefined ? clampValue(nearY + randRange(-500, 500), 60, CITY_HEIGHT - 60) : randRange(60, CITY_HEIGHT - 60);
    angle = randChance(0.5) ? Math.PI / 2 : -Math.PI / 2;
  }
  return {
    x, y, angle, speed: randRange(70, 130), maxSpeed: randRange(90, 150),
    color: randPick(CAR_COLORS), name: randPick(TRAFFIC_CAR_NAMES),
    driver: null, isPolice: false, stolen: false,
    lane: (Math.abs(Math.sin(angle)) < 0.5) ? "h" : "v",
    turnCooldown: randRange(1, 4),
  };
}

function makeParkedCar(city) {
  const road = randPick(AVENUE_X.concat(STREET_Y));
  const vertical = AVENUE_X.includes(road);
  let x, y, angle;
  if (vertical) {
    x = road + randPick([-58, 58]);
    y = randRange(120, CITY_HEIGHT - 120);
    angle = randChance(0.5) ? Math.PI / 2 : -Math.PI / 2;
  } else {
    y = road + randPick([-58, 58]);
    x = randRange(120, CITY_WIDTH - 120);
    angle = randChance(0.5) ? 0 : Math.PI;
  }
  if (pointInBuilding(city, x, y, 4)) return null;
  return {
    x, y, angle, speed: 0, maxSpeed: 170,
    color: randPick(CAR_COLORS), name: randPick(TRAFFIC_CAR_NAMES),
    driver: null, isPolice: false, stolen: false, parked: true,
  };
}

function createTraffic(city, player) {
  const cars = [];
  for (let i = 0; i < 16; i++) cars.push(makeTrafficCar(city, player.x, player.y));
  for (let i = 0; i < 10; i++) {
    const parked = makeParkedCar(city);
    if (parked) cars.push(parked);
  }
  const peds = [];
  for (let i = 0; i < 26; i++) peds.push(makePedestrian(city, player.x, player.y));
  return { cars, peds };
}

function makePedestrian(city, nearX, nearY) {
  const p = nearestRoadPoint(
    nearX !== undefined ? nearX + randRange(-600, 600) : randRange(100, CITY_WIDTH - 100),
    nearY !== undefined ? nearY + randRange(-600, 600) : randRange(100, CITY_HEIGHT - 100));
  return {
    x: p.x + randRange(-70, 70), y: p.y + randRange(-70, 70),
    angle: randRange(0, Math.PI * 2), speed: randRange(28, 55),
    color: randPick(["#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22", "#ecf0f1"]),
    panic: 0, walkPhase: randRange(0, Math.PI * 2),
  };
}

function updateTraffic(traffic, dt, city, player, game) {
  // Keep the streets busy: top traffic back up near the player.
  while (traffic.cars.length < 22) traffic.cars.push(makeTrafficCar(city, player.x, player.y));
  while (traffic.peds.length < 26) traffic.peds.push(makePedestrian(city, player.x, player.y));
  for (const car of traffic.cars) {
    if (car.driver === "player" || car.parked) continue;
    car.turnCooldown -= dt;
    const ahead = carAheadBlocked(traffic, car, player);
    const target = ahead ? 0 : car.maxSpeed;
    car.speed = lerpValue(car.speed, target, 1 - Math.pow(0.05, dt));
    // At an intersection, sometimes turn onto the crossing road.
    if (car.turnCooldown <= 0 && nearIntersection(car)) {
      car.turnCooldown = randRange(2, 6);
      if (randChance(0.4)) {
        car.angle += randPick([-Math.PI / 2, Math.PI / 2]);
        car.lane = car.lane === "h" ? "v" : "h";
        snapCarToLane(car);
      }
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (car.x < 40 || car.x > CITY_WIDTH - 40 || car.y < 40 || car.y > CITY_HEIGHT - 40) {
      const fresh = makeTrafficCar(city, player.x, player.y);
      Object.assign(car, fresh);
    }
  }
  for (const ped of traffic.peds) {
    ped.walkPhase += dt * 6;
    const speed = ped.panic > 0 ? 150 : ped.speed;
    if (ped.panic > 0) ped.panic -= dt;
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    if (randChance(0.004) || ped.x < 30 || ped.x > CITY_WIDTH - 30 || ped.y < 30 || ped.y > CITY_HEIGHT - 30) {
      ped.angle = randRange(0, Math.PI * 2);
      ped.x = clampValue(ped.x, 40, CITY_WIDTH - 40);
      ped.y = clampValue(ped.y, 40, CITY_HEIGHT - 40);
    }
    // Pedestrians stay out of buildings.
    collideCircleWithBuildings(city, ped, 8);
  }
}

function nearIntersection(car) {
  for (const ax of AVENUE_X) {
    for (const sy of STREET_Y) {
      if (distanceBetween(car.x, car.y, ax, sy) < 46) return true;
    }
  }
  return false;
}

function snapCarToLane(car) {
  if (car.lane === "h") {
    let best = STREET_Y[0], bd = 1e9;
    for (const sy of STREET_Y) { const d = Math.abs(car.y - sy); if (d < bd) { bd = d; best = sy; } }
    car.y = best + (Math.sin(car.angle) > 0 ? 24 : -24);
  } else {
    let best = AVENUE_X[0], bd = 1e9;
    for (const ax of AVENUE_X) { const d = Math.abs(car.x - ax); if (d < bd) { bd = d; best = ax; } }
    car.x = best + (Math.cos(car.angle) > 0 ? 24 : -24);
  }
}

function carAheadBlocked(traffic, car, player) {
  const ax = car.x + Math.cos(car.angle) * 52;
  const ay = car.y + Math.sin(car.angle) * 52;
  for (const other of traffic.cars) {
    if (other === car) continue;
    if (distanceBetween(ax, ay, other.x, other.y) < 34) return true;
  }
  if (player && !player.inCar && distanceBetween(ax, ay, player.x, player.y) < 30) return true;
  return false;
}

function nearestCarTo(cars, x, y, maxDist) {
  let best = null, bd = maxDist;
  for (const car of cars) {
    const d = distanceBetween(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
