// traffic.js — AI traffic cars on the road grid + pedestrians on sidewalks.
import { TILE, CITY_W, CITY_H, isRoad, isRoadCell, mulberry32, BLOCK } from './city.js';

export const CAR_TYPES = {
  sedan:   { w: 34, h: 17, maxSpeed: 120, color: '#c94f4f', name: 'Sedan' },
  taxi:    { w: 34, h: 17, maxSpeed: 130, color: '#f2c200', name: 'Taxi' },
  sports:  { w: 36, h: 16, maxSpeed: 210, color: '#2e86de', name: 'Sports' },
  van:     { w: 40, h: 19, maxSpeed: 95,  color: '#7d8a96', name: 'Van' },
  pickup:  { w: 38, h: 18, maxSpeed: 140, color: '#5da85d', name: 'Pickup' },
};

function randRoadPoint(rng) {
  // Pick a random road cell centre.
  for (let tries = 0; tries < 40; tries++) {
    const cx = Math.floor(rng() * CITY_W);
    const cy = Math.floor(rng() * CITY_H);
    if (isRoadCell(cx, cy)) return { x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE };
  }
  return { x: TILE * 1.5, y: TILE * 1.5 };
}

export function makeCar(x, y, type, driver) {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    x, y, angle: 0, speed: 0, type, w: t.w, h: t.h,
    maxSpeed: t.maxSpeed, color: t.color, name: t.name,
    driver: driver || 'none', // 'player' | 'ai' | 'none' (parked)
    parked: driver === 'none',
    aiDir: 0, // 0=E 1=S 2=W 3=N for traffic AI
    stuck: 0,
  };
}

export class Traffic {
  constructor() {
    this.cars = [];
    this.peds = [];
    this.rng = mulberry32(777);
  }

  spawnInitial() {
    const types = Object.keys(CAR_TYPES);
    // Parked cars along roads.
    for (let i = 0; i < 16; i++) {
      const p = randRoadPoint(this.rng);
      const c = makeCar(p.x + (this.rng() * 20 - 10), p.y + (this.rng() * 20 - 10), types[i % types.length], 'none');
      c.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][i % 4];
      this.cars.push(c);
    }
    // Moving traffic.
    for (let i = 0; i < 12; i++) {
      const p = randRoadPoint(this.rng);
      const c = makeCar(p.x, p.y, types[Math.floor(this.rng() * types.length)], 'ai');
      c.aiDir = Math.floor(this.rng() * 4);
      c.angle = c.aiDir * Math.PI / 2;
      c.speed = 40 + this.rng() * 50;
      this.cars.push(c);
    }
    // Pedestrians.
    for (let i = 0; i < 26; i++) {
      const p = randRoadPoint(this.rng);
      this.peds.push({
        x: p.x + (this.rng() * 30 - 15), y: p.y + (this.rng() * 30 - 15),
        angle: this.rng() * Math.PI * 2, speed: 22 + this.rng() * 18,
        color: ['#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#ecf0f1', '#34495e'][i % 6],
        walkPhase: this.rng() * 6, changeIn: 2 + this.rng() * 4,
      });
    }
  }

  nearestStealable(x, y, maxDist) {
    let best = null; let bestD = maxDist;
    for (const c of this.cars) {
      if (c.driver === 'player') continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt, player, onCarHit) {
    // --- AI traffic cars ---
    for (const c of this.cars) {
      if (c.driver !== 'ai') continue;
      // At intersections, sometimes turn.
      const cx = Math.floor(c.x / TILE), cy = Math.floor(c.y / TILE);
      const nearCentre = Math.abs(c.x - (cx + 0.5) * TILE) < 6 && Math.abs(c.y - (cy + 0.5) * TILE) < 6;
      if (nearCentre && cx % BLOCK === 0 && cy % BLOCK === 0 && this.rng() < 0.02) {
        c.aiDir = Math.floor(this.rng() * 4);
      }
      const target = c.aiDir * Math.PI / 2;
      let da = target - c.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, da));
      // Slow down if another car is right ahead.
      let blocked = false;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const ahead = dx * Math.cos(c.angle) + dy * Math.sin(c.angle);
        const side = Math.abs(-dx * Math.sin(c.angle) + dy * Math.cos(c.angle));
        if (ahead > 0 && ahead < 46 && side < 18) { blocked = true; break; }
      }
      const want = blocked ? 0 : c.maxSpeed * 0.55;
      c.speed += (want - c.speed) * Math.min(1, dt * 1.5);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      // Keep inside the city; bounce back by turning around.
      if (!isRoad(c.x, c.y) || c.x < TILE || c.y < TILE || c.x > CITY_W * TILE - TILE || c.y > CITY_H * TILE - TILE) {
        c.aiDir = (c.aiDir + 2) % 4;
        c.x = Math.max(TILE, Math.min(CITY_W * TILE - TILE, c.x));
        c.y = Math.max(TILE, Math.min(CITY_H * TILE - TILE, c.y));
      }
      // Player collision with a traffic car: bump + damage.
      if (player && player.car === c) continue;
      if (player) {
        const d = Math.hypot(c.x - player.x, c.y - player.y);
        if (d < 30) {
          if (player.car) {
            player.car.speed *= 0.5;
            c.speed = 0;
            if (onCarHit) onCarHit(c, 6);
          } else if (player.hitCd <= 0) {
            // On-foot hit: damage once, then a short mercy window so one
            // passing car cannot drain the whole health bar in a second.
            player.hitCd = 0.8;
            player.health = Math.max(0, player.health - 12);
            player.x += (player.x - c.x) * 0.6;
            player.y += (player.y - c.y) * 0.6;
            if (onCarHit) onCarHit(c, 0);
          }
        }
      }
    }
    // --- Pedestrians ---
    for (const p of this.peds) {
      p.changeIn -= dt;
      if (p.changeIn <= 0) {
        p.angle += (this.rng() - 0.5) * 2.2;
        p.changeIn = 2 + this.rng() * 4;
      }
      const nx = p.x + Math.cos(p.angle) * p.speed * dt;
      const ny = p.y + Math.sin(p.angle) * p.speed * dt;
      // Peds prefer to stay near roads/sidewalks; turn away from deep blocks.
      if (isRoad(nx, ny) || this.rng() < 0.3) { p.x = nx; p.y = ny; }
      else { p.angle += Math.PI / 2; }
      p.x = Math.max(8, Math.min(CITY_W * TILE - 8, p.x));
      p.y = Math.max(8, Math.min(CITY_H * TILE - 8, p.y));
      p.walkPhase += dt * 8;
    }
  }

  drawCar(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 3, c.w, c.h);
    // Body.
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.fillRect(-c.w * 0.18, -c.h / 2 + 3, c.w * 0.32, c.h - 6);
    ctx.fillStyle = '#bcd6e8';
    ctx.fillRect(c.w * 0.14, -c.h / 2 + 3, 3, c.h - 6);
    // Headlights.
    ctx.fillStyle = '#ffe98a';
    ctx.fillRect(c.w / 2 - 2, -c.h / 2 + 2, 2, 4);
    ctx.fillRect(c.w / 2 - 2, c.h / 2 - 6, 2, 4);
    if (c.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 8px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    ctx.restore();
  }

  draw(ctx, cam, vw, vh) {
    // Parked + traffic cars.
    for (const c of this.cars) {
      if (c.x < cam.x - 60 || c.y < cam.y - 60 || c.x > cam.x + vw + 60 || c.y > cam.y + vh + 60) continue;
      this.drawCar(ctx, c);
    }
    // Pedestrians: little walking figures.
    for (const p of this.peds) {
      if (p.x < cam.x - 30 || p.y < cam.y - 30 || p.x > cam.x + vw + 30 || p.y > cam.y + vh + 30) continue;
      const bob = Math.sin(p.walkPhase) * 1.5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(1, 3, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, bob * 0.3, 6, 0, Math.PI * 2); ctx.fill(); // head
      ctx.fillRect(-4, 4 + bob * 0.2, 8, 10); // body
      ctx.fillStyle = '#222';
      ctx.fillRect(-4, 13, 3, 5); ctx.fillRect(1, 13, 3, 5); // legs
      ctx.restore();
    }
  }
}
