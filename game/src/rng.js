// rng.js — seeded random numbers and small math helpers for Port Azura.
// Everything in the game that needs chance uses this fixed-seed generator so a
// fresh load always builds the same city, the same traffic and the same missions.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GameRandom = mulberry32(20261124);

function randRange(min, max) { return min + GameRandom() * (max - min); }
function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }
function randPick(list) { return list[Math.floor(GameRandom() * list.length)]; }
function randChance(p) { return GameRandom() < p; }

function clampValue(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerpValue(a, b, t) { return a + (b - a) * t; }
function distanceBetween(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
