// main.js — Costa Verde entry point: loop, input, player, driving, combat, camera.
import { TILE, CITY_W, CITY_H, WORLD_W, WORLD_H, buildCity, drawCity, isRoad } from './city.js';
import { Traffic, CAR_TYPES } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { drawHUD, drawMinimap } from './hud.js';
import { AudioSys } from './audio.js';
import { loadSave, saveGame, clearSave } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = canvas.width, VH = canvas.height;
const $ = (id) => document.getElementById(id);

const city = buildCity();
const saved = loadSave();

const state = {
  time: 0,
  mode: 'menu', // menu | playing | paused | busted
  cash: saved ? saved.cash : 0,
  bestWanted: saved ? saved.bestWanted : 0,
  audioMuted: saved ? saved.muted : false,
  audio: new AudioSys(),
  traffic: new Traffic(),
  police: new Police(),
  missions: new Missions(),
  cam: { x: 0, y: 0 },
  keys: {},
  mouse: { x: VW / 2, y: VH / 2, clicked: false },
  bullets: [],
  particles: [],
  skids: [],
  shake: 0,
  player: null,
};
state.audio.setMuted(state.audioMuted);
if (saved) {
  state.missions.index = Math.min(saved.missionIndex, 3);
  state.missions.completed = saved.completed.slice();
  if (state.missions.index >= 3) state.missions.done = true;
}
window.COSTA = state; // exposed for automated smoke tests

// ---------- player ----------
function spawnPlayer(x, y) {
  // hitCd: mercy window after a traffic-car hit, so one car can't multi-hit.
  return { x, y, angle: -Math.PI / 2, speed: 0, health: 100, car: null, fireCd: 0, punchCd: 0, hitCd: 0 };
}
state.player = spawnPlayer(18.5 * TILE, 16.5 * TILE); // on the north-south road by the plaza
state.traffic.spawnInitial();

function inBuilding(x, y, r) {
  for (const b of city.buildings) {
    if (b.park) continue;
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}
function moveWithCollision(ent, dx, dy, r) {
  const nx = ent.x + dx;
  if (!inBuilding(nx, ent.y, r)) ent.x = nx;
  const ny = ent.y + dy;
  if (!inBuilding(ent.x, ny, r)) ent.y = ny;
  ent.x = Math.max(10, Math.min(WORLD_W - 10, ent.x));
  ent.y = Math.max(10, Math.min(WORLD_H - 10, ent.y));
}

// ---------- combat ----------
function shoot() {
  const p = state.player;
  if (p.car || p.fireCd > 0) return;
  p.fireCd = 0.28;
  const wx = state.cam.x + state.mouse.x;
  const wy = state.cam.y + state.mouse.y;
  const a = Math.atan2(wy - p.y, wx - p.x);
  p.angle = a;
  state.bullets.push({ x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.9 });
  state.audio.shoot();
  // Muzzle flash particles.
  for (let i = 0; i < 5; i++) {
    state.particles.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 120 + (Math.random() - 0.5) * 80, vy: Math.sin(a) * 120 + (Math.random() - 0.5) * 80, life: 0.18, color: '#ffd23f', size: 3 });
  }
}

function punch() {
  const p = state.player;
  if (p.car || p.punchCd > 0) return;
  p.punchCd = 0.4;
  state.audio.punch();
  const fx = p.x + Math.cos(p.angle) * 24, fy = p.y + Math.sin(p.angle) * 24;
  const hit = (list, onHit) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      if (Math.hypot(t.x - fx, t.y - fy) < 26) { onHit(t, i); return true; }
    }
    return false;
  };
  if (hit(state.police.cops, (cop) => {
    cop.hp = (cop.hp ?? 3) - 1;
    if (cop.hp <= 0) state.police.cops.splice(state.police.cops.indexOf(cop), 1);
    state.police.addHeat(0.4, state);
  })) return;
  hit(state.traffic.peds, (_ped, i) => {
    state.traffic.peds.splice(i, 1);
    state.police.addHeat(0.35, state);
    burst(fx, fy, '#e74c3c', 8);
  });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({ x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.5, color, size: 3 });
  }
}

// ---------- car enter / exit ----------
function tryEnterCar() {
  const p = state.player;
  if (p.car) {
    // Exit: step out to the side of the car.
    const c = p.car;
    c.driver = 'none';
    c.parked = true;
    c.speed = 0;
    p.x = c.x - Math.sin(c.angle) * 26;
    p.y = c.y + Math.cos(c.angle) * 26;
    p.angle = c.angle;
    p.car = null;
    state.audio.blip(330, 0.08, 'sine', 0.1);
    return;
  }
  const c = state.traffic.nearestStealable(p.x, p.y, 52);
  if (c) {
    if (c.driver === 'ai') state.traffic.cars.splice(state.traffic.cars.indexOf(c), 1); // driver flees on foot (despawn)
    c.driver = 'player';
    c.parked = false;
    p.car = c;
    p.x = c.x; p.y = c.y;
    state.audio.pickup();
    // Stealing a car in view of the law is a crime.
    if (state.police.wanted === 0) state.police.addHeat(0.22, state);
  }
}

// ---------- update ----------
function update(dt) {
  const p = state.player;
  const k = state.keys;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.hitCd = Math.max(0, (p.hitCd || 0) - dt);
  if (state.mouse.clicked) { shoot(); state.mouse.clicked = false; }
  if (k[' ']) { punch(); k[' '] = false; }

  if (p.car) {
    const c = p.car;
    const fwd = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0);
    const steer = (k.a || k.arrowleft ? -1 : 0) + (k.d || k.arrowright ? 1 : 0);
    const accel = fwd > 0 ? 260 : fwd < 0 ? -170 : 0;
    c.speed += accel * dt;
    if (fwd === 0) c.speed *= Math.max(0, 1 - 1.6 * dt);
    c.speed = Math.max(-70, Math.min(c.maxSpeed, c.speed));
    if (Math.abs(c.speed) > 30) c.angle += steer * 2.1 * dt * Math.sign(c.speed);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!inBuilding(nx, ny, 16)) { c.x = nx; c.y = ny; }
    else { c.speed *= -0.25; state.audio.crash(); state.shake = 6; }
    c.x = Math.max(12, Math.min(WORLD_W - 12, c.x));
    c.y = Math.max(12, Math.min(WORLD_H - 12, c.y));
    p.x = c.x; p.y = c.y; p.angle = c.angle;
    // Skid marks on hard turns at speed.
    if (Math.abs(steer) > 0 && Math.abs(c.speed) > 120) {
      state.skids.push({ x: c.x - Math.cos(c.angle) * 12, y: c.y - Math.sin(c.angle) * 12, angle: c.angle, life: 5 });
      if (state.skids.length > 220) state.skids.shift();
    }
  } else {
    let mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
    let my = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.angle = Math.atan2(my, mx);
      moveWithCollision(p, mx * 150 * dt, my * 150 * dt, 9);
    }
  }

  state.traffic.update(dt, p, (_car, dmg) => {
    if (dmg) { state.shake = 5; state.audio.crash(); }
  });
  state.police.update(dt, p, () => { state.shake = 7; });
  const res = state.missions.update(dt, state);
  if (res === 'complete' || res === 'failed') saveGame(state);

  // Bullets.
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || inBuilding(b.x, b.y, 2);
    if (!dead) {
      for (let j = state.police.cops.length - 1; j >= 0; j--) {
        const cop = state.police.cops[j];
        if (Math.hypot(cop.x - b.x, cop.y - b.y) < 20) {
          cop.hp = (cop.hp ?? 3) - 1;
          burst(b.x, b.y, '#ff5252', 6);
          if (cop.hp <= 0) state.police.cops.splice(j, 1);
          state.police.addHeat(0.5, state);
          dead = true; break;
        }
      }
    }
    if (!dead) {
      for (let j = state.traffic.peds.length - 1; j >= 0; j--) {
        const ped = state.traffic.peds[j];
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 12) {
          state.traffic.peds.splice(j, 1);
          burst(b.x, b.y, '#e74c3c', 8);
          state.police.addHeat(0.45, state);
          dead = true; break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }

  // Particles + skids.
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.skids.length - 1; i >= 0; i--) {
    state.skids[i].life -= dt * 0.4;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }

  // Busted?
  if (p.health <= 0 && state.mode === 'playing') {
    state.mode = 'busted';
    state.audio.busted();
    state.cash = Math.max(0, state.cash - 200);
    saveGame(state);
    $('busted').classList.remove('hidden');
  }

  // Camera follows smoothly.
  const tx = Math.max(0, Math.min(WORLD_W - VW, p.x - VW / 2));
  const ty = Math.max(0, Math.min(WORLD_H - VH, p.y - VH / 2));
  state.cam.x += (tx - state.cam.x) * Math.min(1, dt * 5);
  state.cam.y += (ty - state.cam.y) * Math.min(1, dt * 5);
  state.shake = Math.max(0, state.shake - dt * 20);

  // Audio follows play.
  const speed01 = p.car ? Math.abs(p.car.speed) / p.car.maxSpeed : 0;
  state.audio.update(dt, speed01, state.police.wanted);
}

// ---------- draw ----------
function draw() {
  const p = state.player;
  ctx.save();
  const shx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.translate(-Math.round(state.cam.x + shx), -Math.round(state.cam.y + shy));
  drawCity(ctx, city, state.cam, VW, VH);
  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.4)';
  ctx.lineWidth = 3;
  for (const s of state.skids) {
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 6, s.y - Math.sin(s.angle) * 6);
    ctx.lineTo(s.x + Math.cos(s.angle) * 6, s.y + Math.sin(s.angle) * 6);
    ctx.stroke();
  }
  // Mission marker: pulsing beacon + ground ring.
  const mk = state.missions.marker();
  if (mk) {
    const pulse = 26 + Math.sin(state.time * 4) * 6;
    ctx.strokeStyle = '#37d67a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(55,214,122,0.25)';
    ctx.beginPath(); ctx.arc(mk.x, mk.y, pulse * 0.6, 0, Math.PI * 2); ctx.fill();
    // Beacon column.
    const g = ctx.createLinearGradient(mk.x, mk.y - 120, mk.x, mk.y);
    g.addColorStop(0, 'rgba(55,214,122,0)');
    g.addColorStop(1, 'rgba(55,214,122,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(mk.x - 6, mk.y - 120, 12, 120);
  }
  state.traffic.draw(ctx, state.cam, VW, VH);
  state.police.draw(ctx, state.cam, VW, VH);
  // Player (on foot) or their car (drawn by traffic already when parked; player car drawn here).
  if (p.car) {
    state.traffic.drawCar(ctx, p.car);
  } else {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(1, 4, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); // head
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-5, 5, 10, 11); // jacket
    ctx.fillStyle = '#222';
    ctx.fillRect(-5, 15, 4, 6); ctx.fillRect(1, 15, 4, 6);
    // Facing gun when aiming.
    ctx.fillStyle = '#333';
    ctx.fillRect(6, -2, 10, 4);
    ctx.restore();
  }
  // Bullets + particles.
  for (const b of state.bullets) {
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Day lighting: warm sun tint + soft vignette (screen space).
  const sun = ctx.createLinearGradient(0, 0, VW, VH);
  sun.addColorStop(0, 'rgba(255,220,130,0.10)');
  sun.addColorStop(1, 'rgba(255,180,80,0.05)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, VW, VH);
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VH * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);
  drawHUD(ctx, state, VW, VH);
  drawMinimap(ctx, state, VW, VH);
}

// ---------- loop ----------
let last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  if (state.mode === 'playing') {
    state.time += dt;
    update(dt);
  }
  draw();
}
requestAnimationFrame(frame);

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  state.keys[k] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === 'e' || k === 'enter') {
    if (state.mode === 'playing') tryEnterCar();
  }
  if (k === 'f') shoot();
  if (k === 'p' || k === 'escape') togglePause();
  if (k === 'm') {
    state.audioMuted = !state.audioMuted;
    state.audio.setMuted(state.audioMuted);
    saveGame(state);
  }
});
window.addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', (e) => {
  const r = canvas.getBoundingClientRect();
  state.mouse.x = (e.clientX - r.left) * (VW / r.width);
  state.mouse.y = (e.clientY - r.top) * (VH / r.height);
  state.mouse.clicked = true;
  state.audio.ensure();
});
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  state.mouse.x = (e.clientX - r.left) * (VW / r.width);
  state.mouse.y = (e.clientY - r.top) * (VH / r.height);
});

// ---------- menus ----------
function startGame() {
  state.audio.ensure();
  $('menu').classList.add('hidden');
  $('pauseMenu').classList.add('hidden');
  $('busted').classList.add('hidden');
  state.mode = 'playing';
  if (!state.missions.done && state.missions.messageT <= 0) state.missions.startMission(state);
}
function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    $('pauseMenu').classList.remove('hidden');
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    $('pauseMenu').classList.add('hidden');
  }
}
$('startBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', togglePause);
$('restartBtn').addEventListener('click', () => {
  clearSave();
  state.cash = 0;
  state.missions = new Missions();
  state.police.setWanted(0, state);
  state.player = spawnPlayer(18.5 * TILE, 16.5 * TILE);
  startGame();
});
$('bustedBtn').addEventListener('click', () => {
  state.player = spawnPlayer(18.5 * TILE, 14.5 * TILE); // back on the road by the plaza
  state.player.health = 100;
  state.police.setWanted(0, state);
  state.police.cops = [];
  $('busted').classList.add('hidden');
  state.mode = 'playing';
});

// Save line on the menu.
if (saved && (saved.cash > 0 || saved.missionIndex > 0)) {
  $('saveLine').textContent = `Save found: $${saved.cash}, job ${Math.min(saved.missionIndex + 1, 3)} of 3 — progress resumes when you start.`;
}
if (saved && saved.muted) $('saveLine').textContent += ' (muted)';

// ---------- screenshot staging (?shot=chase|drive|foot|mission) ----------
function stageShot(shot) {
  const p = state.player;
  const putInCar = (type, x, y, angle) => {
    const c = state.traffic.cars.find((cc) => cc.type === type && cc.driver !== 'player')
      || state.traffic.cars[0];
    c.driver = 'player'; c.parked = false; c.speed = 60;
    c.x = x; c.y = y; c.angle = angle;
    p.car = c; p.x = x; p.y = y; p.angle = angle;
  };
  $('menu').classList.add('hidden');
  state.mode = 'playing';
  state.missions.startMission(state);
  if (shot === 'chase') {
    putInCar('sports', 18.5 * TILE, 16.5 * TILE, Math.PI / 2);
    state.police.setWanted(3, state);
    state.missions.index = 2; state.missions.stage = 1; state.missions.timer = 78;
    state.missions.message = 'Deliver it to the docks — lose the cops!';
    state.missions.messageT = 99;
    state.cash = 1300;
    for (let i = 0; i < 3; i++) state.police.spawnCop(p);
  } else if (shot === 'drive') {
    putInCar('sedan', 12.5 * TILE, 13.5 * TILE, Math.PI / 2);
    state.police.setWanted(0, state);
    state.missions.index = 0; state.missions.stage = 1;
    state.cash = 500;
  } else if (shot === 'foot') {
    p.car = null;
    p.x = 18.5 * TILE; p.y = 13.5 * TILE; p.angle = 0;
    p.health = 100;
    // Park a stealable car right beside Mara for the shot.
    const parked = state.traffic.cars.find((cc) => cc.driver === 'none');
    if (parked) { parked.x = 18.5 * TILE; parked.y = 12.5 * TILE; parked.angle = Math.PI / 2; }
    state.police.setWanted(0, state);
    state.missions.index = 0; state.missions.stage = 0;
    state.missions.message = 'Steal a car (walk up to one and press E)';
    state.missions.messageT = 99;
    state.cash = 0;
  } else if (shot === 'mission') {
    putInCar('taxi', 18.5 * TILE, 16.5 * TILE, Math.PI / 2);
    state.missions.index = 1; state.missions.stage = 1; state.missions.passenger = true;
    state.missions.message = 'Tito: "North motel, and step on it."';
    state.missions.messageT = 99;
    state.police.setWanted(1, state);
    state.cash = 800;
  }
  // Settle the scene: run the world forward so traffic, peds and cops are in place.
  for (let i = 0; i < 150; i++) { state.time += 1 / 60; update(1 / 60); }
  // Staging must never leave Mara busted or hurt: restore her for the shot.
  state.player.health = 100;
  state.mode = 'playing';
  $('busted').classList.add('hidden');
  state.cam.x = Math.max(0, Math.min(WORLD_W - VW, p.x - VW / 2));
  state.cam.y = Math.max(0, Math.min(WORLD_H - VH, p.y - VH / 2));
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) stageShot(shot);
