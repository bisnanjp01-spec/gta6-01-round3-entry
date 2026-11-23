// hud.js — HUD + canvas minimap for Costa Verde.
import { WORLD_W, WORLD_H, isRoadCell, CITY_W, CITY_H, BLOCK } from './city.js';

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23f' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = '#7a5b00';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHUD(ctx, state, vw, vh) {
  const p = state.player;
  ctx.save();
  // Top-left panel: health, cash, ammo, car.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(10, 10, 240, 86, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px Verdana';
  ctx.textAlign = 'left';
  ctx.fillText('MARA VOSS', 22, 30);
  // Health bar.
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 38, 150, 12);
  ctx.fillStyle = p.health > 40 ? '#37d67a' : '#e74c3c';
  ctx.fillRect(22, 38, 150 * Math.max(0, p.health / 100), 12);
  ctx.fillStyle = '#fff';
  ctx.font = '12px Verdana';
  ctx.fillText(`HP ${Math.ceil(p.health)}`, 178, 49);
  ctx.fillStyle = '#7CFC98';
  ctx.font = 'bold 15px Verdana';
  ctx.fillText(`$${Math.floor(state.cash)}`, 22, 72);
  ctx.fillStyle = '#9fd8ff';
  ctx.font = '12px Verdana';
  const ride = p.car ? `${p.car.name} — E to exit` : 'On foot — E near a car to steal';
  ctx.fillText(ride, 22, 88);
  // Wanted stars, top-right.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(vw - 190, 10, 180, 40, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Verdana';
  ctx.fillText('WANTED', vw - 178, 27);
  for (let i = 0; i < 5; i++) drawStar(ctx, vw - 118 + i * 22, 32, 9, i < state.police.wanted);
  // Mission objective bar, top-centre.
  const obj = state.missions.objectiveText();
  ctx.font = 'bold 13px Verdana';
  const w = Math.min(560, ctx.measureText(obj).width + 24);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect(vw / 2 - w / 2, 10, w, 30, 8); ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.textAlign = 'center';
  ctx.fillText(obj, vw / 2, 29);
  // Timed stage countdown.
  const st = state.missions.currentStage();
  if (st && st.timed && state.missions.timer > 0) {
    ctx.fillStyle = state.missions.timer < 20 ? '#ff5252' : '#ffd23f';
    ctx.font = 'bold 20px Verdana';
    ctx.fillText(`⏱ ${Math.ceil(state.missions.timer)}s`, vw / 2, 64);
  }
  // Toast message.
  if (state.missions.messageT > 0 && state.missions.message) {
    ctx.font = 'bold 15px Verdana';
    const tw = Math.min(640, ctx.measureText(state.missions.message).width + 28);
    ctx.fillStyle = 'rgba(20,40,20,0.85)';
    ctx.beginPath(); ctx.roundRect(vw / 2 - tw / 2, vh - 96, tw, 32, 8); ctx.fill();
    ctx.fillStyle = '#d6ffd6';
    ctx.fillText(state.missions.message, vw / 2, vh - 74);
  }
  // Controls hint, bottom-left.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.roundRect(10, vh - 34, 330, 24, 6); ctx.fill();
  ctx.fillStyle = '#ddd';
  ctx.font = '11px Verdana';
  ctx.textAlign = 'left';
  ctx.fillText('WASD move/drive · E enter car · Click/F shoot · Space punch · P pause', 18, vh - 17);
  ctx.restore();
}

export function drawMinimap(ctx, state, vw, vh) {
  const MW = 168, MH = 126;
  const mx = vw - MW - 12, my = vh - MH - 12;
  const sx = MW / WORLD_W, sy = MH / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath(); ctx.roundRect(mx - 4, my - 4, MW + 8, MH + 8, 8); ctx.fill();
  // Grass base so roads read against the blocks.
  ctx.fillStyle = '#1d3a24';
  ctx.fillRect(mx, my, MW, MH);
  // Roads.
  ctx.fillStyle = '#3a3f4a';
  for (let cy = 0; cy < CITY_H; cy++) {
    for (let cx = 0; cx < CITY_W; cx++) {
      if (isRoadCell(cx, cy)) ctx.fillRect(mx + cx * (MW / CITY_W), my + cy * (MH / CITY_H), MW / CITY_W + 0.5, MH / CITY_H + 0.5);
    }
  }
  // Mission marker (pulsing green diamond).
  const mk = state.missions.marker();
  if (mk) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.5;
    ctx.fillStyle = '#37d67a';
    ctx.save();
    ctx.translate(mx + mk.x * sx, my + mk.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.restore();
  }
  // Cars (white dots), police (red/blue flash), player (yellow arrow).
  ctx.fillStyle = '#fff';
  for (const c of state.traffic.cars) ctx.fillRect(mx + c.x * sx - 1, my + c.y * sy - 1, 2, 2);
  for (const cop of state.police.cops) {
    ctx.fillStyle = Math.sin(state.time * 8) > 0 ? '#ff2a2a' : '#2a6bff';
    ctx.beginPath(); ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  const p = state.player;
  ctx.fillStyle = '#ffd23f';
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.angle);
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Viewport rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + state.cam.x * sx, my + state.cam.y * sy, vw * sx, vh * sy);
  ctx.restore();
}
