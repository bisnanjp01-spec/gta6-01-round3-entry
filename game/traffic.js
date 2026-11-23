// Emberline — traffic and pedestrians: the city stays alive around the
// player. Traffic cars cruise the road grid and turn at intersections;
// pedestrians stroll the sidewalks and scatter when shots are fired.
import { makeRng, clamp, distance } from "./rng.js";
import { makeCar, stepVehicle, CAR_COLORS } from "./drive.js";
import { isOnRoad, WORLD_W, WORLD_H } from "./harbor.js";

export function makeTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    cars.push(spawnTrafficCar(city, rng));
  }
  const peds = [];
  for (let i = 0; i < 34; i++) {
    peds.push(spawnPed(city, rng));
  }
  return { cars, peds };
}

function spawnTrafficCar(city, rng) {
  const vertical = rng.chance(0.5);
  const road = rng.pick(vertical ? city.roadsV : city.roadsH);
  const along = rng.range(100, (vertical ? WORLD_H : WORLD_W) - 100);
  const x = vertical ? road : along;
  const y = vertical ? along : road;
  const angle = vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
  const car = makeCar(x, y, angle, rng.pick(CAR_COLORS), rng.pick(["sedan", "sedan", "truck", "sport"]));
  car.driver = "traffic";
  car.cruise = rng.range(120, 210);
  return car;
}

function spawnPed(city, rng) {
  const vertical = rng.chance(0.5);
  const road = rng.pick(vertical ? city.roadsV : city.roadsH);
  const along = rng.range(80, (vertical ? WORLD_H : WORLD_W) - 80);
  return {
    x: vertical ? road + (rng.chance(0.5) ? 44 : -44) : along,
    y: vertical ? along : road + (rng.chance(0.5) ? 44 : -44),
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 55),
    color: rng.pick(["#f5d76e", "#e74c3c", "#3498db", "#9b59b6", "#1abc9c", "#ecf0f1"]),
    alive: true, radius: 13, fleeX: 0, fleeY: 0, fleeT: 0,
    tx: 0, ty: 0, retarget: 0,
  };
}

export function stepTraffic(city, state, dt, playerX, playerY, gunfireX, gunfireY) {
  const rng = state.rng;
  // Traffic cars: cruise their road, turn at intersections, keep distance.
  for (const car of state.traffic.cars) {
    const nearIntersection =
      city.roadsV.some((rx) => Math.abs(car.x - rx) < 14) &&
      city.roadsH.some((ry) => Math.abs(car.y - ry) < 14);
    if (nearIntersection && rng.chance(0.012)) {
      car.angle += (rng.chance(0.5) ? 1 : -1) * (Math.PI / 2);
      car.angle = Math.round(car.angle / (Math.PI / 2)) * (Math.PI / 2);
    }
    let throttle = 0.55;
    for (const other of state.traffic.cars) {
      if (other === car) continue;
      const d = distance(car.x, car.y, other.x, other.y);
      if (d < 64) {
        const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
        if (ahead > 0) throttle = -0.2;
      }
    }
    // Slow for the player blocking the road.
    const pd = distance(car.x, car.y, playerX, playerY);
    if (pd < 70) {
      const ahead = Math.cos(car.angle) * (playerX - car.x) + Math.sin(car.angle) * (playerY - car.y);
      if (ahead > 0) throttle = -0.3;
    }
    stepVehicle(city, car, { throttle, steer: 0, brake: throttle < 0 }, dt);
    // Snap back onto the road grid if a turn drifted it off.
    if (!isOnRoad(city, car.x, car.y)) {
      car.angle += 0.03;
    }
    if (car.x < 60 || car.x > WORLD_W - 60 || car.y < 60 || car.y > WORLD_H - 60) {
      Object.assign(car, spawnTrafficCar(city, rng));
    }
  }
  // Pedestrians: stroll, flee gunfire, avoid water.
  for (const p of state.traffic.peds) {
    if (!p.alive) continue;
    if (gunfireX !== null && distance(p.x, p.y, gunfireX, gunfireY) < 260) {
      p.fleeX = p.x - gunfireX;
      p.fleeY = p.y - gunfireY;
      p.fleeT = 1.6;
    }
    p.retarget -= dt;
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      const d = Math.hypot(p.fleeX, p.fleeY) || 1;
      p.x += (p.fleeX / d) * 130 * dt;
      p.y += (p.fleeY / d) * 130 * dt;
      p.angle = Math.atan2(p.fleeY, p.fleeX);
    } else {
      if (p.retarget <= 0) {
        const vertical = rng.chance(0.5);
        const road = rng.pick(vertical ? city.roadsV : city.roadsH);
        p.tx = vertical ? road + (rng.chance(0.5) ? 44 : -44) : rng.range(80, WORLD_W - 80);
        p.ty = vertical ? rng.range(80, WORLD_H - 80) : road + (rng.chance(0.5) ? 44 : -44);
        p.retarget = rng.range(3, 8);
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        p.x += (dx / d) * p.speed * dt;
        p.y += (dy / d) * p.speed * dt;
        p.angle = Math.atan2(dy, dx);
      }
    }
    p.x = clamp(p.x, 20, WORLD_W - 20);
    p.y = clamp(p.y, 20, WORLD_H - 20);
  }
}
