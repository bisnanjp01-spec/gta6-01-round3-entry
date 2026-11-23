// police.js — wanted stars + Verde PD pursuit.
import { TILE, CITY_W, CITY_H, mulberry32 } from './city.js';
import { makeCar } from './traffic.js';

export class Police {
  constructor() {
    this.wanted = 0;            // 0..5 stars
    this.cops = [];
    this.rng = mulberry32(4242);
    this.heat = 0;              // 0..1, builds while committing crimes
    this.quietTimer = 0;        // seconds with no cop nearby
    this.flash = 0;             // lightbar animation phase
  }

  addHeat(amount, state) {
    if (this.wanted >= 5) return;
    this.heat += amount;
    const need = [0, 0.25, 0.55, 0.9, 1.3, 1.8][this.wanted + 1] || 99;
    if (this.heat >= need) {
      this.wanted = Math.min(5, this.wanted + 1);
      this.heat = 0;
      this.quietTimer = 0;
      if (state) state.bestWanted = Math.max(state.bestWanted, this.wanted);
    }
  }

  setWanted(n, state) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.heat = 0;
    this.quietTimer = 0;
    if (state) state.bestWanted = Math.max(state.bestWanted, this.wanted);
  }

  // Spawn a cop car at a road point near (but not on top of) the player.
  spawnCop(player) {
    const a = this.rng() * Math.PI * 2;
    const d = 320 + this.rng() * 160;
    const x = Math.max(TILE, Math.min(CITY_W * TILE - TILE, player.x + Math.cos(a) * d));
    const y = Math.max(TILE, Math.min(CITY_H * TILE - TILE, player.y + Math.sin(a) * d));
    const c = makeCar(x, y, 'sedan', 'cop');
    c.color = '#1a1a1a';
    c.maxSpeed = 150 + this.wanted * 22;
    c.w = 36; c.h = 18;
    this.cops.push(c);
    return c;
  }

  update(dt, player, onRam) {
    this.flash += dt * 6;
    const wantCount = this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 7);
    while (this.cops.length < wantCount) this.spawnCop(player);
    while (this.cops.length > wantCount) this.cops.pop();
    let nearest = Infinity;
    for (const cop of this.cops) {
      const dx = player.x - cop.x;
      const dy = player.y - cop.y;
      const dist = Math.hypot(dx, dy);
      nearest = Math.min(nearest, dist);
      // Chase: steer toward the player, faster with more stars.
      const target = Math.atan2(dy, dx);
      let da = target - cop.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      cop.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, da));
      cop.speed += ((cop.maxSpeed * 0.92) - cop.speed) * Math.min(1, dt * 0.8);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.x = Math.max(8, Math.min(CITY_W * TILE - 8, cop.x));
      cop.y = Math.max(8, Math.min(CITY_H * TILE - 8, cop.y));
      // Ram: contact damages the player (or their car).
      if (dist < 34) {
        if (player.car) {
          player.car.speed *= 0.55;
          player.health = Math.max(0, player.health - 4 * dt * 10);
          if (onRam) onRam(cop);
        } else {
          // On foot: shoved away from the cop, not toward them.
          player.health = Math.max(0, player.health - 25 * dt);
          player.x += (dx / (dist || 1)) * 40 * dt * 10;
          player.y += (dy / (dist || 1)) * 40 * dt * 10;
        }
        cop.speed *= 0.4;
      }
    }
    // Cool down: if no cop is close for a while, lose a star.
    if (this.wanted > 0) {
      if (nearest > 420) {
        this.quietTimer += dt;
        if (this.quietTimer > 9) {
          this.wanted -= 1;
          this.quietTimer = 0;
          this.heat = 0;
        }
      } else {
        this.quietTimer = 0;
      }
    }
  }

  draw(ctx, cam, vw, vh) {
    for (const cop of this.cops) {
      if (cop.x < cam.x - 60 || cop.y < cam.y - 60 || cop.x > cam.x + vw + 60 || cop.y > cam.y + vh + 60) continue;
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-cop.w / 2 + 3, -cop.h / 2 + 3, cop.w, cop.h);
      ctx.fillStyle = '#151515';
      ctx.beginPath(); ctx.roundRect(-cop.w / 2, -cop.h / 2, cop.w, cop.h, 5); ctx.fill();
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-cop.w * 0.1, -cop.h / 2, cop.w * 0.2, cop.h);
      ctx.fillStyle = '#1a3a8a';
      ctx.fillRect(-cop.w * 0.28, -cop.h / 2 + 2, cop.w * 0.18, cop.h - 4);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText('PD', cop.w * 0.28, 2);
      // Flashing lightbar.
      const red = Math.sin(this.flash) > 0;
      ctx.fillStyle = red ? '#ff2a2a' : '#2a6bff';
      ctx.beginPath(); ctx.arc(-2, -cop.h / 2 - 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = red ? '#2a6bff' : '#ff2a2a';
      ctx.beginPath(); ctx.arc(4, -cop.h / 2 - 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
