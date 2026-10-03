# Sonic: Emerald Meadow (fan game)

A complete 2D Sonic-style platformer in plain HTML5 canvas and JavaScript. It has no build step and no dependencies.

## Play

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

**Easiest:** open `sonic-standalone.html`. It's a single file with every script, image, sound and the font built in, so it works offline, by double-click, on its own. Rebuild it with `python3 tools/build_standalone.py --no-music` after changing the game.

You can also open `index.html` directly, but only with the `js/` and `assets/` folders next to it. Sound effects fall back to `<audio>` elements when the page is loaded from `file://`.

To host it, enable **GitHub Pages** for this repo (Settings → Pages → deploy from branch, root folder). The game is fully static.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / left stick | ◀ ▶ |
| Jump | Z / X / C / Space | A / B / X / Y | A |
| Roll | Down while running | Down | ▼ |
| Spin dash | Hold Down, tap Jump, release Down | same | same |
| Homing attack / air dash | Jump, then Jump again in mid-air | A, A | A, A |
| Look up / down | Up / Down while standing | same | ▲ ▼ |
| Pause | Enter / P / Esc | Start | II |
| Mute | M | — | — |

**Final battle (Super Sonic):**

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Fly | Arrows / WASD | D-pad / stick | D-pad |
| Light fist combo (auto lock-on, 3rd hit is a big uppercut) | Z / Space | A | A |
| Laser beam: hold to charge, release to fire | X | X | B |
| Light clones (costs 5 rings) | C | Y | X |
| Rip off a loose part, then throw it | V / Shift | B | Y |
| Counter the eye laser: hold laser while it charges, then mash | X, then Z | X, then A | B, then A |

**Final brawl (vs Eggman on foot):**

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Punch combo (4th hit = uppercut, juggles him) | Z / Space | A | A |
| Kick (sends him into walls; from above = spike) | X | X | B |
| Grab, then throw (aim with arrows, down = slam) | V / Shift | B | Y |
| Ground and pound (when he's knocked down): get close, then mash | Z | A | A |
| Light clones | C | Y | X |

## Features

- Mega Drive–style momentum physics: ground speed, slope gravity, rolling, spin dash, variable jump height and air drag. Values come from the Sonic Physics Guide, scaled for 64px tiles.
- Heightmap collision on slopes (26° and 45° ramps in both directions), one-way cloud platforms, and moving platforms.
- Full 360° vertical loops.
- Rings, and losing them when hit: they scatter and can be picked back up. You get an extra life at 100 rings and at every 50,000 points.
- Item monitors: 10 rings, shield, speed shoes, invincibility, 1-up.
- Springs (yellow and red, up and sideways), spikes, checkpoints (star posts), and a spinning end-of-act signpost.
- Badniks: slime, ladybug, mouse, hopping frog, hovering fly, a bee that fires stingers, and an indestructible saw. Defeating one frees an animal, and chained hits score 100, 200, 500 and then 1000.
- Homing attack with a lock-on reticle: chain enemies in mid-air (flying badniks are placed over pits for this). Hits get impact freeze frames, screen shake and a combo counter; from the 3rd hit in a chain each kill also gives a ring.
- Speech bubbles: Sonic and Eggman talk, and Sonic calls out what to do next with the right button for your keyboard, gamepad or touch screen.
- 3 acts: **Emerald Meadow**, **Sunset Dunes** and **Starlight Fortress**. The last act ends in a boss fight with Dr. Eggman's egg-craft (8 hits, two phases).
- **Final battle:** after the egg-craft falls, it docks as the head of the giant **Egg Colossus**. The Chaos Emeralds turn Sonic into Super Sonic for a free-flight fight with Frontiers-style moves: light fists, a charged laser, light clones, ripping off the robot's arms, missile pods and chest plate and throwing them back at its core, and beam clashes against Eggman's eye laser. Super form drains a ring per second; if you run out you lose a life and retry from the transformation. Counter Eggman's eye laser by holding your laser while it charges: the beams lock into a clash you win by mashing.
- **Final brawl:** when the Colossus falls, Super Sonic rips Eggman out of the cockpit and fights him hand to hand: punch combos, kicks, wall slams, grabs and throws, and ground-and-pound when he's down. Hits land with Sonic's actual gloves and shoes, heavy synthesized punch impacts, hit-stop, blood and teeth that stain the floor, and damage that builds on Eggman's face (bruises, broken goggles, nosebleed). Eggman fights back with charges, leaps and bombs, but gets more scared with every hit (ANGRY → NERVOUS → TERRIFIED): he flees, trips, cowers and begs. At the last second Metal Sonic snatches him away. TO BE CONTINUED.
- Title screen, act title cards, score tally (time and ring bonus), pause, game over, ending, and a saved hi-score.
- Classic death/continue rules: dying in an act sends you to the last star post; dying in the super battle restarts the super battle (like Doomsday Zone), and dying in the brawl restarts the brawl. On game over you get a 10-second **CONTINUE?** screen (2 continues per game): 3 fresh lives, score resets to 0, and you resume at the super battle/brawl if you'd reached it.
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
| `js/speech.js` | Speech bubbles and button prompts |
| `js/superboss.js` | Super Sonic final battle and the Egg Colossus |
| `js/brawl.js` | Eggman brawl, Metal Sonic, impact effects |
| `js/eggframes.js` | Eggman sprite frame rects |

## Credits & licenses

- **Tiles, enemies, backgrounds:** Kenney "New Platformer Pack", CC0 ([kenney.nl](https://kenney.nl/assets/new-platformer-pack)), via the [shorepine/kenney](https://github.com/shorepine/kenney) mirror. The backgrounds were given transparent skies so they can be layered.
- **Sound effects / jingles:** Kenney "Digital Audio" and "Music Jingles", CC0 ([kenney.nl](https://kenney.nl)), via the [ETdoFresh/kenney.nl](https://github.com/ETdoFresh/kenney.nl) mirror. They were converted to MP3. See `assets/LICENSE-kenney.txt`.
- **Sonic sprites:** fan-ripped 8-bit Sonic sprite sheet from [Avalojandro/SONIC-HTML](https://github.com/Avalojandro/SONIC-HTML), downsampled to native resolution. Super Sonic is a gold recolor of the same frames.
- **Eggman sprites:** fan-ripped frames from the same [Avalojandro/SONIC-HTML](https://github.com/Avalojandro/SONIC-HTML) project, downsampled to native pixels. Metal Sonic is a steel recolor of the Sonic sheet.
- **Rings, monitors, bosses, Egg Colossus, effects, chiptune music:** drawn and composed in code for this project.
- **Final battle songs:** the game plays `assets/music/with_me.mp3` (robot fight) and `assets/music/built_for_blame.mp3` (brawl) if present. That folder is git-ignored because the song is a commercial recording. Without it, the battle uses a synth theme. `python3 tools/build_standalone.py` bundles the song into `sonic-standalone-full.html` (also git-ignored).
- **Font:** Press Start 2P (SIL OFL), bundled in `assets/fonts` (from `@fontsource/press-start-2p`).

This is an unofficial, non-commercial fan game. Sonic the Hedgehog, Super Sonic, Dr. Eggman and the original sprites are property of SEGA. This project is not affiliated with or endorsed by SEGA. Don't sell it or monetize it.
