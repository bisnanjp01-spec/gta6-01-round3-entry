// police.js — the wanted level and the Solstice police who answer it.
// One job: turn crimes into stars, stars into pursuing cruisers, and
// distance plus time back into a clean slate.
(function () {
  'use strict';
  var C = window.SC.city;

  var STAR_NAMES = ['', 'DISORDERLY', 'PURSUIT', 'MANHUNT', 'LOCKDOWN', 'CITYWIDE'];
  var MAX_STARS = 5;

  function makePolice() {
    return { stars: 0, heat: 0, cruisers: [], calmTimer: 0, bustedTimer: 0 };
  }

  function addHeat(pol, amount, reason) {
    pol.heat = Math.min(100, pol.heat + amount);
    var want = pol.heat < 12 ? 0 : pol.heat < 28 ? 1 : pol.heat < 48 ? 2
      : pol.heat < 68 ? 3 : pol.heat < 88 ? 4 : 5;
    if (want > pol.stars) {
      pol.stars = want;
      return { raised: true, stars: want, reason: reason || 'crime' };
    }
    pol.stars = want;
    return { raised: false, stars: want, reason: reason || '' };
  }

  function spawnCruiser(pol, x, y, rng) {
    // Cruisers arrive from the nearest road edge, never on top of the player,
    // each one offset along the road so they do not spawn stacked.
    var edge = Math.floor(rng() * 4);
    var jog = pol.cruisers.length * 90;
    var sx = x, sy = y;
    if (edge === 0) { sx = Math.max(40, x - 420); sy = C.roadCenter(1, y) + jog; }
    if (edge === 1) { sx = Math.min(C.WORLD_W - 40, x + 420); sy = C.roadCenter(1, y) + jog; }
    if (edge === 2) { sy = Math.max(40, y - 420); sx = C.roadCenter(0, x) + jog; }
    if (edge === 3) { sy = Math.min(C.WORLD_H - 40, y + 420); sx = C.roadCenter(0, x) + jog; }
    pol.cruisers.push({
      x: sx, y: sy, angle: 0, speed: 0,
      maxSpeed: 150 + pol.stars * 16, color: '#1c2733', siren: rng() * 2
    });
  }

  function stepPolice(pol, dt, player, rng) {
    var wantCount = pol.stars === 0 ? 0 : pol.stars + 1;
    while (pol.cruisers.length < wantCount) spawnCruiser(pol, player.x, player.y, rng);
    while (pol.cruisers.length > wantCount) pol.cruisers.pop();

    var nearest = Infinity;
    for (var i = 0; i < pol.cruisers.length; i++) {
      var cr = pol.cruisers[i];
      cr.siren += dt * 6;
      var dx = player.x - cr.x, dy = player.y - cr.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      nearest = Math.min(nearest, d);
      // Each cruiser aims at its own slot beside the player, so the pack
      // fans out instead of stacking on one point.
      var slot = (i - (pol.cruisers.length - 1) / 2) * 58;
      var tx = player.x + (d > 1 ? -dy / d * slot : 0);
      var ty = player.y + (d > 1 ? dx / d * slot : 0);
      var wantAngle = Math.atan2(ty - cr.y, tx - cr.x);
      var diff = wantAngle - cr.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cr.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      var target = d > 320 ? cr.maxSpeed : cr.maxSpeed * 0.75;
      cr.speed += (target - cr.speed) * Math.min(1, 1.4 * dt);
      cr.x += Math.cos(cr.angle) * cr.speed * dt;
      cr.y += Math.sin(cr.angle) * cr.speed * dt;
      var clamped = C.clampToWorld(cr.x, cr.y, 24);
      cr.x = clamped.x; cr.y = clamped.y;
      // A cruiser that rams the player's car hurts it; on foot it busts her.
      if (d < 34) {
        if (player.inCar) {
          player.carHealth = Math.max(0, (player.carHealth || 100) - 22 * dt);
          player.x += Math.cos(cr.angle) * 60 * dt;
          player.y += Math.sin(cr.angle) * 60 * dt;
        } else {
          pol.bustedTimer += dt;
        }
      }
    }
    // Cooling off: stay far from every cruiser and the heat fades.
    if (pol.stars > 0) {
      if (nearest > 520) {
        pol.calmTimer += dt;
        pol.heat = Math.max(0, pol.heat - 7 * dt);
        if (pol.calmTimer > 9) {
          pol.stars = 0; pol.heat = 0; pol.calmTimer = 0;
          return { cleared: true };
        }
      } else {
        pol.calmTimer = 0;
      }
    }
    return { cleared: false };
  }

  function starLabel(stars) { return STAR_NAMES[stars] || ''; }

  window.SC.police = {
    MAX_STARS: MAX_STARS, makePolice: makePolice, addHeat: addHeat,
    spawnCruiser: spawnCruiser, stepPolice: stepPolice, starLabel: starLabel
  };
})();
