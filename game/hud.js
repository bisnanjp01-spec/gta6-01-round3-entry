// Emberline — the HUD: cash and reputation, wanted stars, health and
// armor, the night clock, the objective banner, the toast feed, and the
// minimap that shows the whole harbor city at a glance.
import { WORLD_W, WORLD_H, districtAt } from "./harbor.js";
import { WANTED_NAMES } from "./cops.js";
import { clamp } from "./rng.js";

export function formatClock(simSeconds) {
  const total = 21 * 3600 + simSeconds; // the night starts at 21:00
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function tideLevel(simSeconds) {
  // The tide breathes on a slow sine over the night; low tide opens the
  // Shanty Quay cache, high tide closes it.
  return 0.5 + 0.5 * Math.sin(simSeconds / 240 + 1.2);
}

export function pushToast(state, text) {
  state.toasts.push({ text, ttl: 4 });
  if (state.toasts.length > 4) state.toasts.shift();
}

export function updateHud(state, els) {
  els.cash.textContent = "$" + state.cash.toLocaleString("en-US");
  els.rep.textContent = "REP " + state.jobs.rep + (state.jobs.finished ? " — LEGEND" : "");
  const stars = "★".repeat(state.cops.wanted) + "☆".repeat(5 - state.cops.wanted);
  els.wanted.textContent = stars;
  els.wanted.className = "wanted" + (state.cops.wanted > 0 ? " hot" : "");
  els.wantedTitle.textContent = state.cops.wanted > 0 ? WANTED_NAMES[state.cops.wanted] : "Clean";
  els.healthFill.style.width = clamp(state.player.health, 0, 100) + "%";
  els.armorFill.style.width = clamp(state.player.armor, 0, 100) + "%";
  els.ammo.textContent = state.player.hasGun ? "AMMO " + state.player.ammo : "NO GUN — buy at Quay Arms";
  els.clock.textContent = formatClock(state.simSeconds);
  const tide = tideLevel(state.simSeconds);
  els.tide.textContent = tide < 0.35 ? "TIDE: LOW — Quay cache open" : tide > 0.7 ? "TIDE: HIGH" : "TIDE: RISING";
  const v = state.vehicle;
  els.speed.textContent = v ? Math.round(Math.abs(v.speed) * 0.36) + " km/h" + (v.kind === "boat" ? " — BOAT" : "") : "ON FOOT";
  els.vehicleHealth.textContent = v ? "VEHICLE " + Math.round(v.health) + "%" : "";
  const job = state.jobs.active;
  if (job) {
    const stage = job.stages[job.stageIndex];
    els.objective.textContent = job.title + " — " + (stage ? stage.label : "");
    els.objectiveTimer.textContent = job.timer !== null && job.timer !== undefined ? Math.ceil(job.timer) + "s" : "";
  } else {
    const next = state.jobs.chapter < 8 ? "Next story: " + (state.jobs.rep >= [0, 2, 4, 6, 8, 10, 12, 14][state.jobs.chapter] ? "visit a payphone" : "earn REP " + [0, 2, 4, 6, 8, 10, 12, 14][state.jobs.chapter]) : "Free roam — legend of Emberline";
    els.objective.textContent = next + " — payphones list jobs (E)";
    els.objectiveTimer.textContent = "";
  }
  els.interact.textContent = state.interactPrompt || "";
  els.interact.style.display = state.interactPrompt ? "block" : "none";
  // Toasts.
  for (const t of state.toasts) t.ttl -= state.lastDt;
  state.toasts = state.toasts.filter((t) => t.ttl > 0);
  els.toasts.innerHTML = state.toasts.map((t) => "<div class='toast'>" + escapeHtml(t.text) + "</div>").join("");
}

export function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function drawMinimap(canvas, city, state) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const sx = W / WORLD_W;
  const sy = H / WORLD_H;
  ctx.fillStyle = "#0a1420";
  ctx.fillRect(0, 0, W, H);
  // Water: river + harbor bay.
  ctx.fillStyle = "#0e2a4a";
  ctx.fillRect(1560 * sx, 0, 180 * sx, H);
  ctx.fillRect(2720 * sx, 0, (WORLD_W - 2720) * sx, H);
  // Roads.
  ctx.strokeStyle = "#3a4a5a";
  ctx.lineWidth = 3;
  for (const rx of city.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx * sx, 0); ctx.lineTo(rx * sx, H); ctx.stroke();
  }
  for (const ry of city.roadsH) {
    ctx.beginPath(); ctx.moveTo(0, ry * sy); ctx.lineTo(W, ry * sy); ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = "#1d2733";
  for (const b of city.buildings) {
    ctx.fillRect(b.x * sx, b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  }
  // Job markers, shops, payphones.
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x * sx, y * sy, r || 3, 0, Math.PI * 2); ctx.fill();
  };
  for (const p of city.payphones) dot(p.x, p.y, "#ffb02e", 2.5);
  for (const s of city.shops) dot(s.x, s.y, "#2ed573", 2.5);
  const job = state.jobs.active;
  if (job) {
    const stage = job.stages[job.stageIndex];
    if (stage) {
      const tx = state.convoy && (stage.type === "follow" || stage.type === "grab") ? state.convoy.x : stage.x;
      const ty = state.convoy && (stage.type === "follow" || stage.type === "grab") ? state.convoy.y : stage.y;
      const pulse = 4 + 2 * Math.sin(state.simSeconds * 5);
      ctx.strokeStyle = "#ff2e88";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx * sx, ty * sy, pulse, 0, Math.PI * 2); ctx.stroke();
      dot(tx, ty, "#ff2e88", 3);
    }
  }
  if (state.convoy) dot(state.convoy.x, state.convoy.y, "#eccc68", 3);
  for (const c of state.cops.cars) dot(c.x, c.y, "#ff4757", 2.5);
  for (const o of state.cops.officers) if (o.alive) dot(o.x, o.y, "#ff4757", 2);
  for (const b of state.cops.boats) dot(b.x, b.y, "#ff4757", 2.5);
  // Player arrow.
  const px = state.player.x * sx;
  const py = state.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Viewport box.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    (state.camera.x - state.viewW / 2) * sx, (state.camera.y - state.viewH / 2) * sy,
    state.viewW * sx, state.viewH * sy,
  );
  void districtAt;
}
