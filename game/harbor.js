// Emberline — the city of Emberline: a rain-slicked river-delta port at
// night. One deterministic generator builds the roads, the river, the
// harbor, the districts, the buildings, the docks, the bridges, the shops
// and the spawn points from a single seed string.
import { makeRng, clamp } from "./rng.js";

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const RIVER_X0 = 1560;
export const RIVER_X1 = 1740;
export const HARBOR_X0 = 2720;

export const DISTRICTS = [
  { name: "Glass Row", x0: 0, y0: 0, x1: 1560, y1: 1100, neon: "#ff2e88", tint: "#2a1b3d" },
  { name: "Old Market", x0: 0, y0: 1100, x1: 1560, y1: 2400, neon: "#ffb02e", tint: "#3d2b1b" },
  { name: "The Docks", x0: 1740, y0: 0, x1: 2720, y1: 1100, neon: "#2ee6ff", tint: "#12283d" },
  { name: "Shanty Quay", x0: 1740, y0: 1100, x1: 2720, y1: 2400, neon: "#7dff5e", tint: "#1b3d22" },
  { name: "Harbor Bay", x0: 2720, y0: 0, x1: 3200, y1: 2400, neon: "#2e7dff", tint: "#0a1a33" },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function buildHarbor(seedText) {
  const rng = makeRng(seedText);
  const roadsV = [200, 600, 1000, 1400, 1800, 2200, 2600];
  const roadsH = [200, 600, 1000, 1400, 1800, 2200];
  const roadHalf = 26;

  // Bridges carry the three cross-river roads over the water.
  const bridges = [600, 1400, 2200].map((y) => ({
    x0: RIVER_X0 - 30, x1: RIVER_X1 + 30, y0: y - roadHalf, y1: y + roadHalf, y,
  }));

  // Piers reach out into the harbor bay from the dock road.
  const piers = [400, 1000, 1600].map((y) => ({
    x0: HARBOR_X0 - 40, x1: HARBOR_X0 + 190, y0: y - 18, y1: y + 18, y,
  }));

  // Buildings fill the blocks between roads, never on water or roads.
  const buildings = [];
  const palette = ["#241a33", "#1c2436", "#33241a", "#1a2e33", "#2e1a24", "#232a1a"];
  for (let ix = 0; ix < roadsV.length - 1; ix++) {
    for (let iy = 0; iy < roadsH.length - 1; iy++) {
      const bx0 = roadsV[ix] + roadHalf + 24;
      const bx1 = roadsV[ix + 1] - roadHalf - 24;
      const by0 = roadsH[iy] + roadHalf + 24;
      const by1 = roadsH[iy + 1] - roadHalf - 24;
      if (bx1 <= bx0 + 40 || by1 <= by0 + 40) continue;
      if (bx0 < RIVER_X1 && bx1 > RIVER_X0) continue; // river block
      if (bx0 >= HARBOR_X0) continue; // harbor water
      const count = rng.int(1, 3);
      for (let k = 0; k < count; k++) {
        const w = rng.range(70, Math.max(80, (bx1 - bx0) / count - 16));
        const h = rng.range(60, Math.max(70, by1 - by0 - 16));
        const x = clamp(bx0 + rng.range(0, Math.max(1, bx1 - bx0 - w)), bx0, bx1 - w);
        const y = clamp(by0 + rng.range(0, Math.max(1, by1 - by0 - h)), by0, by1 - h);
        const d = districtAt(x + w / 2, y + h / 2);
        buildings.push({
          x, y, w, h,
          color: rng.pick(palette),
          neon: d.neon,
          lit: rng.chance(0.55),
          height: rng.int(1, 5),
        });
      }
    }
  }

  // Landmarks the story and the screenshots lean on.
  const landmarks = [
    { id: "tower", name: "Glass Spire", x: 1000, y: 200, w: 120, h: 120 },
    { id: "harbormaster", name: "Harbormaster Hall", x: 2200, y: 600, w: 150, h: 90 },
    { id: "chopshop", name: "Rusty's Chop Shop", x: 2200, y: 1800, w: 140, h: 90 },
    { id: "hospital", name: "St. Tide Hospital", x: 600, y: 1800, w: 150, h: 100 },
    { id: "safehouse", name: "Mara's Safehouse", x: 1000, y: 1400, w: 110, h: 80 },
  ];
  for (const lm of landmarks) {
    buildings.push({ x: lm.x, y: lm.y, w: lm.w, h: lm.h, color: "#2b2140", neon: "#ff2e88", lit: true, height: 4, landmark: lm.id });
  }

  const payphones = [
    { x: 1020, y: 640, name: "Glass Row payphone" },
    { x: 2240, y: 1040, name: "Docks payphone" },
    { x: 640, y: 1440, name: "Old Market payphone" },
    { x: 2240, y: 1840, name: "Quay payphone" },
  ];
  const shops = [
    { id: "garage", name: "Rusty's Garage — repair", x: 2200, y: 1900, kind: "repair", price: 120 },
    { id: "guns", name: "Quay Arms — weapons", x: 2240, y: 2200, kind: "guns", price: 250 },
    { id: "safehouse", name: "Safehouse — save & rest", x: 1000, y: 1480, kind: "save", price: 0 },
    { id: "hospital", name: "St. Tide Hospital", x: 600, y: 1900, kind: "heal", price: 80 },
  ];
  const boatDocks = [
    { x: 1650, y: 600, name: "River dock north" },
    { x: 1650, y: 1800, name: "River dock south" },
    { x: 2860, y: 1000, name: "Harbor pier" },
  ];
  const parkedSpots = [];
  for (let i = 0; i < 26; i++) {
    const vertical = rng.chance(0.5);
    const road = rng.pick(vertical ? roadsV : roadsH);
    const along = rng.range(120, vertical ? WORLD_H - 120 : WORLD_W - 120);
    const x = vertical ? road + (rng.chance(0.5) ? 30 : -30) : along;
    const y = vertical ? along : road + (rng.chance(0.5) ? 30 : -30);
    if (x > RIVER_X0 - 60 && x < RIVER_X1 + 60) continue;
    if (x > HARBOR_X0 - 60) continue;
    parkedSpots.push({ x, y, angle: vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI) });
  }
  const stashSpots = [
    { x: 320, y: 2140, name: "Under the market awning" },
    { x: 2480, y: 320, name: "Behind the container stack" },
    { x: 2480, y: 2120, name: "Shanty Quay low-tide cache" },
    { x: 1080, y: 320, name: "Glass Row rooftop drop" },
    { x: 420, y: 1020, name: "Old Market alley cache" },
  ];

  return {
    seed: seedText, roadsV, roadsH, roadHalf, bridges, piers,
    buildings, landmarks, payphones, shops, boatDocks, parkedSpots, stashSpots,
  };
}

export function onBridge(city, x, y) {
  for (const b of city.bridges) {
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}

export function onPier(city, x, y) {
  for (const p of city.piers) {
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return true;
  }
  return false;
}

export function isWater(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
  if (x > RIVER_X0 && x < RIVER_X1 && !onBridge(city, x, y)) return true;
  if (x > HARBOR_X0 && !onPier(city, x, y)) return true;
  return false;
}

export function isOnRoad(city, x, y) {
  for (const rx of city.roadsV) if (Math.abs(x - rx) <= city.roadHalf) return true;
  for (const ry of city.roadsH) if (Math.abs(y - ry) <= city.roadHalf) return true;
  return false;
}

export function buildingHit(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadsV) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 40, WORLD_H - 40), vertical: true }; }
  }
  for (const ry of city.roadsH) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 40, WORLD_W - 40), y: ry, vertical: false }; }
  }
  return best;
}
