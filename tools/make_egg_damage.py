#!/usr/bin/env python3
"""Paint progressive beating damage onto every Eggman frame.

Reads assets/sonic/eggman.png + js/eggframes.js and writes
assets/sonic/eggman_d1.png .. eggman_d4.png. The damage sheets are 2x the
size of the original sheet, so cracks, cuts and drips can be half a sprite
pixel wide. Every frame's face is found automatically (goggle lenses, skin,
nose), and the damage is painted around those points:

  d1  swollen cheek, cracked lens, nosebleed
  d2  black eye, both lenses cracked, split forehead, blood on the mustache
  d3  both eyes blackened, one lens shattered over a swollen-shut eye,
      blood running down the face, split lip, torn and stained coat
  d4  goggles smashed, face purple and covered in blood, scalp gashes,
      blood dripping off his chin, coat in tatters

It also writes js/eggface.js with each frame's face anchors, so the game
can spawn blood from exactly where his face is.
"""
import json, math, os, random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = 2   # output scale

SKIN = {(231, 162, 132), (231, 165, 132), (240, 176, 144), (240, 208, 192), (224, 144, 96),
        (165, 98, 66), (165, 99, 66)}
SKIN_LIGHT = {(231, 162, 132), (231, 165, 132), (240, 176, 144), (240, 208, 192)}
LENS = {(33, 32, 132), (66, 65, 165), (0, 0, 128), (0, 56, 192), (48, 160, 240)}
GOGGLE_DARK = (33, 33, 33)
NOSE = {(231, 0, 0), (224, 0, 0)}

BLOOD = (170, 8, 16)
BLOOD_WET = (215, 34, 40)
BLOOD_DARK = (92, 0, 6)
BRUISE = (128, 64, 132)
BRUISE_YEL = (176, 160, 70)
BLACKEYE = (44, 16, 52)
GLASS = (236, 244, 255)
SHATTER = (14, 14, 22)


def find_face(px, w, h):
    """Return (eyes, nose, skin, crown_top) for a frame, in native coords."""
    pts = {(x, y): px[x, y][:3] for y in range(h) for x in range(w) if px[x, y][3] > 0}
    skin = [p for p, c in pts.items() if c in SKIN]
    light = {p for p, c in pts.items() if c in SKIN_LIGHT}
    if not skin:
        return None
    eyes = [p for p, c in pts.items() if c in LENS]
    if not eyes:   # side-on frames: the goggles are dark pixels touching his skin
        for (x, y), c in pts.items():
            if c == GOGGLE_DARK and any((x + dx, y + dy) in light for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                eyes.append((x, y))
    # split the lens pixels into left/right goggles at the biggest x gap
    xs = sorted(set(p[0] for p in eyes))
    gaps = [(xs[i + 1] - xs[i], i) for i in range(len(xs) - 1)]
    groups = [eyes]
    if gaps:
        g, i = max(gaps)
        if g >= 2:
            groups = [[p for p in eyes if p[0] <= xs[i]], [p for p in eyes if p[0] > xs[i]]]
    centers = []
    for grp in groups:
        cx = sum(p[0] for p in grp) / len(grp) + 0.5
        cy = sum(p[1] for p in grp) / len(grp) + 0.5
        centers.append((cx, cy, grp))
    ecx = sum(c[0] for c in centers) / len(centers)
    ecy = max(c[1] for c in centers)
    reds = [p for p, c in pts.items() if c in NOSE and ecy - 1 <= p[1] <= ecy + 4 and abs(p[0] + 0.5 - ecx) <= 2.5]
    if reds:
        nose = min(reds, key=lambda p: (abs(p[0] + 0.5 - ecx) + abs(p[1] - ecy - 1.5)))
        nose = (nose[0] + 0.5, nose[1] + 1)
    else:
        nose = (ecx, ecy + 2)
    top = min(p[1] for p in skin)
    return centers, nose, skin, top, pts


class Canvas:
    """2x working copy of one frame with masked painting helpers."""

    def __init__(self, fr):
        self.im = fr.resize((fr.width * K, fr.height * K), Image.NEAREST)
        self.px = self.im.load()
        self.w, self.h = self.im.size
        self.orig = self.im.copy().load()

    def ok(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.orig[x, y][3] > 0

    def is_skin(self, x, y):
        return self.ok(x, y) and self.orig[x, y][:3] in SKIN

    def set(self, x, y, c, skin_only=False):
        x, y = int(x), int(y)
        if not self.ok(x, y) or (skin_only and not self.is_skin(x, y)):
            return
        self.px[x, y] = tuple(c[:3]) + (255,)

    def blend(self, x, y, c, k, skin_only=True):
        x, y = int(x), int(y)
        if not self.ok(x, y) or (skin_only and not self.is_skin(x, y)):
            return
        a = self.px[x, y]
        self.px[x, y] = tuple(int(a[i] + (c[i] - a[i]) * k) for i in range(3)) + (255,)

    def line(self, x0, y0, x1, y1, c, skin_only=False):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            self.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c, skin_only)

    def drip(self, x, y, length, rnd, wide=False):
        """A blood trickle running down from (x, y) (2x coords)."""
        for d in range(int(length)):
            if rnd.random() < 0.18:
                x += rnd.choice((-1, 1))
            c = BLOOD_WET if d < 2 else BLOOD
            self.set(x, y + d, c)
            if wide and d < length * 0.6:
                self.set(x + 1, y + d, BLOOD_DARK)
        self.set(x, y + length, BLOOD_DARK)
        self.set(x + 1, y + length, BLOOD_DARK)
        self.set(x, y + length + 1, BLOOD_DARK)


def damage_frame(fr, level, rnd):
    px = fr.load()
    face = find_face(px, fr.width, fr.height)
    cv = Canvas(fr)
    if not face:
        return cv.im, None
    eyes, nose, skin, top, pts = face
    side = len(eyes) == 1 or abs(eyes[0][0] - eyes[-1][0]) < 3.5   # side-on head
    S = lambda v: v * K
    ex = [S(e[0]) for e in eyes]
    ey = [S(e[1]) for e in eyes]
    nx, ny = S(nose[0]), S(nose[1])
    # the eye that takes the first beating: the one nearer his nose, so it's visible side-on
    hit = 0 if len(eyes) == 1 else min(range(len(eyes)), key=lambda i: abs(ex[i] - nx) if side else i)
    other = 1 - hit if len(eyes) > 1 else hit

    def ring(i, r, col, k):
        """Bruise around eye i; strongest next to the goggle, fading out."""
        cx, cy = ex[i], ey[i]
        for y in range(int(cy - r * 1.3), int(cy + r * 1.3) + 1):
            for x in range(int(cx - r * 1.3), int(cx + r * 1.3) + 1):
                d = math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 0.9) / r
                if d <= 1:
                    cv.blend(x, y, col, k * (1 - d * 0.45))

    def crack(i, n):
        """White crack lines across a lens."""
        lens = [(S(x) + a, S(y) + b) for x, y in eyes[i][2] for a in range(K) for b in range(K)]
        if not lens:
            return
        x0 = min(p[0] for p in lens); x1 = max(p[0] for p in lens)
        y0 = min(p[1] for p in lens); y1 = max(p[1] for p in lens)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        lset = set(lens)
        for j in range(n):
            ang = rnd.random() * math.pi * 2 if j else -0.9
            for t in range(-6, 7):
                x, y = int(cx + math.cos(ang) * t * 0.5), int(cy + math.sin(ang) * t * 0.5)
                if (x, y) in lset:
                    cv.set(x, y, GLASS)

    def shatter(i, smashed=False):
        """Lens knocked out: swollen, shut eye behind a broken frame."""
        cells = [(S(x) + a, S(y) + b) for x, y in eyes[i][2] for a in range(K) for b in range(K)]
        cy = sum(p[1] for p in cells) / len(cells)
        for x, y in cells:
            r = rnd.random()
            if smashed:
                cv.set(x, y, BLACKEYE if r < 0.6 else (90, 20, 70))
            else:
                cv.set(x, y, SHATTER if r < 0.55 else GLASS if r < 0.8 else BLACKEYE)
        # the swollen-shut eye slit, with blood
        xs = sorted(set(p[0] for p in cells))
        for x in xs:
            cv.set(x, int(cy), (20, 4, 10))
        if smashed:
            cv.set(xs[-1], int(cy) + 1, BLOOD_WET)
            cv.set(xs[0], int(cy) - 1, GLASS)   # a shard still stuck in the rim

    # ------------------------------------------------------------ face
    # swelling on the cheek under the first eye
    cheek_r = {1: 2.6, 2: 3.4, 3: 4.2, 4: 5.0}[level]
    ring(hit, S(cheek_r) * 0.55, (198, 92, 96), {1: 0.55, 2: 0.4, 3: 0.3, 4: 0.25}[level])
    if level >= 2:
        ring(hit, S(cheek_r) * 0.5, BLACKEYE, {2: 0.75, 3: 0.9, 4: 0.95}[level])
    if level >= 3:
        ring(other, S(cheek_r) * 0.45, BLACKEYE, 0.85)
        ring(hit, S(cheek_r) * 0.75, BRUISE, 0.55)
    if level >= 4:   # face beaten purple/yellow all over
        for x, y in skin:
            for a in range(K):
                for b in range(K):
                    r = rnd.random()
                    if r < 0.35:
                        cv.blend(S(x) + a, S(y) + b, BRUISE, 0.55)
                    elif r < 0.45:
                        cv.blend(S(x) + a, S(y) + b, BRUISE_YEL, 0.4)
    elif level >= 2:
        for x, y in skin:
            if rnd.random() < (0.12 if level == 2 else 0.22):
                cv.blend(S(x), S(y), BRUISE, 0.45)

    # goggles
    crack(hit, {1: 1, 2: 2, 3: 3, 4: 3}[level])
    if level >= 2 and len(eyes) > 1:
        crack(other, 1 if level == 2 else 3)
    if level >= 3:
        shatter(hit, smashed=level >= 4)
    if level >= 4 and len(eyes) > 1:
        crack(other, 5)

    # nosebleed: one nostril, then both, then a flood over the mustache
    nlen = {1: 6, 2: 9, 3: 13, 4: 18}[level]
    cv.drip(nx, ny, nlen, rnd, wide=level >= 3)
    if level >= 2:
        cv.drip(nx + (2 if not side else -1), ny, nlen - 3, rnd)
    if level >= 3:   # split lip / mouth blood smeared under the nose
        for d in range(-3, 4):
            if rnd.random() < 0.75:
                cv.set(nx + d, ny + 5 + rnd.randint(0, 2), BLOOD)
        cv.drip(nx - 3, ny + 6, nlen - 4, rnd, wide=True)
    if level >= 4:
        for d in range(-5, 6):
            for e in range(3, 9):
                if rnd.random() < 0.45:
                    cv.set(nx + d, ny + e, BLOOD if rnd.random() < 0.7 else BLOOD_DARK)
        cv.drip(nx + 4, ny + 7, 12, rnd, wide=True)

    # split forehead / scalp, blood running down into the goggles
    if level >= 2:
        crown = sorted([p for p in skin if p[1] <= top + 2], key=lambda p: p[0])
        cuts = {2: 1, 3: 2, 4: 3}[level]
        for c in range(cuts):
            x, y = crown[(c * 7 + len(crown) // 2) % len(crown)] if c else crown[len(crown) // 2]
            gx, gy = S(x) + rnd.randint(0, 1), S(y) + 1 + rnd.randint(0, 1)
            cv.line(gx - 2, gy, gx + 2, gy + 1, BLOOD_DARK, skin_only=True)
            cv.line(gx - 1, gy - 1, gx + 1, gy, BLOOD_WET, skin_only=True)
            cv.drip(gx, gy + 1, {2: 7, 3: 10, 4: 14}[level] + rnd.randint(0, 4), rnd, wide=level >= 3)

    # ------------------------------------------------------------ coat
    if level >= 3:
        coat = [p for p, c in pts.items() if c[1] == 0 and c[2] < 20 and c[0] >= 100]
        n = {3: 4, 4: 9}[level]
        for _ in range(n):   # rips: a dark ragged gash with a frayed light edge
            x, y = rnd.choice(coat)
            gx, gy = S(x), S(y)
            L = rnd.randint(4, 7)
            ang = rnd.uniform(-1.2, 1.2) + math.pi / 2
            for t in range(L):
                px_ = gx + math.cos(ang) * t
                py_ = gy + math.sin(ang) * t
                cv.set(px_, py_, (26, 0, 4))
                cv.set(px_ + 1, py_, (26, 0, 4))
                cv.set(px_ - 1, py_ - 1, (255, 130, 120))   # frayed edge catching the light
        for _ in range({3: 5, 4: 12}[level]):   # blood soaked into the coat
            x, y = rnd.choice(coat)
            gx, gy = S(x), S(y)
            for a in range(-2, 2):
                for b in range(-1, 4):
                    if abs(a + 0.5) + abs(b - 1) < 3 and rnd.random() < 0.8:
                        cv.set(gx + a, gy + b, BLOOD_DARK)
            cv.set(gx, gy, (150, 10, 18))

    anchor = {
        'eye': [round(eyes[hit][0], 1), round(eyes[hit][1], 1)],
        'nose': [round(nose[0], 1), round(nose[1], 1)],
        'top': top,
    }
    return cv.im, anchor


def main():
    sheet = Image.open(os.path.join(ROOT, 'assets/sonic/eggman.png')).convert('RGBA')
    src = open(os.path.join(ROOT, 'js/eggframes.js')).read()
    frames = json.loads(src.split('EGG_FRAMES = ')[1].split(';')[0])
    anchors = []
    for level in range(1, 5):
        out = Image.new('RGBA', (sheet.width * K, sheet.height * K), (0, 0, 0, 0))
        for i, (x, y, w, h) in enumerate(frames):
            fr = sheet.crop((x, y, x + w, y + h))
            im, anchor = damage_frame(fr, level, random.Random(i * 31 + level * 7))
            out.paste(im, (x * K, y * K))
            if level == 1:
                anchors.append(anchor)
        path = os.path.join(ROOT, f'assets/sonic/eggman_d{level}.png')
        out.save(path, optimize=True)
        print('wrote', path)
    with open(os.path.join(ROOT, 'js/eggface.js'), 'w') as f:
        f.write('// Face anchors per Eggman frame, in frame pixels (generated by tools/make_egg_damage.py).\n')
        f.write("'use strict';\n")
        f.write('const EGG_FACE = ' + json.dumps(anchors) + ';\n')
        f.write(f'const EGG_DMG_SCALE = {K};\n')
    print('wrote js/eggface.js')


if __name__ == '__main__':
    main()
