# Lantern Bay — An Open-World Crime Story

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bisnanjp01-spec/gta6-01-round3-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bisnanjp01-spec/gta6-01-round3-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Bounty: https://make.fun/bounty/gta6-01

**Lantern Bay** is a complete open-world crime game that runs offline in a desktop browser. You are Ezra Cole, a broke garage mechanic who takes six jobs from the crews of Lantern Bay — a sun-soaked coastal city you can explore on foot and by car — and ends up running the whole town.

## What is in the game

- **A city to explore** — Lantern Bay: Old Town, Downtown, the Night Market, the Docks, the Marina and the Hills, with roads, traffic, pedestrians, parks, a beach and the sea.
- **Driving and stealing** — traffic cars, parked cars, a gold coupe to steal, arcade driving with collisions, damage and smoke.
- **Wanted level and police** — 5 stars, police pursuit cars with flashing light bars and sirens that ram you, bust you on foot, and give up when you lose them.
- **Missions and a story** — 6 story jobs with briefings, objectives, a timed delivery run, shootouts with rival crews, and a final confrontation at the Marlowe Hotel. Cash rewards, progression, free roam after the story.
- **Combat** — mouse aim, click to shoot, reload, enemy guards who shoot back, bullets, particles and a health system.
- **HUD and minimap** — cash, health, wanted stars, mission objective banner, speedometer, and a live minimap with the mission marker, police dots and the player arrow.
- **Start screen and save** — title menu with New Game / Continue / How to Play; progress auto-saves to localStorage.
- **Sound and polish** — fully synthesised WebAudio: engine hum, police sirens, gunshots, crashes, pickups and a bassline loop. No audio files, no network requests.
- **Deterministic** — fixed seed (20261124) and a fixed 60 Hz timestep, so every run plays the same city the same way.

## How to run it

Play in a browser (Node 22+ for the entrypoint):

```sh
node main.ts
```

`main.ts` runs a headless scripted driving session twice, checks the two runs are byte-identical, then copies `game/` and `screenshots/` to the output directory (`/output`, or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` there.

Or play the game directly — serve `game/` with any static server and open `game/index.html`:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080 in desktop Chrome
```

## Controls

- **WASD / arrows** — walk or drive
- **E** — steal a car / step out
- **Mouse + click** — aim and shoot on foot
- **R** — reload
- **Shift** — sprint
- **P** — pause (auto-saves)
- **M** — music on/off

## Files

- `game/index.html` — the page
- `game/src/rng.js` — deterministic seeded RNG
- `game/src/city.js` — the map of Lantern Bay
- `game/src/audio.js` — synthesised WebAudio sound
- `game/src/entities.js` — player, traffic, pedestrians, police, bullets
- `game/src/missions.js` — the story and the six jobs
- `game/src/hud.js` — HUD and minimap
- `game/src/game.js` — main loop, camera, rendering, saving
- `main.ts` — the entrypoint (headless session + dossier)

Built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01). Referral code: `qk4dawkj`.
