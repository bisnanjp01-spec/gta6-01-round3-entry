// main.js — Solstice City: the game loop, the player, driving, combat, the
// camera and all the drawing. One job: run the world the other files describe.
(function () {
  'use strict';
  var C = window.SC.city;
  var T = window.SC.traffic;
  var POL = window.SC.police;
  var MIS = window.SC.missions;
  var HUD = window.SC.hud;
  var SAVE = window.SC.save;
  var AUDIO = window.SC.audio;
  var SHOTS = window.SC.shots;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var VIEW_W = 1280, VIEW_H = 720;

  window.addEventListener('error', function (e) {
    document.title = 'ERR: ' + (e.message || 'unknown');
  });

  var city = C.buildCity();
  var traffic = T.makeTraffic();
  var police = POL.makePolice();
  var missions = MIS.makeMissions();
  var rng = C.mulberry32(424242);

  var player = {
    x: C.PLACES.inezDiner.x, y: C.PLACES.inezDiner.y, angle: 0,
    speed: 0, inCar: false, car: null, carHealth: 100, health: 100
  };
  var state = {
    cash: 0, day: 1, elapsed: 0, bestCash: 0, started: false,
    paused: false, missions: missions
  };
  var camera = { x: player.x - VIEW_W / 2, y: player.y - VIEW_H / 2 };
  var keys = {};
  var mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
  var rivals = [];
  var bullets = [];
  var enemyBullets = [];
  var pickup = null;
  var goldCar = null;
  var lastShot = 0;
  var saveTimer = 0;
  var shotStageSpawned = -1;
  var game = {
    player: player, police: police, state: state, traffic: traffic,
    frozen: false, startPlay: startPlay, showStart: showStart,
    step: step, hudShow: showBanner, spawnRivals: spawnRivals
  };

  function showBanner(text) { HUD.showBanner(text, 3600); }

  function showStart() {
    document.getElementById('start').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('over').classList.add('hidden');
    var save = SAVE.loadGame();
    if (save) {
      document.getElementById('continuebtn').classList.remove('hidden');
      document.getElementById('contday').textContent = String(save.day);
    }
  }

  function startPlay(fromSave) {
    var save = fromSave ? SAVE.loadGame() : null;
    if (save) {
      state.cash = save.cash; state.day = save.day;
      state.bestCash = save.bestCash || save.cash;
      missions.index = Math.min(save.missionIndex, MIS.MISSIONS.length - 1);
      missions.kills = save.kills || 0;
      if (save.storyDone) missions.storyDone = true;
    }
    document.getElementById('start').classList.add('hidden');
    document.getElementById('over').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    state.started = true;
    state.paused = false;
    AUDIO.ensure();
    var m = MIS.current(missions);
    if (m) showBanner(m.title + ' — ' + m.brief, 5200);
    else showBanner('Solstice City is yours. Spend it well.');
  }

  function gameOver(title, text) {
    state.started = false;
    AUDIO.play('busted');
    AUDIO.setEngine(false, 0);
    AUDIO.setSiren(false);
    document.getElementById('overtitle').textContent = title;
    document.getElementById('overtext').textContent = text;
    document.getElementById('over').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  function bustPlayer() {
    var fine = Math.min(state.cash, 200);
    state.cash -= fine;
    police.stars = 0; police.heat = 0; police.cruisers = []; police.bustedTimer = 0;
    gameOver('BUSTED', 'The Solstice police haul Rae in. Bail costs ' + HUD.fmtCash(fine) +
      '. She walks out of the station with her debt intact and her pride bruised.');
  }

  function wastePlayer() {
    var lost = Math.min(state.cash, 300);
    state.cash -= lost;
    player.health = 100;
    player.x = C.PLACES.hospital.x; player.y = C.PLACES.hospital.y;
    player.inCar = false; player.car = null;
    police.stars = 0; police.heat = 0; police.cruisers = []; police.bustedTimer = 0;
    gameOver('WASTED', 'Rae wakes up at St. Anselm Hospital, $' + lost +
      ' lighter. The Foundry debt is still waiting.');
  }

  function spawnRivals(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      rivals.push({
        x: x + Math.cos(a) * 130, y: y + Math.sin(a) * 130,
        health: 100, speed: 62 + rng() * 20, shootTimer: 1 + rng() * 1.5
      });
    }
  }

  function tryEnterCar() {
    if (player.inCar) {
      // Step out: leave the car parked where it stands.
      var car = player.car;
      car.x = player.x; car.y = player.y;
      car.speed = 0; car.parked = true;
      car.horizontal = Math.abs(Math.cos(player.angle)) > 0.7;
      car.dir = Math.cos(player.angle) >= 0 ? 1 : -1;
      traffic.cars.push(car);
      player.x += Math.cos(player.angle + Math.PI / 2) * 30;
      player.y += Math.sin(player.angle + Math.PI / 2) * 30;
      player.inCar = false; player.car = null; player.speed = 0;
      AUDIO.setEngine(false, 0);
      return;
    }
    var car2 = T.nearestCar(traffic, player.x, player.y, 56);
    if (!car2) return;
    var idx = traffic.cars.indexOf(car2);
    if (idx >= 0) traffic.cars.splice(idx, 1);
    player.inCar = true;
    player.car = car2;
    player.carHealth = 100;
    player.angle = car2.horizontal ? (car2.dir > 0 ? 0 : Math.PI) : (car2.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    player.speed = 0;
    var heat = POL.addHeat(police, 8, 'car theft');
    AUDIO.play('steal');
    if (heat.raised) showBanner('WANTED — ' + POL.starLabel(heat.stars) + ' (' + heat.stars + '★). Lose the cops!');
    // The gold coupe is the repo job's prize.
    if (car2.gold) {
      var st = MIS.currentStage(missions);
      if (st && st.kind === 'stealGold') advanceStage();
    }
  }

  function shoot() {
    var now = performance.now() / 1000;
    if (now - lastShot < 0.28) return;
    lastShot = now;
    var wx = camera.x + mouse.x, wy = camera.y + mouse.y;
    var a = Math.atan2(wy - player.y, wx - player.x);
    player.angle = a;
    bullets.push({ x: player.x + Math.cos(a) * 20, y: player.y + Math.sin(a) * 20, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540, life: 0.8 });
    AUDIO.play('shoot');
    POL.addHeat(police, 2, 'gunfire');
    T.scarePeds(traffic, player.x, player.y, 260);
  }

  function advanceStage() {
    var res = MIS.advance(missions);
    pickup = null;
    shotStageSpawned = -1;
    if (res.missionDone) {
      state.cash += res.pay;
      AUDIO.play('mission');
      showBanner(res.title + ' COMPLETE — +' + HUD.fmtCash(res.pay) + (res.storyDone ? ' DEBT PAID. SOLSTICE CITY IS YOURS.' : ''), 5200);
      SAVE.saveGame(state);
      var next = MIS.current(missions);
      if (next) setTimeout(function () { showBanner(next.title + ' — ' + next.brief, 5200); }, 3600);
    }
  }

  function missionTarget() {
    var st = MIS.currentStage(missions);
    if (!st) return null;
    if (st.kind === 'reach' || st.kind === 'escape') return MIS.placeOf(st);
    if (st.kind === 'pickup') return MIS.placeOf({ place: missions.index === 4 ? 'uptownBank' : 'foundryGate' });
    if (st.kind === 'stealGold') return C.PLACES.uptownBank;
    if (st.kind === 'combat') return C.PLACES.marina;
    return null;
  }

  function ensureStageProps() {
    var st = MIS.currentStage(missions);
    if (!st) return;
    var key = missions.index * 10 + missions.stage;
    if (key === shotStageSpawned) return;
    shotStageSpawned = key;
    if (st.kind === 'pickup') {
      var place = missions.index === 4 ? C.PLACES.uptownBank : C.PLACES.foundryGate;
      pickup = { x: place.x, y: place.y, kind: 'package' };
    }
    if (st.kind === 'combat' && rivals.length === 0) {
      spawnRivals(C.PLACES.marina.x, C.PLACES.marina.y, st.count);
    }
    if (missions.index === 2 && !goldCar) {
      goldCar = {
        x: C.PLACES.uptownBank.x + 40, y: C.PLACES.uptownBank.y + 90,
        horizontal: true, dir: 1, speed: 0, color: '#ffd23e', len: 34, wid: 17,
        kind: 'coupe', gold: true, parked: true
      };
      traffic.cars.push(goldCar);
    }
  }

  function checkMission() {
    var st = MIS.currentStage(missions);
    if (!st) return;
    if (st.kind === 'getCar') {
      if (player.inCar) advanceStage();
    } else if (st.kind === 'reach') {
      var place = MIS.placeOf(st);
      if (place) {
        var dx = place.x - player.x, dy = place.y - player.y;
        if (dx * dx + dy * dy < 70 * 70) advanceStage();
      }
    } else if (st.kind === 'pickup') {
      if (pickup) {
        var pdx = pickup.x - player.x, pdy = pickup.y - player.y;
        if (pdx * pdx + pdy * pdy < 30 * 30) {
          missions.packageHeld = true;
          AUDIO.play('pickup');
          showBanner('Package secured. Deliver it.');
          if (missions.index === 4) POL.addHeat(police, 40, 'bank job');
          advanceStage();
        }
      }
    } else if (st.kind === 'stealGold') {
      if (player.inCar && player.car && player.car.gold) advanceStage();
    } else if (st.kind === 'combat') {
      if (missions.kills >= st.count) advanceStage();
    } else if (st.kind === 'escape') {
      var safe = C.PLACES.safehouse;
      var sdx = safe.x - player.x, sdy = safe.y - player.y;
      if (police.stars === 0 && sdx * sdx + sdy * sdy < 80 * 80) advanceStage();
    }
  }

  function movePlayer(dt) {
    var fwd = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    var strafe = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
    if (player.inCar) {
      var maxSpeed = 250;
      player.speed += fwd * 190 * dt;
      if (fwd === 0) player.speed *= Math.max(0, 1 - 0.9 * dt);
      if (fwd < 0) player.speed = Math.max(player.speed, -70);
      player.speed = Math.max(-70, Math.min(maxSpeed, player.speed));
      if (Math.abs(player.speed) > 4) {
        player.angle += strafe * 1.9 * dt * (player.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(player.speed) / 90);
      }
      var nx = player.x + Math.cos(player.angle) * player.speed * dt;
      var ny = player.y + Math.sin(player.angle) * player.speed * dt;
      if (!C.collideRect(city, nx - 13, ny - 9, 26, 18)) { player.x = nx; player.y = ny; }
      else {
        player.speed *= 0.35;
        player.carHealth -= 4;
        AUDIO.play('crash');
      }
      var cl = C.clampToWorld(player.x, player.y, 20);
      player.x = cl.x; player.y = cl.y;
      AUDIO.setEngine(true, Math.abs(player.speed) / maxSpeed);
      // Running over a pedestrian is a crime, and it shows.
      for (var i = 0; i < traffic.peds.length; i++) {
        var p = traffic.peds[i];
        var dx = p.x - player.x, dy = p.y - player.y;
        if (dx * dx + dy * dy < 26 * 26) {
          POL.addHeat(police, 12, 'hit pedestrian');
          T.scarePeds(traffic, player.x, player.y, 200);
          p.x = Math.max(40, Math.min(C.WORLD_W - 40, p.x + (rng() - 0.5) * 300));
          p.y = Math.max(40, Math.min(C.WORLD_H - 40, p.y + (rng() - 0.5) * 300));
        }
      }
      if (player.carHealth <= 0) {
        player.inCar = false; player.car = null; player.speed = 0;
        AUDIO.play('crash');
        showBanner('Your car is wrecked. Run!');
      }
    } else {
      var run = (keys['ShiftLeft'] || keys['ShiftRight']) ? 260 : 165;
      var mx = strafe, my = -fwd;
      var len = Math.sqrt(mx * mx + my * my);
      if (len > 0) {
        mx /= len; my /= len;
        var px = player.x + mx * run * dt;
        var py = player.y + my * run * dt;
        if (!C.collideRect(city, px - 11, player.y - 11, 22, 22)) player.x = px;
        if (!C.collideRect(city, player.x - 11, py - 11, 22, 22)) player.y = py;
        player.angle = Math.atan2(camera.y + mouse.y - player.y, camera.x + mouse.x - player.x);
      }
      var cl2 = C.clampToWorld(player.x, player.y, 16);
      player.x = cl2.x; player.y = cl2.y;
      AUDIO.setEngine(false, 0);
    }
  }

  function stepRivals(dt) {
    for (var i = rivals.length - 1; i >= 0; i--) {
      var r = rivals[i];
      var dx = player.x - r.x, dy = player.y - r.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 12) {
        r.x += (dx / d) * r.speed * dt;
        r.y += (dy / d) * r.speed * dt;
      }
      r.shootTimer -= dt;
      if (r.shootTimer <= 0 && d < 420) {
        r.shootTimer = 1.4 + rng() * 1.2;
        var a = Math.atan2(dy, dx) + (rng() - 0.5) * 0.2;
        enemyBullets.push({ x: r.x, y: r.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, life: 1.1 });
      }
      if (r.health <= 0) {
        rivals.splice(i, 1);
        missions.kills++;
        state.cash += 60;
      }
    }
  }

  function stepBullets(dt) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      var dead = b.life <= 0;
      if (!dead) {
        for (var j = 0; j < rivals.length; j++) {
          var r = rivals[j];
          var dx = r.x - b.x, dy = r.y - b.y;
          if (dx * dx + dy * dy < 18 * 18) { r.health -= 34; dead = true; break; }
        }
      }
      if (!dead && C.collideRect(city, b.x - 1, b.y - 1, 2, 2)) dead = true;
      if (dead) bullets.splice(i, 1);
    }
    for (var k = enemyBullets.length - 1; k >= 0; k--) {
      var eb = enemyBullets[k];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
      var edx = player.x - eb.x, edy = player.y - eb.y;
      if (edx * edx + edy * edy < 16 * 16) {
        player.health -= 9;
        enemyBullets.splice(k, 1);
        continue;
      }
      if (eb.life <= 0) enemyBullets.splice(k, 1);
    }
  }

  function step(dt) {
    state.elapsed += dt;
    ensureStageProps();
    movePlayer(dt);
    T.stepTraffic(traffic, dt, player, city);
    var cleared = POL.stepPolice(police, dt, player, rng);
    if (cleared.cleared) showBanner('You lost them. The heat is off.');
    stepRivals(dt);
    stepBullets(dt);
    checkMission();
    if (police.bustedTimer > 1.2) { bustPlayer(); return; }
    if (player.health <= 0) { wastePlayer(); return; }
    AUDIO.setSiren(police.stars >= 2);
    saveTimer += dt;
    if (saveTimer > 15) { saveTimer = 0; SAVE.saveGame(state); }
    // Camera follows the player, clamped to the world.
    camera.x = Math.max(0, Math.min(C.WORLD_W - VIEW_W, player.x - VIEW_W / 2));
    camera.y = Math.max(0, Math.min(C.WORLD_H - VIEW_H, player.y - VIEW_H / 2));
  }

  function drawCar(x, y, c, angle, isPlayer) {
    ctx.save();
    ctx.translate(x - camera.x, y - camera.y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-c.len / 2 + 2, -c.wid / 2 + 3, c.len, c.wid);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.len / 2, -c.wid / 2, c.len, c.wid);
    ctx.fillStyle = 'rgba(200,225,255,0.85)';
    ctx.fillRect(-4, -c.wid / 2 + 2, 10, c.wid - 4);
    ctx.fillStyle = '#1c2733';
    ctx.fillRect(c.len / 2 - 7, -c.wid / 2 + 2, 4, 4);
    ctx.fillRect(c.len / 2 - 7, c.wid / 2 - 6, 4, 4);
    if (isPlayer) {
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(-c.len / 2 - 2, -2, 3, 4);
    }
    ctx.restore();
  }

  function draw() {
    var vx0 = camera.x, vy0 = camera.y;
    ctx.fillStyle = '#3f7a58';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // District ground.
    for (var d = 0; d < C.DISTRICTS.length; d++) {
      var dist = C.DISTRICTS[d];
      ctx.fillStyle = dist.ground;
      ctx.fillRect(dist.x - vx0, dist.y - vy0, dist.w, dist.h);
    }
    // Parks.
    for (var p = 0; p < city.parks.length; p++) {
      var park = city.parks[p];
      ctx.fillStyle = '#2f7a3e';
      ctx.fillRect(park.x - vx0, park.y - vy0, park.w, park.h);
      ctx.fillStyle = '#57a05a';
      ctx.beginPath(); ctx.arc(park.x + park.w / 3 - vx0, park.y + park.h / 3 - vy0, 16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(park.x + park.w * 2 / 3 - vx0, park.y + park.h * 2 / 3 - vy0, 20, 0, Math.PI * 2); ctx.fill();
    }
    // Roads: asphalt, then centre dashes.
    ctx.fillStyle = '#33383f';
    for (var gx = 0; gx < C.WORLD_W; gx += C.ROAD_STEP) {
      ctx.fillRect(gx - vx0, -vy0, C.ROAD_W, C.WORLD_H);
    }
    for (var gy = 0; gy < C.WORLD_H; gy += C.ROAD_STEP) {
      ctx.fillRect(-vx0, gy - vy0, C.WORLD_W, C.ROAD_W);
    }
    ctx.fillStyle = '#e8d44f';
    for (var dx2 = 0; dx2 < C.WORLD_W; dx2 += 64) {
      for (var gy2 = 0; gy2 < C.WORLD_H; gy2 += C.ROAD_STEP) {
        ctx.fillRect(dx2 - vx0, gy2 + C.ROAD_W / 2 - 2 - vy0, 30, 4);
      }
    }
    for (var dy2 = 0; dy2 < C.WORLD_H; dy2 += 64) {
      for (var gx2 = 0; gx2 < C.WORLD_W; gx2 += C.ROAD_STEP) {
        ctx.fillRect(gx2 + C.ROAD_W / 2 - 2 - vx0, dy2 - vy0, 4, 30);
      }
    }
    // Parking lots.
    for (var l = 0; l < city.lots.length; l++) {
      var lot = city.lots[l];
      ctx.fillStyle = '#6b6f75';
      ctx.fillRect(lot.x - vx0, lot.y - vy0, lot.w, lot.h);
    }
    // Buildings with roofs and windows.
    for (var b = 0; b < city.buildings.length; b++) {
      var bd = city.buildings[b];
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bd.x - vx0 + 4, bd.y - vy0 + 5, bd.w, bd.h);
      ctx.fillStyle = bd.color;
      ctx.fillRect(bd.x - vx0, bd.y - vy0, bd.w, bd.h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bd.x - vx0, bd.y - vy0, bd.w, 5);
      if (bd.kind === 'tower') {
        ctx.fillStyle = 'rgba(20,40,70,0.5)';
        for (var f = 0; f < bd.floors; f++) {
          ctx.fillRect(bd.x + 6 - vx0, bd.y + 8 + f * 12 - vy0, bd.w - 12, 5);
        }
      } else if (bd.roof) {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(bd.x + bd.w / 4 - vx0, bd.y + bd.h / 4 - vy0, bd.w / 2, bd.h / 2);
      }
    }
    // Place labels.
    ctx.font = 'bold 15px Trebuchet MS, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    var placeNames = Object.keys(C.PLACES);
    for (var pi = 0; pi < placeNames.length; pi++) {
      var pl = C.PLACES[placeNames[pi]];
      ctx.fillText(pl.label, pl.x - vx0 - 30, pl.y - vy0 - 12);
    }
    // Mission marker beacon.
    var target = missionTarget();
    if (target) {
      var pulse = 5 + Math.sin(state.elapsed * 4) * 2;
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(target.x - vx0, target.y - vy0, 26 + pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(target.x - vx0, target.y - vy0 - 14);
      ctx.lineTo(target.x + 10 - vx0, target.y - vy0);
      ctx.lineTo(target.x - vx0, target.y + 14 - vy0);
      ctx.lineTo(target.x - 10 - vx0, target.y - vy0);
      ctx.closePath(); ctx.fill();
    }
    if (pickup) {
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(pickup.x - 10 - vx0, pickup.y - 10 - vy0, 20, 20);
      ctx.strokeStyle = '#7a5a00';
      ctx.lineWidth = 2;
      ctx.strokeRect(pickup.x - 10 - vx0, pickup.y - 10 - vy0, 20, 20);
    }
    // Pedestrians.
    for (var j = 0; j < traffic.peds.length; j++) {
      var ped = traffic.peds[j];
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.arc(ped.x - vx0, ped.y - vy0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2118';
      ctx.beginPath(); ctx.arc(ped.x - vx0, ped.y - 2 - vy0, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Traffic cars.
    for (var i = 0; i < traffic.cars.length; i++) {
      var car = traffic.cars[i];
      var ang = car.horizontal ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      drawCar(car.x, car.y, car, ang, false);
    }
    // Police cruisers with flashing light bars.
    for (var ci = 0; ci < police.cruisers.length; ci++) {
      var cr = police.cruisers[ci];
      drawCar(cr.x, cr.y, { color: cr.color, len: 36, wid: 18 }, cr.angle, false);
      var flash = Math.sin(cr.siren) > 0 ? '#ff3b30' : '#3b82ff';
      ctx.fillStyle = flash;
      ctx.fillRect(cr.x - 6 - vx0, cr.y - 12 - vy0, 12, 5);
    }
    // Rivals.
    for (var ri = 0; ri < rivals.length; ri++) {
      var rv = rivals[ri];
      ctx.fillStyle = '#c22e2e';
      ctx.beginPath(); ctx.arc(rv.x - vx0, rv.y - vy0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Trebuchet MS, sans-serif';
      ctx.fillText('V', rv.x - 4 - vx0, rv.y + 4 - vy0);
      ctx.fillStyle = '#40060a';
      ctx.fillRect(rv.x - 12 - vx0, rv.y - 20 - vy0, 24, 4);
      ctx.fillStyle = '#ff5a4e';
      ctx.fillRect(rv.x - 12 - vx0, rv.y - 20 - vy0, 24 * (rv.health / 100), 4);
    }
    // Bullets.
    ctx.strokeStyle = '#ffe14e';
    ctx.lineWidth = 3;
    for (var bi = 0; bi < bullets.length; bi++) {
      var bl = bullets[bi];
      ctx.beginPath(); ctx.moveTo(bl.x - vx0, bl.y - vy0);
      ctx.lineTo(bl.x - bl.vx * 0.02 - vx0, bl.y - bl.vy * 0.02 - vy0); ctx.stroke();
    }
    ctx.strokeStyle = '#ff6a4e';
    for (var ei = 0; ei < enemyBullets.length; ei++) {
      var eb = enemyBullets[ei];
      ctx.beginPath(); ctx.moveTo(eb.x - vx0, eb.y - vy0);
      ctx.lineTo(eb.x - eb.vx * 0.02 - vx0, eb.y - eb.vy * 0.02 - vy0); ctx.stroke();
    }
    // The player: on foot a runner with a jacket, in a car the car itself.
    if (player.inCar && player.car) {
      drawCar(player.x, player.y, player.car, player.angle, true);
      if (player.carHealth < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(player.x - 26 - vx0, player.y - 34 - vy0, 52, 6);
        ctx.fillStyle = '#ff5a4e';
        ctx.fillRect(player.x - 26 - vx0, player.y - 34 - vy0, 52 * (player.carHealth / 100), 6);
      }
    } else {
      ctx.fillStyle = '#e8452c';
      ctx.beginPath(); ctx.arc(player.x - vx0, player.y - vy0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8452c';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(player.x - vx0, player.y - vy0);
      ctx.lineTo(player.x + Math.cos(player.angle) * 18 - vx0, player.y + Math.sin(player.angle) * 18 - vy0); ctx.stroke();
      ctx.fillStyle = '#ffd9c2';
      ctx.beginPath(); ctx.arc(player.x - vx0, player.y - vy0, 4, 0, Math.PI * 2); ctx.fill();
    }
    // HUD + minimap.
    if (state.started) {
      HUD.updateHud({
        cash: state.cash, health: player.health, stars: police.stars,
        elapsed: state.elapsed, day: state.day, inCar: player.inCar,
        speed: player.speed, objective: MIS.stageText(missions)
      });
      HUD.drawMinimap({
        player: player, cruisers: police.cruisers, marker: target
      });
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.started || state.paused || game.frozen) {
      draw();
      return;
    }
    var dt = Math.min(0.05, (now - (frame.last || now)) / 1000 || 0.016);
    frame.last = now;
    step(dt);
    draw();
  }

  function onKey(e, down) {
    keys[e.code] = down;
    if (down && e.code === 'KeyE') tryEnterCar();
    if (down && e.code === 'KeyP' && state.started) {
      state.paused = !state.paused;
      document.getElementById('pause').classList.toggle('hidden', !state.paused);
    }
    if (down && e.code === 'KeyM') {
      var m = AUDIO.toggleMute();
      showBanner(m ? 'Sound off.' : 'Sound on.');
    }
    if (down && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  }

  window.addEventListener('keydown', function (e) { onKey(e, true); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });
  canvas.addEventListener('mousemove', function (e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (VIEW_W / r.width);
    mouse.y = (e.clientY - r.top) * (VIEW_H / r.height);
  });
  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 0 && state.started && !state.paused && !player.inCar) shoot();
  });
  document.getElementById('startbtn').addEventListener('click', function () { startPlay(false); });
  document.getElementById('continuebtn').addEventListener('click', function () { startPlay(true); });
  document.getElementById('resumebtn').addEventListener('click', function () {
    state.paused = false;
    document.getElementById('pause').classList.add('hidden');
  });
  document.getElementById('restartbtn').addEventListener('click', function () {
    SAVE.clearSave();
    window.location.reload();
  });
  document.getElementById('retrybtn').addEventListener('click', function () {
    document.getElementById('over').classList.add('hidden');
    player.health = 100;
    player.x = C.PLACES.hospital.x; player.y = C.PLACES.hospital.y;
    player.inCar = false; player.car = null;
    state.started = true;
    document.getElementById('hud').classList.remove('hidden');
  });

  // Boot: start screen, or a staged screenshot scene.
  window.SC.game = game;
  var shot = SHOTS.shotNumber();
  if (shot > 0) {
    showStart();
    document.getElementById('start').classList.add('hidden');
    SHOTS.stage(game, shot);
    draw();
  } else {
    showStart();
  }
  requestAnimationFrame(frame);
})();
