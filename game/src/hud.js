// hud.js — the heads-up display: cash, health, wanted stars, mission
// objective, speed, and the minimap that shows the whole of Lantern Bay.

var Hud = {
  hintTimer: 12
};

Hud.draw = function (ctx, game, viewW, viewH) {
  var p = game.player;
  ctx.save();
  // --- top-left: cash and health ---
  ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
  ctx.fillRect(14, 12, 250, 74);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.strokeRect(14, 12, 250, 74);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 26, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px monospace';
  ctx.fillText(districtAt(p.x, p.y) + '  •  ' + game.clockText(), 26, 62);
  ctx.fillStyle = '#222';
  ctx.fillRect(26, 68, 180, 10);
  ctx.fillStyle = p.health > 30 ? '#4fd06a' : '#e04a3a';
  ctx.fillRect(26, 68, 180 * Math.max(0, p.health / p.maxHealth), 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px monospace';
  ctx.fillText('HP ' + Math.ceil(Math.max(0, p.health)), 212, 77);

  // --- top-right: wanted stars ---
  ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
  ctx.fillRect(viewW - 214, 12, 200, 44);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.strokeRect(viewW - 214, 12, 200, 44);
  ctx.font = '22px monospace';
  for (var s = 0; s < 5; s++) {
    ctx.fillStyle = s < p.wanted ? '#ffcf3a' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', viewW - 200 + s * 36, 42);
  }

  // --- top-center: mission objective ---
  var obj = MissionState.objectiveText();
  if (obj) {
    ctx.font = 'bold 15px monospace';
    var w = ctx.measureText(obj).width + 28;
    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    ctx.fillRect((viewW - w) / 2, 12, w, 34);
    ctx.strokeStyle = '#ffd94a';
    ctx.strokeRect((viewW - w) / 2, 12, w, 34);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(obj, viewW / 2, 35);
    ctx.textAlign = 'left';
  }

  // --- mission banner ---
  if (MissionState.bannerTimer > 0 && MissionState.banner) {
    ctx.font = '15px monospace';
    var lines = wrapText(ctx, MissionState.banner, viewW - 360);
    var bh = lines.length * 20 + 18;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.78)';
    ctx.fillRect(180, viewH - 210, viewW - 360, bh);
    ctx.strokeStyle = '#ffd94a';
    ctx.strokeRect(180, viewH - 210, viewW - 360, bh);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], viewW / 2, viewH - 210 + 26 + li * 20);
    }
    ctx.textAlign = 'left';
  }

  // --- bottom-right: speed and car ---
  if (!p.onFoot && p.car) {
    var kmh = Math.round(Math.abs(p.car.speed) * 0.36);
    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    ctx.fillRect(viewW - 214, viewH - 84, 200, 70);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(viewW - 214, viewH - 84, 200, 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(kmh + '', viewW - 40, viewH - 46);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9fb3d8';
    ctx.fillText('km/h', viewW - 40, viewH - 28);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(p.car.model.name.toUpperCase(), viewW - 200, viewH - 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';
    var carHp = Math.max(0, Math.round(p.car.health));
    ctx.fillText('CAR ' + carHp + '%', viewW - 200, viewH - 28);
    ctx.fillStyle = '#222';
    ctx.fillRect(viewW - 200, viewH - 22, 120, 6);
    ctx.fillStyle = carHp > 30 ? '#4fd06a' : '#e04a3a';
    ctx.fillRect(viewW - 200, viewH - 22, 120 * carHp / 100, 6);
  } else {
    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    ctx.fillRect(viewW - 214, viewH - 84, 200, 70);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(viewW - 214, viewH - 84, 200, 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('ON FOOT', viewW - 200, viewH - 52);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9fb3d8';
    ctx.fillText('AMMO ' + p.ammo + '  •  MAG ' + p.mag, viewW - 200, viewH - 30);
  }

  // --- controls hint, fades after a while ---
  if (this.hintTimer > 0) {
    ctx.globalAlpha = Math.min(1, this.hintTimer / 2);
    ctx.fillStyle = 'rgba(10, 12, 20, 0.6)';
    ctx.fillRect(14, viewH - 44, 560, 30);
    ctx.fillStyle = '#dfe6f2';
    ctx.font = '13px monospace';
    ctx.fillText('WASD move/drive  •  E steal car  •  Click shoot  •  R reload  •  Shift sprint  •  P pause  •  M music', 24, viewH - 24);
    ctx.globalAlpha = 1;
  }

  this.drawMinimap(ctx, game, viewW, viewH);
  ctx.restore();
};

Hud.drawMinimap = function (ctx, game, viewW, viewH) {
  var mw = 220;
  var mh = 158;
  var mx = 14;
  var my = viewH - mh - 14;
  var sx = mw / WORLD_W;
  var sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(8, 12, 16, 0.78)';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 2;
  ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.lineWidth = 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // Ground and water.
  ctx.fillStyle = '#2c3a2e';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#2f6f8f';
  ctx.fillRect(mx + 3300 * sx, my, (WORLD_W - 3300) * sx, mh);
  // Roads.
  ctx.fillStyle = '#5a5f6a';
  for (var i = 0; i < ROADS_X.length; i++) ctx.fillRect(mx + ROADS_X[i] * sx - 2, my, 4, mh);
  for (var j = 0; j < ROADS_Y.length; j++) ctx.fillRect(mx, my + ROADS_Y[j] * sy - 2, mw, 4);
  // Buildings, simplified.
  ctx.fillStyle = '#8a7a6a';
  for (var b = 0; b < cityBuildings.length; b++) {
    var bd = cityBuildings[b];
    ctx.fillRect(mx + bd.x * sx, my + bd.y * sy, Math.max(1.5, bd.w * sx), Math.max(1.5, bd.h * sy));
  }
  // Mission marker.
  var step = MissionState.currentStep();
  if (MissionState.active && step) {
    var pulse = 4 + Math.sin(game.tick * 0.12) * 2;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(mx + step.x * sx, my + step.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  // Police dots.
  ctx.fillStyle = '#4a8cff';
  for (var q = 0; q < Police.cars.length; q++) {
    ctx.beginPath();
    ctx.arc(mx + Police.cars[q].x * sx, my + Police.cars[q].y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  var p = game.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('LANTERN BAY', mx, my - 8);
};

function wrapText(ctx, text, maxWidth) {
  var words = text.split(' ');
  var lines = [];
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
