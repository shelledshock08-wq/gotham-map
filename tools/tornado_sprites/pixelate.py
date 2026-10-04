#!/usr/bin/env python3
"""Turn the 3D renders from gen.js into 8-bit style sprites that sit next to the
fan Sonic sheet: 4x downsample, hard alpha, a small palette per sprite and a dark
outline. Writes assets/sonic/tornado_sprites.png and js/tailsframes.js."""
import json, os, sys
from PIL import Image, ImageEnhance
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/gen'
ORDER = ['t_idle', 't_run0', 't_run1', 't_run2', 't_run3', 't_fly0', 't_fly1', 'plane0', 'plane1', 'jet', 'bird', 'zom']
F = 4

def pixel(im):
    im = im.crop(im.getbbox())
    w, h = max(1, round(im.width / F)), max(1, round(im.height / F))
    small = im.resize((w, h), Image.BOX)
    rgb, alpha = small.convert('RGB'), small.split()[3]
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(rgb).enhance(1.45)).enhance(1.15)   # 8-bit sprites are punchy
    rgb = rgb.quantize(colors=14 if w < 60 else 28, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    small = rgb.convert('RGBA'); small.putalpha(alpha)
    px = small.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 110: px[x, y] = (0, 0, 0, 0)
            else:
                k = 255 / a if a < 255 else 1   # un-premultiply the edge
                px[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)), 255)
    return small

sprites = [(n, pixel(Image.open(os.path.join(SRC, n + '.png')).convert('RGBA'))) for n in ORDER]
W = sum(s.width + 3 for _, s in sprites) + 2; H = max(s.height for _, s in sprites) + 2
sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
x = 1; frames = {}
for n, s in sprites:
    sheet.paste(s, (x, 1)); frames[n] = [x - 1, 0, s.width + 2, s.height + 2]; x += s.width + 3
out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
sa, oa = sheet.load(), out.load()
for y in range(H):
    for x in range(W):
        if sa[x, y][3]: oa[x, y] = sa[x, y]
# outline: transparent pixels touching the sprite become a dark edge
edge = (16, 12, 30, 255)
for y in range(H):
    for x in range(W):
        if oa[x, y][3]: continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = x + dx, y + dy
            if 0 <= xx < W and 0 <= yy < H and sa[xx, yy][3]: oa[x, y] = edge; break
out.save(os.path.join(ROOT, 'assets', 'sonic', 'tornado_sprites.png'), optimize=True)
js = ("// Frame rects [x, y, w, h] in assets/sonic/tornado_sprites.png: Tails, the Tornado and the infected,\n"
      "// rendered from the 3D models by tools/tornado_sprites and reduced to 8-bit style.\n"
      "'use strict';\nconst TOR_FRAMES = " + json.dumps(frames) + ";\n")
open(os.path.join(ROOT, 'js', 'tailsframes.js'), 'w').write(js)
print(W, H, frames)
