"""PBR materials for the suit, with tiling textures generated here (numpy),
so no texture is downloaded or bought. Colours follow refs 1-3."""
import os

import bpy
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "build", "textures")

# metres covered by one texture tile, per material
TILE_M = {"leather_jacket": 0.14, "trousers": 0.12, "undersuit": 0.10, "boot": 0.18, "glove": 0.12,
          "belt": 0.18, "helmet": 0.30}

rng = np.random.default_rng(7)


def _noise(n, scale, octaves=4, seed=0):
    """Tileable value noise (sum of octaves), 0..1."""
    r = np.random.default_rng(seed)
    out = np.zeros((n, n))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        g = max(2, int(scale * 2 ** o))
        grid = r.random((g, g))
        xs = np.linspace(0, g, n, endpoint=False)
        i0 = np.floor(xs).astype(int)
        f = xs - i0
        f = f * f * (3 - 2 * f)
        i1 = (i0 + 1) % g
        a = grid[np.ix_(i0, i0)] * (1 - f)[None, :] + grid[np.ix_(i0, i1)] * f[None, :]
        b = grid[np.ix_(i1, i0)] * (1 - f)[None, :] + grid[np.ix_(i1, i1)] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        tot += amp
        amp *= 0.5
    return out / tot


def _cells(n, count, seed=0):
    """Tileable Worley-ish cell pattern (distance to nearest point), 0..1."""
    r = np.random.default_rng(seed)
    pts = r.random((count, 2)) * n
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    d = np.full((n, n), 1e9)
    for p in pts:
        dx = np.abs(xx - p[0])
        dx = np.minimum(dx, n - dx)
        dy = np.abs(yy - p[1])
        dy = np.minimum(dy, n - dy)
        d = np.minimum(d, dx * dx + dy * dy)
    d = np.sqrt(d)
    return d / d.max()


def _normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    n = np.stack([-gx, gy, nz], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def _save(name, arr):
    os.makedirs(TEX, exist_ok=True)
    p = os.path.join(TEX, name + ".png")
    Image.fromarray(arr).save(p)
    return p


def make_textures():
    n = 512
    t = {}
    # leather: pebbled grain + soft creases
    cells = _cells(n, 900, seed=1)
    crease = _noise(n, 3, 3, seed=2)
    h = 0.6 * (1 - cells) ** 2 + 0.4 * np.abs(crease - 0.5) * 2
    t["leather_n"] = _save("leather_n", _normal_from_height(h, 1.0))
    mott = _noise(n, 4, 4, seed=3)
    t["leather_mott"] = mott
    # twill fabric for the trousers: diagonal ribs
    yy, xx = np.mgrid[0:n, 0:n]
    rib = 0.5 + 0.5 * np.sin((xx + yy) * 2 * np.pi / 8.0)
    weave = 0.5 + 0.5 * np.sin(xx * 2 * np.pi / 4.0) * np.sin(yy * 2 * np.pi / 4.0)
    h = 0.7 * rib + 0.2 * weave + 0.25 * _noise(n, 6, 3, seed=4)
    t["twill_n"] = _save("twill_n", _normal_from_height(h, 1.2))
    # knit/ripstop for the grey under-layer
    grid = ((xx % 32 < 2) | (yy % 32 < 2)).astype(float)
    knit = 0.5 + 0.5 * np.sin(xx * 2 * np.pi / 3.0) * np.cos(yy * 2 * np.pi / 6.0)
    h = 0.5 * knit + 0.6 * grid + 0.2 * _noise(n, 8, 2, seed=5)
    t["knit_n"] = _save("knit_n", _normal_from_height(h, 1.0))
    # brushed metal / micro scratches
    scr = _noise(n, 64, 2, seed=6)
    h = np.repeat(_noise(n, 128, 1, seed=7)[:1, :], n, axis=0) * 0.6 + scr * 0.4
    t["brushed_n"] = _save("brushed_n", _normal_from_height(h, 0.6))
    # tread for soles
    tread = ((xx // 32 + yy // 32) % 2).astype(float)
    t["tread_n"] = _save("tread_n", _normal_from_height(tread * 0.8 + 0.2 * _noise(n, 8, 2, seed=8), 3.0))
    # paint: almost flat with faint orange peel
    h = _noise(n, 24, 3, seed=9)
    t["paint_n"] = _save("paint_n", _normal_from_height(h, 0.35))
    return t


def _color_tex(name, base, mott, amount):
    rgb = np.array(base[:3])[None, None, :] * (1 + amount * (mott[..., None] - 0.5))
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, 1), 1 / 2.4) - 0.055)
    return _save(name, (np.clip(srgb, 0, 1) * 255).astype(np.uint8))


def material(name, base, rough, metal=0.0, normal=None, nstrength=1.0, coat=0.0, coat_rough=0.05,
             emission=None, color_tex=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    if normal:
        img = bpy.data.images.load(normal, check_existing=True)
        img.colorspace_settings.name = "Non-Color"
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nstrength
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if color_tex:
        img = bpy.data.images.load(color_tex, check_existing=True)
        tc = nt.nodes.new("ShaderNodeTexImage")
        tc.image = img
        nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def make_all():
    t = make_textures()
    mott = t["leather_mott"]
    M = {}
    M["helmet"] = material("helmet", (0.40, 0.022, 0.02), 0.32, normal=t["paint_n"], nstrength=0.4,
                           coat=1.0, coat_rough=0.06)
    M["lens"] = material("lens", (0.92, 0.94, 0.96), 0.12, emission=((0.85, 0.9, 1.0), 0.6))
    M["lens_rim"] = material("lens_rim", (0.012, 0.012, 0.014), 0.35)
    M["undersuit"] = material("undersuit", (0.15, 0.155, 0.165), 0.78, normal=t["knit_n"], nstrength=0.6)
    M["plate"] = material("plate", (0.055, 0.057, 0.062), 0.42, metal=0.15, normal=t["brushed_n"], nstrength=0.3)
    M["zip"] = material("zip", (0.08, 0.08, 0.085), 0.3, metal=0.8)
    M["leather_jacket"] = material("leather_jacket", (0.040, 0.042, 0.048), 0.6, normal=t["leather_n"],
                                   nstrength=0.45,
                                   color_tex=_color_tex("jacket_c", (0.040, 0.042, 0.048), mott, 0.5))
    M["trousers"] = material("trousers", (0.022, 0.022, 0.025), 0.86, normal=t["twill_n"], nstrength=0.5)
    M["belt"] = material("belt", (0.018, 0.018, 0.02), 0.45, normal=t["leather_n"], nstrength=0.5)
    M["boot"] = material("boot", (0.02, 0.02, 0.022), 0.4, normal=t["leather_n"], nstrength=0.5)
    M["glove"] = material("glove", (0.018, 0.018, 0.02), 0.45, normal=t["leather_n"], nstrength=0.6)
    M["sole"] = material("sole", (0.2, 0.205, 0.21), 0.8, normal=t["tread_n"], nstrength=0.6)
    M["metal"] = material("metal", (0.38, 0.39, 0.41), 0.38, metal=1.0, normal=t["brushed_n"], nstrength=0.3)
    M["metal_dark"] = material("metal_dark", (0.2, 0.2, 0.21), 0.35, metal=1.0)
    M["metal_cuff"] = material("metal_cuff", (0.26, 0.27, 0.285), 0.42, metal=0.8, normal=t["brushed_n"], nstrength=0.3)
    M["holster"] = material("holster", (0.016, 0.016, 0.018), 0.55, normal=t["leather_n"], nstrength=0.4)
    M["gun"] = material("gun", (0.03, 0.03, 0.032), 0.55, metal=0.3)
    return M
