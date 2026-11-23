// city.js — the map of Lantern Bay: roads, districts, buildings,
// landmarks, water and the collision helpers every system shares.
// The city is generated once from a fixed seed, so it never changes.

var WORLD_W = 3600;
var WORLD_H = 2600;
var ROAD_W = 96;

var ROADS_X = [320, 760, 1200, 1640, 2080, 2520, 2960];
var ROADS_Y = [300, 700, 1100, 1500, 1900, 2300];

var DISTRICTS = [
  { name: 'Old Town', x: 0, y: 0, w: 1000, h: 900, tint: '#c9a86a' },
  { name: 'The Hills', x: 1000, y: 0, w: 1100, h: 900, tint: '#8fae7e' },
  { name: 'Downtown', x: 1000, y: 900, w: 1100, h: 1000, tint: '#7e9cc4' },
  { name: 'Night Market', x: 2100, y: 1900, w: 1100, h: 700, tint: '#d98a7a' },
  { name: 'The Docks', x: 0, y: 1900, w: 1100, h: 700, tint: '#8a97a3' },
  { name: 'Marina', x: 3200, y: 0, w: 400, h: 2600, tint: '#5fb3c9' }
];

var LANDMARKS = [
  { id: 'garage', name: "Cole's Garage", x: 470, y: 470, w: 170, h: 120, color: '#e07a3f' },
  { id: 'safehouse', name: 'Safehouse', x: 500, y: 1240, w: 150, h: 110, color: '#4f9d6d' },
  { id: 'casino', name: 'The Gilded Lantern', x: 1300, y: 800, w: 220, h: 180, color: '#d4af37' },
  { id: 'hospital', name: 'St. Anselm Hospital', x: 2190, y: 420, w: 220, h: 150, color: '#e8e8e8' },
  { id: 'police', name: 'Lantern Bay PD', x: 880, y: 1620, w: 200, h: 140, color: '#3f6fb5' },
  { id: 'market', name: 'Night Market', x: 2200, y: 2040, w: 200, h: 130, color: '#c95f7a' },
  { id: 'docks', name: 'Fisherman Docks', x: 420, y: 2080, w: 220, h: 130, color: '#7a6a55' },
  { id: 'marina', name: 'Marina Pier', x: 3060, y: 820, w: 150, h: 200, color: '#5fb3c9' },
  { id: 'hotel', name: 'The Marlowe Hotel', x: 1760, y: 1230, w: 200, h: 150, color: '#9a6bc9' }
];

var BUILDING_COLORS = ['#b5764f', '#8a6f8f', '#5f7f9e', '#a89a6a', '#7d8a6a', '#96604f', '#6a8a8f', '#b58a5a'];
var ROOF_COLORS = ['#6e4a3a', '#4a5a6e', '#5a6e4a', '#7a5a4a', '#3f4a5a'];

var cityBuildings = [];
var cityTrees = [];
var cityParks = [
  { x: 1300, y: 420, w: 260, h: 200 },
  { x: 2600, y: 1200, w: 280, h: 220 },
  { x: 800, y: 1600, w: 200, h: 180 }
];

function isWater(x, y) {
  return x >= 3300 || (x >= 3240 && y >= 0 && y <= WORLD_H);
}

function isOnRoad(x, y) {
  for (var i = 0; i < ROADS_X.length; i++) {
    if (Math.abs(x - ROADS_X[i]) <= ROAD_W / 2) return true;
  }
  for (var j = 0; j < ROADS_Y.length; j++) {
    if (Math.abs(y - ROADS_Y[j]) <= ROAD_W / 2) return true;
  }
  return false;
}

function nearestRoadX(x) {
  var best = ROADS_X[0];
  for (var i = 1; i < ROADS_X.length; i++) {
    if (Math.abs(ROADS_X[i] - x) < Math.abs(best - x)) best = ROADS_X[i];
  }
  return best;
}

function nearestRoadY(y) {
  var best = ROADS_Y[0];
  for (var j = 1; j < ROADS_Y.length; j++) {
    if (Math.abs(ROADS_Y[j] - y) < Math.abs(best - y)) best = ROADS_Y[j];
  }
  return best;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function buildCity(seed) {
  var rng = new LanternRng(seed);
  cityBuildings = [];
  cityTrees = [];
  for (var li = 0; li < LANDMARKS.length; li++) {
    var lm = LANDMARKS[li];
    cityBuildings.push({ x: lm.x, y: lm.y, w: lm.w, h: lm.h, color: lm.color, roof: '#2e2a33', landmark: lm.id, name: lm.name });
  }
  // Fill each road block with one or two buildings, leaving parks and
  // landmark plots empty.
  for (var xi = 0; xi < ROADS_X.length - 1; xi++) {
    for (var yi = 0; yi < ROADS_Y.length - 1; yi++) {
      var bx0 = ROADS_X[xi] + ROAD_W / 2 + 24;
      var by0 = ROADS_Y[yi] + ROAD_W / 2 + 24;
      var bx1 = ROADS_X[xi + 1] - ROAD_W / 2 - 24;
      var by1 = ROADS_Y[yi + 1] - ROAD_W / 2 - 24;
      if (bx1 - bx0 < 90 || by1 - by0 < 90) continue;
      var block = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
      var blocked = false;
      for (var p = 0; p < cityParks.length; p++) {
        if (rectsOverlap(block, cityParks[p])) { blocked = true; break; }
      }
      if (blocked) continue;
      for (var l = 0; l < LANDMARKS.length; l++) {
        if (rectsOverlap(block, LANDMARKS[l])) { blocked = true; break; }
      }
      if (blocked) continue;
      if (rng.chance(0.14)) {
        // Empty lot with trees instead of a building.
        var nt = rng.int(2, 5);
        for (var t = 0; t < nt; t++) {
          cityTrees.push({ x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20), r: rng.range(10, 18) });
        }
        continue;
      }
      var two = rng.chance(0.45) && block.w > 260;
      if (two) {
        var split = block.w * rng.range(0.42, 0.58);
        cityBuildings.push({ x: block.x, y: block.y, w: split - 14, h: block.h, color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS), landmark: null, name: '' });
        cityBuildings.push({ x: block.x + split + 14, y: block.y, w: block.w - split - 14, h: block.h, color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS), landmark: null, name: '' });
      } else {
        cityBuildings.push({ x: block.x, y: block.y, w: block.w, h: block.h, color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS), landmark: null, name: '' });
      }
      if (rng.chance(0.5)) {
        cityTrees.push({ x: rng.range(bx0, bx1), y: by0 - 8, r: rng.range(9, 15) });
      }
    }
  }
  // Street trees along the marina road.
  for (var s = 0; s < 14; s++) {
    cityTrees.push({ x: 3120 + (s % 2) * 40, y: 140 + s * 170, r: 13 });
  }
}

// Push a circle out of every building it overlaps. Returns true on hit.
function collideBuildings(pos, radius) {
  var hit = false;
  for (var i = 0; i < cityBuildings.length; i++) {
    var b = cityBuildings[i];
    var cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    var cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    var dx = pos.x - cx;
    var dy = pos.y - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        var d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.y = cy + (dy / d) * radius;
      } else {
        pos.y = b.y - radius;
      }
    }
  }
  return hit;
}

function clampToWorld(pos, margin) {
  pos.x = Math.max(margin, Math.min(WORLD_W - margin, pos.x));
  pos.y = Math.max(margin, Math.min(WORLD_H - margin, pos.y));
}

function landmarkById(id) {
  for (var i = 0; i < LANDMARKS.length; i++) {
    if (LANDMARKS[i].id === id) return LANDMARKS[i];
  }
  return LANDMARKS[0];
}

function districtAt(x, y) {
  for (var i = 0; i < DISTRICTS.length; i++) {
    var d = DISTRICTS[i];
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return 'Lantern Bay';
}
