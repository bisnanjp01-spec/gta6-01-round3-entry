// rng.js — deterministic seeded random numbers for Lantern Bay.
// Every run of the game uses the same seed, so traffic, pedestrians,
// building colours and mission spawns are identical every time.

function mulberry32(seed) {
  var a = seed >>> 0;
  return function nextRandom() {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small seeded RNG with the helpers the game needs.
function LanternRng(seed) {
  this.next = mulberry32(seed);
}

LanternRng.prototype.float = function () {
  return this.next();
};

LanternRng.prototype.range = function (min, max) {
  return min + this.next() * (max - min);
};

LanternRng.prototype.int = function (min, max) {
  return Math.floor(this.range(min, max + 1));
};

LanternRng.prototype.pick = function (list) {
  return list[Math.floor(this.next() * list.length)];
};

LanternRng.prototype.chance = function (p) {
  return this.next() < p;
};

// A stable hash of a short string, used to seed per-district variation.
function hashSeed(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
