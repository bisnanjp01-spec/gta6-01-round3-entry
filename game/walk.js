// Emberline — on foot: Mara Voss walks, sprints, punches and shoots.
// Shooting is aimed with the mouse; bullets are short-lived, deterministic
// projectiles resolved against the same fixed timestep as everything else.
import { clamp, distance, angleTo } from "./rng.js";
import { isWater, buildingHit, WORLD_W, WORLD_H } from "./harbor.js";

export function makeWalker(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    health: 100, armor: 0, ammo: 24, hasGun: false,
    punchCooldown: 0, shootCooldown: 0, moving: false,
  };
}

export function stepWalker(city, w, input, dt) {
  // input: { mx, my (move -1..1), sprint, aimX, aimY }
  const sprint = input.sprint ? 1.55 : 1;
  const top = 165 * sprint;
  const tx = input.mx * top;
  const ty = input.my * top;
  w.x += tx * dt;
  w.y += ty * dt;
  w.moving = Math.abs(input.mx) + Math.abs(input.my) > 0.1;
  if (input.aimX !== undefined && input.aimY !== undefined) {
    w.angle = angleTo(w.x, w.y, input.aimX, input.aimY);
  } else if (w.moving) {
    w.angle = angleTo(0, 0, tx, ty);
  }
  const b = buildingHit(city, w.x, w.y, 13);
  if (b) {
    const cx = clamp(w.x, b.x, b.x + b.w);
    const cy = clamp(w.y, b.y, b.y + b.h);
    const dx = w.x - cx;
    const dy = w.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < 13) {
      w.x += (dx / d) * (13 - d);
      w.y += (dy / d) * (13 - d);
    }
  }
  if (isWater(city, w.x, w.y)) {
    // The river is chest-deep at the banks: wading is slow and cold.
    w.x -= tx * dt * 0.75;
    w.y -= ty * dt * 0.75;
  }
  w.x = clamp(w.x, 16, WORLD_W - 16);
  w.y = clamp(w.y, 16, WORLD_H - 16);
  w.punchCooldown = Math.max(0, w.punchCooldown - dt);
  w.shootCooldown = Math.max(0, w.shootCooldown - dt);
  return w;
}

export function makeBullet(x, y, angle, owner) {
  return { x, y, angle, speed: 620, life: 0.55, owner, dead: false };
}

export function stepBullets(city, bullets, targets, dt, onHit) {
  // targets: [{x, y, radius, damage(amount, from), alive}] — cops, peds, player.
  for (const b of bullets) {
    if (b.dead) continue;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0 || buildingHit(city, b.x, b.y, 2)) {
      b.dead = true;
      continue;
    }
    for (const t of targets) {
      if (!t.alive) continue;
      if (t === b.owner) continue;
      if (distance(b.x, b.y, t.x, t.y) < t.radius) {
        b.dead = true;
        onHit(t, b);
        break;
      }
    }
  }
  return bullets.filter((b) => !b.dead);
}

export function damageWalker(w, amount) {
  let left = amount;
  if (w.armor > 0) {
    const absorbed = Math.min(w.armor, left * 0.6);
    w.armor -= absorbed;
    left -= absorbed;
  }
  w.health = Math.max(0, w.health - left);
  return w.health <= 0;
}
