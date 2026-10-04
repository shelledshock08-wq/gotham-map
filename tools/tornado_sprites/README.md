# Tornado level sprites

There is no Tails sheet by the author of our 8-bit Sonic sprites (Avalojandro/SONIC-HTML), and no free IDW Zombot sprites or models, so the 2D sprites for the Sky Chase pickup scene are rendered from the 3D models instead:

1. Serve a folder holding `gen.html`, `gen.js` and `jobs.json`, with `js/` linked to the game's `js/` folder, on port 8766.
2. `NODE_PATH=$(npm root -g) node gen.js` renders each job (Tails clips, the Tornado with Tails at the stick, a Zombot jet, an infected bird and a Zombot) to `/tmp/claude-0/gen/`.
3. `python3 pixelate.py [render dir]` downsamples 4x, quantizes each sprite to a small palette, adds a dark outline, and writes `assets/sonic/tornado_sprites.png` and `js/tailsframes.js`.
