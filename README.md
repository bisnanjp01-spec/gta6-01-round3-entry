# Costa Verde — Open-World Crime Caper

An original 2D top-down open-world crime game, built from scratch for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

You are **Mara Voss**, a getaway driver in **Costa Verde**, a sun-soaked coastal
city of our own invention. Take three chained jobs from your fixer Rico — a
getaway, a pickup, and one very hot delivery — while the Verde PD closes in.

## What the game has

- A city to explore **on foot and by car**, with a road grid, harbour, plaza and parks
- **Traffic** (AI cars driving the roads) and **pedestrians** on the sidewalks
- **Cars to steal** — sedans, taxis, sports cars, vans and pickups, each with its own handling
- A **wanted system** (5 stars) with police cars that chase, ram and escalate — lose them by breaking line of sight
- **3 chained story missions** with objectives, a timer on the final delivery, and cash rewards
- **Combat** — punch up close, shoot with the mouse
- A **HUD with a live minimap** (player, cars, police, mission marker), wanted stars, health and cash
- **Start screen** with story intro and controls, **pause menu**, and **localStorage saves**
- **Synthesized WebAudio sound** — engine hum, sirens, shots, jingles. No audio files.
- Polish: smooth camera, skid marks, muzzle-flash particles, day lighting and a vignette

## How to play

| Key | Action |
| --- | --- |
| WASD / Arrow keys | Move on foot / drive |
| E or Enter | Enter / exit a car (steal the nearest one) |
| Mouse click or F | Shoot (on foot) |
| Space | Punch (on foot) |
| P or Esc | Pause |
| M | Mute |

Steal a car, follow the green beacon to each objective, and watch the stars.
If your health hits zero you are busted — you lose $200 and wake up at the plaza.
Progress (cash, completed jobs) is saved in your browser automatically.

## Run it

Open `game/index.html` in a desktop browser (or serve `game/` with any static
server). No build step, no libraries, no network requests — everything loads
from files under `game/`.

Screenshot staging: `game/index.html?shot=chase|drive|foot|mission` opens the
game straight into a staged scene.
