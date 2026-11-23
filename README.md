# gta6-01-round3-entry

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bisnanjp01-spec/gta6-01-round3-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bisnanjp01-spec/gta6-01-round3-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solstice City — an original open-world crime game for make.fun's "Make GTA 6" bounty. Rae Delgado owes the Foundry crew $8,000, and fixer Mama Inez has five jobs that pay it off. Explore a sun-soaked coastal city on foot and by car, steal cars, outrun the Solstice police through a five-star wanted system, take on rival gang ambushes, and finish a five-mission story with a HUD, minimap, save system and procedural sound. Everything — the city, characters, vehicles, story, art and music — is original.

## Run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests: every file the game loads lives under `game/`.

## Controls

- **WASD / arrows** — move on foot, drive in a car (Shift to sprint)
- **E** — steal a car / step out
- **Mouse** — aim, **click** — shoot
- **P** — pause, **M** — mute

## How it is built

- `game/index.html` — the page, HUD and menus
- `game/main.js` — the loop, player, driving, combat, camera and rendering
- `game/city.js` — the seeded city: districts, roads, buildings, collision
- `game/traffic.js` — traffic cars and pedestrians
- `game/police.js` — the wanted level and pursuing cruisers
- `game/missions.js` — the five-job story
- `game/hud.js` — HUD and minimap
- `game/save.js` — localStorage saves
- `game/audio.js` — procedural Web Audio sound
- `game/shots.js` — staged scenes for the screenshots
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
