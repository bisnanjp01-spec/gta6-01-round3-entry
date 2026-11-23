// city.js — Solstice City: the map, its districts, roads, buildings and collision.
// One job: describe a fixed, seeded city the other systems drive around in.
(function () {
  'use strict';

  // Deterministic seeded random: the same city every load, every machine.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var WORLD_W = 2560;
  var WORLD_H = 1920;
  var ROAD_STEP = 320;      // blocks are 320px apart
  var ROAD_W = 56;          // road width in px
  var BLOCK = ROAD_STEP - ROAD_W;

  var DISTRICTS = [
    { name: 'The Strand', x: 0, y: 0, w: 1280, h: 640, ground: '#c9a86a', accent: '#2e7f9e' },
    { name: 'Old Quarter', x: 1280, y: 0, w: 1280, h: 640, ground: '#b98d5f', accent: '#a03d2d' },
    { name: 'Uptown', x: 0, y: 640, w: 1280, h: 640, ground: '#8fae7e', accent: '#3d6e8f' },
    { name: 'The Foundry', x: 1280, y: 640, w: 1280, h: 640, ground: '#9a8a7a', accent: '#6e3d8f' },
    { name: 'South Docks', x: 0, y: 1280, w: 2560, h: 640, ground: '#7d8a99', accent: '#2d5f4e' }
  ];

  var PALETTES = {
    house: ['#e8b04b', '#d96f4e', '#7fae8a', '#6f9fd8', '#c98bb0', '#e0d6b8'],
    tower: ['#5b7fa6', '#7a6a9e', '#4e8a7a', '#a67c52'],
    shop: ['#ff8c42', '#ff5d73', '#4ecdc4', '#ffd166', '#9b5de5'],
    industrial: ['#8d7d6b', '#6b7c8d', '#7d6b5d']
  };

  function buildCity() {
    var rng = mulberry32(20261124);
    var buildings = [];
    var parks = [];
    var lots = [];
    // Walk the block grid; each block gets buildings, a park, or a parking lot.
    for (var bx = 0; bx < WORLD_W / ROAD_STEP; bx++) {
      for (var by = 0; by < WORLD_H / ROAD_STEP; by++) {
        var ox = bx * ROAD_STEP + ROAD_W / 2;
        var oy = by * ROAD_STEP + ROAD_W / 2;
        var roll = rng();
        if (roll < 0.12) {
          parks.push({ x: ox + 14, y: oy + 14, w: BLOCK - 28, h: BLOCK - 28 });
          continue;
        }
        if (roll < 0.22) {
          lots.push({ x: ox + 10, y: oy + 10, w: BLOCK - 20, h: BLOCK - 20 });
          continue;
        }
        var district = districtAt(ox + BLOCK / 2, oy + BLOCK / 2);
        var n = 2 + Math.floor(rng() * 3);
        for (var i = 0; i < n; i++) {
          var bw = 46 + rng() * 70;
          var bh = 46 + rng() * 70;
          var px = ox + 8 + rng() * (BLOCK - 16 - bw);
          var py = oy + 8 + rng() * (BLOCK - 16 - bh);
          var kind = district.name === 'The Foundry' ? 'industrial'
            : (district.name === 'Uptown' && rng() < 0.4) ? 'tower'
            : (rng() < 0.3 ? 'shop' : 'house');
          var pal = PALETTES[kind];
          buildings.push({
            x: px, y: py, w: bw, h: bh, kind: kind,
            color: pal[Math.floor(rng() * pal.length)],
            roof: rng() < 0.5, floors: kind === 'tower' ? 3 + Math.floor(rng() * 4) : 1
          });
        }
      }
    }
    return { buildings: buildings, parks: parks, lots: lots };
  }

  function districtAt(x, y) {
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    return DISTRICTS[0];
  }

  function isRoad(x, y) {
    var mx = x % ROAD_STEP;
    var my = y % ROAD_STEP;
    return mx < ROAD_W || my < ROAD_W;
  }

  function roadCenter(axis, v) {
    // Nearest road centre line along one axis.
    var idx = Math.round((v - ROAD_W / 2) / ROAD_STEP);
    return idx * ROAD_STEP + ROAD_W / 2;
  }

  // Axis-aligned rectangle vs the building list. Returns the building hit, or null.
  function collideRect(city, x, y, w, h) {
    for (var i = 0; i < city.buildings.length; i++) {
      var b = city.buildings[i];
      if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return b;
    }
    return null;
  }

  function clampToWorld(x, y, m) {
    return {
      x: Math.max(m, Math.min(WORLD_W - m, x)),
      y: Math.max(m, Math.min(WORLD_H - m, y))
    };
  }

  // Landmark spots the missions and the start use, by name.
  var PLACES = {
    inezDiner: { x: 700, y: 420, label: "Inez's Diner" },
    marina: { x: 340, y: 300, label: 'Marina Pier' },
    foundryGate: { x: 1980, y: 900, label: 'Foundry Gate' },
    uptownBank: { x: 620, y: 900, label: 'Uptown Bank' },
    safehouse: { x: 2200, y: 1560, label: 'Safehouse' },
    garage: { x: 1700, y: 1560, label: "Lou's Garage" },
    hospital: { x: 1050, y: 1180, label: 'St. Anselm Hospital' },
    plaza: { x: 1500, y: 300, label: 'Old Plaza' }
  };

  window.SC = window.SC || {};
  window.SC.city = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, ROAD_STEP: ROAD_STEP, ROAD_W: ROAD_W,
    DISTRICTS: DISTRICTS, PLACES: PLACES, mulberry32: mulberry32,
    buildCity: buildCity, districtAt: districtAt, isRoad: isRoad,
    roadCenter: roadCenter, collideRect: collideRect, clampToWorld: clampToWorld
  };
})();
