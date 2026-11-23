// Emberline — vehicles: street cars you can steal and boats you can sail
// on the river and the harbor bay. One small arcade physics model serves
// both: throttle, steering that bites harder at speed, drag, and damage
// from hard impacts.
import { clamp, distance } from "./rng.js";
import { isWater, buildingHit, WORLD_W, WORLD_H } from "./harbor.js";

export const CAR_COLORS = ["#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#eccc68", "#ff6b81", "#a55eea", "#f1f2f6"];

export function makeCar(x, y, angle, color, kind) {
  return {
    kind: kind || "sedan", x, y, angle, speed: 0,
    color: color || "#ff4757", health: 100, stolen: false,
    driver: null, // "player" | "traffic" | "police" | null (parked)
    maxSpeed: kind === "sport" ? 430 : kind === "truck" ? 300 : 360,
    accel: kind === "sport" ? 260 : 200,
  };
}

export function makeBoat(x, y, angle) {
  return {
    kind: "boat", x, y, angle, speed: 0,
    color: "#2ee6ff", health: 100, stolen: false,
    driver: null, maxSpeed: 330, accel: 170,
  };
}

function collideWorld(city, v, radius) {
  const b = buildingHit(city, v.x, v.y, radius);
  if (b) {
    const cx = clamp(v.x, b.x, b.x + b.w);
    const cy = clamp(v.y, b.y, b.y + b.h);
    const dx = v.x - cx;
    const dy = v.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const push = radius - d + 1;
    if (d < radius) {
      v.x += (dx / d) * push;
      v.y += (dy / d) * push;
      if (Math.abs(v.speed) > 120) {
        v.health = Math.max(0, v.health - (Math.abs(v.speed) - 120) / 14);
      }
      v.speed *= 0.35;
    }
  }
  v.x = clamp(v.x, 24, WORLD_W - 24);
  v.y = clamp(v.y, 24, WORLD_H - 24);
}

export function stepVehicle(city, v, input, dt) {
  // input: { throttle: -1..1, steer: -1..1, brake: bool }
  const onWater = v.kind === "boat";
  if (onWater) {
    if (!isWater(city, v.x, v.y)) {
      // Beached: a boat out of the water barely moves.
      v.speed *= 0.92;
    }
  } else if (isWater(city, v.x, v.y)) {
    // A car that drives into the river stalls and sinks: heavy drag.
    v.speed *= 0.86;
    v.health = Math.max(0, v.health - 12 * dt);
  }
  const grip = onWater ? 0.55 : 1;
  if (input.throttle > 0) v.speed += v.accel * input.throttle * dt;
  if (input.throttle < 0) v.speed += v.accel * input.throttle * 0.7 * dt;
  if (input.brake) v.speed *= Math.pow(0.12, dt);
  v.speed -= v.speed * (onWater ? 0.35 : 0.55) * dt;
  v.speed = clamp(v.speed, -v.maxSpeed * 0.45, v.maxSpeed);
  const steerPower = 2.1 * grip * clamp(Math.abs(v.speed) / 140, 0.15, 1);
  v.angle += input.steer * steerPower * dt * (v.speed >= 0 ? 1 : -1);
  v.x += Math.cos(v.angle) * v.speed * dt;
  v.y += Math.sin(v.angle) * v.speed * dt;
  collideWorld(city, v, v.kind === "boat" ? 26 : 20);
  return v;
}

export function vehicleNear(list, x, y, radius) {
  let best = null;
  let bestD = radius;
  for (const v of list) {
    const d = distance(x, y, v.x, v.y);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
