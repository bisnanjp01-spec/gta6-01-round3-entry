// Emberline — the wanted system and the Emberline Port Police. Wanted
// runs 0–5 stars: patrol cars chase and ram, foot officers chase on foot,
// boats join on the water, a helicopter circles at 4+ stars, and roadblocks
// go up at 3+ stars. Hide out of sight and the heat cools.
import { clamp, distance, angleTo, turnToward } from "./rng.js";
import { makeCar, makeBoat, stepVehicle } from "./drive.js";
import { nearestRoadPoint, isWater } from "./harbor.js";

export const WANTED_NAMES = ["Clean", "Suspicious", "Wanted", "Hunted", "Man-hunt", "City Lockdown"];

export function makeCops() {
  return {
    wanted: 0, heat: 0, // heat 0..100 feeds the star level
    cars: [], officers: [], boats: [],
    heli: null, heliAngle: 0,
    roadblocks: [],
    bustTimer: 0, coolTimer: 0,
  };
}

export function addHeat(cops, amount) {
  cops.heat = clamp(cops.heat + amount, 0, 100);
  const stars = cops.heat <= 0 ? 0 : cops.heat < 18 ? 1 : cops.heat < 38 ? 2 : cops.heat < 58 ? 3 : cops.heat < 80 ? 4 : 5;
  if (stars > cops.wanted) cops.wanted = stars;
}

function spawnCopCar(city, rng, x, y) {
  const spot = nearestRoadPoint(city, x, y);
  const car = makeCar(spot.x, spot.y, 0, "#1c2733", "sedan");
  car.driver = "police";
  car.maxSpeed = 400;
  car.siren = true;
  return car;
}

export function stepCops(city, state, dt) {
  const cops = state.cops;
  const rng = state.rng;
  const px = state.player.x;
  const py = state.player.y;
  const inVehicle = !!state.vehicle;
  const onWater = state.vehicle ? state.vehicle.kind === "boat" : isWater(city, px, py);

  // Wanted stars only fall when no officer can see the player.
  const nearest = nearestCopDistance(cops, px, py);
  if (cops.wanted > 0 && nearest > 520) {
    cops.coolTimer += dt;
    if (cops.coolTimer > 6) {
      cops.heat = Math.max(0, cops.heat - 9 * dt);
      const stars = cops.heat <= 0 ? 0 : cops.heat < 18 ? 1 : cops.heat < 38 ? 2 : cops.heat < 58 ? 3 : cops.heat < 80 ? 4 : 5;
      cops.wanted = stars;
    }
  } else {
    cops.coolTimer = 0;
  }

  // Reinforcements arrive until the street has the right number of units.
  const wantCars = cops.wanted === 0 ? 0 : cops.wanted === 1 ? 1 : cops.wanted === 2 ? 2 : cops.wanted === 3 ? 3 : cops.wanted === 4 ? 4 : 5;
  if (!onWater) {
    while (cops.cars.length < wantCars) {
      const a = rng.range(0, Math.PI * 2);
      cops.cars.push(spawnCopCar(city, rng, px + Math.cos(a) * 700, py + Math.sin(a) * 700));
    }
  }
  if (onWater && cops.wanted >= 2) {
    while (cops.boats.length < 2) {
      const a = rng.range(0, Math.PI * 2);
      const b = makeBoat(px + Math.cos(a) * 420, py + Math.sin(a) * 420, 0);
      b.driver = "police";
      cops.boats.push(b);
    }
  }
  if (cops.wanted >= 4 && !cops.heli) {
    cops.heli = { x: px + 300, y: py - 300, angle: 0 };
  }
  if (cops.wanted < 4) cops.heli = null;
  if (cops.wanted >= 3 && cops.roadblocks.length === 0) {
    const spot = nearestRoadPoint(city, px + 500, py);
    cops.roadblocks.push({ x: spot.x, y: spot.y, vertical: spot.vertical, ttl: 40 });
  }
  for (const rb of cops.roadblocks) rb.ttl -= dt;
  cops.roadblocks = cops.roadblocks.filter((rb) => rb.ttl > 0);

  // Chase: cars steer toward the player and ram.
  for (const car of cops.cars) {
    const target = angleTo(car.x, car.y, px, py);
    const diff = Math.abs(((target - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const steer = diff > 0.08 ? ((((target - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0 ? 1 : -1) : 0;
    const dist = distance(car.x, car.y, px, py);
    stepVehicle(city, car, { throttle: dist > 90 ? 1 : 0.6, steer, brake: false }, dt);
    if (dist < 46 && !inVehicle) {
      // An officer reaches the player on foot: the bust begins.
      cops.bustTimer += dt;
    }
    if (dist < 40 && inVehicle && state.vehicle) {
      state.vehicle.health = Math.max(0, state.vehicle.health - 26 * dt);
      car.speed *= 0.6;
    }
  }
  cops.cars = cops.cars.filter((c) => c.health > 0 && distance(c.x, c.y, px, py) < 1600);

  // Foot officers spill out of a stopped car when the player is on foot.
  if (!inVehicle && cops.wanted > 0 && cops.officers.length < cops.wanted) {
    const near = cops.cars.find((c) => distance(c.x, c.y, px, py) < 420);
    if (near) {
      cops.officers.push({ x: near.x + 24, y: near.y, angle: 0, speed: 150, alive: true, radius: 14, shootT: 1.2 });
    }
  }
  for (const o of cops.officers) {
    if (!o.alive) continue;
    const d = distance(o.x, o.y, px, py);
    const a = angleTo(o.x, o.y, px, py);
    o.angle = a;
    const chaseSpeed = d > 240 ? 185 : 150;
    o.x += Math.cos(a) * chaseSpeed * dt;
    o.y += Math.sin(a) * chaseSpeed * dt;
    o.shootT -= dt;
    if (d < 320 && d > 60 && cops.wanted >= 2 && o.shootT <= 0) {
      o.shootT = 1.6;
      state.pendingShots.push({ x: o.x, y: o.y, angle: a + (rng.next() - 0.5) * 0.3, owner: o, damage: 9 });
    }
    if (d < 34) cops.bustTimer += dt;
  }
  cops.officers = cops.officers.filter((o) => o.alive && distance(o.x, o.y, px, py) < 1400);

  // Police boats chase on the water.
  for (const b of cops.boats) {
    const target = angleTo(b.x, b.y, px, py);
    const steer = turnToward(b.angle, target, 1.6 * dt) - b.angle;
    stepVehicle(city, b, { throttle: 0.9, steer: clamp(steer * 2, -1, 1), brake: false }, dt);
  }
  cops.boats = cops.boats.filter((b) => b.health > 0 && distance(b.x, b.y, px, py) < 1500);

  // Helicopter circles overhead and keeps the spotlight on the player.
  if (cops.heli) {
    cops.heliAngle += dt * 0.5;
    cops.heli.x = px + Math.cos(cops.heliAngle) * 220;
    cops.heli.y = py + Math.sin(cops.heliAngle) * 220 - 120;
  }

  // Busted: an officer holds the player for 1.5 seconds.
  if (cops.bustTimer > 0 && nearest > 60 && inVehicle) cops.bustTimer = 0;
  if (cops.bustTimer > 1.5) {
    state.events.push({ type: "busted" });
    cops.bustTimer = 0;
  }
}

export function nearestCopDistance(cops, x, y) {
  let best = Infinity;
  for (const c of cops.cars) best = Math.min(best, distance(x, y, c.x, c.y));
  for (const o of cops.officers) if (o.alive) best = Math.min(best, distance(x, y, o.x, o.y));
  for (const b of cops.boats) best = Math.min(best, distance(x, y, b.x, b.y));
  return best;
}

export function clearWanted(cops) {
  cops.wanted = 0;
  cops.heat = 0;
  cops.cars = [];
  cops.officers = [];
  cops.boats = [];
  cops.heli = null;
  cops.roadblocks = [];
  cops.bustTimer = 0;
}
