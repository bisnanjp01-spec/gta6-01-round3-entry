// main.ts — Port Azura entry program (Node 22, standard library only).
// Copies game/ and screenshots/ from this repository into the output directory
// (MAKEFUN_OUTPUT_DIR, or /output in the grader) and writes dossier.json with
// buildDossier from the kit's vendor/makefun-game.ts. Two runs write identical
// bytes: entries are copied in sorted order and the dossier is deterministic.
import { buildDossier } from "./vendor/makefun-game.ts";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const repoRoot = new URL(".", import.meta.url).pathname;

// Start from a clean output directory so stale files can never leak in.
if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

// Copy the playable game and its screenshots, preserving the tree exactly.
cpSync(join(repoRoot, "game"), join(outputDir, "game"), { recursive: true });
cpSync(join(repoRoot, "screenshots"), join(outputDir, "screenshots"), { recursive: true });

// The dossier is the entry's manifest: source listing, screenshots and totals.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputDir, "dossier.json"), dossier);
console.log("Port Azura entry written to " + outputDir);
