# Sonic: Emerald Meadow (fan game)

A complete 2D Sonic-style platformer in plain HTML5 canvas and JavaScript. It has no build step and no dependencies.

## Play

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Easiest:** open `sonic-standalone.html`. It's a single file with every script, image, sound and the font built in, so it works offline, by double-click, on its own. Rebuild it with `python3 tools/build_standalone.py` after changing the game.

You can also open `index.html` directly, but only with the `js/` and `assets/` folders next to it. Sound effects fall back to `<audio>` elements when the page is loaded from `file://`.

To host it, enable **GitHub Pages** for this repo (Settings → Pages → deploy from branch, root folder). The game is fully static.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / left stick | ◀ ▶ |
| Jump | Z / X / C / Space | A / B / X / Y | A |
| Roll | Down while running | Down | ▼ |
| Spin dash | Hold Down, tap Jump, release Down | same | same |
| Look up / down | Up / Down while standing | same | ▲ ▼ |
| Pause | Enter / P / Esc | Start | II |
| Mute | M | — | — |

## Features

- Mega Drive–style momentum physics: ground speed, slope gravity, rolling, spin dash, variable jump height and air drag. Values come from the Sonic Physics Guide, scaled for 64px tiles.
- Heightmap collision on slopes (26° and 45° ramps in both directions), one-way cloud platforms, and moving platforms.
- Full 360° vertical loops.
- Rings, and losing them when hit: they scatter and can be picked back up. You get an extra life at 100 rings and at every 50,000 points.
- Item monitors: 10 rings, shield, speed shoes, invincibility, 1-up.
- Springs (yellow and red, up and sideways), spikes, checkpoints (star posts), and a spinning end-of-act signpost.
- Badniks: slime, ladybug, mouse, hopping frog, hovering fly, a bee that fires stingers, and an indestructible saw. Defeating one frees an animal, and chained hits score 100, 200, 500 and then 1000.
- 3 acts: **Emerald Meadow**, **Sunset Dunes** and **Starlight Fortress**. The last act ends in a boss fight with Dr. Eggman's egg-craft (8 hits, two phases).
- Title screen, act title cards, score tally (time and ring bonus), pause, game over, ending, and a saved hi-score.
- An original chiptune soundtrack synthesized live with Web Audio: meadow, dunes, fortress, boss and invincibility themes.
- Works with keyboard, gamepad and touch (on-screen controls appear automatically on phones and tablets).

## Code layout

| File | Purpose |
|---|---|
| `js/assets.js` | Image loader, mirrored ramps, tinted variants |
| `js/audio.js` | SFX playback and the chiptune sequencer |
| `js/sprites.js` | Hand-drawn vector sprites: hero, rings, monitors, signpost, boss, animals |
| `js/levels.js` | Level builder ("pen" that lays slopes/flats/gaps) and the 3 acts |
| `js/world.js` | Tile heightmaps, floor/wall queries, autotiling, parallax |
| `js/player.js` | Hero physics and animation |
| `js/entities.js` | Rings, enemies, monitors, springs, platforms, boss |
| `js/input.js` | Keyboard, gamepad and touch input |
| `js/game.js` | State machine, camera, HUD, main loop |

## Credits & licenses

- **Tiles, enemies, backgrounds:** Kenney "New Platformer Pack", CC0 ([kenney.nl](https://kenney.nl/assets/new-platformer-pack)), via the [shorepine/kenney](https://github.com/shorepine/kenney) mirror. The backgrounds were given transparent skies so they can be layered.
- **Sound effects / jingles:** Kenney "Digital Audio" and "Music Jingles", CC0 ([kenney.nl](https://kenney.nl)), via the [ETdoFresh/kenney.nl](https://github.com/ETdoFresh/kenney.nl) mirror. They were converted to MP3. See `assets/LICENSE-kenney.txt`.
- **Hero, rings, monitors, boss, music:** drawn and composed in code for this project.
- **Font:** Press Start 2P (SIL OFL), bundled in `assets/fonts` (from `@fontsource/press-start-2p`).

This is an unofficial, non-commercial fan game. Sonic the Hedgehog and Dr. Eggman are trademarks of SEGA. This project is not affiliated with or endorsed by SEGA. Don't sell it or monetize it.
