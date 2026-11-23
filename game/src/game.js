// game.js — Lantern Bay: the main loop, input, camera, rendering,
// wanted system, stealing, combat, saving and the staged demo scenes
// used for screenshots. Fixed 60 Hz timestep, fixed seed 20261124.

var GAME_SEED = 20261124;
var STEP = 1 / 60;
var VIEW_W = 1280;
var VIEW_H = 800;

var combatRng = new LanternRng(555);

var game = {
  state: 'menu',
  tick: 0,
  player: null,
  cam: { x: 1640, y: 1300 },
  shake: 0,
  keys: {},
  mouse: { x: VIEW_W / 2, y: VIEW_H / 2, down: false },
  fireTimer: 0,
  saveTimer: 0,
  gunfireAt: null,
  timeMinutes: 9 * 60 + 12,
  crashCooldown: 0
};

game.clockText = function () {
  var total = this.timeMinutes + Math.floor(this.tick / 150);
  var h = Math.floor(total / 60) % 24;
  var m = total % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
};

function resetWorld() {
  buildCity(GAME_SEED);
  Traffic.init(GAME_SEED);
  Peds.init(GAME_SEED);
  Police.init(GAME_SEED);
  Bullets.list = [];
  Particles.list = [];
  MissionState.index = 0;
  MissionState.step = 0;
  MissionState.active = false;
  MissionState.done = false;
  MissionState.completedCount = 0;
  MissionState.banner = '';
  MissionState.bannerTimer = 0;
  MissionState.enemies = [];
  game.tick = 0;
  game.timeMinutes = 9 * 60 + 12;
  game.shake = 0;
  game.fireTimer = 0;
  game.saveTimer = 0;
  game.gunfireAt = null;
}

game.ensureStealTarget = function (x, y) {
  // Make sure a gold coupe is parked by the target spot.
  for (var i = 0; i < Traffic.cars.length; i++) {
    var c = Traffic.cars[i];
    if (c.model.name === 'Coupe' && Math.hypot(c.x - x, c.y - y) < 140) return;
  }
  var coupe = makeCar(x + 46, y + 30, 0, 2, false);
  coupe.parked = true;
  coupe.cruise = 0;
  coupe.speed = 0;
  coupe.axis = 'x';
  coupe.road = nearestRoadY(y);
  coupe.dir = 1;
  Traffic.cars.push(coupe);
};

function startNewGame() {
  resetWorld();
  game.player = makePlayer(555, 530);
  game.player.angle = 0;
  game.cam.x = game.player.x;
  game.cam.y = game.player.y;
  game.state = 'playing';
  hideMenu();
  MissionState.start(0, game);
  saveGame();
}

function startDemo(kind) {
  resetWorld();
  var p;
  if (kind === 'chase') {
    p = makePlayer(2080, 1900);
    var sport = makeCar(2080, 1900, -Math.PI / 2, 4, false);
    sport.health = 100;
    p.car = sport;
    p.onFoot = false;
    p.angle = -Math.PI / 2;
    game.player = p;
    game.state = 'playing';
    hideMenu();
    MissionState.start(3, game);
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2;
      var pc = makeCar(p.x + Math.cos(a) * 320, p.y + Math.sin(a) * 320, a + Math.PI, 1, true);
      pc.cruise = 430;
      pc.speed = 260;
      Police.cars.push(pc);
    }
  } else if (kind === 'docks') {
    p = makePlayer(700, 2350);
    p.angle = -Math.PI / 2;
    game.player = p;
    game.state = 'playing';
    hideMenu();
    MissionState.start(2, game);
  } else if (kind === 'drive') {
    p = makePlayer(1200, 1900);
    var sedan = makeCar(1200, 1900, -Math.PI / 2, 1, false);
    p.car = sedan;
    p.onFoot = false;
    game.player = p;
    game.state = 'playing';
    hideMenu();
    MissionState.start(1, game);
  } else if (kind === 'marina') {
    p = makePlayer(2960, 700);
    var coupe = makeCar(2960, 700, Math.PI / 2, 4, false);
    p.car = coupe;
    p.onFoot = false;
    game.player = p;
    game.state = 'playing';
    hideMenu();
    MissionState.start(4, game);
  } else {
    game.player = makePlayer(555, 530);
    game.state = 'menu';
    showMenu();
  }
  game.cam.x = game.player.x;
  game.cam.y = game.player.y;
  Hud.hintTimer = 0;
}

function saveGame() {
  try {
    var p = game.player;
    if (!p) return;
    var data = {
      cash: p.cash, health: p.health, mission: MissionState.index,
      completed: MissionState.completedCount,
      x: Math.round(p.x), y: Math.round(p.y), ammo: p.ammo
    };
    localStorage.setItem('lanternbay.save.v1', JSON.stringify(data));
  } catch (e) { /* storage unavailable: the game still plays */ }
}

function loadSave() {
  try {
    var raw = localStorage.getItem('lanternbay.save.v1');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function continueGame() {
  var s = loadSave();
  if (!s) return;
  resetWorld();
  game.player = makePlayer(s.x, s.y);
  game.player.cash = s.cash;
  game.player.health = s.health;
  game.player.ammo = s.ammo;
  game.cam.x = s.x;
  game.cam.y = s.y;
  game.state = 'playing';
  hideMenu();
  MissionState.completedCount = s.completed || 0;
  MissionState.start(Math.min(s.mission, MISSIONS.length - 1), game);
}

// ---- crime, wanted level, busted / wasted ---------------------------

game.commitCrime = function (level) {
  var p = this.player;
  p.wanted = Math.min(5, p.wanted + level);
  p.lastCrime = this.tick;
};

game.updateWanted = function (dt) {
  var p = this.player;
  if (p.wanted <= 0) return;
  var nearPolice = false;
  for (var i = 0; i < Police.cars.length; i++) {
    if (Math.hypot(Police.cars[i].x - p.x, Police.cars[i].y - p.y) < 520) { nearPolice = true; break; }
  }
  if (!nearPolice && this.tick - p.lastCrime > 25 * 60) {
    p.wanted--;
    p.lastCrime = this.tick;
    if (p.wanted === 0) MissionState.showBanner('You lost the police. Wanted level clear.');
  }
  if (!nearPolice) p.bustTimer = 0;
  // Busted: a police car sits on the player on foot.
  if (p.onFoot && p.bustTimer > 1.2) {
    p.bustTimer = 0;
    var fine = Math.min(p.cash, 150);
    p.cash -= fine;
    p.wanted = 0;
    p.health = 100;
    p.x = 980;
    p.y = 1800;
    Police.cars.length = 0;
    MissionState.showBanner('BUSTED! The PD took $' + fine + ' and dropped you at the station.');
    AudioSys.crash();
  }
  if (p.health <= 0) {
    p.health = 100;
    var lost = Math.min(p.cash, 200);
    p.cash -= lost;
    p.wanted = 0;
    p.x = 2240;
    p.y = 620;
    p.onFoot = true;
    p.car = null;
    Police.cars.length = 0;
    MissionState.showBanner('WASTED! You woke up at St. Anselm Hospital, $' + lost + ' lighter.');
  }
};

// ---- player update ---------------------------------------------------

game.updatePlayer = function (dt) {
  var p = this.player;
  var k = this.keys;
  if (p.hurtTimer > 0) p.hurtTimer -= dt;
  if (this.crashCooldown > 0) this.crashCooldown -= dt;
  if (this.fireTimer > 0) this.fireTimer -= dt;

  if (p.onFoot) {
    AudioSys.setEngine(0, false);
    var mx = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    var my = (k['KeyS'] || k['ArrowDown'] ? 1 : 0) - (k['KeyW'] || k['ArrowUp'] ? 1 : 0);
    var sprint = k['ShiftLeft'] || k['ShiftRight'];
    var sp = sprint ? 330 : 215;
    if (mx !== 0 || my !== 0) {
      var len = Math.hypot(mx, my);
      p.x += (mx / len) * sp * dt;
      p.y += (my / len) * sp * dt;
      p.angle = Math.atan2(my, mx);
    }
    // Aim at the mouse; click to shoot.
    var worldMouse = this.screenToWorld(this.mouse.x, this.mouse.y);
    p.angle = Math.atan2(worldMouse.y - p.y, worldMouse.x - p.x);
    if (this.mouse.down && this.fireTimer <= 0 && p.mag > 0) {
      this.fireTimer = 0.18;
      p.mag--;
      Bullets.fire(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, p.angle, true);
      AudioSys.shot();
      this.gunfireAt = { x: p.x, y: p.y };
      Particles.burst(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, '#ffd94a', 4, 90);
      this.shake = Math.max(this.shake, 2);
    }
    if (this.mouse.down && p.mag <= 0 && p.ammo > 0) this.reload();
    collideBuildings(p, 14);
    if (isWater(p.x, p.y)) {
      // The sea is not a shortcut: push back to the sand.
      p.x = Math.min(p.x, 3230);
    }
    clampToWorld(p, 16);
  } else if (p.car) {
    var car = p.car;
    var fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    var steer = (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0);
    var accel = car.model.accel;
    if (fwd > 0) car.speed += accel * dt;
    else if (fwd < 0) {
      if (car.speed > 30) car.speed -= accel * 1.4 * dt;
      else car.speed -= 200 * dt;
    } else {
      car.speed *= Math.max(0, 1 - 0.7 * dt);
    }
    var offRoad = !isOnRoad(car.x, car.y);
    var top = car.model.top * (offRoad ? 0.55 : 1);
    if (car.speed > top) car.speed = top;
    if (car.speed < -190) car.speed = -190;
    var turn = steer * 2.5 * dt * Math.min(1, Math.abs(car.speed) / 120);
    car.angle += turn * (car.speed >= 0 ? 1 : -1);
    var nx = car.x + Math.cos(car.angle) * car.speed * dt;
    var ny = car.y + Math.sin(car.angle) * car.speed * dt;
    var probe = { x: nx, y: ny };
    var hitBuilding = collideBuildings(probe, 20);
    if (hitBuilding) {
      if (Math.abs(car.speed) > 200 && this.crashCooldown <= 0) {
        car.health -= 12;
        this.crashCooldown = 0.6;
        this.shake = 7;
        AudioSys.crash();
        Particles.burst(car.x, car.y, '#cccccc', 14, 140);
        if (car.health <= 0) {
          Particles.burst(car.x, car.y, '#ff7a3a', 40, 260);
          p.car = null;
          p.onFoot = true;
          p.x = car.x + 40;
          p.y = car.y + 40;
          p.health -= 20;
          this.commitCrime(1);
        }
      }
      car.speed *= 0.4;
      car.x = probe.x;
      car.y = probe.y;
    } else {
      car.x = nx;
      car.y = ny;
    }
    if (isWater(car.x, car.y)) {
      car.x = Math.min(car.x, 3220);
      car.speed *= 0.5;
    }
    clampToWorld(car, 26);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Traffic fender-benders slow both cars down.
    for (var i = 0; i < Traffic.cars.length; i++) {
      var t = Traffic.cars[i];
      if (Math.hypot(t.x - car.x, t.y - car.y) < 42) {
        car.speed *= 0.96;
        t.speed = Math.min(t.speed, 40);
        if (Math.abs(car.speed) > 260 && this.crashCooldown <= 0) {
          this.crashCooldown = 0.5;
          AudioSys.crash();
          this.shake = 4;
        }
      }
    }
    AudioSys.setEngine(Math.abs(car.speed) / 560, true);
  }

  // Health slowly recovers when safe.
  if (p.wanted === 0 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 1.2 * dt);
};

game.reload = function () {
  var p = this.player;
  if (p.ammo <= 0 || p.mag >= 12) return;
  var need = 12 - p.mag;
  var take = Math.min(need, p.ammo);
  p.mag += take;
  p.ammo -= take;
  AudioSys.blip(520);
};

game.trySteal = function () {
  var p = this.player;
  if (p.onFoot) {
    var car = Traffic.nearestCar(p.x, p.y, 70);
    if (car) {
      Traffic.removeCar(car);
      car.health = 100;
      car.speed = 0;
      p.car = car;
      p.onFoot = false;
      p.x = car.x;
      p.y = car.y;
      AudioSys.blip(440);
      if (!car.parked) this.commitCrime(1);
      if (MissionState.active) MissionState.update(0, this);
    }
  } else {
    // Step out of the car.
    var c = p.car;
    p.car = null;
    p.onFoot = true;
    p.x = c.x - Math.sin(c.angle) * 34;
    p.y = c.y + Math.cos(c.angle) * 34;
    p.angle = c.angle;
    AudioSys.setEngine(0, false);
    collideBuildings(p, 14);
  }
};

game.screenToWorld = function (sx, sy) {
  return { x: this.cam.x - VIEW_W / 2 + sx, y: this.cam.y - VIEW_H / 2 + sy };
};

// ---- main update -----------------------------------------------------

game.update = function (dt) {
  this.tick++;
  var p = this.player;
  this.updatePlayer(dt);
  Traffic.update(dt, p, new LanternRng(GAME_SEED + this.tick));
  Peds.update(dt, p, this.gunfireAt);
  this.gunfireAt = null;
  Police.update(dt, p, new LanternRng(GAME_SEED + 5000 + this.tick));
  MissionState.update(dt, this);
  MissionState.updateEnemies(dt, this);
  Bullets.update(dt, p, MissionState.enemies,
    function (ped) {
      game.commitCrime(1);
      Particles.burst(ped.x, ped.y, '#c93a3a', 10, 120);
      Peds.list.splice(Peds.list.indexOf(ped), 1);
    },
    function (enemy) {
      Particles.burst(enemy.x, enemy.y, '#ff5a3a', 12, 150);
    },
    function (dmg) {
      p.health -= dmg;
      p.hurtTimer = 0.4;
      game.shake = Math.max(game.shake, 3);
    });
  Particles.update(dt);
  this.updateWanted(dt);
  AudioSys.setSiren(Police.cars.length > 0);
  // Camera follows the player with a soft lag.
  this.cam.x += (p.x - this.cam.x) * Math.min(1, dt * 4);
  this.cam.y += (p.y - this.cam.y) * Math.min(1, dt * 4);
  this.cam.x = Math.max(VIEW_W / 2 - 200, Math.min(WORLD_W - VIEW_W / 2 + 200, this.cam.x));
  this.cam.y = Math.max(VIEW_H / 2 - 200, Math.min(WORLD_H - VIEW_H / 2 + 200, this.cam.y));
  if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
  if (Hud.hintTimer > 0) Hud.hintTimer -= dt;
  this.saveTimer += dt;
  if (this.saveTimer > 8) {
    this.saveTimer = 0;
    saveGame();
  }
};

// ---- rendering -------------------------------------------------------

game.render = function (ctx) {
  var camX = this.cam.x - VIEW_W / 2;
  var camY = this.cam.y - VIEW_H / 2;
  if (this.shake > 0) {
    camX += (Math.random() - 0.5) * this.shake;
    camY += (Math.random() - 0.5) * this.shake;
  }
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  // Ground.
  ctx.fillStyle = '#46683f';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Parks.
  ctx.fillStyle = '#3a7a44';
  for (var pk = 0; pk < cityParks.length; pk++) {
    var park = cityParks[pk];
    ctx.fillRect(park.x - camX, park.y - camY, park.w, park.h);
  }
  // Beach and sea.
  ctx.fillStyle = '#d8c08a';
  ctx.fillRect(3180 - camX, 0 - camY, 120, WORLD_H);
  ctx.fillStyle = '#2f6f8f';
  ctx.fillRect(3300 - camX, 0 - camY, WORLD_W - 3300, WORLD_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (var w = 0; w < 12; w++) {
    var wy = ((w * 211 + this.tick * 0.6) % WORLD_H);
    ctx.beginPath();
    ctx.moveTo(3320 - camX, wy - camY);
    ctx.lineTo(3380 - camX, wy - camY);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Roads.
  ctx.fillStyle = '#3a3d44';
  for (var i = 0; i < ROADS_X.length; i++) ctx.fillRect(ROADS_X[i] - ROAD_W / 2 - camX, -camY, ROAD_W, WORLD_H);
  for (var j = 0; j < ROADS_Y.length; j++) ctx.fillRect(-camX, ROADS_Y[j] - ROAD_W / 2 - camY, WORLD_W, ROAD_W);
  // Sidewalks.
  ctx.strokeStyle = '#8f887c';
  ctx.lineWidth = 6;
  for (var si = 0; si < ROADS_X.length; si++) {
    ctx.beginPath(); ctx.moveTo(ROADS_X[si] - ROAD_W / 2 - camX, -camY); ctx.lineTo(ROADS_X[si] - ROAD_W / 2 - camX, WORLD_H - camY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROADS_X[si] + ROAD_W / 2 - camX, -camY); ctx.lineTo(ROADS_X[si] + ROAD_W / 2 - camX, WORLD_H - camY); ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Lane dashes.
  ctx.strokeStyle = 'rgba(255, 214, 90, 0.75)';
  ctx.setLineDash([26, 30]);
  for (var di = 0; di < ROADS_X.length; di++) {
    ctx.beginPath(); ctx.moveTo(ROADS_X[di] - camX, -camY); ctx.lineTo(ROADS_X[di] - camX, WORLD_H - camY); ctx.stroke();
  }
  for (var dj = 0; dj < ROADS_Y.length; dj++) {
    ctx.beginPath(); ctx.moveTo(-camX, ROADS_Y[dj] - camY); ctx.lineTo(WORLD_W - camX, ROADS_Y[dj] - camY); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Buildings in view.
  for (var b = 0; b < cityBuildings.length; b++) {
    var bd = cityBuildings[b];
    if (bd.x + bd.w < camX - 40 || bd.x > camX + VIEW_W + 40 || bd.y + bd.h < camY - 40 || bd.y > camY + VIEW_H + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bd.x - camX + 6, bd.y - camY + 8, bd.w, bd.h);
    ctx.fillStyle = bd.color;
    ctx.fillRect(bd.x - camX, bd.y - camY, bd.w, bd.h);
    ctx.fillStyle = bd.roof;
    ctx.fillRect(bd.x - camX + 8, bd.y - camY + 8, bd.w - 16, bd.h - 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(bd.x - camX + 8, bd.y - camY + 8, bd.w - 16, bd.h - 16);
    // Windows.
    ctx.fillStyle = 'rgba(255, 240, 180, 0.55)';
    for (var wx = bd.x + 20; wx < bd.x + bd.w - 14; wx += 26) {
      for (var wy = bd.y + 20; wy < bd.y + bd.h - 14; wy += 26) {
        ctx.fillRect(wx - camX, wy - camY, 10, 8);
      }
    }
    if (bd.landmark) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bd.name, bd.x + bd.w / 2 - camX, bd.y + bd.h / 2 - camY + 4);
      ctx.textAlign = 'left';
    }
  }
  // Trees.
  for (var t = 0; t < cityTrees.length; t++) {
    var tr = cityTrees[t];
    if (tr.x < camX - 30 || tr.x > camX + VIEW_W + 30 || tr.y < camY - 30 || tr.y > camY + VIEW_H + 30) continue;
    ctx.fillStyle = '#2c5a2e';
    ctx.beginPath(); ctx.arc(tr.x - camX, tr.y - camY, tr.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a8a3f';
    ctx.beginPath(); ctx.arc(tr.x - camX - 2, tr.y - camY - 2, tr.r * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  // Mission target marker.
  var step = MissionState.currentStep();
  if (MissionState.active && step) {
    var pulse = 1 + Math.sin(this.tick * 0.1) * 0.15;
    ctx.save();
    ctx.translate(step.x - camX, step.y - camY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd94a';
    var ms = 16 * pulse;
    ctx.fillRect(-ms / 2, -ms / 2, ms, ms);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(-ms / 2, -ms / 2, ms, ms);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 217, 74, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(step.x - camX, step.y - camY, 46 + Math.sin(this.tick * 0.1) * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    this.drawEdgeArrow(ctx, step.x, step.y, camX, camY);
  }
  // Traffic, police, peds, enemies, player, bullets, particles.
  for (var ti = 0; ti < Traffic.cars.length; ti++) this.drawCar(ctx, Traffic.cars[ti], camX, camY, false);
  for (var qi = 0; qi < Police.cars.length; qi++) this.drawCar(ctx, Police.cars[qi], camX, camY, true);
  for (var pi = 0; pi < Peds.list.length; pi++) this.drawPed(ctx, Peds.list[pi], camX, camY);
  for (var ei = 0; ei < MissionState.enemies.length; ei++) {
    var en = MissionState.enemies[ei];
    if (!en.alive) continue;
    ctx.fillStyle = '#1e1e24';
    ctx.beginPath(); ctx.arc(en.x - camX, en.y - camY, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff4a3a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(en.x - camX, en.y - camY, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(en.x - camX, en.y - camY); ctx.lineTo(en.x - camX + Math.cos(en.angle) * 22, en.y - camY + Math.sin(en.angle) * 22); ctx.stroke();
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(en.x - camX - 14, en.y - camY - 26, 28 * Math.max(0, en.health / 80), 4);
  }
  this.drawPlayer(ctx, camX, camY);
  ctx.strokeStyle = '#ffe94a';
  ctx.lineWidth = 3;
  for (var bi = 0; bi < Bullets.list.length; bi++) {
    var bl = Bullets.list[bi];
    ctx.beginPath();
    ctx.moveTo(bl.x - camX - Math.cos(bl.angle) * 10, bl.y - camY - Math.sin(bl.angle) * 10);
    ctx.lineTo(bl.x - camX, bl.y - camY);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (var fi = 0; fi < Particles.list.length; fi++) {
    var pt = Particles.list[fi];
    ctx.globalAlpha = Math.max(0, pt.life * 2);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x - camX, pt.y - camY, pt.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Warm sun-soaked tint.
  var grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(255, 190, 90, 0.05)');
  grad.addColorStop(1, 'rgba(255, 140, 60, 0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (this.player.hurtTimer > 0) {
    ctx.fillStyle = 'rgba(200, 30, 30, 0.18)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
};

game.drawEdgeArrow = function (ctx, wx, wy, camX, camY) {
  var sx = wx - camX;
  var sy = wy - camY;
  if (sx > 40 && sx < VIEW_W - 40 && sy > 40 && sy < VIEW_H - 40) return;
  var cx = Math.max(50, Math.min(VIEW_W - 50, sx));
  var cy = Math.max(60, Math.min(VIEW_H - 50, sy));
  var ang = Math.atan2(sy - cy, sx - cx);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

game.drawCar = function (ctx, car, camX, camY, isPolice) {
  var sx = car.x - camX;
  var sy = car.y - camY;
  if (sx < -80 || sx > VIEW_W + 80 || sy < -80 || sy > VIEW_H + 80) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);
  var L = car.model.len;
  var W = car.model.wid;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // Wheels.
  ctx.fillStyle = '#111';
  ctx.fillRect(-L / 2 + 6, -W / 2 - 3, 12, 6);
  ctx.fillRect(-L / 2 + 6, W / 2 - 3, 12, 6);
  ctx.fillRect(L / 2 - 18, -W / 2 - 3, 12, 6);
  ctx.fillRect(L / 2 - 18, W / 2 - 3, 12, 6);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = 'rgba(20, 30, 44, 0.85)';
  roundRect(ctx, -L / 2 + 12, -W / 2 + 4, L - 30, W - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 220, 255, 0.5)';
  ctx.fillRect(L / 2 - 14, -W / 2 + 4, 5, W - 8);
  // Headlights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
  if (isPolice) {
    var flash = Math.sin(car.sirenPhase) > 0;
    ctx.fillStyle = flash ? '#ff3a3a' : '#3a6cff';
    ctx.fillRect(-6, -W / 2 + 2, 12, 6);
    ctx.fillStyle = flash ? '#3a6cff' : '#ff3a3a';
    ctx.fillRect(-6, W / 2 - 8, 12, 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    ctx.textAlign = 'left';
  }
  if (car.health < 50 && !isPolice) {
    ctx.fillStyle = 'rgba(120,120,120,0.8)';
    ctx.beginPath(); ctx.arc(-L / 4, 0, 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};

game.drawPed = function (ctx, ped, camX, camY) {
  var sx = ped.x - camX;
  var sy = ped.y - camY;
  if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) return;
  var bob = Math.sin(ped.walkPhase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + 8, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath(); ctx.arc(sx, sy + bob * 0.3, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(sx + Math.cos(ped.angle) * 3, sy + Math.sin(ped.angle) * 3 + bob * 0.3, 5, 0, Math.PI * 2); ctx.fill();
};

game.drawPlayer = function (ctx, camX, camY) {
  var p = this.player;
  var sx = p.x - camX;
  var sy = p.y - camY;
  if (p.onFoot) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 9, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e6fb5';
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89a';
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e1e24';
    ctx.beginPath(); ctx.arc(sx, sy - 2, 6, Math.PI, 0); ctx.fill();
    // Gun barrel toward the aim.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(p.angle) * 20, sy + Math.sin(p.angle) * 20);
    ctx.stroke();
    ctx.lineWidth = 1;
    // White ring so the player is always findable.
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.stroke();
  } else if (p.car) {
    this.drawCar(ctx, p.car, camX, camY, false);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
  }
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- menu DOM ----------------------------------------------------------

function showMenu() {
  var menu = document.getElementById('menu');
  if (menu) menu.style.display = 'flex';
  var cont = document.getElementById('continueBtn');
  if (cont) cont.style.display = loadSave() ? 'inline-block' : 'none';
}

function hideMenu() {
  var menu = document.getElementById('menu');
  if (menu) menu.style.display = 'none';
}

function wireMenu() {
  var newBtn = document.getElementById('newBtn');
  if (newBtn) newBtn.addEventListener('click', function () { AudioSys.init(); AudioSys.resume(); startNewGame(); });
  var contBtn = document.getElementById('continueBtn');
  if (contBtn) contBtn.addEventListener('click', function () { AudioSys.init(); AudioSys.resume(); continueGame(); });
  var howBtn = document.getElementById('howBtn');
  var how = document.getElementById('howto');
  if (howBtn && how) howBtn.addEventListener('click', function () {
    how.style.display = how.style.display === 'none' ? 'block' : 'none';
  });
}

// ---- boot --------------------------------------------------------------

function bootGame() {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  wireMenu();
  var params = new URLSearchParams(window.location.search);
  var demo = params.get('demo');
  var shot = params.get('shot');
  if (shot) Hud.hintTimer = 0;

  window.addEventListener('keydown', function (e) {
    game.keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.code === 'KeyE' && game.state === 'playing') game.trySteal();
    if (e.code === 'KeyR' && game.state === 'playing') game.reload();
    if (e.code === 'KeyM') {
      var on = AudioSys.toggleMusic();
      MissionState.showBanner(on ? 'Music on.' : 'Music off.');
    }
    if (e.code === 'KeyP' && game.state === 'playing') {
      game.state = 'paused';
      MissionState.showBanner('Paused — press P to keep playing. Progress saved.');
      saveGame();
    } else if (e.code === 'KeyP' && game.state === 'paused') {
      game.state = 'playing';
    }
    AudioSys.init();
    AudioSys.resume();
  });
  window.addEventListener('keyup', function (e) { game.keys[e.code] = false; });
  canvas.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    game.mouse.x = (e.clientX - rect.left) * (VIEW_W / rect.width);
    game.mouse.y = (e.clientY - rect.top) * (VIEW_H / rect.height);
  });
  canvas.addEventListener('mousedown', function (e) {
    game.mouse.down = true;
    AudioSys.init();
    AudioSys.resume();
  });
  window.addEventListener('mouseup', function () { game.mouse.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  if (demo) {
    startDemo(demo);
  } else {
    resetWorld();
    game.player = makePlayer(555, 530);
    game.state = 'menu';
    showMenu();
  }

  var last = performance.now();
  var acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var elapsed = Math.min(100, now - last);
    last = now;
    acc += elapsed;
    while (acc >= STEP * 1000) {
      acc -= STEP * 1000;
      if (game.state === 'playing') game.update(STEP);
    }
    if (game.state === 'playing' || game.state === 'paused') {
      game.render(ctx);
      Hud.draw(ctx, game, VIEW_W, VIEW_H);
      if (game.state === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 10);
        ctx.font = '18px monospace';
        ctx.fillText('Press P to resume — your progress is saved', VIEW_W / 2, VIEW_H / 2 + 30);
        ctx.textAlign = 'left';
      }
    } else {
      // Menu backdrop: render the city behind the title.
      game.render(ctx);
    }
  }
  requestAnimationFrame(frame);
}

document.addEventListener('DOMContentLoaded', bootGame);
