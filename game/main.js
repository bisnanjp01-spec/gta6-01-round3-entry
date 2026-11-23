// Emberline — the game itself: state, the fixed-timestep loop, input,
// rendering, stealing, shops, the armored convoy, busted and wasted, and
// saving. The simulation runs at a fixed 60 Hz from a fixed seed, so the
// same inputs always play the same night.
import { makeRng, clamp, distance, angleTo } from "./rng.js";
import { buildHarbor, isWater, buildingHit, districtAt, WORLD_W, WORLD_H } from "./harbor.js";
import { makeCar, makeBoat, stepVehicle, vehicleNear, CAR_COLORS } from "./drive.js";
import { makeWalker, stepWalker, makeBullet, stepBullets, damageWalker } from "./walk.js";
import { makeTraffic, stepTraffic } from "./traffic.js";
import { makeCops, stepCops, addHeat, clearWanted, nearestCopDistance } from "./cops.js";
import { makeJobs, updateJobs, startStory, startJob, refreshBoard, nextStoryChapter, STORY } from "./jobs.js";
import { updateHud, drawMinimap, pushToast } from "./hud.js";
import { makeAudio, audioUnlock, audioEngine, audioShot, audioPickup, audioCash, audioCrash, audioSiren, audioBusted, audioClick, audioMusicStep, audioSetMuted } from "./audio.js";
import { applyShot } from "./shots.js";

const SEED = "emberline-20261124";
const DT = 1 / 60;
const SAVE_KEY = "emberline-save-v1";

export function createGame(canvas, els) {
  const city = buildHarbor(SEED);
  const rng = makeRng(SEED);
  const state = {
    city, rng, canvas, els,
    mode: "menu", // menu | playing | paused | gameover
    simSeconds: 0, tick: 0, lastDt: 0,
    player: makeWalker(1000, 660),
    vehicle: null,
    parkedCars: [],
    boats: [],
    markedCar: null,
    convoy: null,
    traffic: makeTraffic(city, rng, 14),
    cops: makeCops(),
    jobs: makeJobs(),
    cash: 120, toasts: [], events: [], pendingShots: [],
    bullets: [], particles: [],
    camera: { x: 1000, y: 660 },
    viewW: 1280, viewH: 720,
    keys: {}, mouse: { x: 0, y: 0, down: false },
    interactPrompt: "",
    audio: makeAudio(),
    musicStep: 0,
    gameoverKind: null,
    rainSeed: 7,
    boardOpen: false,
    saveNote: "",
  };
  spawnParked(state);
  spawnBoats(state);
  refreshBoard(state);
  return state;
}

function spawnParked(state) {
  const rng = state.rng;
  for (const spot of state.city.parkedSpots) {
    const car = makeCar(spot.x, spot.y, spot.angle, rng.pick(CAR_COLORS), rng.pick(["sedan", "sedan", "truck", "sport"]));
    car.parked = true;
    state.parkedCars.push(car);
  }
}

function spawnBoats(state) {
  for (const dock of state.city.boatDocks) {
    const boat = makeBoat(dock.x + 40, dock.y + 30, 0);
    boat.parked = true;
    state.boats.push(boat);
  }
}

function spawnMarkedCar(state) {
  const car = makeCar(1400, 200, Math.PI / 2, "#ff4757", "sport");
  car.parked = true;
  car.marked = true;
  state.markedCar = car;
  state.parkedCars.push(car);
  pushToast(state, "A red sportscar waits on Glass Row — take it.");
}

function ensureConvoy(state) {
  if (state.convoy) return;
  const job = state.jobs.active;
  const stage = job ? job.stages[job.stageIndex] : null;
  const x = stage ? stage.x : 1800;
  const y = stage ? stage.y : 600;
  state.convoy = {
    x, y, angle: 0, speed: 150, health: 400,
    route: [{ x: 1800, y: 600 }, { x: 2600, y: 600 }, { x: 2600, y: 1400 }, { x: 2600, y: 1800 }, { x: 1800, y: 1800 }, { x: 1800, y: 1000 }],
    leg: 0,
  };
}

function stepConvoy(state, dt) {
  const c = state.convoy;
  if (!c) return;
  const target = c.route[c.leg];
  const d = distance(c.x, c.y, target.x, target.y);
  if (d < 30) {
    c.leg = (c.leg + 1) % c.route.length;
    return;
  }
  const a = angleTo(c.x, c.y, target.x, target.y);
  c.angle = a;
  c.x += Math.cos(a) * c.speed * dt;
  c.y += Math.sin(a) * c.speed * dt;
  // The player ramming the convoy slows it and angers the escort.
  if (state.vehicle && distance(c.x, c.y, state.vehicle.x, state.vehicle.y) < 60) {
    c.speed = 110;
    if (state.cops.wanted < 2) addHeat(state.cops, 6 * dt);
  } else {
    c.speed = 150;
  }
}

function startNewGame(state) {
  state.mode = "playing";
  state.simSeconds = 0;
  state.tick = 0;
  state.cash = 120;
  state.player = makeWalker(1000, 660);
  state.vehicle = null;
  state.cops = makeCops();
  state.jobs = makeJobs();
  state.bullets = [];
  state.particles = [];
  state.toasts = [];
  state.events = [];
  state.pendingShots = [];
  state.convoy = null;
  state.markedCar = null;
  state.parkedCars = [];
  state.boats = [];
  state.traffic = makeTraffic(state.city, state.rng, 14);
  spawnParked(state);
  spawnBoats(state);
  refreshBoard(state);
  pushToast(state, "Emberline, 21:00. Mara Voss is back on the street. Find a payphone — work is waiting.");
  showOnly(state, null);
}

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash, rep: state.jobs.rep, chapter: state.jobs.chapter,
      completed: state.jobs.completed, finished: state.jobs.finished,
      simSeconds: state.simSeconds,
      player: { x: state.player.x, y: state.player.y, health: state.player.health, armor: state.player.armor, ammo: state.player.ammo, hasGun: state.player.hasGun },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.saveNote = "Saved.";
    return true;
  } catch (e) {
    state.saveNote = "Save failed (storage unavailable).";
    return false;
  }
}

export function loadSave(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function applySave(state, data) {
  startNewGame(state);
  state.cash = data.cash;
  state.jobs.rep = data.rep;
  state.jobs.chapter = data.chapter;
  state.jobs.completed = data.completed;
  state.jobs.finished = !!data.finished;
  state.simSeconds = data.simSeconds || 0;
  state.player.x = data.player.x;
  state.player.y = data.player.y;
  state.player.health = data.player.health;
  state.player.armor = data.player.armor;
  state.player.ammo = data.player.ammo;
  state.player.hasGun = !!data.player.hasGun;
  pushToast(state, "Save loaded — welcome back to Emberline.");
}

// ---------- input ----------

export function bindInput(state) {
  const canvas = state.canvas;
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    state.keys[e.key.toLowerCase()] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key === "Escape" || e.key.toLowerCase() === "p") togglePause(state);
    if (e.key.toLowerCase() === "e") doInteract(state);
    if (e.key.toLowerCase() === "m") {
      audioSetMuted(state.audio, !state.audio.muted);
      pushToast(state, state.audio.muted ? "Sound muted." : "Sound on.");
    }
    audioUnlock(state.audio);
  });
  window.addEventListener("keyup", (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - rect.left;
    state.mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener("mousedown", (e) => {
    state.mouse.down = true;
    state.mouse.x = e.clientX - canvas.getBoundingClientRect().left;
    state.mouse.y = e.clientY - canvas.getBoundingClientRect().top;
    audioUnlock(state.audio);
    if (state.mode === "playing") shoot(state);
  });
  window.addEventListener("mouseup", () => { state.mouse.down = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

function togglePause(state) {
  if (state.mode === "playing") {
    state.mode = "paused";
    showOnly(state, "pause");
  } else if (state.mode === "paused") {
    state.mode = "playing";
    showOnly(state, null);
  }
}

function showOnly(state, which) {
  const els = state.els;
  els.startScreen.style.display = which === "start" ? "flex" : "none";
  els.pauseMenu.style.display = which === "pause" ? "flex" : "none";
  els.jobBoard.style.display = which === "board" ? "flex" : "none";
  els.gameover.style.display = which === "gameover" ? "flex" : "none";
  if (which === "start") {
    const save = loadSave(state);
    els.btnContinue.style.display = save ? "inline-block" : "none";
    els.startSaveNote.textContent = save ? "Save found: $" + save.cash + " — chapter " + (save.chapter + 1) + "." : "No save yet.";
  }
}

function shoot(state) {
  const p = state.player;
  if (state.vehicle || state.mode !== "playing") return;
  if (p.shootCooldown > 0) return;
  const world = screenToWorld(state, state.mouse.x, state.mouse.y);
  if (p.hasGun && p.ammo > 0) {
    p.shootCooldown = 0.22;
    p.ammo--;
    p.angle = angleTo(p.x, p.y, world.x, world.y);
    state.bullets.push(makeBullet(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18, p.angle, p));
    audioShot(state.audio);
    addHeat(state.cops, 3);
    state.lastGunfire = { x: p.x, y: p.y };
  } else if (!p.hasGun) {
    // No gun: a punch, short range.
    p.shootCooldown = 0.4;
    for (const ped of state.traffic.peds) {
      if (ped.alive && distance(p.x, p.y, ped.x, ped.y) < 46) {
        ped.alive = false;
        addHeat(state.cops, 10);
        pushToast(state, "You knocked out a pedestrian. Someone saw that.");
        spawnParticles(state, ped.x, ped.y, "#f5d76e", 8);
      }
    }
    for (const o of state.cops.officers) {
      if (o.alive && distance(p.x, p.y, o.x, o.y) < 46) {
        o.hp = (o.hp === undefined ? 50 : o.hp) - 14;
        if (o.hp <= 0) o.alive = false;
        addHeat(state.cops, 12);
      }
    }
  }
}

function screenToWorld(state, sx, sy) {
  return {
    x: state.camera.x + (sx - state.viewW / 2),
    y: state.camera.y + (sy - state.viewH / 2),
  };
}

function spawnParticles(state, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = state.rng.range(0, Math.PI * 2);
    const s = state.rng.range(40, 180);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, color, size: state.rng.range(2, 5) });
  }
}

function nearestInteractable(state) {
  const p = state.player;
  const px = p.x, py = p.y;
  if (state.vehicle) return { kind: "exit", x: p.x, y: p.y, label: "E — step out" };
  const car = vehicleNear(state.parkedCars, px, py, 70);
  if (car) return { kind: "car", car, label: car.marked ? "E — steal the red sportscar" : "E — get in the car" };
  const boat = vehicleNear(state.boats, px, py, 80);
  if (boat) return { kind: "boat", boat, label: "E — board the boat" };
  for (const ph of state.city.payphones) {
    if (distance(px, py, ph.x, ph.y) < 60) return { kind: "payphone", label: "E — answer the payphone (jobs)" };
  }
  for (const s of state.city.shops) {
    if (distance(px, py, s.x, s.y) < 70) return { kind: "shop", shop: s, label: "E — " + s.name };
  }
  return null;
}

function doInteract(state) {
  if (state.mode !== "playing" || state.boardOpen) return;
  const it = nearestInteractable(state);
  if (!it) return;
  audioClick(state.audio);
  if (it.kind === "exit") {
    const v = state.vehicle;
    if (Math.abs(v.speed) > 60) { pushToast(state, "Too fast to step out!"); return; }
    state.player.x = v.x + Math.cos(v.angle + Math.PI / 2) * 34;
    state.player.y = v.y + Math.sin(v.angle + Math.PI / 2) * 34;
    state.player.angle = v.angle;
    v.driver = null;
    state.vehicle = null;
    return;
  }
  if (it.kind === "car") {
    const car = it.car;
    state.vehicle = car;
    car.driver = "player";
    state.player.x = car.x;
    state.player.y = car.y;
    if (car.parked) {
      car.parked = false;
      car.stolen = true;
      addHeat(state.cops, 8);
      pushToast(state, car.marked ? "That's the one. Drive it to Rusty's — fast." : "Car stolen. Keep it clean, keep it moving.");
      audioSiren(state.audio);
    }
    return;
  }
  if (it.kind === "boat") {
    const boat = it.boat;
    state.vehicle = boat;
    boat.driver = "player";
    boat.parked = false;
    state.player.x = boat.x;
    state.player.y = boat.y;
    pushToast(state, "Boat away. The river is yours tonight.");
    return;
  }
  if (it.kind === "payphone") {
    openBoard(state);
    return;
  }
  if (it.kind === "shop") {
    useShop(state, it.shop);
  }
}

function useShop(state, shop) {
  if (shop.kind === "repair") {
    if (state.vehicle && state.vehicle.health < 100) {
      if (state.cash >= shop.price) {
        state.cash -= shop.price;
        state.vehicle.health = 100;
        pushToast(state, "Rusty patched you up. -$" + shop.price);
        audioCash(state.audio);
      } else pushToast(state, "Repair costs $" + shop.price + " — you're short.");
    } else pushToast(state, "Bring a damaged car to repair it.");
  } else if (shop.kind === "guns") {
    if (!state.player.hasGun) {
      if (state.cash >= shop.price) {
        state.cash -= shop.price;
        state.player.hasGun = true;
        state.player.ammo = 48;
        pushToast(state, "Pistol bought — 48 rounds. Don't wave it at cops.");
        audioCash(state.audio);
      } else pushToast(state, "A pistol costs $" + shop.price + ".");
    } else if (state.cash >= 60) {
      state.cash -= 60;
      state.player.ammo += 48;
      pushToast(state, "Ammo restocked +48. -$60");
    } else pushToast(state, "Ammo costs $60.");
  } else if (shop.kind === "save") {
    saveGame(state);
    state.player.health = 100;
    pushToast(state, "Safehouse. Saved, rested, healed. " + state.saveNote);
  } else if (shop.kind === "heal") {
    if (state.cash >= shop.price) {
      state.cash -= shop.price;
      state.player.health = 100;
      pushToast(state, "Patched up at St. Tide. -$" + shop.price);
    } else pushToast(state, "Treatment costs $" + shop.price + ".");
  }
}

function openBoard(state) {
  state.boardOpen = true;
  state.mode = "paused";
  const els = state.els;
  const list = els.jobList;
  const story = nextStoryChapter(state.jobs);
  let html = "";
  if (story) {
    html += "<button class='job story' data-story='1'><b>" + story.title + "</b><br>" + story.brief + "<br>Pay: $" + story.payout + "</button>";
  } else if (state.jobs.chapter < STORY.length) {
    const ch = STORY[state.jobs.chapter];
    html += "<div class='job locked'>Next chapter unlocks at REP " + ch.rep + " — you have " + state.jobs.rep + ".</div>";
  } else {
    html += "<div class='job locked'>The Tide Ledger is finished. Side work still pays.</div>";
  }
  for (const job of state.jobs.board) {
    html += "<button class='job' data-job='" + job.id + "'><b>" + job.title + "</b> — pay $" + job.payout + "<br>" + job.stages[0].label + "</button>";
  }
  list.innerHTML = html;
  showOnly(state, "board");
  list.querySelectorAll("[data-story]").forEach((b) => b.addEventListener("click", () => {
    if (state.jobs.chapter === 2) spawnMarkedCar(state);
    if (startStory(state)) { state.boardOpen = false; state.mode = "playing"; showOnly(state, null); audioClick(state.audio); }
  }));
  list.querySelectorAll("[data-job]").forEach((b) => b.addEventListener("click", () => {
    const job = state.jobs.board.find((j) => j.id === b.getAttribute("data-job"));
    if (job && startJob(state, job)) { state.boardOpen = false; state.mode = "playing"; showOnly(state, null); audioClick(state.audio); }
  }));
}

// ---------- simulation step ----------

function step(state, dt) {
  state.tick++;
  state.simSeconds += dt;
  const p = state.player;
  const k = state.keys;

  // Movement input.
  let mx = 0, my = 0;
  if (k["w"] || k["arrowup"]) my -= 1;
  if (k["s"] || k["arrowdown"]) my += 1;
  if (k["a"] || k["arrowleft"]) mx -= 1;
  if (k["d"] || k["arrowright"]) mx += 1;
  if (mx && my) { mx *= 0.7071; my *= 0.7071; }

  if (state.vehicle) {
    const v = state.vehicle;
    const throttle = (k["w"] || k["arrowup"] ? 1 : 0) + (k["s"] || k["arrowdown"] ? -0.8 : 0);
    const steer = (k["a"] || k["arrowleft"] ? -1 : 0) + (k["d"] || k["arrowright"] ? 1 : 0);
    stepVehicle(state.city, v, { throttle, steer, brake: !!(k["shift"] || k[" "]) }, dt);
    p.x = v.x; p.y = v.y; p.angle = v.angle;
    audioEngine(state.audio, v.speed, v.maxSpeed);
    if (v.health <= 0) {
      spawnParticles(state, v.x, v.y, "#ff9f43", 26);
      audioCrash(state.audio);
      pushToast(state, v.kind === "boat" ? "The boat is wrecked. Swim for it." : "Your car is wrecked. You're on foot now.");
      state.parkedCars = state.parkedCars.filter((c) => c !== v);
      state.boats = state.boats.filter((b) => b !== v);
      state.vehicle = null;
      p.x = v.x + 40; p.y = v.y;
    }
  } else {
    const world = screenToWorld(state, state.mouse.x, state.mouse.y);
    stepWalker(state.city, p, { mx, my, sprint: !!k["shift"], aimX: world.x, aimY: world.y }, dt);
    if (k[" "] && p.shootCooldown <= 0) shoot(state);
    audioEngine(state.audio, 0, 1);
  }

  // Convoy appears when a follow/grab stage is live.
  const job = state.jobs.active;
  if (job) {
    const stage = job.stages[job.stageIndex];
    if (stage && (stage.type === "follow" || stage.type === "grab")) ensureConvoy(state);
  }
  stepConvoy(state, dt);

  // Traffic, pedestrians, police.
  const gunfire = state.lastGunfire || null;
  stepTraffic(state.city, state, dt, p.x, p.y, gunfire ? gunfire.x : null, gunfire ? gunfire.y : null);
  state.lastGunfire = null;
  stepCops(state.city, state, dt);

  // Officer bullets become real bullets.
  for (const s of state.pendingShots) {
    state.bullets.push(makeBullet(s.x, s.y, s.angle, s.owner));
  }
  state.pendingShots = [];

  // Bullets vs walkers.
  const targets = [];
  targets.push({ x: p.x, y: p.y, radius: 14, alive: !state.vehicle && p.health > 0, isPlayer: true });
  for (const o of state.cops.officers) targets.push(o);
  for (const ped of state.traffic.peds) targets.push(ped);
  state.bullets = stepBullets(state.city, state.bullets, targets, dt, (t) => {
    if (t.isPlayer) {
      if (damageWalker(p, 9)) {
        state.events.push({ type: "wasted" });
      }
    } else if (t.shootT !== undefined) {
      t.hp = (t.hp === undefined ? 50 : t.hp) - 20;
      if (t.hp <= 0) { t.alive = false; addHeat(state.cops, 20); pushToast(state, "Officer down. The whole city will hear about this."); }
    } else {
      t.alive = false;
      addHeat(state.cops, 12);
    }
    spawnParticles(state, t.x, t.y, "#ff4757", 6);
  });

  // Car vs traffic / cops / pedestrians.
  if (state.vehicle) {
    const v = state.vehicle;
    for (const other of state.traffic.cars) {
      if (distance(v.x, v.y, other.x, other.y) < 44) {
        const push = 44 - distance(v.x, v.y, other.x, other.y);
        const a = angleTo(other.x, other.y, v.x, v.y);
        v.x += Math.cos(a) * push * 0.5;
        v.y += Math.sin(a) * push * 0.5;
        other.x -= Math.cos(a) * push * 0.5;
        other.y -= Math.sin(a) * push * 0.5;
        if (Math.abs(v.speed) > 140) {
          v.health -= 6; other.health -= 10;
          audioCrash(state.audio);
          spawnParticles(state, v.x, v.y, "#ffa502", 10);
        }
        v.speed *= 0.7;
      }
    }
    for (const ped of state.traffic.peds) {
      if (ped.alive && distance(v.x, v.y, ped.x, ped.y) < 30 && Math.abs(v.speed) > 60) {
        ped.alive = false;
        addHeat(state.cops, 12);
        pushToast(state, "You ran over a pedestrian. The police noticed.");
        spawnParticles(state, ped.x, ped.y, "#f5d76e", 8);
      }
    }
  }

  // Roadblocks: solid police cars.
  for (const rb of state.cops.roadblocks) {
    if (state.vehicle && distance(state.vehicle.x, state.vehicle.y, rb.x, rb.y) < 52) {
      state.vehicle.health -= 20;
      state.vehicle.speed *= 0.3;
      audioCrash(state.audio);
      spawnParticles(state, rb.x, rb.y, "#ff4757", 10);
    }
  }

  // Jobs advance.
  updateJobs(state, dt);

  // Particles.
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // Interact prompt.
  state.interactPrompt = state.mode === "playing" ? (nearestInteractable(state)?.label || "") : "";

  // Camera follows the player.
  const tx = clamp(p.x, state.viewW / 2, WORLD_W - state.viewW / 2);
  const ty = clamp(p.y, state.viewH / 2, WORLD_H - state.viewH / 2);
  state.camera.x += (tx - state.camera.x) * 0.12;
  state.camera.y += (ty - state.camera.y) * 0.12;

  // Music steps on the beat of the sim.
  state.musicStep++;
  audioMusicStep(state.audio, dt, state.musicStep);

  // Events: busted / wasted / job done.
  for (const ev of state.events) {
    if (ev.type === "busted") {
      state.mode = "gameover";
      state.gameoverKind = "busted";
      audioBusted(state.audio);
      const fine = Math.min(200, state.cash);
      state.cash -= fine;
      clearWanted(state.cops);
      state.events.push({ type: "toast", text: "BUSTED — fined $" + fine + ". The Tide posts your bail." });
      showGameover(state, "BUSTED", "The Port Police caught Mara on foot. Bail cost $" + fine + ". The night goes on.");
    } else if (ev.type === "wasted") {
      state.mode = "gameover";
      state.gameoverKind = "wasted";
      audioBusted(state.audio);
      const lost = Math.floor(state.cash * 0.15);
      state.cash -= lost;
      clearWanted(state.cops);
      showGameover(state, "WASTED", "Mara went down in Emberline. The hospital bill took $" + lost + ". The night goes on.");
    } else if (ev.type === "jobdone") {
      audioCash(state.audio);
      saveGame(state);
    } else if (ev.type === "toast") {
      pushToast(state, ev.text);
    }
  }
  state.events = [];
}

function showGameover(state, title, text) {
  state.els.gameoverTitle.textContent = title;
  state.els.gameoverText.textContent = text;
  showOnly(state, "gameover");
}

function respawn(state) {
  state.player = makeWalker(600, 1900);
  state.player.health = 100;
  state.vehicle = null;
  state.mode = "playing";
  state.cops = makeCops();
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  showOnly(state, null);
  pushToast(state, "Back on the street outside St. Tide Hospital.");
}

// ---------- rendering ----------

function draw(state) {
  const canvas = state.canvas;
  const ctx = canvas.getContext("2d");
  const cam = state.camera;
  const city = state.city;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Night ground.
  ctx.fillStyle = "#0b0f16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 - cam.x, canvas.height / 2 - cam.y);

  // District tints.
  for (const d of [{ x0: 0, y0: 0, x1: 1560, y1: 1100, c: "#12101d" }, { x0: 0, y0: 1100, x1: 1560, y1: 2400, c: "#14100b" }, { x0: 1740, y0: 0, x1: 2720, y1: 1100, c: "#0b141d" }, { x0: 1740, y0: 1100, x1: 2720, y1: 2400, c: "#0d1710" }]) {
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  // Water with a slow shimmer.
  const shimmer = 0.5 + 0.5 * Math.sin(state.simSeconds * 0.7);
  ctx.fillStyle = "#0a2036";
  ctx.fillRect(1560, 0, 180, WORLD_H);
  ctx.fillRect(2720, 0, WORLD_W - 2720, WORLD_H);
  ctx.strokeStyle = "rgba(46,230,255," + (0.12 + shimmer * 0.1) + ")";
  ctx.lineWidth = 2;
  for (let y = 60; y < WORLD_H; y += 140) {
    ctx.beginPath();
    ctx.moveTo(1580, y + shimmer * 8);
    ctx.lineTo(1720, y + shimmer * 8);
    ctx.stroke();
  }
  // Roads.
  ctx.fillStyle = "#1a2230";
  for (const rx of city.roadsV) ctx.fillRect(rx - city.roadHalf, 0, city.roadHalf * 2, WORLD_H);
  for (const ry of city.roadsH) ctx.fillRect(0, ry - city.roadHalf, WORLD_W, city.roadHalf * 2);
  // Road center dashes.
  ctx.strokeStyle = "rgba(255,214,64,0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const rx of city.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD_H); ctx.stroke();
  }
  for (const ry of city.roadsH) {
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD_W, ry); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Bridges.
  for (const b of city.bridges) {
    ctx.fillStyle = "#232e3d";
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.strokeStyle = "#2ee6ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  }
  // Piers.
  for (const p of city.piers) {
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  }
  // Buildings with neon edges and lit windows.
  for (const b of city.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b.lit) {
      ctx.strokeStyle = b.neon;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,214,120,0.85)";
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 24));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (((i * 7 + j * 13 + b.x) % 5) < 2) {
            ctx.fillRect(b.x + 6 + i * 26, b.y + 6 + j * 24, 8, 10);
          }
        }
      }
    }
    if (b.landmark) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText({ tower: "GLASS SPIRE", harbormaster: "HARBORMASTER HALL", chopshop: "RUSTY'S", hospital: "ST. TIDE", safehouse: "SAFEHOUSE" }[b.landmark] || "", b.x + 6, b.y - 6);
    }
  }
  // Shops / payphones.
  for (const s of city.shops) {
    ctx.fillStyle = "#2ed573";
    ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#06130a";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("$", s.x - 3, s.y + 4);
  }
  for (const p of city.payphones) {
    ctx.fillStyle = "#ffb02e";
    ctx.fillRect(p.x - 7, p.y - 10, 14, 20);
    ctx.fillStyle = "#201503";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("☎", p.x - 6, p.y + 4);
  }
  // Stash spots (only the active side-job stash glows).
  for (const s of city.stashSpots) {
    ctx.fillStyle = "rgba(125,255,94,0.5)";
    ctx.fillRect(s.x - 6, s.y - 6, 12, 12);
  }
  // Boat docks.
  for (const d of city.boatDocks) {
    ctx.fillStyle = "#2ee6ff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("⚓ DOCK", d.x - 24, d.y - 10);
  }

  // Objective marker.
  const job = state.jobs.active;
  if (job) {
    const stage = job.stages[job.stageIndex];
    if (stage) {
      const tx = state.convoy && (stage.type === "follow" || stage.type === "grab") ? state.convoy.x : stage.x;
      const ty = state.convoy && (stage.type === "follow" || stage.type === "grab") ? state.convoy.y : stage.y;
      const pulse = 26 + 8 * Math.sin(state.simSeconds * 5);
      ctx.strokeStyle = "#ff2e88";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tx, ty, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ff2e88";
      ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Vehicles: parked cars, boats, traffic, convoy, police.
  const drawCar = (v, isPlayer) => {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = v.color;
    ctx.fillRect(-20, -10, 40, 20);
    ctx.fillStyle = "rgba(10,16,24,0.9)";
    ctx.fillRect(-8, -8, 14, 16);
    if (v.siren) {
      ctx.fillStyle = (Math.floor(state.simSeconds * 4) % 2 === 0) ? "#ff4757" : "#1e90ff";
      ctx.fillRect(-20, -12, 8, 4);
      ctx.fillRect(-20, 8, 8, 4);
    }
    if (v.marked) {
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, -12, 44, 24);
    }
    if (isPlayer && v.health < 100) {
      ctx.fillStyle = "#ff4757";
      ctx.fillRect(-20, -16, 40 * (v.health / 100), 3);
    }
    ctx.restore();
  };
  const drawBoat = (v) => {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.moveTo(26, 0); ctx.lineTo(-18, -12); ctx.lineTo(-24, 0); ctx.lineTo(-18, 12); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(10,16,24,0.9)";
    ctx.fillRect(-8, -5, 14, 10);
    ctx.restore();
  };
  for (const c of state.parkedCars) drawCar(c, false);
  for (const b of state.boats) drawBoat(b);
  for (const c of state.traffic.cars) drawCar(c, false);
  if (state.convoy) {
    ctx.save();
    ctx.translate(state.convoy.x, state.convoy.y);
    ctx.rotate(state.convoy.angle);
    ctx.fillStyle = "#eccc68";
    ctx.fillRect(-26, -12, 52, 24);
    ctx.fillStyle = "#8a6d1a";
    ctx.fillRect(10, -10, 14, 20);
    ctx.restore();
    ctx.fillStyle = "#eccc68";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("CONVOY", state.convoy.x - 26, state.convoy.y - 20);
  }
  for (const c of state.cops.cars) drawCar(c, false);
  for (const b of state.cops.boats) drawBoat(b);
  for (const rb of state.cops.roadblocks) {
    ctx.fillStyle = "#1c2733";
    ctx.fillRect(rb.x - 40, rb.y - 10, 80, 20);
    ctx.fillStyle = "#ff4757";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("ROADBLOCK", rb.x - 34, rb.y - 14);
  }
  // Pedestrians and officers.
  for (const p of state.traffic.peds) {
    if (!p.alive) continue;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
  }
  for (const o of state.cops.officers) {
    if (!o.alive) continue;
    ctx.fillStyle = "#22364d";
    ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#7fb3ff";
    ctx.beginPath(); ctx.arc(o.x, o.y - 3, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Player vehicle or walker.
  if (state.vehicle) {
    if (state.vehicle.kind === "boat") drawBoat(state.vehicle);
    else drawCar(state.vehicle, true);
    // Headlight cone.
    const v = state.vehicle;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    const grad = ctx.createLinearGradient(20, 0, 260, 0);
    grad.addColorStop(0, "rgba(255,240,180,0.20)");
    grad.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(20, -8); ctx.lineTo(260, -70); ctx.lineTo(260, 70); ctx.lineTo(20, 8); ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = "#ff2e88";
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd6e8";
    ctx.fillRect(8, -3, 12, 6);
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("MARA", p.x - 14, p.y - 18);
  }
  // Bullets and particles.
  ctx.fillStyle = "#ffe66d";
  for (const b of state.bullets) {
    ctx.fillRect(b.x - 3, b.y - 1, 6, 2);
  }
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / 0.6);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  // Helicopter + spotlight.
  if (state.cops.heli) {
    const h = state.cops.heli;
    const grad = ctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, 130);
    grad.addColorStop(0, "rgba(255,255,220,0.20)");
    grad.addColorStop(1, "rgba(255,255,220,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(h.x, h.y, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a4a5a";
    ctx.beginPath(); ctx.arc(h.x, h.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9fb3c8";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h.x - 20, h.y); ctx.lineTo(h.x + 20, h.y); ctx.stroke();
  }
  // Rain streaks (deterministic from the tick).
  ctx.strokeStyle = "rgba(180,210,255,0.28)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const rx = ((i * 173 + state.tick * 7) % 1400) - 100;
    const ry = ((i * 311 + state.tick * 23) % 900) - 100;
    const sx = cam.x - state.viewW / 2 + rx;
    const sy = cam.y - state.viewH / 2 + ry;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - 4, sy + 14);
    ctx.stroke();
  }
  ctx.restore();
  // Vignette.
  const vg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.35, canvas.width / 2, canvas.height / 2, canvas.height * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---------- boot ----------

function resize(state) {
  const canvas = state.canvas;
  canvas.width = Math.min(window.innerWidth, 1600);
  canvas.height = Math.min(window.innerHeight, 1000);
  state.viewW = canvas.width;
  state.viewH = canvas.height;
}

export function boot() {
  const canvas = document.getElementById("game-canvas");
  const els = {
    cash: document.getElementById("hud-cash"),
    rep: document.getElementById("hud-rep"),
    wanted: document.getElementById("hud-wanted"),
    wantedTitle: document.getElementById("hud-wanted-title"),
    healthFill: document.getElementById("hud-health-fill"),
    armorFill: document.getElementById("hud-armor-fill"),
    ammo: document.getElementById("hud-ammo"),
    clock: document.getElementById("hud-clock"),
    tide: document.getElementById("hud-tide"),
    speed: document.getElementById("hud-speed"),
    vehicleHealth: document.getElementById("hud-vehicle-health"),
    objective: document.getElementById("hud-objective-text"),
    objectiveTimer: document.getElementById("hud-objective-timer"),
    interact: document.getElementById("hud-interact"),
    toasts: document.getElementById("hud-toasts"),
    minimap: document.getElementById("minimap"),
    startScreen: document.getElementById("start-screen"),
    pauseMenu: document.getElementById("pause-menu"),
    jobBoard: document.getElementById("job-board"),
    jobList: document.getElementById("job-list"),
    gameover: document.getElementById("gameover"),
    gameoverTitle: document.getElementById("gameover-title"),
    gameoverText: document.getElementById("gameover-text"),
    btnStart: document.getElementById("btn-start"),
    btnContinue: document.getElementById("btn-continue"),
    startSaveNote: document.getElementById("start-save-note"),
    btnResume: document.getElementById("btn-resume"),
    btnSave: document.getElementById("btn-save"),
    btnQuit: document.getElementById("btn-quit"),
    btnCloseBoard: document.getElementById("btn-close-board"),
    btnRespawn: document.getElementById("btn-respawn"),
  };
  const state = createGame(canvas, els);
  bindInput(state);
  resize(state);
  window.addEventListener("resize", () => resize(state));

  els.btnStart.addEventListener("click", () => { audioUnlock(state.audio); audioClick(state.audio); startNewGame(state); });
  els.btnContinue.addEventListener("click", () => {
    const save = loadSave(state);
    audioUnlock(state.audio);
    if (save) { applySave(state, save); }
  });
  els.btnResume.addEventListener("click", () => { state.mode = "playing"; showOnly(state, null); });
  els.btnSave.addEventListener("click", () => { saveGame(state); pushToast(state, state.saveNote || "Saved."); });
  els.btnQuit.addEventListener("click", () => { state.mode = "menu"; showOnly(state, "start"); });
  els.btnCloseBoard.addEventListener("click", () => { state.boardOpen = false; state.mode = "playing"; showOnly(state, null); });
  els.btnRespawn.addEventListener("click", () => respawn(state));

  // Screenshot staging: ?shot=1..4 renders a fixed scene for the maker.
  const params = new URLSearchParams(window.location.search);
  const shot = params.get("shot");
  window.__emberline = { state, startNewGame, applyShot, version: "emberline-1.0" };
  if (shot) {
    startNewGame(state);
    applyShot(state, Number(shot));
    if (state.mode === "menu") {
      showOnly(state, "start");
    } else {
      state.mode = "playing";
      showOnly(state, null);
    }
  } else {
    showOnly(state, "start");
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const frameDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.mode === "playing") {
      acc += frameDt;
      let steps = 0;
      while (acc >= DT && steps < 4) {
        step(state, DT);
        acc -= DT;
        steps++;
      }
      if (steps === 4) acc = 0;
    }
    state.lastDt = frameDt;
    draw(state);
    if (state.mode === "playing" || state.mode === "paused") {
      updateHud(state, els);
      drawMinimap(els.minimap, state.city, state);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return state;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
