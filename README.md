# Sonic Anthology (fan game)

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
| Headbutt | Up + Z | Up + A | ▲ + A |
| Kick (sends him into walls; from above = spike) | X | X | B |
| Spin-dash cut: hold to rev, release to slice through him (1-3 passes) | hold C | hold Y | hold X |
| Grab him by the leg, smash him into the floor left/right, throw | V, then ← / → (or Z), V | B, ← / →, B | Y, ◀ / ▶, Y |
| Ground and pound (when he's knocked down) | Z next to him, mash Z | A | A |
| Bite (while pinned) / haul him up by the leg | hold V / Up | hold B / Up | hold Y / ▲ |

**Egg Base Escape (3D boost run):**

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | ← / → | D-pad / stick | ◀ ▶ |
| Boost (hold; very fast but drains quickly; smashes crates and robots, but Egg trucks and rocks are solid) | X | X | B |
| Jump / homing attack in mid-air / air dash | Z / Space | A | A |
| Slide | hold ↓ | Down | ▼ |
| Spin dash: hold to rev, let go to roll (faster than running, slower than boost; busts crates and robots; no gauge; not on water) | hold C | hold Y | hold X |
| Run on water | you MUST be boosting (floating dash panels give a short kick); stop and you drown instantly | | |

**Emerald Ruins (Diamond Rush style):** arrows / D-pad move one tile at a time; walk into a boulder to push it sideways; hold Z (A) to give up and go back to the last checkpoint.

**Special Stage:** ← / → run up the walls of the half-pipe, Z / A jumps.

**Sky Chase (the Tornado):**

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Switch between the pilot and the fighter on the wing | Q / Tab | LB | ⇄ |
| Swap roles (Sonic flies, Tails fights), only for a few seconds | E | RB | ⟲ |
| Pilot: fly left / right; aim the guns up / down (the reticle follows the plane) | Arrows / WASD | D-pad / stick | D-pad |
| Pilot: machine guns with auto-aim (hold) | Z or left mouse button | A | A |
| Pilot: hold to open the lock circle around the reticle; anything kept inside it for a moment gets locked (up to 6); release to fire a missile salvo | hold X or right mouse button | hold X | hold B |
| Sonic Missile (special 1, 8 s): drift left / right on momentum; homing attack (on-screen targets only) | ← → / Z or left click | | |
| Super Sonic (special 5, 15 s, Sonic Frontiers style): fly / hold to boost / homing attack, then mash for the combo / Spin Slash / Sonic Boom / tap for Quick Cyloop, hold for Cyloop | Arrows / C / Z / X / B / V | | |
| Super Sonic skills: boost + Z Homing Shot, boost + X Loop Kick, boost + V Cross Slash; dodge left/right (hold to stay untouchable); hold both to parry; both + Z Wild Rush; X or V after a parry: Grand Slam | C+Z / C+X / C+V / Q or E / Q+E / Q+E+Z | LB / RB = dodge, LB+RB = parry, LT = Sonic Boom | |
| Special moves, paid in rings: 1 Sonic Missile (10), 2 Freeze Ray (20), 3 Shield Ram (30), 4 Autopilot Combo (40), 5 Super Sonic (50) | 1–5 | | 1–5 buttons |
| Pilot: barrel roll (shrugs off energy bolts) | C | Y | X |
| Fighter: move along the wing / jump | ← → / ↑ | D-pad | ◀ ▶ / ▲ |
| Sonic: homing attack at the nearest enemy, from the ground or the air (no target: jump, then a short air dash); bounces you up to chain up to 3 | Z or left mouse button | A | A |
| Sonic: spin dash: hold to charge, tap again to rev harder, let go to blast along the wing (breaks guards) | hold X (or ↓ + Z) | | |
| Sonic: boost (costs half the boost gauge, refilled by landing hits) | C | | |
| Sonic: grab one and hold it over your head, smack it into the wing, throw it | V, then Z / V | | |
| Tails: punch combo (3rd hit: Sonic kicks, Tails swipes with his tails); press it while the red "!" is up to PARRY | Z or left mouse button | A | A |
| Tails: uppercut (launches them for a juggle; they SLAM when they land) | ↓ + Z | ↓ + A | ▼ + A |
| Tails: dash at an enemy (hits on the way, doesn't one-shot) | double-tap ← or → (A / D) | double-tap | double-tap |
| Tails: TAIL SMACK (360° whip that clears the wing) / tail spin | X / C | X / Y | B / X |
| Grab an enemy by the leg, swing it around and throw it off the plane; on a staggered Zombot: ZANDATSU (Sonic) or FATALITY (Tails) | V / Shift | B | Y |
| Bite (don't) | B | LT | ☠ |

**Save files:** pressing Start on the title screen opens DATA SELECT (3 files, Sonic 3 & Knuckles style). An empty file becomes a new save the moment you start it. The game saves at the start of every stage and the moment you decide Eggman's fate. A file in progress always continues where you left off; you can only pick stages once the file is cleared, and on a cleared file Eggman's fate plays out the way you chose it. Press the grab button twice on a file to erase it.

**Developer skip menu (temporary):** on the title screen, click **DEV** (or press 0–9) to jump to Act 1–3, the Eggman ship boss, the Egg Colossus cutscene, the super battle, the brawl, the 3D base escape, the Emerald Ruins (9), the Special Stage (0) or the Sky Chase (the minus key). Skips past the brawl first ask whether Eggman was KILLED or SPARED. Dev skips never touch save files. Turn it off with `DEV_MENU = false` in `js/game.js`.

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
- **Chaos Emeralds:** Acts 1 and 2 each hide two emeralds (the HUD shows the eight slots). The goal post won't turn until you've found the act's two.
- **Emerald Ruins:** after Act 2, the four emeralds open a portal to a jungle temple that plays like Gameloft's *Diamond Rush*:
  - **The grid:** Sonic walks tile by tile through tunnels and cuts through vines.
  - **Boulders:** they fall and roll off round things, crush anything underneath (snakes too), and can be pushed sideways.
  - **Doors:** keys open locked doors, and a padlocked gate needs 16 purple diamonds.
  - **Hazards:** snakes and timed spike traps.
  - **Checkpoints:** dying resets the room to how it was at the last checkpoint.

  Three more emeralds are hidden in the Ruins.
- **Special Stage:** the portal home throws Sonic into a Sonic 2 style half-pipe (3D, Generations Sonic model) and the seven emeralds scatter ahead of him:
  - **Gates:** you clear ring-quota gates to win them back, and bombs cost 10 rings.
  - **The eighth:** at the end he catches an **eighth emerald**, which sends him home to Act 3 and Eggman.
- **Final battle:** after the egg-craft falls, it docks as the head of the giant **Egg Colossus**. The Chaos Emeralds turn Sonic into Super Sonic for a free-flight fight with Frontiers-style moves: light fists, a charged laser, light clones, ripping off the robot's arms, missile pods and chest plate and throwing them back at its core, and beam clashes against Eggman's eye laser. Super form drains a ring per second; if you run out you lose a life and retry from the transformation. Counter Eggman's eye laser by holding your laser while it charges: the beams lock into a clash you win by mashing.
- **Final brawl:** when the Colossus falls, Super Sonic rips Eggman out of the cockpit and fights him hand to hand: punch combos, kicks, wall slams, grabs and throws, and ground-and-pound when he's down. The camera goes in close (and tighter during ground-and-pound), jolts toward every punch, and heavy blows drop into slow motion. Sonic's rage builds as he lands hits: his aura burns from gold to crimson, embers rise off him and red edges close in on the screen. Hits land with Sonic's actual gloves and shoes, heavy synthesized punch impacts, hit-stop, blood and teeth that stain the floor, and a beating that shows on Eggman in four stages: a swollen cheek, a cracked lens and a nosebleed; then a black eye and a split forehead; then both eyes blackened, a shattered lens over a swollen-shut eye, blood running down his face and a torn coat; and finally smashed goggles, a purple face covered in blood that drips off him, and a coat in tatters. Eggman fights back with charges, leaps and bombs, but gets more scared with every hit (ANGRY → NERVOUS → TERRIFIED): he flees, trips, cowers and begs. When his health runs out you choose: **KILL** or **SPARE**.
  - **Spare:** Metal Sonic snatches him away at the last second, as before, and Eggman smiles. *Eggman will remember that.*
  - **Kill:** Sonic spin-dashes straight through him, leaving a hole in his body. His last words are "I... knew you had... it in you." Metal Sonic arrives too late and carries the body away. *Metal Sonic will remember that.*

  Either way the game carries on to the escape.
- **Egg Base Escape:** Eggman sets the base to self-destruct. Sonic drops out of super form and the game switches to a behind-the-back 3D boost stage in the style of Sonic Generations (three.js), with the Sonic Generations model and animations: run, max-speed sprint, spring, hurt, falling and victory. It plays *Rise From The Ashes* if `assets/music/rise_from_the_ashes.mp3` is present. The course has five parts:
  1. You boost through the collapsing base and a loop in its hangar.
  2. You burst out onto an elevated highway through a burning city at dusk, with banked turns, cars, Egg Pawns, a broken bridge you cross by chaining homing attacks, a loop and a corkscrew.
  3. You run straight down the glass face of a skyscraper (Speed Highway style) while windows burst around you.
  4. You cross a bay running on the water. You have to keep boosting or you sink.
  5. You take the coast road through a final loop, launch off a ramp and watch the base blow up behind you.

  Boosting hits with a sonic-boom shockwave, a blue jet trail, a camera FOV punch and a synthesized roar that becomes a held jet-engine sound. The blast wave chases you the whole way (the meter at the top). Rings refill the boost gauge. Dying restarts the escape.
- **Sky Chase:** on the coast road, Tails swoops in with the Tornado and Sonic hops onto the wing (a 2D scene). Sonic starts telling him what happened ("Eggman's gone completely batshit insane, and—") when Zombots attack, firing energy bolts. The game then switches to a third-person 3D shooter: Tails flies the SADX Tornado through a blood-red dusk against infected jets and jetpack Zombots. After about 40 seconds, infected birds (and later Zombots) start landing on the wing and tearing at it, and you have to keep switching between Tails flying and firing, and Sonic fighting the boarders in a Sonic Battle-style brawl on the wing.
  - Neglect the fight and the wing is **torn apart**; Sonic falls to his death.
  - Neglect the flying and the Tornado is **shot down**.
  - Balance both for 70 seconds and a giant Zombot gunship shoots you down anyway. The Tornado crash-lands on a beach, and both of them walk away. TO BE CONTINUED.

  The flying plays like the classic rail shooters (Star Fox, Panzer Dragoon, After Burner): the enemies come from above, so left/right flies the plane and up/down aims; the Star Fox-style double reticle rides out ahead of the plane and the guns auto-aim at whatever it's over (lock tone, red brackets). Hold the missile button and a lock circle opens around the reticle: sweep it over enemies and each one that stays inside for a moment locks on with a rising beep (up to six, and only what you actually aimed at), then let go for a salvo of corkscrewing missiles with fiery trails and big blasts. Destroyed jets and jetpack Zombots go up in a rolling fireball with a shockwave and break apart into burning wreckage that falls away trailing smoke. Destroyed enemies drop rings (repairs) and hyper laser capsules. A Star Fox-style HITS counter tracks kills. The Tornado shows its damage: the paint blackens, scorch marks appear where bolts hit, the engine smokes and then burns, the prop coughs, and the wing gets ripped up as boarders tear at it.

  Tails' wing fight mixes in Metal Gear Rising and Mortal Kombat: time a punch into an enemy's attack to PARRY it (slow motion, the enemy reels); uppercut them into the air and juggle them; build a hit counter (6+ hits add damage); and when a Zombot is beaten down it staggers and the game calls FINISH HIM!. Grab it then and Sonic goes into blade mode and cuts it apart in slow motion (ZANDATSU, which also patches the wing and refills his boost), or Tails lifts it on his spinning tails and whips it to pieces (FATALITY). Sonic doesn't brawl: he fights the classic way. The homing attack hits the nearest enemy and bounces him up into the next one (three in a row at most), the spin dash revs up and rolls through everything on the wing, and the boost burns half the gauge. Zombots put their guard up when you get close: a homing attack just bounces off (BLOCKED), so spin-dash or boost through them (GUARD BREAK!). For fun, he can also grab one, hold it over his head, smack it into the wing as many times as you like, and throw it overboard. Infected birds hop off the wing and dive-bomb you from a distance. A "!" appears over anything winding up (Tails can parry it). A Devil May Cry-style style rank (D, C, B, A, S, SS, SSS) climbs as you vary your moves (spamming one move earns less and less), drains if you stand around, drops by half when you get hit, and pays out rings when it ranks up.

  The special moves (keys 1–5) cost rings, which you earn from kills and ring drops: 1 has Tails fire Sonic into the sky as the Sonic Missile for eight seconds: he can't actually fly, he carries on momentum on a ballistic arc (you only drift left and right) and his homing attack only reaches enemies that are already on screen, bouncing him on to the next; 2 is an ice cannon that fires a beam at every enemy in turn and locks each one in a block of ice (frozen boarders shatter off the plane with one hit, and stop tearing at it); 3 wraps the Tornado in a shield that soaks up fire and lets you climb up and ram the jets out of the sky; 4 switches on a working autopilot while Sonic and Tails fly off together and wipe out everything on the wing and in the air; 5 turns Sonic into Super Sonic, built on how he fights the Titans in Sonic Frontiers. Free flight with boost; the attack button homes in on the soft lock (whatever's nearest the middle of the screen, cores first) and mashing it runs the auto-combo with a heavy finisher, and he stays locked on until you steer away. Skills: Spin Slash (mid-combo), Sonic Boom (crescent kicks), Homing Shot, Loop Kick and Cross Slash (boost + a button), and Wild Rush (zig-zags through everything on screen). Dodge with either shoulder button (hold it to stay untouchable but unable to attack), or hold both to parry: parried bolts fly back into the cores, and a parried ram stuns the gunship for a GRAND SLAM, a mash-for-damage flurry ending in one huge blow. The gunship cores are shielded, and only a Cyloop breaks the shields: hold the button and Sonic draws a loop of light around the ship, which also stuns it; a tap is a Quick Cyloop that breaks nearby shields and shakes a few rings loose. Gunships attack with bolt volleys, rams (a red line shows the path: parry it) and beams (dodge, or get caught in a beam struggle and mash to push it back into the ship for a stun). Landing hits without getting hit fills the gauge for Phantom Rush (double damage). Rings are time, as in Frontiers: fifteen seconds' worth that tick away, and every hit knocks some out (a Recovery Smash right after a hit lets you strike back). The plane takes no damage while he's super. Both flying specials keep a stream of enemies coming until Sonic is back on the wing.

  The Zombots are infected mobians in the style of Sonic Forces fan OCs: hedgehogs, foxes, bunnies, wolves, bears, cats, echidnas and hawks, built on the Generations Sonic and Tails rigs (reshaped ears, tails and bulk, plus snouts, beaks, crests and dreadlocks) in 18 dull metal colours and varied sizes, with dull metallic skin in a random muted colour (blue, green, red, purple...), black sclera and red eyes, spikes pushing out of their heads, shoulders and backs, and a hunched, arms-out zombie lurch. They raise both claws and rake down when they attack.

  Everyone moves with real motion capture from the CMU Graphics Lab database, retargeted onto the Generations rigs: Sonic and Tails fight from a boxer's guard with captured jabs, crosses, uppercuts, front kicks, a jump kick and a spin kick, and run with a captured run; the Zombots march with the captured "zombie march", creep along the wing while they tear at it, and limp when staggered. Enemies flash white when hit and the camera punches in on heavy blows.

  On the wing, Sonic and Tails fight Sonic Battle-style with real poses: a fists-up boxer's stance, jab, cross, roundhouse (Sonic) or tail swipe (Tails), flying kick, spin attack, boost dash, leg grab and swing-throw, and Tails' tail smack. Every hit lands with a flash, a shockwave ring, flying feathers or metal plates, hit-stop, camera shake, layered impact sounds and a P5-style SMASH!/BAM! word.

  You can swap roles for a few seconds: Tails can fight (his tail smack is the strongest move in the game) until he gets tired, and Sonic can fly until he admits he has no idea how (the controls are reversed and the plane wanders). Biting a Zombot or an infected bird gets you infected by the Metal Virus: instant game over. The stage leans uneasy: a dark sky, glowing eyes opening in the clouds, lightning, film grain and the odd glitch, a low drone with whispers, and a minor-key theme.
- **Persona 5-style dialogue:** every line is a slanted black panel with a white rim, a red offset shadow and a tilted name tag in the speaker's colour.
- Title screen, act title cards, score tally (time and ring bonus), pause, game over, ending, and a saved hi-score.
- Classic death/continue rules: dying in an act sends you to the last star post; dying in the super battle restarts the super battle (like Doomsday Zone); dying in the brawl or the escape restarts that part; dying in the Sky Chase restarts the shooter, or the boarding fight once you've reached it. On game over you get a 10-second **CONTINUE?** screen (2 continues per game): 3 fresh lives, score resets to 0, and you resume at the super battle, brawl or escape if you had reached it.
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
| `js/save.js` | Save files: data select screen, stage picker for cleared files, the DEV fate prompt |
| `js/speech.js` | Speech bubbles and button prompts |
| `js/superboss.js` | Super Sonic final battle and the Egg Colossus |
| `js/brawl.js` | Eggman brawl, Metal Sonic, impact effects |
| `js/ruins.js` | Emerald Ruins: the Diamond Rush style grid act (map, boulder physics, snakes, spikes, checkpoints) |
| `js/special.js` | Sonic 2 style Special Stage (3D half-pipe, ring quotas, emeralds) |
| `js/escape.js` | 3D Egg Base Escape: course (loops, corkscrew, building run, water), boost physics, hazards, camera |
| `js/tornado.js` | Sky Chase: 2D pickup scene, 3D Tornado shooter, wing brawler, role switching, the three outcomes, horror post-effects |
| `js/models_tornado.js` | Packed Tails (Generations) and Tornado (SADX) models (generated by `tools/convert_models/pack_tornado.py`) |
| `js/tailsframes.js` | Frame rects for `assets/sonic/tornado_sprites.png` (generated by `tools/tornado_sprites`) |
| `js/mocap.js` | Retargeted motion-capture clips (generated by `tools/mocap/extract.py`) |
| `js/models3d.js` | Packed Sonic and Egg Pawn 3D models and animations (generated by `tools/convert_models`) |
| `js/lib/three.min.js` | three.js r149 (MIT), used only by the escape |
| `js/eggframes.js` | Eggman sprite frame rects |
| `js/eggface.js` | Eggman face anchors per frame (generated) |
| `tools/make_egg_damage.py` | Paints the four beaten-up Eggman sheets (`eggman_d1-4.png`) and writes `js/eggface.js` |

## Credits & licenses

- **Tiles, enemies, backgrounds:** Kenney "New Platformer Pack", CC0 ([kenney.nl](https://kenney.nl/assets/new-platformer-pack)), via the [shorepine/kenney](https://github.com/shorepine/kenney) mirror. The backgrounds were given transparent skies so they can be layered.
- **Sound effects / jingles:** Kenney "Digital Audio" and "Music Jingles", CC0 ([kenney.nl](https://kenney.nl)), via the [ETdoFresh/kenney.nl](https://github.com/ETdoFresh/kenney.nl) mirror. They were converted to MP3. See `assets/LICENSE-kenney.txt`.
- **Sonic sprites:** fan-ripped 8-bit Sonic sprite sheet from [Avalojandro/SONIC-HTML](https://github.com/Avalojandro/SONIC-HTML), downsampled to native resolution. Super Sonic is a gold recolor of the same frames.
- **Eggman sprites:** fan-ripped frames from the same [Avalojandro/SONIC-HTML](https://github.com/Avalojandro/SONIC-HTML) project, downsampled to native pixels.
- **Metal Sonic sprites:** real 16-bit Metal Sonic frames (stand, hover, jet dash, boost) cut from the fan-made "Metal Sonic (1.9.3)" skin in [Sonic Boll Deluxe](https://github.com/LillyPads07/Sonic-Boll-Deluxe-OE) (`SBDX_skins/player/Metal Sonic (1.9.3)/sonic.png`) by `tools/metal_sprites/build.py`.
- **3D Sonic and Egg Pawn:** the Sonic Generations models ripped by Apoc Hedgie for The Models Resource, with Generations animation clips, both taken from the [JonathanOdgis/Sonic-The-Hedgehog-Controller-Unity](https://github.com/JonathanOdgis/Sonic-The-Hedgehog-Controller-Unity) fan project and converted with `tools/convert_models`.
- **3D Tails and the Tornado:** Tails is the Sonic Generations model ripped by Random Talking Bush (The Models Resource) with Generations fly, idle and run clips. The Tornado is the Sonic Adventure DX model ripped by josh98. Both come from the same [JonathanOdgis/Sonic-The-Hedgehog-Controller-Unity](https://github.com/JonathanOdgis/Sonic-The-Hedgehog-Controller-Unity) project and were converted with `tools/convert_models` (`export_tornado.*`, `pack_tornado.py`).
- **Tails, Tornado and Zombot sprites:** the author of our Sonic sprites never drew Tails, and there are no free IDW Zombot sprites or models, so the 2D sprites are rendered from the 3D models and reduced to 8-bit style (`tools/tornado_sprites`). The Zombots are Egg Pawns repainted by the Metal Virus (in code), and the infected birds and jets are built in code.
- **Motion capture:** the [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/) (free for any use), in Bruce Hahne's BVH conversion via the [una-dinosauria/cmu-mocap](https://github.com/una-dinosauria/cmu-mocap) mirror: boxing (subjects 13, 14), kicks (74, 88, 90), running (9), zombie march (20, 21), limping and creeping (77). `tools/mocap/extract.py` cuts the clips around the punches and kicks and retargets them by limb direction into `js/mocap.js`.
- **3D engine:** [three.js](https://threejs.org) r149, MIT license (`js/lib/LICENSE-three.txt`).
- **Rings, monitors, bosses, Egg Colossus, effects, chiptune music:** drawn and composed in code for this project.
- **Final battle songs:** the game plays `assets/music/with_me.mp3` (robot fight), `assets/music/built_for_blame.mp3` (brawl) and `assets/music/rise_from_the_ashes.mp3` (escape) if present. That folder is git-ignored because the song is a commercial recording. Without it, the battle uses a synth theme. `python3 tools/build_standalone.py` bundles the song into `sonic-standalone-full.html` (also git-ignored).
- **Font:** Press Start 2P (SIL OFL), bundled in `assets/fonts` (from `@fontsource/press-start-2p`).

This is an unofficial, non-commercial fan game. Sonic the Hedgehog, Super Sonic, Dr. Eggman and the original sprites are property of SEGA. This project is not affiliated with or endorsed by SEGA. Don't sell it or monetize it.
