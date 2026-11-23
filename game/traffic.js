// traffic.js — traffic cars and pedestrians for Solstice City.
// One job: keep the streets alive with cars that follow the roads and people
// who walk the sidewalks, all from the same fixed seed.
(function () {
  'use strict';
  var C = window.SC.city;

  var CAR_COLORS = ['#d94f3d', '#3d7fd9', '#e8c33a', '#e8e4da', '#3a3f4a', '#7ac74f', '#c97bb8', '#e07b2e'];
  var PED_COLORS = ['#f2c14e', '#7ec8e3', '#e38bb1', '#9be07a', '#e3e3e3', '#ff9d5c'];

  function makeTraffic() {
    var rng = C.mulberry32(777001);
    var cars = [];
    for (var i = 0; i < 26; i++) {
      var horizontal = rng() < 0.5;
      var lane = Math.floor(rng() * (C.WORLD_H / C.ROAD_STEP));
      var along = rng() * C.WORLD_W;
      var dir = rng() < 0.5 ? 1 : -1;
      var y = horizontal ? lane * C.ROAD_STEP + C.ROAD_W / 2 + (dir > 0 ? 14 : -14)
        : along;
      var x = horizontal ? along
        : lane * C.ROAD_STEP + C.ROAD_W / 2 + (dir > 0 ? 14 : -14);
      cars.push({
        x: x, y: y, horizontal: horizontal, dir: dir,
        speed: 42 + rng() * 38, color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
        len: 34, wid: 17, kind: rng() < 0.15 ? 'taxi' : 'car',
        wobble: rng() * Math.PI * 2
      });
    }
    var peds = [];
    for (var j = 0; j < 46; j++) {
      var px = 60 + rng() * (C.WORLD_W - 120);
      var py = 60 + rng() * (C.WORLD_H - 120);
      peds.push({
        x: px, y: py, tx: px, ty: py, speed: 16 + rng() * 14,
        color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
        wait: rng() * 2, panic: 0
      });
    }
    return { cars: cars, peds: peds, rng: rng };
  }

  function stepTraffic(t, dt, player, city) {
    // Cars cruise their lane; at a block edge they turn onto a cross street.
    for (var i = 0; i < t.cars.length; i++) {
      var c = t.cars[i];
      if (c.parked) continue; // a car the player left behind stays where it is
      var step = c.speed * c.dir * dt;
      if (c.horizontal) c.x += step; else c.y += step;
      var atEdge = c.horizontal
        ? (c.x < 20 || c.x > C.WORLD_W - 20)
        : (c.y < 20 || c.y > C.WORLD_H - 20);
      if (atEdge) {
        // Wrap to the far side on a new random lane instead of vanishing.
        var lane = Math.floor(t.rng() * (C.WORLD_W / C.ROAD_STEP));
        if (c.horizontal) {
          c.x = c.dir > 0 ? 20 : C.WORLD_W - 20;
          c.y = lane * C.ROAD_STEP + C.ROAD_W / 2 + (c.dir > 0 ? 14 : -14);
        } else {
          c.y = c.dir > 0 ? 20 : C.WORLD_H - 20;
          c.x = lane * C.ROAD_STEP + C.ROAD_W / 2 + (c.dir > 0 ? 14 : -14);
        }
      }
      // A car that would drive through the player's car slows down.
      if (player && player.inCar) {
        var dx = c.x - player.x, dy = c.y - player.y;
        if (dx * dx + dy * dy < 70 * 70) c.speed = Math.max(12, c.speed - 30 * dt);
        else if (c.speed < 80) c.speed = Math.min(80, c.speed + 10 * dt);
      }
    }
    // Pedestrians wander to a nearby target, wait, then pick another.
    for (var j = 0; j < t.peds.length; j++) {
      var p = t.peds[j];
      if (p.panic > 0) {
        p.panic -= dt;
        p.x += Math.cos(p.panic * 7) * 40 * dt;
        p.y += Math.sin(p.panic * 5) * 40 * dt;
        continue;
      }
      var dx = p.tx - p.x, dy = p.ty - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 6) {
        p.wait -= dt;
        if (p.wait <= 0) {
          p.tx = Math.max(40, Math.min(C.WORLD_W - 40, p.x + (t.rng() - 0.5) * 420));
          p.ty = Math.max(40, Math.min(C.WORLD_H - 40, p.y + (t.rng() - 0.5) * 420));
          p.wait = 1 + t.rng() * 3;
        }
      } else {
        p.x += (dx / d) * p.speed * dt;
        p.y += (dy / d) * p.speed * dt;
      }
      // Keep pedestrians out of buildings.
      if (C.collideRect(city, p.x - 5, p.y - 5, 10, 10)) {
        p.tx = p.x + (t.rng() - 0.5) * 200;
        p.ty = p.y + (t.rng() - 0.5) * 200;
      }
    }
  }

  function scarePeds(t, x, y, radius) {
    for (var j = 0; j < t.peds.length; j++) {
      var p = t.peds[j];
      var dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < radius * radius) p.panic = 1.6;
    }
  }

  // The nearest parked, stealable car to a point (traffic cars count as parked
  // when the player is close and slow enough to yank the driver out).
  function nearestCar(t, x, y, maxDist) {
    var best = null, bestD = maxDist;
    for (var i = 0; i < t.cars.length; i++) {
      var c = t.cars[i];
      var dx = c.x - x, dy = c.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  window.SC.traffic = {
    makeTraffic: makeTraffic, stepTraffic: stepTraffic,
    scarePeds: scarePeds, nearestCar: nearestCar
  };
})();
