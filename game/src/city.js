// city.js — builds Port Azura: districts, road grid, buildings, parks, beach.
// The city is generated once from the fixed seed, so every player explores the
// same streets. Roads are axis-aligned avenues and streets; buildings fill the
// blocks between them and are stored as rectangles for collision and drawing.
const CITY_WIDTH = 3200;
const CITY_HEIGHT = 2400;
const ROAD_WIDTH = 92;

const DISTRICTS = [
  { name: "Old Town", x: 0, y: 0, w: 800, h: 1200, tint: "#c9a06a" },
  { name: "Downtown", x: 800, y: 400, w: 1200, h: 1200, tint: "#7fa8c9" },
  { name: "Marina Bay", x: 2000, y: 0, w: 1050, h: 1200, tint: "#6fc3c9" },
  { name: "Harbor South", x: 0, y: 1200, w: 2000, h: 1200, tint: "#b08a5a" },
  { name: "Palm Heights", x: 2000, y: 1200, w: 1050, h: 1200, tint: "#8fbf7f" },
];

const AVENUE_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 2950];
const STREET_Y = [200, 600, 1000, 1400, 1800, 2150];

const CAR_COLORS = ["#d23b3b", "#3b7fd2", "#e8c33a", "#3ad27a", "#e8e8e8", "#22242a",
  "#d2691e", "#8e44ad", "#19b5a6", "#f2f2f2", "#5a6b7a", "#c0392b"];
const BUILDING_COLORS = ["#b98d5f", "#8fa3b8", "#c9b18a", "#7d8ea3", "#a8705a",
  "#93a88f", "#b5a06a", "#6f86a3", "#c98f6a", "#9aa38f"];

function buildCity() {
  const buildings = [];
  const trees = [];
  const parks = [];
  const lamps = [];
  // Buildings fill each block between neighbouring roads.
  for (let ax = 0; ax < AVENUE_X.length - 1; ax++) {
    for (let sy = 0; sy < STREET_Y.length - 1; sy++) {
      const x0 = AVENUE_X[ax] + ROAD_WIDTH / 2 + 14;
      const x1 = AVENUE_X[ax + 1] - ROAD_WIDTH / 2 - 14;
      const y0 = STREET_Y[sy] + ROAD_WIDTH / 2 + 14;
      const y1 = STREET_Y[sy + 1] - ROAD_WIDTH / 2 - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // One in six blocks is a park instead of buildings.
      if (randChance(0.16)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = Math.floor(((x1 - x0) * (y1 - y0)) / 9000);
        for (let i = 0; i < n; i++) {
          trees.push({ x: randRange(x0 + 20, x1 - 20), y: randRange(y0 + 20, y1 - 20), r: randRange(9, 15) });
        }
        continue;
      }
      const cols = randInt(1, 2), rows = randInt(1, 2);
      const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const bx = x0 + c * cw + 8, by = y0 + r * ch + 8;
          const bw = cw - 16, bh = ch - 16;
          if (bw < 50 || bh < 50) continue;
          const downtown = bx > 800 && bx < 2000 && by > 400 && by < 1600;
          buildings.push({
            x: bx, y: by, w: bw, h: bh,
            height: downtown ? randInt(26, 64) : randInt(10, 30),
            color: randPick(BUILDING_COLORS),
            roof: randPick(["#5a6b7a", "#7a6a5a", "#4a5a6a", "#8a7a6a"]),
            windows: randInt(2, 5),
          });
        }
      }
      if (randChance(0.5)) {
        trees.push({ x: randRange(x0 + 20, x1 - 20), y: randRange(y0 + 20, y1 - 20), r: randRange(9, 14) });
      }
    }
  }
  // Street lamps along every avenue and street.
  for (const ax of AVENUE_X) {
    for (const sy of STREET_Y) {
      lamps.push({ x: ax + ROAD_WIDTH / 2 + 6, y: sy - ROAD_WIDTH / 2 - 6 });
    }
  }
  return {
    width: CITY_WIDTH, height: CITY_HEIGHT,
    buildings, trees, parks, lamps,
    // Named landmarks the missions and HUD refer to.
    landmarks: {
      plaza: { x: 1000, y: 800, label: "Azura Plaza" },
      pier: { x: 3050, y: 600, label: "Sunset Pier" },
      bank: { x: 1400, y: 1000, label: "Bank of Azura" },
      garage: { x: 600, y: 1800, label: "Rico's Garage" },
      docks: { x: 1000, y: 2250, label: "Harbor Docks" },
      cafe: { x: 2200, y: 1400, label: "Cafe Lumen" },
      stadium: { x: 2600, y: 1800, label: "Azura Bowl" },
      hideout: { x: 600, y: 200, label: "Mara's Hideout" },
    },
  };
}

function pointInBuilding(city, x, y, pad) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

// Push a circle out of any building it overlaps; returns the building hit, if any.
function collideCircleWithBuildings(city, ent, radius) {
  for (const b of city.buildings) {
    const cx = clampValue(ent.x, b.x, b.x + b.w);
    const cy = clampValue(ent.y, b.y, b.y + b.h);
    const dx = ent.x - cx, dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        ent.x = cx + (dx / d) * radius;
        ent.y = cy + (dy / d) * radius;
      } else {
        ent.y = b.y - radius;
      }
      return b;
    }
  }
  return null;
}

function isOnRoad(x, y) {
  for (const ax of AVENUE_X) if (Math.abs(x - ax) < ROAD_WIDTH / 2) return true;
  for (const sy of STREET_Y) if (Math.abs(y - sy) < ROAD_WIDTH / 2) return true;
  return false;
}

function nearestRoadPoint(x, y) {
  let best = null, bestD = 1e9;
  for (const ax of AVENUE_X) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  }
  for (const sy of STREET_Y) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  }
  return best;
}
