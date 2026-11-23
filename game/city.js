// city.js — Costa Verde: an original coastal city on a road grid.
// Deterministic layout from a seeded PRNG so every run draws the same city.
export const TILE = 64;              // pixels per road-grid cell
export const BLOCK = 3;              // road every BLOCK cells
export const CITY_W = 40;            // cells wide
export const CITY_H = 30;            // cells tall
export const WORLD_W = CITY_W * TILE;
export const WORLD_H = CITY_H * TILE;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A cell is a road when its column or row sits on the grid lines.
// Roads run every BLOCK cells, so blocks are (BLOCK-1) x (BLOCK-1) cells.
export function isRoadCell(cx, cy) {
  return cx % BLOCK === 0 || cy % BLOCK === 0;
}
export function isRoad(x, y) {
  const cx = Math.floor(x / TILE);
  const cy = Math.floor(y / TILE);
  if (cx < 0 || cy < 0 || cx >= CITY_W || cy >= CITY_H) return false;
  return isRoadCell(cx, cy);
}

// Buildings fill non-road blocks; each gets a deterministic colour/height.
export function buildCity() {
  const rng = mulberry32(20261123);
  const buildings = [];
  const palette = ['#e8b04b', '#d97b6c', '#7fb3d5', '#a8c686', '#c9a0dc', '#f2e3c6', '#8fb8a8'];
  for (let cy = 0; cy < CITY_H; cy++) {
    for (let cx = 0; cx < CITY_W; cx++) {
      if (isRoadCell(cx, cy)) continue;
      // The central plaza stays open — no buildings on the fountain square.
      if (cx >= 19 && cx <= 20 && cy >= 13 && cy <= 14) continue;
      // One building per block cell, slightly inset so streets read clearly.
      buildings.push({
        x: cx * TILE + 6, y: cy * TILE + 6,
        w: TILE - 12, h: TILE - 12,
        color: palette[Math.floor(rng() * palette.length)],
        roof: rng() > 0.5,
        park: rng() < 0.14,
      });
    }
  }
  // The harbour promenade along the south edge + a central plaza.
  const plaza = { x: 19 * TILE, y: 13 * TILE, w: 2 * TILE, h: 2 * TILE };
  return { buildings, plaza, rng };
}

export function drawCity(ctx, city, cam, vw, vh) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(CITY_W - 1, Math.ceil((cam.x + vw) / TILE));
  const y1 = Math.min(CITY_H - 1, Math.ceil((cam.y + vh) / TILE));
  // Ground: grass base, then sand along the south harbour edge.
  ctx.fillStyle = '#4c9a52';
  ctx.fillRect(cam.x, cam.y, vw, vh);
  ctx.fillStyle = '#e6cf9a';
  ctx.fillRect(cam.x, Math.max(cam.y, WORLD_H - TILE * 2), vw, Math.min(vh, WORLD_H - Math.max(cam.y, WORLD_H - TILE * 2)));
  // Roads.
  ctx.fillStyle = '#3a3f4a';
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!isRoadCell(cx, cy)) continue;
      ctx.fillRect(cx * TILE, cy * TILE, TILE, TILE);
    }
  }
  // Sidewalks: lighter border around road cells adjacent to blocks.
  ctx.fillStyle = '#9aa0ab';
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!isRoadCell(cx, cy)) continue;
      if (cx + 1 < CITY_W && !isRoadCell(cx + 1, cy)) ctx.fillRect((cx + 1) * TILE - 6, cy * TILE, 6, TILE);
      if (cy + 1 < CITY_H && !isRoadCell(cx, cy + 1)) ctx.fillRect(cx * TILE, (cy + 1) * TILE - 6, TILE, 6);
    }
  }
  // Road centre dashes.
  ctx.fillStyle = '#f5d76e';
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!isRoadCell(cx, cy)) continue;
      const horiz = cy % BLOCK === 0 && cx % BLOCK !== 0;
      const vert = cx % BLOCK === 0 && cy % BLOCK !== 0;
      if (horiz) ctx.fillRect(cx * TILE + TILE / 2 - 8, cy * TILE + TILE / 2 - 2, 16, 4);
      if (vert) ctx.fillRect(cx * TILE + TILE / 2 - 2, cy * TILE + TILE / 2 - 8, 4, 16);
    }
  }
  // Plaza (fountain square) in the city centre.
  ctx.fillStyle = '#cbb98a';
  ctx.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
  ctx.fillStyle = '#5db7d6';
  ctx.beginPath();
  ctx.arc(city.plaza.x + city.plaza.w / 2, city.plaza.y + city.plaza.h / 2, 26, 0, Math.PI * 2);
  ctx.fill();
  // Buildings (only those on screen).
  for (const b of city.buildings) {
    if (b.x + b.w < cam.x || b.y + b.h < cam.y || b.x > cam.x + vw || b.y > cam.y + vh) continue;
    if (b.park) {
      ctx.fillStyle = '#2f7d3a';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#3f9a4a';
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 12, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 4, b.y + 4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    }
  }
  // Harbour water strip at the very south edge.
  ctx.fillStyle = '#2e6fb0';
  ctx.fillRect(cam.x, Math.max(cam.y, WORLD_H - 18), vw, 18);
  // World border.
  ctx.strokeStyle = '#1c2f22';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);
}
