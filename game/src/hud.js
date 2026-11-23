// hud.js — the heads-up display: cash and health, wanted stars, mission
// objective panel, message feed, minimap and the start / pause / busted screens.
// The HUD is DOM so its text stays crisp; the minimap is a small canvas drawn
// from the same city data as the main view.
const Hud = {
  els: {},
  toastTimer: null,
  messageTimer: null,

  init() {
    const ids = ["topbar", "wanted", "cash", "objTitle", "objText", "objDist",
      "messages", "toast", "speedo", "screen", "screenCard", "minimap"];
    for (const id of ids) this.els[id] = document.getElementById(id);
    this.miniCtx = this.els.minimap.getContext("2d");
  },

  update(game) {
    const p = game.player;
    const stars = wantedStars(p);
    this.els.topbar.innerHTML = "MARA VOSS<br><span class='sub'>Port Azura &nbsp;·&nbsp; ❤ " +
      Math.ceil(p.health) + " &nbsp;·&nbsp; 🛡 " + Math.ceil(p.armor) +
      " &nbsp;·&nbsp; 🔫 " + p.ammo + "</span>";
    this.els.wanted.textContent = stars > 0 ? "★".repeat(stars) : "";
    this.els.cash.innerHTML = "$" + p.cash.toLocaleString("en-US") +
      "<br><span class='sub'>Jobs done: " + p.missionsDone + " &nbsp;·&nbsp; Cars stolen: " +
      p.carsStolen + "</span>";
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.12);
      this.els.speedo.textContent = p.inCar.name + "  ·  " + mph + " mph";
    } else {
      this.els.speedo.textContent = "On foot — press E near a car to take it";
    }
    this.drawMinimap(game);
  },

  drawMinimap(game) {
    const ctx = this.miniCtx;
    const W = 220, H = 168;
    const sx = W / CITY_WIDTH, sy = H / CITY_HEIGHT;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1d2f4d";
    ctx.fillRect(0, 0, W, H);
    // Water strip on the east edge.
    ctx.fillStyle = "#2f7fb8";
    ctx.fillRect(W - 10, 0, 10, H);
    // Roads.
    ctx.strokeStyle = "#5a6b7a";
    ctx.lineWidth = 3;
    for (const ax of AVENUE_X) { ctx.beginPath(); ctx.moveTo(ax * sx, 0); ctx.lineTo(ax * sx, H); ctx.stroke(); }
    for (const sy2 of STREET_Y) { ctx.beginPath(); ctx.moveTo(0, sy2 * sy); ctx.lineTo(W, sy2 * sy); ctx.stroke(); }
    // Buildings as faint blocks.
    ctx.fillStyle = "rgba(200,205,215,.5)";
    for (const b of game.city.buildings) {
      ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
    }
    // Mission marker.
    const step = currentStep(game.missions);
    if (game.missions.active && step && step.x !== undefined) {
      const mx = step.x * sx, my = step.y * sy;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.stroke();
    }
    // Cops as blue dots.
    ctx.fillStyle = "#4da3ff";
    for (const cop of game.police.copCars) {
      ctx.beginPath(); ctx.arc(cop.x * sx, cop.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player as a white arrow.
    const p = game.player;
    ctx.save();
    ctx.translate(p.x * sx, p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = "#cfe6ff";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("N", 4, 12);
  },

  setObjective(title, text, step, dist) {
    this.els.objTitle.textContent = title;
    this.els.objText.textContent = text;
    this.els.objDist.textContent = (dist !== undefined && dist !== null)
      ? "Distance: " + dist + " m" : "";
  },

  message(text) {
    const box = this.els.messages;
    const div = document.createElement("div");
    div.textContent = text;
    box.appendChild(div);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => { box.innerHTML = ""; }, 6000);
  },

  showToast(text) {
    const t = this.els.toast;
    t.textContent = text;
    t.style.display = "block";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.display = "none"; }, 3200);
  },

  showScreen(html) {
    this.els.screen.style.display = "flex";
    this.els.screenCard.innerHTML = html;
  },

  hideScreen() { this.els.screen.style.display = "none"; },

  showStart(game) {
    const hasSave = !!game.loadSaveData();
    this.showScreen(
      "<h1>PORT AZURA</h1><h2>AN OPEN-WORLD CRIME STORY</h2>" +
      "<p>You are <b>Mara Voss</b>, a courier with a fast car and faster enemies. " +
      "Six jobs stand between you and the crown of Port Azura — a sun-soaked city of " +
      "avenues, beaches, traffic, cops and Harbor Kings who want you gone. Steal cars, " +
      "outrun the APD, finish the jobs.</p>" +
      "<p class='controls'>WASD move / drive &nbsp;·&nbsp; E steal &amp; enter car &nbsp;·&nbsp; Mouse aim, Click shoot &nbsp;·&nbsp; F punch<br>" +
      "Shift sprint &nbsp;·&nbsp; Space handbrake &nbsp;·&nbsp; N next job &nbsp;·&nbsp; S save &nbsp;·&nbsp; P pause &nbsp;·&nbsp; M mute</p>" +
      (hasSave
        ? "<button id='btnContinue'>CONTINUE</button><button id='btnNew'>NEW GAME</button>"
        : "<button id='btnNew'>START ENGINE</button>") +
      "<br><button class='ghost' id='btnHow'>HOW TO PLAY</button>");
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind("btnNew", () => game.startNewGame());
    bind("btnContinue", () => game.startContinueGame());
    bind("btnHow", () => {
      this.showScreen("<h1>HOW TO PLAY</h1><p>Walk with WASD. Near any car, press E to take it — " +
        "the APD notices theft, so be quick. Drive with W/S and steer with A/D, Space to handbrake. " +
        "Aim with the mouse and click to shoot, F to punch. Stars mean the police are coming: " +
        "hide and stay calm until they fade. Press N to start your next job; the yellow marker " +
        "on the map and minimap is your objective. S saves to this browser.</p>" +
        "<button id='btnBack'>BACK</button>");
      document.getElementById("btnBack").onclick = () => this.showStart(game);
    });
  },

  showPause(game) {
    this.showScreen("<h1>PAUSED</h1><p>Port Azura waits for no one — except right now.</p>" +
      "<button id='btnResume'>RESUME</button><button id='btnSave'>SAVE GAME</button>" +
      "<button class='ghost' id='btnQuit'>QUIT TO MENU</button>");
    document.getElementById("btnResume").onclick = () => game.togglePause();
    document.getElementById("btnSave").onclick = () => { game.saveGame(); game.message("Game saved."); };
    document.getElementById("btnQuit").onclick = () => { game.state = "menu"; this.showStart(game); };
  },

  showBusted(game) {
    this.showScreen("<h1>BUSTED</h1><p>The APD caught up with Mara. Your cash is lighter and the " +
      "cops drove off — but Port Azura still remembers your name.</p>" +
      "<button id='btnRetry'>BACK ON THE STREETS</button>");
    document.getElementById("btnRetry").onclick = () => game.respawnAfterBusted();
  },

  showWasted(game) {
    this.showScreen("<h1>WASTED</h1><p>Mara went down in the streets of Port Azura. The city keeps " +
      "moving — and so do you.</p><button id='btnRetry2'>GET BACK UP</button>");
    document.getElementById("btnRetry2").onclick = () => game.respawnAfterWasted();
  },
};
