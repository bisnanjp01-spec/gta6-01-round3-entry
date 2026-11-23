// main.js — Port Azura: game loop, camera, rendering, input, save/load and
// the deterministic screenshot states (?shot=cover|drive|chase|mission).
// Fixed timestep (60 Hz) with a seeded world, so the city plays the same every load.
const SAVE_KEY = "portazura-save-v1";
const STEP = 1 / 60;

const Game = {
  canvas: null, ctx: null,
  city: null, player: null, traffic: null, police: null, missions: null,
  state: "menu", // menu | playing | paused | busted | wasted
  camera: { x: 0, y: 0, shake: 0 },
  input: { up: false, down: false, left: false, right: false, sprint: false, handbrake: false },
  mouse: { x: 0, y: 0, down: false },
  mouseWorld: { x: 0, y: 0 },
  enemies: [], tracers: [], sparks: [], skids: [], pickups: [],
  elapsed: 0, frames: 0, shotMode: null,
  timeOfDay: 0.32, // afternoon sun

  boot() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.city = buildCity();
    this.player = createPlayer(this.city);
    this.traffic = createTraffic(this.city, this.player);
    this.police = createPolice();
    this.missions = createMissions();
    this.buildPickups();
    Hud.init();
    this.bindInput();
    const params = new URLSearchParams(window.location.search);
    this.shotMode = params.get("shot");
    if (this.shotMode) {
      this.startNewGame();
      this.applyShotState(this.shotMode);
      // Snap the camera to the player at once so the first rendered frame
      // already shows the intended scene (no drift-in from the origin).
      this.camera.x = clampValue(this.player.x - this.canvas.width / 2, 0, CITY_WIDTH - this.canvas.width);
      this.camera.y = clampValue(this.player.y - this.canvas.height / 2, 0, CITY_HEIGHT - this.canvas.height);
    } else {
      Hud.showStart(this);
      Hud.setObjective("Port Azura", "Press START ENGINE, then N to take your first job.", null);
    }
    let last = performance.now(), acc = 0;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= STEP) { this.tick(STEP); acc -= STEP; }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  buildPickups() {
    this.pickups = [
      { kind: "health", x: 1000, y: 740, label: "+50 Health", taken: false, respawn: 0 },
      { kind: "armor", x: 600, y: 1760, label: "+50 Armor", taken: false, respawn: 0 },
      { kind: "ammo", x: 1000, y: 2210, label: "+24 Ammo", taken: false, respawn: 0 },
    ];
  },

  // ----- game flow -----
  startNewGame() {
    SoundEngine.init(); SoundEngine.resume(); SoundEngine.startMusic();
    this.state = "playing";
    Hud.hideScreen();
    this.missions = createMissions();
    this.player = createPlayer(this.city);
    this.traffic = createTraffic(this.city, this.player);
    this.police = createPolice();
    this.enemies = [];
    this.buildPickups();
    this.message("Welcome to Port Azura, Mara. Press N for your first job.");
    Hud.setObjective("Port Azura", "Press N to take your first job.", null);
  },

  startContinueGame() {
    const save = this.loadSaveData();
    this.startNewGame();
    if (save) {
      this.player.cash = save.cash; this.player.health = save.health;
      this.player.armor = save.armor; this.player.ammo = save.ammo;
      this.player.missionsDone = save.missionsDone; this.player.kills = save.kills;
      this.player.carsStolen = save.carsStolen;
      this.player.x = save.x; this.player.y = save.y;
      this.missions.index = save.missionIndex;
      this.message("Save loaded — job " + (save.missionIndex + 1) + " of 6. Press N to continue.");
    }
  },

  togglePause() {
    if (this.state === "playing") { this.state = "paused"; Hud.showPause(this); SoundEngine.setSiren(false); }
    else if (this.state === "paused") { this.state = "playing"; Hud.hideScreen(); }
  },

  onPlayerDown() {
    this.state = "wasted";
    SoundEngine.setSiren(false); SoundEngine.setEngine(0, false);
    Hud.showWasted(this);
  },

  onBusted() {
    this.state = "busted";
    this.player.cash = Math.max(0, this.player.cash - 300);
    this.player.wanted = 0;
    this.police.copCars = []; this.police.officers = [];
    SoundEngine.setSiren(false);
    Hud.showBusted(this);
  },

  respawnAfterBusted() {
    const home = this.city.landmarks.hideout;
    this.player.x = home.x; this.player.y = home.y;
    this.player.health = 100; this.player.inCar = null;
    this.state = "playing"; Hud.hideScreen();
    this.message("You walked out of the precinct. Lay low for a while.");
  },

  respawnAfterWasted() {
    const home = this.city.landmarks.hideout;
    this.player.x = home.x; this.player.y = home.y;
    this.player.health = 100; this.player.armor = 0; this.player.inCar = null;
    this.player.wanted = 0;
    this.police.copCars = []; this.police.officers = [];
    this.enemies = [];
    this.state = "playing"; Hud.hideScreen();
    this.message("You woke up at the hideout. The city is still yours to take.");
  },

  onEnemyDown(enemy) {
    this.addHitSpark(enemy.x, enemy.y, "#ff5a4e");
    if (this.missions.active) {
      const step = currentStep(this.missions);
      if (step && step.kind === "defeat") {
        this.missions.defeatLeft--;
        this.message("Crew member down — " + this.missions.defeatLeft + " left.");
      }
    }
    if (enemy.isOfficer) raiseWanted(this.player, 0.5);
  },

  // ----- HUD helpers used by other systems -----
  message(text) { Hud.message(text); },
  showToast(text) { Hud.showToast(text); },
  setObjective(title, text, step, dist) { Hud.setObjective(title, text, step, dist); },
  addShake(n) { this.camera.shake = Math.max(this.camera.shake, n); },
  addTracer(x1, y1, x2, y2) { this.tracers.push({ x1, y1, x2, y2, life: 0.12 }); },
  addHitSpark(x, y, color) {
    for (let i = 0; i < 10; i++) {
      this.sparks.push({ x, y, vx: randRange(-160, 160), vy: randRange(-160, 160), life: 0.4, color });
    }
  },
  spawnSkid(car) {
    if (Math.abs(car.speed) > 260 && this.skids.length < 400) {
      this.skids.push({ x: car.x - Math.cos(car.angle) * 16, y: car.y - Math.sin(car.angle) * 16, life: 6 });
    }
  },

  // ----- save / load -----
  saveGame() {
    try {
      const s = {
        cash: this.player.cash, health: this.player.health, armor: this.player.armor,
        ammo: this.player.ammo, missionIndex: this.missions.index,
        missionsDone: this.player.missionsDone, kills: this.player.kills,
        carsStolen: this.player.carsStolen, x: this.player.x, y: this.player.y,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (e) {}
  },

  loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  // ----- input -----
  bindInput() {
    const keymap = {
      KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
      KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
      ShiftLeft: "sprint", ShiftRight: "sprint", Space: "handbrake",
    };
    window.addEventListener("keydown", (e) => {
      if (keymap[e.code] !== undefined) { this.input[keymap[e.code]] = true; e.preventDefault(); }
      if (e.code === "KeyE") this.tryEnterCar();
      if (e.code === "KeyF") playerPunch(this.player, this.enemies.concat(this.police.officers), this);
      if (e.code === "KeyN") this.tryNextMission();
      if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) this.saveGame();
      if (e.code === "KeyP" || e.code === "Escape") this.togglePause();
      if (e.code === "KeyM") { const m = SoundEngine.toggleMute(); this.message(m ? "Sound muted." : "Sound on."); }
    });
    window.addEventListener("keyup", (e) => {
      if (keymap[e.code] !== undefined) this.input[keymap[e.code]] = false;
    });
    this.canvas.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    this.canvas.addEventListener("mousedown", (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.state !== "playing") return;
      SoundEngine.init(); SoundEngine.resume();
      if (!this.player.inCar) {
        playerShoot(this.player, this.mouseWorld.x, this.mouseWorld.y,
          this.enemies.concat(this.police.officers), this);
        for (const ped of this.traffic.peds) {
          if (distanceBetween(ped.x, ped.y, this.mouseWorld.x, this.mouseWorld.y) < 200) ped.panic = 2;
        }
      }
    });
  },

  tryEnterCar() {
    if (this.state !== "playing") return;
    if (this.player.inCar) { playerExitCar(this.player, this); return; }
    const car = nearestCarTo(this.traffic.cars, this.player.x, this.player.y, 52);
    if (car) {
      if (playerEnterCar(this.player, car)) {
        if (car.stolen && this.player.carsStolen > 0) {
          raiseWanted(this.player, 0.6);
          this.message("You stole the " + car.name + "! The APD noticed.");
        } else {
          this.message("You took the " + car.name + ".");
        }
        SoundEngine.blip(440, 0.1, "sine", 0.12);
      }
      return;
    }
    const cop = nearestCarTo(this.police.copCars, this.player.x, this.player.y, 52);
    if (cop) this.message("That one belongs to the APD — find another ride.");
  },

  tryNextMission() {
    if (this.state !== "playing") return;
    if (this.missions.done) { this.message("All six jobs are done — free roam, Mara."); return; }
    if (this.missions.active) { this.message("Finish the current job first."); return; }
    startMission(this.missions, this);
    const step = currentStep(this.missions);
    if (step && step.kind === "defeat") this.spawnGangCrew(2200, 1400, step.count);
  },

  spawnGangCrew(x, y, count) {
    this.enemies = [];
    for (let i = 0; i < count; i++) {
      this.enemies.push({
        x: x + randRange(-90, 90), y: y + randRange(-90, 90),
        angle: randRange(0, Math.PI * 2), health: 70, speed: 120,
        shootCooldown: randRange(0.5, 1.5), isOfficer: false,
        color: "#8e2f2f", name: "Harbor King",
      });
    }
    this.message("Harbor Kings crew spotted — take them down!");
  },

  // ----- simulation -----
  tick(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    this.frames++;
    updatePlayer(this.player, this.input, dt, this.city, this.traffic.cars, this);
    updateTraffic(this.traffic, dt, this.city, this.player, this);
    updatePolice(this.police, dt, this.city, this.player, this.traffic, this);
    updateMissions(this.missions, dt, this);
    this.updateEnemies(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.collidePlayerCarWithTraffic();
    // Camera follows the player with a soft lag.
    const tx = clampValue(this.player.x - this.canvas.width / 2, 0, CITY_WIDTH - this.canvas.width);
    const ty = clampValue(this.player.y - this.canvas.height / 2, 0, CITY_HEIGHT - this.canvas.height);
    this.camera.x = lerpValue(this.camera.x, tx, 1 - Math.pow(0.001, dt));
    this.camera.y = lerpValue(this.camera.y, ty, 1 - Math.pow(0.001, dt));
    this.camera.shake = Math.max(0, this.camera.shake - dt * 22);
    this.mouseWorld.x = this.mouse.x + this.camera.x;
    this.mouseWorld.y = this.mouse.y + this.camera.y;
    if (this.frames % 30 === 0) Hud.update(this);
  },

  updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.health <= 0) { this.enemies.splice(i, 1); continue; }
      const dist = distanceBetween(e.x, e.y, this.player.x, this.player.y);
      e.angle = angleTo(e.x, e.y, this.player.x, this.player.y);
      if (dist > 70) {
        e.x += Math.cos(e.angle) * e.speed * dt;
        e.y += Math.sin(e.angle) * e.speed * dt;
      }
      collideCircleWithBuildings(this.city, e, 10);
      e.shootCooldown -= dt;
      if (dist < 380 && e.shootCooldown <= 0) {
        e.shootCooldown = randRange(1.2, 2.0);
        if (randChance(0.4)) {
          this.addTracer(e.x, e.y, this.player.x, this.player.y);
          SoundEngine.gunshot();
          damagePlayer(this.player, 7, this);
        }
      }
      if (dist < 30 && e.shootCooldown <= 0) {
        e.shootCooldown = 0.8;
        damagePlayer(this.player, 10, this);
        this.message("A Harbor King hit you!");
      }
    }
  },

  updatePickups(dt) {
    for (const pk of this.pickups) {
      if (pk.taken) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) pk.taken = false;
        continue;
      }
      if (distanceBetween(this.player.x, this.player.y, pk.x, pk.y) < 30) {
        pk.taken = true; pk.respawn = 45;
        if (pk.kind === "health") this.player.health = Math.min(100, this.player.health + 50);
        if (pk.kind === "armor") this.player.armor = Math.min(100, this.player.armor + 50);
        if (pk.kind === "ammo") this.player.ammo += 24;
        this.message("Picked up: " + pk.label);
        SoundEngine.pickup();
      }
    }
  },

  updateEffects(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    for (let i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].life -= dt;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }
  },

  collidePlayerCarWithTraffic() {
    const car = this.player.inCar;
    if (!car) return;
    for (const other of this.traffic.cars) {
      if (other === car || other.driver === "player") continue;
      const d = distanceBetween(car.x, car.y, other.x, other.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const nx = (car.x - other.x) / d, ny = (car.y - other.y) / d;
        car.x += nx * push; car.y += ny * push;
        other.x -= nx * push; other.y -= ny * push;
        if (Math.abs(car.speed) > 120) {
          car.speed *= 0.6;
          SoundEngine.crash();
          this.addShake(4);
          raiseWanted(this.player, 0.15);
        }
        other.speed = 0;
      }
    }
  },

  // ----- screenshot states -----
  applyShotState(shot) {
    const p = this.player;
    if (shot === "cover") {
      p.x = 1000; p.y = 920; p.inCar = null;
      this.missions.index = 0;
      startMission(this.missions, this);
      this.camera.x = clampValue(p.x - 640, 0, CITY_WIDTH - 1280);
      this.camera.y = clampValue(p.y - 400, 0, CITY_HEIGHT - 800);
      this.message("Port Azura — first job: deliver the package to the Plaza.");
    } else if (shot === "drive") {
      const car = this.traffic.cars.find(c => !c.isPolice) || makeTrafficCar(this.city, 1400, 1000);
      car.x = 1400; car.y = 900; car.angle = Math.PI / 2; car.speed = 260;
      car.color = "#d23b3b"; car.name = "Azura GT"; car.stolen = true;
      p.carsStolen = 1;
      p.inCar = car; car.driver = "player"; p.x = car.x; p.y = car.y;
      this.missions.index = 1;
      startMission(this.missions, this);
      this.message("Driving the Azura GT down Harbor Avenue.");
    } else if (shot === "chase") {
      const car = this.traffic.cars.find(c => !c.isPolice) || makeTrafficCar(this.city, 1000, 1000);
      car.x = 1000; car.y = 1000; car.angle = 0; car.speed = 300;
      car.color = "#e8c33a"; car.name = "Comet";
      p.inCar = car; car.driver = "player"; p.x = car.x; p.y = car.y;
      p.wanted = 3;
      this.police.copCars = [];
      for (let i = 0; i < 3; i++) {
        const cop = spawnCopCar(this.city, p);
        cop.x = p.x - 120 - i * 70; cop.y = p.y + (i - 1) * 90;
        cop.angle = 0; cop.speed = 280;
        this.police.copCars.push(cop);
      }
      this.missions.index = 4;
      startMission(this.missions, this);
      this.message("Three stars — the APD is on your tail!");
    } else if (shot === "mission") {
      p.x = 2200; p.y = 1330; p.inCar = null; p.ammo = 48;
      this.missions.index = 3;
      startMission(this.missions, this);
      // Jump straight to the shootout step so the capture shows the fight.
      this.missions.step = 1;
      this.missions.defeatLeft = 3;
      this.spawnGangCrew(2200, 1400, 3);
      this.setObjective("4 · The Informant", "Deal with the Harbor Kings crew (3)", currentStep(this.missions));
      p.wanted = 1;
      this.message("The Informant — shut the meeting down at Cafe Lumen.");
    }
    Hud.update(this);
  },

  // ----- rendering -----
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const shX = (Math.random() - 0.5) * this.camera.shake;
    const shY = (Math.random() - 0.5) * this.camera.shake;
    const camX = this.camera.x + shX, camY = this.camera.y + shY;
    // Sky-tinted ground.
    ctx.fillStyle = "#3f7d4e";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-camX, -camY);
    this.drawGround(ctx);
    this.drawRoads(ctx);
    this.drawParks(ctx);
    this.drawSkids(ctx);
    this.drawPickups(ctx);
    this.drawBuildings(ctx);
    this.drawTrees(ctx);
    this.drawLamps(ctx);
    this.drawMissionMarker(ctx);
    this.drawCars(ctx);
    this.drawPeds(ctx);
    this.drawEnemies(ctx);
    this.drawPlayer(ctx);
    this.drawEffects(ctx);
    ctx.restore();
    // Warm afternoon vignette.
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    grad.addColorStop(0, "rgba(255,190,90,0)");
    grad.addColorStop(1, "rgba(255,170,60,0.14)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    window.__gameReady = true;
  },

  drawGround(ctx) {
    ctx.fillStyle = "#4a8a58";
    ctx.fillRect(0, 0, CITY_WIDTH, CITY_HEIGHT);
    // Sidewalk-colored city base.
    ctx.fillStyle = "#b9b3a4";
    ctx.fillRect(0, 0, CITY_WIDTH, CITY_HEIGHT);
    // Beach + water on the east edge.
    ctx.fillStyle = "#e8d49a";
    ctx.fillRect(3030, 0, 70, CITY_HEIGHT);
    ctx.fillStyle = "#2f7fb8";
    ctx.fillRect(3100, 0, 100, CITY_HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    for (let y = 0; y < CITY_HEIGHT; y += 90) {
      ctx.fillRect(3104, y + ((this.elapsed * 20) % 90), 92, 4);
    }
    // District labels painted on the ground.
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    for (const d of DISTRICTS) ctx.fillText(d.name.toUpperCase(), d.x + d.w / 2, d.y + d.h / 2);
    ctx.textAlign = "left";
  },

  drawRoads(ctx) {
    ctx.fillStyle = "#33363d";
    for (const ax of AVENUE_X) ctx.fillRect(ax - ROAD_WIDTH / 2, 0, ROAD_WIDTH, CITY_HEIGHT);
    for (const sy of STREET_Y) ctx.fillRect(0, sy - ROAD_WIDTH / 2, CITY_WIDTH, ROAD_WIDTH);
    // Center dashes.
    ctx.fillStyle = "#e8d23a";
    for (const ax of AVENUE_X) {
      for (let y = 0; y < CITY_HEIGHT; y += 64) ctx.fillRect(ax - 3, y, 6, 30);
    }
    for (const sy of STREET_Y) {
      for (let x = 0; x < CITY_WIDTH; x += 64) ctx.fillRect(x, sy - 3, 30, 6);
    }
    // Crosswalks at intersections.
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (const ax of AVENUE_X) {
      for (const sy of STREET_Y) {
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(ax - ROAD_WIDTH / 2 + 8 + i * 12, sy - ROAD_WIDTH / 2 + 4, 6, 14);
        }
      }
    }
  },

  drawParks(ctx) {
    for (const park of this.city.parks) {
      ctx.fillStyle = "#3f8a4e";
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = "#5aa86a";
      ctx.fillRect(park.x + 10, park.y + 10, park.w - 20, park.h - 20);
      ctx.fillStyle = "#7fc3e8";
      ctx.beginPath();
      ctx.arc(park.x + park.w / 2, park.y + park.h / 2, Math.min(park.w, park.h) / 5, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawSkids(ctx) {
    ctx.fillStyle = "rgba(20,20,20,.35)";
    for (const s of this.skids) ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
  },

  drawPickups(ctx) {
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      const bob = Math.sin(this.elapsed * 3 + pk.x) * 3;
      ctx.fillStyle = pk.kind === "health" ? "#e74c3c" : pk.kind === "armor" ? "#3498db" : "#f1c40f";
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(pk.kind === "health" ? "+" : pk.kind === "armor" ? "A" : "•", pk.x, pk.y + bob + 5);
      ctx.textAlign = "left";
    }
  },

  drawBuildings(ctx) {
    for (const b of this.city.buildings) {
      // Pseudo-3D: side faces, then roof with windows.
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.fillRect(b.x + 6, b.y + 6, b.w, b.h);
      ctx.fillStyle = shadeColor(b.color, -28);
      ctx.fillRect(b.x, b.y + b.height * 0.4, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      ctx.fillStyle = "rgba(255,255,200,.75)";
      const cols = Math.max(1, Math.floor(b.w / 34)), rows = Math.max(1, Math.floor(b.h / 34));
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          ctx.fillRect(b.x + 12 + c * 34, b.y + 12 + r * 34, 14, 10);
        }
      }
    }
  },

  drawTrees(ctx) {
    for (const t of this.city.trees) {
      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.beginPath(); ctx.arc(t.x + 4, t.y + 4, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e7d32";
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#66bb6a";
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawLamps(ctx) {
    ctx.fillStyle = "#2c2c2c";
    for (const l of this.city.lamps) ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  },

  drawMissionMarker(ctx) {
    const step = currentStep(this.missions);
    if (!this.missions.active || !step || step.x === undefined) return;
    const pulse = 1 + Math.sin(this.elapsed * 5) * 0.25;
    const r = 26 * pulse;
    ctx.save();
    ctx.translate(step.x, step.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(255,210,63,.9)";
    ctx.fillRect(-r / 2, -r / 2, r, r);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.strokeRect(-r / 2, -r / 2, r, r);
    ctx.restore();
    ctx.fillStyle = "#1a1206";
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("★", step.x, step.y + 5);
    ctx.textAlign = "left";
  },

  drawCarShape(ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(-22, -11, 46, 24);
    // Body.
    ctx.fillStyle = car.color;
    roundRectPath(ctx, -22, -13, 44, 26, 7);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = "rgba(20,30,45,.85)";
    roundRectPath(ctx, -6, -10, 16, 20, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,.7)";
    ctx.fillRect(8, -9, 4, 18);
    // Headlights.
    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(20, -11, 3, 5); ctx.fillRect(20, 6, 3, 5);
    if (car.isPolice) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("APD", 0, 3);
      ctx.textAlign = "left";
      const blink = Math.floor(this.elapsed * 6) % 2 === 0;
      ctx.fillStyle = blink ? "#ff2d2d" : "#2d7bff";
      ctx.beginPath(); ctx.arc(-2, -12, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? "#2d7bff" : "#ff2d2d";
      ctx.beginPath(); ctx.arc(-2, 12, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  drawCars(ctx) {
    for (const car of this.traffic.cars) this.drawCarShape(ctx, car);
    for (const cop of this.police.copCars) this.drawCarShape(ctx, cop);
  },

  drawPeds(ctx) {
    for (const ped of this.traffic.peds) {
      const bob = Math.sin(ped.walkPhase) * 2;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.arc(ped.x + 2, ped.y + 3, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.arc(ped.x, ped.y + bob, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f2c89b";
      ctx.beginPath(); ctx.arc(ped.x, ped.y + bob - 2, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawEnemies(ctx) {
    for (const e of this.enemies) {
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.arc(e.x + 2, e.y + 3, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(e.x, e.y - 2, 5, 0, Math.PI * 2); ctx.fill();
      // Health bar.
      ctx.fillStyle = "#222";
      ctx.fillRect(e.x - 14, e.y - 24, 28, 5);
      ctx.fillStyle = "#ff3b30";
      ctx.fillRect(e.x - 14, e.y - 24, 28 * (e.health / 70), 5);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(e.name, e.x, e.y - 28);
      ctx.textAlign = "left";
    }
    for (const off of this.police.officers) {
      ctx.fillStyle = "#1c2f4a";
      ctx.beginPath(); ctx.arc(off.x, off.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#cfe0ff";
      ctx.beginPath(); ctx.arc(off.x, off.y - 2, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("APD", off.x, off.y - 16);
      ctx.textAlign = "left";
    }
  },

  drawPlayer(ctx) {
    const p = this.player;
    if (p.inCar) return; // the car shape is the player while driving
    const bob = p.speed > 10 ? Math.sin(this.elapsed * 12) * 2 : 0;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8b13a";
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath(); ctx.arc(p.x, p.y + bob - 3, 6, 0, Math.PI * 2); ctx.fill();
    // Gun direction tick.
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 12, p.y + Math.sin(p.angle) * 12);
    ctx.lineTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("MARA", p.x, p.y - 20);
    ctx.textAlign = "left";
  },

  drawEffects(ctx) {
    ctx.strokeStyle = "#ffe27a";
    ctx.lineWidth = 2;
    for (const t of this.tracers) {
      ctx.globalAlpha = clampValue(t.life / 0.12, 0, 1);
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of this.sparks) {
      ctx.globalAlpha = clampValue(s.life / 0.4, 0, 1);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  },
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = clampValue(((n >> 16) & 255) + amt, 0, 255);
  let g = clampValue(((n >> 8) & 255) + amt, 0, 255);
  let b = clampValue((n & 255) + amt, 0, 255);
  return "rgb(" + r + "," + g + "," + b + ")";
}

window.addEventListener("load", () => Game.boot());
