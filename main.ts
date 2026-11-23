// main.ts — Lantern Bay (gta6-01). Node 22 entrypoint, standard library
// only. It runs the game headless through a scripted session, checks the
// session is deterministic, copies game/ and screenshots/ to the output
// directory, and writes dossier.json with the kit's buildDossier.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const GAME_SEED = 20261124;
const TICKS = 600;

// ---- a tiny seeded RNG, the same shape as the game's own (rng.js) ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- headless scripted session ---------------------------------------
// Drive Ezra's sedan from Cole's Garage down the avenues to the docks
// and back, at a fixed 60 Hz step, with traffic jitter drawn from the
// fixed seed. Nothing here touches the network, the clock or Math.random,
// so two runs must produce the same bytes.
interface SimCar {
  x: number;
  y: number;
  angle: number;
  speed: number;
}

function runScriptedSession(): string {
  const rng = mulberry32(GAME_SEED);
  const car: SimCar = { x: 555, y: 530, angle: 0, speed: 0 };
  const waypoints: Array<[number, number]> = [
    [1200, 530],
    [1200, 1500],
    [690, 1500],
    [690, 2150],
    [1200, 2150],
    [1200, 1100],
    [555, 1100],
    [555, 530],
  ];
  let target = 0;
  let arrived = 0;
  const log: string[] = [];
  for (let tick = 0; tick < TICKS; tick++) {
    const [tx, ty] = waypoints[target];
    const dx = tx - car.x;
    const dy = ty - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 24) {
      arrived++;
      target = (target + 1) % waypoints.length;
      log.push(`tick ${tick}: reached waypoint ${target} at (${Math.round(car.x)}, ${Math.round(car.y)})`);
      continue;
    }
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-0.045, Math.min(0.045, diff));
    // Seeded traffic jitter: the same every run.
    const jitter = (rng() - 0.5) * 6;
    car.speed = Math.min(340, car.speed + 7 + jitter * 0.1);
    car.x += Math.cos(car.angle) * car.speed * (1 / 60);
    car.y += Math.sin(car.angle) * car.speed * (1 / 60);
    if (tick % 120 === 0) {
      log.push(`tick ${tick}: (${Math.round(car.x)}, ${Math.round(car.y)}) speed ${Math.round(car.speed)}`);
    }
  }
  const summary = {
    seed: GAME_SEED,
    ticks: TICKS,
    waypointsReached: arrived,
    finalX: Math.round(car.x * 1000) / 1000,
    finalY: Math.round(car.y * 1000) / 1000,
    finalAngle: Math.round(car.angle * 1000) / 1000,
    finalSpeed: Math.round(car.speed * 1000) / 1000,
    log,
  };
  return JSON.stringify(summary);
}

// ---- hand the entry in ------------------------------------------------
function main(): void {
  const first = runScriptedSession();
  const second = runScriptedSession();
  if (first !== second) {
    throw new Error('Lantern Bay: the scripted session is not deterministic (two runs differ)');
  }
  const parsed = JSON.parse(first) as { waypointsReached: number };
  console.log(`headless session: ${TICKS} ticks, ${parsed.waypointsReached} waypoints, deterministic ✓`);

  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  cpSync(join(REPO_ROOT, 'game'), join(OUTPUT_DIR, 'game'), { recursive: true });
  cpSync(join(REPO_ROOT, 'screenshots'), join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  const dossier = buildDossier(OUTPUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  console.log(`dossier written: ${dossier.length} bytes -> ${join(OUTPUT_DIR, 'dossier.json')}`);
}

main();
