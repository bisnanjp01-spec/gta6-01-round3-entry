// hud.js — the HUD: cash, health, wanted stars, clock, speed, objective line
// and the minimap. One job: turn game state into what the player sees.
(function () {
  'use strict';
  var C = window.SC.city;

  var els = {};
  function bind() {
    els.cash = document.getElementById('cash');
    els.healthfill = document.getElementById('healthfill');
    els.stars = document.getElementById('stars');
    els.clock = document.getElementById('clock');
    els.speed = document.getElementById('speed');
    els.objective = document.getElementById('objective');
    els.banner = document.getElementById('banner');
    els.minimap = document.getElementById('minimap');
    els.hud = document.getElementById('hud');
  }

  var bannerUntil = 0;
  function showBanner(text, ms) {
    if (!els.banner) return;
    els.banner.textContent = text;
    els.banner.classList.remove('hidden');
    bannerUntil = Date.now() + (ms || 3200);
  }

  function fmtCash(n) {
    return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function updateHud(state) {
    if (!els.cash) bind();
    els.cash.textContent = fmtCash(state.cash);
    els.healthfill.style.width = Math.max(0, Math.min(100, state.health)) + '%';
    var stars = '';
    for (var i = 0; i < state.stars; i++) stars += '★';
    for (var j = state.stars; j < 5; j++) stars += '☆';
    els.stars.textContent = stars;
    var hour = 9 + Math.floor(state.elapsed / 3600);
    var min = Math.floor((state.elapsed % 3600) / 60);
    els.clock.textContent = 'DAY ' + state.day + ' · ' + String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    els.speed.textContent = state.inCar ? Math.round(Math.abs(state.speed) * 1.6) + ' mph' : 'ON FOOT';
    els.objective.textContent = state.objective;
    if (bannerUntil && Date.now() > bannerUntil) {
      els.banner.classList.add('hidden');
      bannerUntil = 0;
    }
  }

  function drawMinimap(state) {
    if (!els.minimap) bind();
    var ctx = els.minimap.getContext('2d');
    var W = els.minimap.width, H = els.minimap.height;
    var sx = W / C.WORLD_W, sy = H / C.WORLD_H;
    ctx.fillStyle = '#101623';
    ctx.fillRect(0, 0, W, H);
    // Districts as soft blocks.
    for (var d = 0; d < C.DISTRICTS.length; d++) {
      var dist = C.DISTRICTS[d];
      ctx.fillStyle = 'rgba(120,150,180,0.25)';
      ctx.fillRect(dist.x * sx, dist.y * sy, dist.w * sx, dist.h * sy);
    }
    // Roads.
    ctx.strokeStyle = 'rgba(220,225,235,0.55)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= C.WORLD_W; gx += C.ROAD_STEP) {
      ctx.beginPath(); ctx.moveTo(gx * sx, 0); ctx.lineTo(gx * sx, H); ctx.stroke();
    }
    for (var gy = 0; gy <= C.WORLD_H; gy += C.ROAD_STEP) {
      ctx.beginPath(); ctx.moveTo(0, gy * sy); ctx.lineTo(W, gy * sy); ctx.stroke();
    }
    // Mission marker: a pulsing gold diamond.
    if (state.marker) {
      var pulse = 3 + Math.sin(Date.now() / 240) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(state.marker.x * sx, state.marker.y * sy - pulse - 3);
      ctx.lineTo(state.marker.x * sx + pulse + 3, state.marker.y * sy);
      ctx.lineTo(state.marker.x * sx, state.marker.y * sy + pulse + 3);
      ctx.lineTo(state.marker.x * sx - pulse - 3, state.marker.y * sy);
      ctx.closePath(); ctx.fill();
    }
    // Police as blue dots, player as a white triangle.
    ctx.fillStyle = '#4e9cff';
    for (var i = 0; i < state.cruisers.length; i++) {
      ctx.beginPath();
      ctx.arc(state.cruisers[i].x * sx, state.cruisers[i].y * sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(state.player.x * sx, state.player.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  window.SC.hud = {
    bind: bind, showBanner: showBanner, updateHud: updateHud,
    drawMinimap: drawMinimap, fmtCash: fmtCash
  };
})();
