[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bisnanjp01-spec/gta6-01-round3-entry/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bisnanjp01-spec/gta6-01-round3-entry/reward.svg)](https://make.fun/bounty/gta6-01)

# Emberline — a neon-noir open-world crime game

Emberline is an original open-world crime game built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01). Rain on the river, neon on the wet streets, and one driver who owes the Tide crew everything.

## The game

You are **Mara Voss**, ex-getaway driver turned night courier in Emberline — a rain-slicked river-delta port city at night, split into Glass Row, Old Market, The Docks, Shanty Quay, and the Harbor Bay. Steal cars, sail boats on the river and the bay, outrun the Port Police, and work the eight chapters of the Tide Ledger, from a quiet first fare to stealing the harbormaster's ledger from a moving armored convoy and escaping through the storm gates by boat.

**What's in the city**

- A full open world on foot and by car — plus boats on the river and harbor
- Traffic and pedestrians who flee gunfire; a living night city
- Cars to steal (stealing raises your wanted level) and a marked sportscar heist
- Wanted level 0–5 stars: patrol cars, foot officers, police boats, a helicopter, and roadblocks
- Missions and a story: 8 chapters of the Tide Ledger, plus a payphone job board (courier runs, taxi fares, getaway drives, stash pickups, street races, boat runs)
- Combat on foot: pistol with mouse aim, punches, armor, ammo
- HUD with minimap, wanted stars, health/armor, cash, reputation, night clock, and a living tide that opens the Shanty Quay cache at low tide
- Start screen, pause menu, game-over (busted / wasted) flow, and saving — at the safehouse or from the pause menu
- Synthesized sound: rain, engine hum, sirens, gunshots, and a slow neon bass line (WebAudio, no audio files)

## How to play

Serve `game/` with any static server and open `game/index.html` in desktop Chrome. No network requests — everything is local.

- **WASD / arrows** — drive or walk · **Shift** — sprint / handbrake
- **E** — steal a car, board a boat, answer a payphone, use a shop
- **Mouse** — aim · **click / Space** — shoot (or punch without a gun)
- **P / Esc** — pause · **M** — mute

Find a payphone (yellow ☎) to take work. Earn reputation to unlock the next story chapter. Save at the safehouse (green $).

## How it is built

- `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `vendor/makefun-game.ts`.
- `game/` is plain HTML/CSS/JavaScript (Canvas 2D, no libraries, no build step). The simulation runs at a fixed 60 Hz from a fixed seed (`emberline-20261124`), so the same night plays the same way every time.
- `game/main.js` — state, loop, input, rendering, save/load · `game/harbor.js` — the city generator · `game/drive.js` — cars and boats · `game/walk.js` — on-foot movement and combat · `game/traffic.js` — traffic and pedestrians · `game/cops.js` — wanted levels and police · `game/jobs.js` — the job board and the Tide Ledger story · `game/hud.js` — HUD and minimap · `game/audio.js` — synthesized sound · `game/shots.js` — screenshot staging

## License

MIT — see [LICENSE](LICENSE). All names, characters, art, and music are original; nothing is taken from any commercial game.
