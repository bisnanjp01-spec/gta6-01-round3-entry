// Emberline — make.fun gta6-01 entry program (Node 22, standard library only).
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-game.ts, the kit's copy, unchanged.
//
// Output directory: MAKEFUN_OUTPUT_DIR when set, else /output (the grader's
// writable directory). When that directory cannot be created (for example a
// local run of `node main.ts` with no /output), fall back to ./out next to
// this file so the program still terminates cleanly with exit code 0.
// The dossier bytes are deterministic: the same repository writes the same
// bytes on every run.
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));

function pickOutputDir(): string {
  const wanted = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  try {
    mkdirSync(wanted, { recursive: true });
    return wanted;
  } catch {
    const local = join(repoRoot, "out");
    mkdirSync(local, { recursive: true });
    return local;
  }
}

function main(): void {
  const outDir = pickOutputDir();
  const gameOut = join(outDir, "game");
  const shotsOut = join(outDir, "screenshots");
  const dossierOut = join(outDir, "dossier.json");

  // Clear only the entry's own outputs, never the output folder itself.
  rmSync(gameOut, { recursive: true, force: true });
  rmSync(shotsOut, { recursive: true, force: true });
  rmSync(dossierOut, { force: true });
  mkdirSync(gameOut, { recursive: true });
  mkdirSync(shotsOut, { recursive: true });

  cpSync(join(repoRoot, "game"), gameOut, { recursive: true });
  cpSync(join(repoRoot, "screenshots"), shotsOut, { recursive: true });

  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(dossierOut, dossier);

  const sha = createHash("sha256").update(dossier).digest("hex");
  console.log(`emberline: wrote ${outDir} dossier sha256 ${sha}`);
}

main();
