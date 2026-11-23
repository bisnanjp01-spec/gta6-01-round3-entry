// entities.js — everything that moves in Lantern Bay: the player on
// foot and in a car, traffic cars, pedestrians, police pursuit cars,
// bullets and particles. All motion is fixed-step and seeded.

var CAR_MODELS = [
  { name: 'Hatchback', color: '#c95f4a', len: 46, wid: 22, top: 300, accel: 380 },
  { name: 'Sedan', color: '#4a7ec9', len: 52, wid: 23, top: 340, accel: 400 },
  { name: 'Coupe', color: '#d4af37', len: 50, wid: 22, top: 380, accel: 440 },
  { name: 'Van', color: '#7a8a99', len: 58, wid: 26, top: 280, accel: 320 },
  { name: 'Sports', color: '#c93a5a', len: 52, wid: 23, top: 520, accel: 560 },
  { name: 'Taxi', color: '#e8c832', len: 50, wid: 23, top: 330, accel: 400 }
];

var PED_COLORS = ['#e07a3f', '#4f9d6d', '#7a6bc9', '#c95f7a', '#3f8a9e', '#a8a04a', '#8a5a3a'];
var POLICE_COLOR = '#2e4a8a';

function makePlayer(x, y) {
  return {
    x: x, y: y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, health: 100, maxHealth: 100,
    cash: 250, ammo: 48, mag: 12, wanted: 0,
    car: null, lastCrime: -999, hurtTimer: 0, bustTimer: 0
  };
}

function makeCar(x, y, angle, modelIdx, isPolice) {
  var m = CAR_MODELS[modelIdx % CAR_MODELS.length];
  return {
    x: x, y: y, angle: angle, speed: 0,
    model: m, isPolice: !!isPolice, health: 100,
    color: isPolice ? POLICE_COLOR : m.color,
    sirenPhase: 0, stuckTimer: 0
  };
}

function makePed(x, y, rng) {
  return {
    x: x, y: y, angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 52), color: rng.pick(PED_COLORS),
    targetX: x, targetY: y, fleeing: false, fleeTimer: 0,
    walkPhase: rng.range(0, 6)
  };
}

function makeEnemy(x, y, name) {
  return {
    x: x, y: y, angle: 0, health: 80, name: name || 'Rival',
    shootTimer: 1.5, speed: 120, alive: true, color: '#3a3a3a'
  };
}

// ---- traffic ---------------------------------------------------------

var Traffic = {
  cars: [],
  rng: null
};

Traffic.init = function (seed) {
  this.rng = new LanternRng(seed + 77);
  this.cars = [];
  for (var i = 0; i < 26; i++) this.spawnCar(true);
};

Traffic.spawnCar = function (anywhere) {
  var rng = this.rng;
  var vertical = rng.chance(0.5);
  var road = vertical ? rng.pick(ROADS_X) : rng.pick(ROADS_Y);
  var along = rng.range(120, (vertical ? WORLD_H : WORLD_W) - 120);
  var dir = rng.chance(0.5) ? 1 : -1;
  var lane = 22;
  var car;
  if (vertical) {
    car = makeCar(road + dir * lane, along, dir > 0 ? Math.PI / 2 : -Math.PI / 2, rng.int(0, CAR_MODELS.length - 1), false);
    car.axis = 'y'; car.road = road; car.dir = dir;
  } else {
    car = makeCar(along, road + dir * lane, dir > 0 ? 0 : Math.PI, rng.int(0, CAR_MODELS.length - 1), false);
    car.axis = 'x'; car.road = road; car.dir = dir;
  }
  car.cruise = rng.range(95, 150);
  car.parked = rng.chance(0.18);
  if (car.parked) {
    // Parked along a road edge, engine off.
    car.speed = 0;
    car.cruise = 0;
    if (vertical) car.x = road + dir * (ROAD_W / 2 - 16);
    else car.y = road + dir * (ROAD_W / 2 - 16);
  }
  this.cars.push(car);
  return car;
};

Traffic.update = function (dt, player, rng) {
  for (var i = this.cars.length - 1; i >= 0; i--) {
    var c = this.cars[i];
    if (c.parked) continue;
    // Slow down for the car ahead on the same lane.
    var want = c.cruise;
    for (var j = 0; j < this.cars.length; j++) {
      if (j === i) continue;
      var o = this.cars[j];
      if (o.axis !== c.axis || o.road !== c.road || o.dir !== c.dir) continue;
      var gap = (c.axis === 'y' ? (o.y - c.y) * c.dir : (o.x - c.x) * c.dir);
      if (gap > 0 && gap < 78) { want = Math.min(want, Math.max(0, o.speed - 20)); }
    }
    // Ease toward the wanted speed.
    c.speed += (want - c.speed) * Math.min(1, dt * 1.6);
    var step = c.speed * dt;
    if (c.axis === 'y') c.y += step * c.dir;
    else c.x += step * c.dir;
    // At an intersection, sometimes turn onto the cross street.
    var cross = c.axis === 'y' ? ROADS_Y : ROADS_X;
    for (var k = 0; k < cross.length; k++) {
      var at = c.axis === 'y' ? c.y : c.x;
      if (Math.abs(at - cross[k]) < 6 && rng.chance(0.004)) {
        var ndir = rng.chance(0.5) ? 1 : -1;
        if (c.axis === 'y') {
          c.axis = 'x'; c.road = cross[k]; c.y = cross[k] + ndir * 22;
          c.angle = ndir > 0 ? 0 : Math.PI; c.dir = ndir;
        } else {
          c.axis = 'y'; c.road = cross[k]; c.x = cross[k] + ndir * 22;
          c.angle = ndir > 0 ? Math.PI / 2 : -Math.PI / 2; c.dir = ndir;
        }
        break;
      }
    }
    // Wrap around the far edge or respawn near the player.
    if (c.axis === 'y' && (c.y < 40 || c.y > WORLD_H - 40)) this.respawnFar(c, player);
    if (c.axis === 'x' && (c.x < 40 || c.x > WORLD_W - 40)) this.respawnFar(c, player);
  }
  // Keep the streets busy: top up to 26 cars.
  if (this.cars.length < 26) this.spawnCar(false);
};

Traffic.respawnFar = function (c, player) {
  var tries = 0;
  while (tries++ < 8) {
    var vertical = this.rng.chance(0.5);
    var road = vertical ? this.rng.pick(ROADS_X) : this.rng.pick(ROADS_Y);
    var along = this.rng.range(120, (vertical ? WORLD_H : WORLD_W) - 120);
    var px = vertical ? road : along;
    var py = vertical ? along : road;
    var d = Math.hypot(px - player.x, py - player.y);
    if (d > 700 && d < 1600) {
      var dir = this.rng.chance(0.5) ? 1 : -1;
      c.axis = vertical ? 'y' : 'x'; c.road = road; c.dir = dir;
      c.x = vertical ? road + dir * 22 : along;
      c.y = vertical ? along : road + dir * 22;
      c.angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      c.speed = c.cruise;
      return;
    }
  }
  // Fallback: put it back at the near edge.
  if (c.axis === 'y') c.y = c.dir > 0 ? 60 : WORLD_H - 60;
  else c.x = c.dir > 0 ? 60 : WORLD_W - 60;
};

// The nearest drivable car to a point, for stealing with E.
Traffic.nearestCar = function (x, y, maxDist) {
  var best = null;
  var bestD = maxDist;
  for (var i = 0; i < this.cars.length; i++) {
    var c = this.cars[i];
    var d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
};

Traffic.removeCar = function (car) {
  var idx = this.cars.indexOf(car);
  if (idx >= 0) this.cars.splice(idx, 1);
};

// ---- pedestrians -----------------------------------------------------

var Peds = {
  list: [],
  rng: null
};

Peds.init = function (seed) {
  this.rng = new LanternRng(seed + 131);
  this.list = [];
  for (var i = 0; i < 34; i++) {
    var vertical = this.rng.chance(0.5);
    var road = vertical ? this.rng.pick(ROADS_X) : this.rng.pick(ROADS_Y);
    var along = this.rng.range(100, (vertical ? WORLD_H : WORLD_W) - 100);
    var side = this.rng.chance(0.5) ? 1 : -1;
    var x = vertical ? road + side * (ROAD_W / 2 + 26) : along;
    var y = vertical ? along : road + side * (ROAD_W / 2 + 26);
    this.list.push(makePed(x, y, this.rng));
  }
};

Peds.update = function (dt, player, gunfireAt) {
  for (var i = 0; i < this.list.length; i++) {
    var p = this.list[i];
    p.walkPhase += dt * 6;
    if (gunfireAt) {
      var gd = Math.hypot(p.x - gunfireAt.x, p.y - gunfireAt.y);
      if (gd < 420) { p.fleeing = true; p.fleeTimer = 3; }
    }
    if (p.fleeTimer > 0) {
      p.fleeTimer -= dt;
      if (p.fleeTimer <= 0) p.fleeing = false;
    }
    var tx = p.targetX;
    var ty = p.targetY;
    var dx = tx - p.x;
    var dy = ty - p.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 12) {
      // Pick a new strolling target along a nearby road.
      var vertical = this.rng.chance(0.5);
      var road = vertical ? nearestRoadX(p.x) : nearestRoadY(p.y);
      var along = this.rng.range(120, (vertical ? WORLD_H : WORLD_W) - 120);
      var side = this.rng.chance(0.5) ? 1 : -1;
      p.targetX = vertical ? road + side * (ROAD_W / 2 + 26) : along;
      p.targetY = vertical ? along : road + side * (ROAD_W / 2 + 26);
      continue;
    }
    var sp = p.fleeing ? p.speed * 2.4 : p.speed;
    if (p.fleeing && gunfireAt) {
      // Run directly away from the scare.
      var ax = p.x - gunfireAt.x;
      var ay = p.y - gunfireAt.y;
      var ad = Math.hypot(ax, ay) || 1;
      p.angle = Math.atan2(ay / ad, ax / ad);
      p.x += Math.cos(p.angle) * sp * dt;
      p.y += Math.sin(p.angle) * sp * dt;
    } else {
      p.angle = Math.atan2(dy, dx);
      p.x += Math.cos(p.angle) * sp * dt;
      p.y += Math.sin(p.angle) * sp * dt;
    }
    // Pedestrians never walk through buildings or water.
    if (isWater(p.x, p.y)) { p.x -= Math.cos(p.angle) * sp * dt; p.y -= Math.sin(p.angle) * sp * dt; p.targetX = p.x; p.targetY = p.y; }
    collideBuildings(p, 10);
    clampToWorld(p, 20);
  }
};

// ---- police ----------------------------------------------------------

var Police = {
  cars: [],
  rng: null,
  spawnTimer: 0
};

Police.init = function (seed) {
  this.rng = new LanternRng(seed + 211);
  this.cars = [];
  this.spawnTimer = 0;
};

Police.update = function (dt, player, rng) {
  var want = Math.min(player.wanted, 4);
  this.spawnTimer -= dt;
  if (this.cars.length < want && this.spawnTimer <= 0) {
    this.spawnTimer = 1.6;
    var road = rng.pick(ROADS_X);
    var along = rng.pick(ROADS_Y);
    var px = player.x + rng.range(-500, 500);
    var py = player.y + rng.range(-500, 500);
    var car = makeCar(px, py, Math.atan2(player.y - py, player.x - px), 1, true);
    car.cruise = 430;
    car.speed = 200;
    this.cars.push(car);
  }
  for (var i = this.cars.length - 1; i >= 0; i--) {
    var c = this.cars[i];
    c.sirenPhase += dt * 6;
    var dx = player.x - c.x;
    var dy = player.y - c.y;
    var dist = Math.hypot(dx, dy);
    if (dist > 1400) {
      // Too far behind: teleport the pursuit back into range.
      var a = rng.range(0, Math.PI * 2);
      c.x = player.x + Math.cos(a) * 800;
      c.y = player.y + Math.sin(a) * 800;
      continue;
    }
    var targetAngle = Math.atan2(dy, dx);
    var diff = targetAngle - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    var top = 400 + player.wanted * 26;
    c.speed = Math.min(top, c.speed + 260 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    collideBuildings(c, 20);
    clampToWorld(c, 30);
    // Ramming the player.
    if (dist < 46) {
      if (player.onFoot) {
        player.bustTimer += dt;
      } else if (player.car) {
        player.car.health -= 14 * dt;
        player.car.speed *= 0.985;
        if (player.car.health <= 0) {
          player.car = null;
          player.onFoot = true;
          player.health -= 15;
        }
      }
    }
  }
  if (player.wanted <= 0) {
    // Wanted cleared: the pursuit gives up and drives off.
    this.cars.length = 0;
  }
};

// ---- bullets and particles ------------------------------------------

var Bullets = {
  list: []
};

Bullets.fire = function (x, y, angle, fromPlayer) {
  this.list.push({ x: x, y: y, angle: angle, speed: 920, life: 0.7, fromPlayer: !!fromPlayer });
};

Bullets.update = function (dt, player, enemies, onPedHit, onEnemyHit, onPlayerHit) {
  for (var i = this.list.length - 1; i >= 0; i--) {
    var b = this.list[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    var dead = b.life <= 0 || isWater(b.x, b.y);
    if (!dead) {
      // Buildings stop bullets.
      for (var k = 0; k < cityBuildings.length; k++) {
        var bd = cityBuildings[k];
        if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) { dead = true; break; }
      }
    }
    if (!dead && b.fromPlayer) {
      for (var e = 0; e < enemies.length; e++) {
        var en = enemies[e];
        if (!en.alive) continue;
        if (Math.hypot(b.x - en.x, b.y - en.y) < 18) {
          en.health -= 34;
          onEnemyHit(en);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (var p = 0; p < Peds.list.length; p++) {
          var ped = Peds.list[p];
          if (Math.hypot(b.x - ped.x, b.y - ped.y) < 12) {
            onPedHit(ped);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (var q = 0; q < Police.cars.length; q++) {
          var pc = Police.cars[q];
          if (Math.hypot(b.x - pc.x, b.y - pc.y) < 26) {
            pc.health -= 20;
            if (pc.health <= 0) Police.cars.splice(q, 1);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      if (player.onFoot && Math.hypot(b.x - player.x, b.y - player.y) < 14) {
        onPlayerHit(12);
        dead = true;
      }
    }
    if (dead) this.list.splice(i, 1);
  }
};

var Particles = {
  list: []
};

// Deterministic RNG for visual effects, so replays stay identical.
var fxRng = new LanternRng(777);

Particles.burst = function (x, y, color, n, speed) {
  for (var i = 0; i < n; i++) {
    var a = fxRng.range(0, Math.PI * 2);
    var s = (speed || 120) * (0.4 + fxRng.float() * 0.8);
    this.list.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + fxRng.float() * 0.4, color: color, r: 2 + fxRng.float() * 3 });
  }
};

Particles.update = function (dt) {
  for (var i = this.list.length - 1; i >= 0; i--) {
    var p = this.list[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) this.list.splice(i, 1);
  }
};
