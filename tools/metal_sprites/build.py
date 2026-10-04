"""Cut the 2D Metal Sonic frames out of the "Metal Sonic (1.9.3)" skin sheet
from Sonic Boll Deluxe (github.com/LillyPads07/Sonic-Boll-Deluxe-OE,
SBDX_skins/player/Metal Sonic (1.9.3)/sonic.png) into a packed strip.

usage: python3 tools/metal_sprites/build.py path/to/sonic.png
writes assets/sonic/metal_sprites.png and prints the frame table for js/sprites.js
"""
import sys, json
from collections import deque
from PIL import Image

BG = (104, 175, 253)
# cell index -> (animation, frame) ; cells are numbered top-to-bottom, left-to-right
PICK = {'idle': [14], 'hover': [46, 47], 'dive': [108, 109], 'boost': [55, 56], 'point': [18], 'fall': [30]}


def cells(im):
    W, H = im.size; px = im.load()
    bg = lambda x, y: px[x, y][:3] == BG
    seen = set(); out = []
    for y in range(120, H):
        for x in range(W):
            if (x, y) in seen or not bg(x, y): continue
            q = deque([(x, y)]); seen.add((x, y)); x0 = x1 = x; y0 = y1 = y
            while q:
                cx, cy = q.popleft(); x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and bg(nx, ny): seen.add((nx, ny)); q.append((nx, ny))
            if x1 - x0 >= 20 and y1 - y0 >= 28: out.append((y0, x0, y1 + 1, x1 + 1))
    out.sort(key=lambda c: (c[0] // 8, c[1]))
    return out


def main(src):
    im = Image.open(src).convert('RGBA'); cs = cells(im)
    frames, tiles = {}, []
    x = 0
    for anim, ids in PICK.items():
        frames[anim] = []
        for k in ids:
            y0, x0, y1, x1 = cs[k]
            t = im.crop((x0, y0, x1, y1)); p = t.load()
            for yy in range(t.height):
                for xx in range(t.width):
                    if p[xx, yy][:3] == BG: p[xx, yy] = (0, 0, 0, 0)
            bb = t.getbbox(); t = t.crop((bb[0], bb[1], bb[2], t.height))   # keep the cell's floor as the baseline
            tiles.append((t, x)); frames[anim].append([x, 0, t.width, t.height]); x += t.width + 1
    sheet = Image.new('RGBA', (x, max(t.height for t, _ in tiles)), (0, 0, 0, 0))
    for t, tx in tiles: sheet.paste(t, (tx, 0))
    sheet.save('assets/sonic/metal_sprites.png')
    print('const METAL_FRAMES = ' + json.dumps(frames).replace(' ', '') + ';')


main(sys.argv[1] if len(sys.argv) > 1 else 'sonic.png')
