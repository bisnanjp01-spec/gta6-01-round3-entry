# Port Azura — Open-World Crime Game

![Port Azura](https://img.shields.io/badge/game-open%20world-brightgreen)
![Players](https://img.shields.io/badge/players-1-blue)
![Offline](https://img.shields.io/badge/offline-static%20files-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

**Port Azura** is a complete open-world crime game in the spirit of GTA 6, built
from static files and playable offline in a desktop browser. You are **Mara Voss**,
a courier with a fast car and faster enemies, working six jobs across a sun-soaked
coastal city — stealing cars, outrunning the Azura Police Department, and taking
the crown of Port Azura.

Everything is original: the city, the characters, the vehicles, the story, the art
and the synthesized sounds. Nothing is taken from Rockstar's GTA or any other
commercial game.

## What is in the game

- **A city to explore** — Port Azura: five districts (Old Town, Downtown, Marina Bay,
  Harbor South, Palm Heights), a beach and pier, parks, a stadium and a harbor.
- **On foot and by car** — walk, sprint, steal any parked or traffic car, drive with
  acceleration, steering and a handbrake.
- **Traffic and pedestrians** — cars follow the road grid and turn at intersections;
  pedestrians stroll the sidewalks and panic when shots ring out.
- **Wanted level and police** — 0–5 stars. The APD sends patrol cars that chase and
  ram, and officers on foot at higher levels. Lay low and the heat fades; get caught
  on foot and you are busted.
- **Missions and a story** — six jobs: a delivery, a car theft, losing the cops, a
  gang shootout at Cafe Lumen, the Bank of Azura heist, and the final run to Sunset Pier.
- **Combat** — mouse-aim shooting, punching, health / armor / ammo pickups, enemy
  health bars and gang crews that fight back.
- **HUD with minimap** — cash, health, armor, ammo, wanted stars, mission objective
  with distance, and a live minimap with the mission marker, cop blips and player arrow.
- **Start screen and save** — start screen with story and controls, pause menu, and
  saving to the browser (localStorage) — progress survives a reload.
- **Sound, all synthesized** — engine hum, police sirens, gunshots, pickups and a
  sunset bass groove, made with WebAudio. No audio files, no network.

## How to play

Open `game/index.html` from any static file server (for example `node serve.ts`
in the kit, or `python3 -m http.server` inside `game/`) and play in desktop Chrome.

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk / drive, steer |
| E | Enter / steal a car, exit a car |
| Mouse + Click | Aim and shoot |
| F | Punch |
| Shift | Sprint |
| Space | Handbrake |
| N | Start the next job |
| S | Save the game |
| P / Esc | Pause |
| M | Mute |

## Screenshot states

The game supports deterministic scene presets for captures via URL query params:

- `?shot=cover` — on foot at Azura Plaza, first mission active
- `?shot=drive` — driving the Azura GT down Harbor Avenue
- `?shot=chase` — three-star police chase
- `?shot=mission` — the Cafe Lumen gang shootout

## Structure

- `game/index.html` — the playable page and HUD
- `game/src/rng.js` — seeded RNG and math helpers
- `game/src/city.js` — city generation, districts, collision
- `game/src/audio.js` — WebAudio synthesized sound and music
- `game/src/player.js` — Mara on foot and behind the wheel, combat
- `game/src/traffic.js` — traffic cars and pedestrians
- `game/src/police.js` — wanted level, cop cars and officers
- `game/src/missions.js` — the six-job story
- `game/src/hud.js` — HUD, minimap, menus
- `game/src/main.js` — game loop, camera, rendering, save/load
- `main.ts` — entry program: copies `game/` + `screenshots/` to the output
  dir and writes `dossier.json`

## License

MIT — see `LICENSE`.
