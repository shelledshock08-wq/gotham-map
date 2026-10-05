"""Jason's main suit (Under the Red Hood design, refs 1-3), built from the
posed MakeHuman body: every garment is an offset/smoothed copy of the body
surface, so it follows his anatomy and keeps the body's skin weights.

No red bat emblem anywhere (brief, section 14).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from scipy.sparse import coo_matrix
from scipy.spatial import ConvexHull

import materials

NB = 13380


class Body:
    def __init__(self, ob, joints, mh):
        me = ob.data
        self.ob = ob
        n = len(me.vertices)
        self.v = np.zeros(n * 3)
        me.vertices.foreach_get("co", self.v)
        self.v = self.v.reshape(-1, 3)
        self.n = np.zeros(n * 3)
        me.vertex_normals.foreach_get("vector", self.n)
        self.n = self.n.reshape(-1, 3)
        self.faces = [tuple(p.vertices) for p in me.polygons]
        self.face_loops = [tuple(p.loop_indices) for p in me.polygons]
        uv = np.zeros(len(me.loops) * 2)
        me.uv_layers[0].data.foreach_get("uv", uv)
        self.loop_uv = uv.reshape(-1, 2)
        self.groups = [g.name for g in ob.vertex_groups]
        self.W = np.zeros((n, len(self.groups)))
        for v in me.vertices:
            for g in v.groups:
                self.W[v.index, g.group] = g.weight
        self.j = joints
        self.bvh = BVHTree.FromPolygons(self.v.tolist(), self.faces)
        self.kd = KDTree(n)
        for i, p in enumerate(self.v):
            self.kd.insert(p, i)
        self.kd.balance()
        self.eye = mh["eyes"]

    def w(self, *names):
        out = np.zeros(len(self.v))
        for nm in names:
            for i, g in enumerate(self.groups):
                if g == nm or (nm.endswith("*") and g.startswith(nm[:-1])):
                    out += self.W[:, i]
        return out


# ---------------------------------------------------------------- mesh utils

def adjacency(nv, faces):
    rows, cols = [], []
    for f in faces:
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            rows += [a, b]
            cols += [b, a]
    m = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nv, nv)).tocsr()
    m.data[:] = 1.0
    return m


def boundary_verts(nv, faces):
    count = {}
    for f in faces:
        k = len(f)
        for i in range(k):
            e = tuple(sorted((f[i], f[(i + 1) % k])))
            count[e] = count.get(e, 0) + 1
    out = np.zeros(nv, bool)
    edges = [e for e, c in count.items() if c == 1]
    for a, b in edges:
        out[a] = out[b] = True
    return out, edges


def taubin(v, adj, iters, lam=0.5, mu=-0.53, fixed=None, weight=None):
    deg = np.asarray(adj.sum(axis=1)).ravel()
    deg[deg == 0] = 1
    v = v.copy()
    for _ in range(iters):
        for f in (lam, mu):
            avg = adj @ v / deg[:, None]
            d = (avg - v) * f
            if weight is not None:
                d *= weight[:, None]
            if fixed is not None:
                d[fixed] = 0
            v += d
    return v


def smooth_boundary(v, faces, iters=12, f=0.5):
    """1D smoothing along open edges: turns stair-stepped face cuts into clean lines."""
    _, edges = boundary_verts(len(v), faces)
    nb = {}
    for a, b in edges:
        nb.setdefault(a, []).append(b)
        nb.setdefault(b, []).append(a)
    idx = np.array([k for k, n in nb.items() if len(n) == 2])
    if not len(idx):
        return v
    n0 = np.array([nb[k][0] for k in idx])
    n1 = np.array([nb[k][1] for k in idx])
    v = v.copy()
    for _ in range(iters):
        v[idx] += f * ((v[n0] + v[n1]) / 2 - v[idx])
    return v


def vertex_normals(v, faces):
    n = np.zeros_like(v)
    for f in faces:
        p = v[list(f)]
        fn = np.cross(p[1] - p[0], p[2] - p[0])
        if len(f) == 4:
            fn += np.cross(p[2] - p[0], p[3] - p[0])
        for i in f:
            n[i] += fn
    ln = np.linalg.norm(n, axis=1)
    ln[ln == 0] = 1
    return n / ln[:, None]


def push_out(v, body, clear, mask=None):
    """Keeps every vertex at least `clear` metres outside the body surface."""
    clear = np.broadcast_to(np.asarray(clear, float), (len(v),))
    out = v.copy()
    for i, p in enumerate(v):
        if mask is not None and not mask[i]:
            continue
        loc, nrm, _, dist = body.bvh.find_nearest(Vector(p))
        if loc is None:
            continue
        d = Vector(p) - loc
        signed = d.dot(nrm)
        if signed < clear[i]:
            out[i] = np.array(loc + nrm * clear[i])
    return out


def new_object(name, verts, faces, mat, loop_uv=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(x) for x in verts], [], [tuple(f) for f in faces])
    me.validate()
    if loop_uv is not None:
        uv = me.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", np.asarray(loop_uv).ravel())
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat is not None:
        ob.data.materials.append(mat)
    return ob


def set_weights_from_body(ob, body, src_index=None, rigid=None):
    """Copies skin weights: 1:1 from body verts when the piece was made from
    them, nearest body vertex otherwise, or a single bone when rigid."""
    me = ob.data
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    if rigid:
        g = ob.vertex_groups.new(name=rigid)
        g.add(list(range(len(me.vertices))), 1.0, "REPLACE")
        return
    groups = {nm: ob.vertex_groups.new(name=nm) for nm in body.groups}
    for v in me.vertices:
        if src_index is not None and v.index < len(src_index):
            bi = src_index[v.index]
        else:
            _, bi, _ = body.kd.find(v.co)
        row = body.W[bi]
        for gi in np.nonzero(row > 1e-4)[0]:
            groups[body.groups[gi]].add([v.index], float(row[gi]), "REPLACE")


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def solidify(ob, thickness, offset=-1.0, rim=True):
    m = ob.modifiers.new("Solidify", "SOLIDIFY")
    m.thickness = thickness
    m.offset = offset
    m.use_rim = rim
    m.use_even_offset = False
    m.use_quality_normals = False
    apply_mods(ob)


def subdivide(ob, levels=1):
    m = ob.modifiers.new("Subsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    apply_mods(ob)


def bevel(ob, width, segments=2):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    apply_mods(ob)


def smart_uv(ob, island_margin=0.02):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob)
    if not ob.data.uv_layers:
        ob.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=island_margin,
                             scale_to_bounds=False, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def scale_uv(ob, metres_per_tile):
    """Smart UV packs into 0..1; rescale so one texture tile = metres_per_tile."""
    me = ob.data
    area3 = sum(p.area for p in me.polygons)
    uv = np.zeros(len(me.loops) * 2)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    area_uv = 0.0
    for p in me.polygons:
        pts = uv[list(p.loop_indices)]
        x, y = pts[:, 0], pts[:, 1]
        area_uv += 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    if area_uv <= 0:
        return
    s = math.sqrt(area3 / area_uv) / metres_per_tile
    me.uv_layers[0].data.foreach_set("uv", (uv * s).ravel())


# ------------------------------------------------------------ shell builder

def shell(name, body, vmask, offset, mat, smooth=10, clear=None, face_ok=None,
          smooth_weight=None, keep_uv=False, edge_smooth=14):
    """Offset copy of the body faces whose verts are all in vmask."""
    faces = []
    for fi, f in enumerate(body.faces):
        if all(vmask[i] for i in f):
            if face_ok is None or face_ok(body.v[list(f)].mean(axis=0)):
                faces.append(fi)
    used = sorted({i for fi in faces for i in body.faces[fi]})
    remap = {b: i for i, b in enumerate(used)}
    src = np.array(used)
    off = np.broadcast_to(np.asarray(offset, float), (len(body.v),))[src]
    v = body.v[src] + body.n[src] * off[:, None]
    nf = [tuple(remap[i] for i in body.faces[fi]) for fi in faces]
    if smooth:
        adj = adjacency(len(v), nf)
        bnd, _ = boundary_verts(len(v), nf)
        sw = None if smooth_weight is None else np.asarray(smooth_weight)[src]
        v = taubin(v, adj, smooth, weight=sw)
        del bnd
    if edge_smooth:
        v = smooth_boundary(v, nf, edge_smooth)
    if clear is not None:
        cl = np.broadcast_to(np.asarray(clear, float), (len(body.v),))[src]
        v = push_out(v, body, cl)
    loop_uv = None
    if keep_uv:
        loop_uv = np.concatenate([body.loop_uv[list(body.face_loops[fi])] for fi in faces])
    ob = new_object(name, v, nf, mat, loop_uv)
    ob["src_index"] = src.tolist()
    return ob, src


def ring_band(name, targets, a, b, bands, offset, mat, n=48, start=0.3, ref=None, rows=3, straight=True):
    """Bands hugging the outermost of `targets` (BVHTrees) around the axis
    a->b. bands = [(t0, t1), ...] fractions along the axis; each band gets
    `rows` rings. offset is added along the radial direction."""
    if not isinstance(targets, (list, tuple)):
        targets = [targets]
    a, b = np.asarray(a, float), np.asarray(b, float)
    ax = (b - a) / np.linalg.norm(b - a)
    r = np.asarray(ref if ref is not None else [0, -1, 0], float)
    u = r - np.dot(r, ax) * ax
    u /= np.linalg.norm(u)
    w = np.cross(ax, u)
    angles = np.linspace(0, 2 * math.pi, n, endpoint=False)
    verts, faces = [], []
    for t0, t1 in bands:
        base = len(verts)
        ts = np.linspace(t0, t1, rows)
        grid = np.full((rows, n), np.nan)
        dirs = [math.cos(th) * u + math.sin(th) * w for th in angles]
        for i, t in enumerate(ts):
            c = a + (b - a) * t
            for k, d in enumerate(dirs):
                best = None
                for tg in targets:
                    hit, _, _, dist = tg.ray_cast(Vector(c + d * start), Vector(-d), start)
                    if hit is not None and (best is None or dist < best):
                        best = dist
                if best is not None:
                    grid[i, k] = start - best
        # fill misses from neighbours, then soften
        for i in range(rows):
            row = grid[i]
            if np.all(np.isnan(row)):
                grid[i] = np.nanmedian(grid)
                continue
            idx = np.arange(n)
            ok = ~np.isnan(row)
            grid[i] = np.interp(idx, idx[ok], row[ok], period=n)
        if straight:
            grid[:] = grid.max(axis=0)  # straight-sided band at the widest point
        sm = grid.copy()
        for _ in range(2):
            sm = (np.roll(sm, 1, 1) + 2 * sm + np.roll(sm, -1, 1)) / 4
        for i, t in enumerate(ts):
            c = a + (b - a) * t
            for k, d in enumerate(dirs):
                verts.append(c + d * (sm[i, k] + offset))
        for i in range(rows - 1):
            for k in range(n):
                k2 = (k + 1) % n
                faces.append((base + i * n + k, base + i * n + k2, base + (i + 1) * n + k2, base + (i + 1) * n + k))
    return new_object(name, verts, faces, mat)


def neck_band(name, B, J, mat, z0, z1, off0, off1, arc=None, rows=8, n=64, flare=0.0):
    """Band around the neck axis between heights z0..z1 (radial offset grows
    off0 -> off1). arc=(a0, a1) degrees from the front, for an open collar."""
    c0 = np.array([0.0, J["neck_01"][1] + 0.01, 0])
    a0, a1 = (0, 360) if arc is None else arc
    closed = arc is None
    angles = np.radians(np.linspace(a0, a1, n, endpoint=not closed))
    verts, faces = [], []
    for i, zz in enumerate(np.linspace(z0, z1, rows)):
        t = i / (rows - 1)
        for th in angles:
            d = np.array([math.sin(th), -math.cos(th), 0.0])
            o = c0 + np.array([0, 0, zz])
            hit, _, _, dist = B.bvh.ray_cast(Vector(o + d * 0.25), Vector(-d), 0.25)
            r = (0.25 - dist) if hit is not None else 0.06
            r = max(r, 0.045)
            verts.append(o + d * (r + off0 + (off1 - off0) * t + flare * t * t))
    m = len(angles)
    for i in range(rows - 1):
        for k in range(m if closed else m - 1):
            k2 = (k + 1) % m
            faces.append((i * m + k, i * m + k2, (i + 1) * m + k2, (i + 1) * m + k))
    ob = new_object(name, verts, faces, mat)
    # smooth the rings so the band reads as fabric, not as the neck's bumps
    v = np.array([p.co for p in ob.data.vertices])
    adj = adjacency(len(v), faces)
    v = taubin(v, adj, 8)
    for p, co in zip(ob.data.vertices, v):
        p.co = Vector(co)
    return ob


def bvh_of(ob):
    me = ob.data
    mw = ob.matrix_world
    return BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def rounded_box(name, center, size, mat, axes=None, bevel_w=0.004):
    """Box with bevelled edges; axes = 3x3 columns (x, y, z) orientation."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    A = np.eye(3) if axes is None else np.asarray(axes)
    for v in me.vertices:
        v.co = Vector(A @ np.array(v.co) + np.asarray(center))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if bevel_w:
        m = ob.modifiers.new("Bevel", "BEVEL")
        m.width = bevel_w
        m.segments = 3
        apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def projected_patch(name, target, center, poly, mat, lift, rings=4, samples=40, scale_out=1.0):
    """2D polygon (x, z offsets from center, character front view) projected
    onto `target` along +Y (from the front). Returns a gridded patch."""
    poly = np.asarray(poly, float) * scale_out
    c2 = poly.mean(axis=0)
    # resample outline evenly
    seg = np.vstack([poly, poly[:1]])
    lens = np.linalg.norm(np.diff(seg, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(lens)])
    tt = np.linspace(0, cum[-1], samples, endpoint=False)
    outline = np.stack([np.interp(tt, cum, seg[:, 0]), np.interp(tt, cum, seg[:, 1])], axis=1)
    pts2 = [c2]
    for r in range(1, rings + 1):
        f = r / rings
        pts2.extend(c2 + (outline - c2) * f)
    verts = []
    for p in pts2:
        o = Vector((center[0] + p[0], center[1] - 0.4, center[2] + p[1]))
        hit, nrm, _, _ = target.ray_cast(o, Vector((0, 1, 0)), 1.0)
        if hit is None:
            hit, nrm = Vector((o.x, center[1], o.z)), Vector((0, -1, 0))
        verts.append(np.array(hit + nrm * lift))
    faces = []
    for k in range(samples):
        faces.append((0, 1 + k, 1 + (k + 1) % samples))
    for r in range(1, rings):
        b0 = 1 + (r - 1) * samples
        b1 = 1 + r * samples
        for k in range(samples):
            k2 = (k + 1) % samples
            faces.append((b0 + k, b1 + k, b1 + k2, b0 + k2))
    return new_object(name, verts, faces, mat)


def radial_helmet(B, J, mat, offset=0.019, nth=96, nph=72):
    """Rays from inside the skull find the head surface in every direction;
    an opening (removes ears, nose tip) + closing (fills eye sockets, mouth)
    + blur gives one smooth helmet form. Bottom edge follows the jaw/neck."""
    from scipy import ndimage
    c = np.array([0.0, J["head"][1] - 0.012, J["head"][2] + 0.042])
    th = np.linspace(0, 2 * math.pi, nth, endpoint=False)
    ph = np.linspace(0.02, math.radians(150), 220)
    D = np.zeros((len(ph), nth, 3))
    R = np.full((len(ph), nth), np.nan)
    for i, p in enumerate(ph):
        for k, t in enumerate(th):
            d = np.array([math.sin(p) * math.sin(t), -math.sin(p) * math.cos(t), math.cos(p)])
            D[i, k] = d
            hit, _, _, dist = B.bvh.ray_cast(Vector(c), Vector(d), 0.4)
            if hit is not None:
                R[i, k] = dist
    for i in range(len(ph)):
        ok = ~np.isnan(R[i])
        if ok.any():
            idx = np.arange(nth)
            R[i] = np.interp(idx, idx[ok], R[i][ok], period=nth)
    R = np.nan_to_num(R, nan=np.nanmedian(R))
    R = ndimage.grey_opening(R, size=(9, 5), mode=("nearest", "wrap"))  # drops ears, nose tip
    # convex hull of the head form: fills eye sockets and mouth with one
    # smooth face plate, like the movie helmet
    pts = (c[None, None, :] + D * R[..., None]).reshape(-1, 3)
    pts = pts[pts[:, 2] > 1.55]
    hull = ConvexHull(pts)
    hb = BVHTree.FromPolygons(pts.tolist(), [tuple(f) for f in hull.simplices])
    R2 = np.zeros_like(R)
    for i in range(len(ph)):
        for k in range(nth):
            hit, _, _, dist = hb.ray_cast(Vector(c), Vector(D[i, k]), 0.5)
            R2[i, k] = dist if hit is not None else R[i, k]
    R = ndimage.gaussian_filter(R2, sigma=(5, 2.5), mode=("nearest", "wrap"))
    P = c[None, None, :] + D * (R + offset)[..., None]
    low = np.clip((c[2] + 0.01 - P[..., 2]) / 0.1, 0, 1)
    P[..., 0] *= 1 + 0.07 * low
    # bottom edge: under the chin at the front, base of the skull at the back
    cut = 1.618 + 0.022 * (0.5 - 0.5 * np.cos(th))
    rows = 46
    grid = np.zeros((rows, nth, 3))
    for k in range(nth):
        zc = P[:, k, 2]
        below = np.nonzero(zc < cut[k])[0]
        last = below[0] if len(below) else len(ph) - 1
        s_ = np.linspace(0, last, rows)
        for j in range(3):
            grid[:, k, j] = np.interp(s_, np.arange(len(ph)), P[:, k, j])
    # smooth the bottom edge line a little
    for j in range(rows - 6, rows):
        grid[j, :, 2] = (np.roll(grid[j, :, 2], 1) + 2 * grid[j, :, 2] + np.roll(grid[j, :, 2], -1)) / 4
    verts = [grid[0].mean(axis=0) + np.array([0, 0, 0.0005])]
    for j in range(rows):
        for k in range(nth):
            verts.append(grid[j, k])
    faces = [(0, 1 + (k + 1) % nth, 1 + k) for k in range(nth)]
    for j in range(rows - 1):
        for k in range(nth):
            k2 = (k + 1) % nth
            a0, a1 = 1 + j * nth + k, 1 + j * nth + k2
            b0, b1 = 1 + (j + 1) * nth + k, 1 + (j + 1) * nth + k2
            faces.append((a0, a1, b1, b0))
    ob = new_object("Helmet", verts, faces, mat)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# ------------------------------------------------------------------- suit

def build(body_ob, arm, mh, posed_v, joints):
    M = materials.make_all()
    B = Body(body_ob, joints, mh)
    J = {k: np.asarray(v) for k, v in joints.items()}
    v = B.v
    z = v[:, 2]
    ax = np.abs(v[:, 0])
    pieces = []

    w_head = B.w("head")
    w_neck = B.w("neck_01")
    w_torso = B.w("spine_01", "spine_02", "spine_03", "pelvis", "clavicle_l", "clavicle_r")
    w_arm = B.w("upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r")
    w_hand = B.w("hand_l", "hand_r", "thumb*", "index*", "middle*", "ring*", "pinky*")
    w_leg = B.w("thigh_l", "thigh_r", "calf_l", "calf_r")
    w_foot = B.w("foot_l", "foot_r", "ball_l", "ball_r")

    chin_z = 1.625
    belt_z = 1.035
    hem_z = 1.046
    wrist_x = abs(J["hand_l"][0]) - 0.01

    # ---------------- helmet: smooth enclosed shell, rigid to the head bone
    helmet = radial_helmet(B, J, M["helmet"])
    solidify(helmet, 0.004, offset=-1)
    set_weights_from_body(helmet, B, rigid="head")
    pieces.append(helmet)
    hbvh = bvh_of(helmet)

    # eye lenses: angled almond (inner corner low and pointed), dark surround
    lens_l = [(-0.019, -0.0075), (-0.008, 0.002), (0.006, 0.0085), (0.018, 0.0105), (0.027, 0.0085),
              (0.031, 0.002), (0.024, -0.004), (0.010, -0.0075), (-0.004, -0.0095)]
    for side, sx in (("l", 1), ("r", -1)):
        e = B.eye[side]
        poly = [(sx * x, zz) for x, zz in lens_l]
        if sx < 0:
            poly = poly[::-1]
        c = np.array([e[0], e[1], e[2] + 0.002])
        sur = projected_patch(f"Lens_Surround_{side}", hbvh, c, poly, M["lens_rim"], 0.0012, scale_out=1.32)
        lens = projected_patch(f"Lens_{side}", hbvh, c, poly, M["lens"], 0.0024)
        for ob in (sur, lens):
            solidify(ob, 0.0012, offset=-1)
            set_weights_from_body(ob, B, rigid="head")
            pieces.append(ob)

    # ---------------- grey zipped under-layer (torso + high neck)
    um = ((w_torso + w_neck) > 0.5) & (z > 0.97) & (z < 1.53) & (ax < 0.215)
    under, usrc = shell("Undersuit", B, um, 0.004, M["undersuit"], smooth=6, clear=0.003)
    solidify(under, 0.002)
    set_weights_from_body(under, B)
    pieces.append(under)

    gaiter = neck_band("Undersuit_Neck", B, J, M["undersuit"], 1.47, 1.655, 0.009, 0.004, rows=12)
    solidify(gaiter, 0.002)
    set_weights_from_body(gaiter, B)
    pieces.append(gaiter)

    # chest/ab armour plates on the under-layer (darker grey), from the body's own forms
    def plate(name, x0, x1, z0, z1, off=0.009, slant=0.0):
        """Armour plate on the under-layer; `slant` lifts the outer edge of
        the lower border so the pecs read as angular plates (ref 1)."""
        def ok(p):
            zl = z0 + slant * (abs(p[0]) - min(abs(x0), abs(x1))) / abs(x1 - x0)
            return zl < p[2] < z1
        pm = (v[:, 1] < -0.03) & (v[:, 0] > x0) & (v[:, 0] < x1) & (z > z0 - 0.01) & (z < z1)
        ob, _ = shell(name, B, pm, off, M["plate"], smooth=6, clear=off - 0.002, face_ok=ok, edge_smooth=3)
        solidify(ob, 0.004)
        subdivide(ob, 1)
        set_weights_from_body(ob, B)
        return ob

    for sx in (1, -1):
        sd = "l" if sx > 0 else "r"
        lo, hi = (0.008, 0.165) if sx > 0 else (-0.165, -0.008)
        pieces.append(plate(f"Plate_Pec_{sd}", lo, hi, 1.325, 1.48, slant=0.05))
        for k, (z0, z1) in enumerate(((1.245, 1.31), (1.17, 1.235), (1.095, 1.16))):
            lo2, hi2 = (0.008, 0.095) if sx > 0 else (-0.095, -0.008)
            pieces.append(plate(f"Plate_Ab{k}_{sd}", lo2, hi2, z0, z1, off=0.008))

    # zip: a narrow metal strip down the centre front of the under-layer
    ubvh = bvh_of(under)
    zip_pts = []
    gbvh = bvh_of(gaiter)
    for zz in np.linspace(1.0, 1.64, 70):
        hits = [t.ray_cast(Vector((0, -0.5, zz)), Vector((0, 1, 0)), 1.0) for t in (ubvh, gbvh)]
        hits = [h for h in hits if h[0] is not None]
        hit, nrm = (min(hits, key=lambda h: h[3])[:2]) if hits else (None, None)
        if hit is not None:
            zip_pts.append((np.array(hit), np.array(nrm)))
    zv, zf = [], []
    for i, (p, nrm) in enumerate(zip_pts):
        for dx in (-0.0035, 0.0035):
            zv.append(p + np.array([dx, 0, 0]) + nrm * 0.0015)
        if i:
            zf.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    zipper = new_object("Zip", zv, zf, M["zip"])
    solidify(zipper, 0.0015)
    set_weights_from_body(zipper, B)
    pieces.append(zipper)

    # ---------------- jacket: short, open front, raised collar
    def opening(p):
        if p[1] > -0.02:
            return True
        half = 0.068 + 0.03 * np.clip((p[2] - 1.38) / 0.2, 0, 1)
        return abs(p[0]) > half

    jm = (((w_torso + w_neck + w_arm) > 0.45) & (z > hem_z) & (z < 1.585) & (ax < wrist_x - 0.012)
          & (w_hand < 0.3))
    j_off = np.where(ax > 0.2, 0.017 - 0.006 * np.clip((ax - 0.55) / 0.2, 0, 1), 0.024)
    jacket, jsrc = shell("Jacket", B, jm, j_off, M["leather_jacket"], smooth=30,
                         clear=np.where(ax > 0.2, 0.012, 0.017), face_ok=opening)
    solidify(jacket, 0.0035)
    set_weights_from_body(jacket, B)
    pieces.append(jacket)
    collar = neck_band("Jacket_Collar", B, J, M["leather_jacket"], 1.535, 1.66, 0.03, 0.036, arc=(34, 326),
                       rows=9, n=56, flare=0.012)
    solidify(collar, 0.004)
    set_weights_from_body(collar, B)
    pieces.append(collar)

    # ---------------- trousers (tucked into the boots)
    boot_top = 0.36
    tm = ((w_leg + w_torso) > 0.5) & (z < belt_z + 0.02) & (z > 0.24) & (w_foot < 0.3)
    t_off = np.select([z > 0.97, z > 0.62, z > 0.45, z > 0.37], [0.008, 0.021, 0.024, 0.026], 0.006)
    trousers, tsrc = shell("Trousers", B, tm, t_off, M["trousers"], smooth=22, clear=np.select([z > 0.95, z > 0.37], [0.005, 0.012], 0.004))
    solidify(trousers, 0.002)
    set_weights_from_body(trousers, B)
    pieces.append(trousers)
    tbvh = bvh_of(trousers)

    # ---------------- belt + buckle + hip sheath
    belt = ring_band("Belt", [tbvh, B.bvh], [0, 0.0, belt_z - 0.03], [0, 0.0, belt_z + 0.03], [(0.12, 0.88)], 0.006,
                     M["belt"], n=72, start=0.4)
    solidify(belt, 0.004)
    set_weights_from_body(belt, B)
    pieces.append(belt)
    bbvh = bvh_of(belt)
    hit, nrm, _, _ = bbvh.ray_cast(Vector((0, -0.5, belt_z)), Vector((0, 1, 0)), 1.0)
    buckle = rounded_box("Buckle", np.array(hit) + np.array(nrm) * 0.004, (0.062, 0.008, 0.042), M["metal"], bevel_w=0.003)
    inner = rounded_box("Buckle_Inset", np.array(hit) + np.array(nrm) * 0.008, (0.044, 0.004, 0.024), M["metal_dark"], bevel_w=0.0015)
    for ob in (buckle, inner):
        set_weights_from_body(ob, B, rigid="pelvis")
        pieces.append(ob)
    # knife sheath on his left hip (viewer's right in ref 1)
    hit, nrm, _, _ = bbvh.ray_cast(Vector((0.5, -0.06, belt_z - 0.01)), Vector((-1, 0.12, 0)), 1.0)
    if hit is not None:
        c = np.array(hit) + np.array(nrm) * 0.016 + np.array([0, 0, -0.035])
        tilt = math.radians(12)
        A = np.array([[0, 0, 0], [0, 0, 0], [0, 0, 0]], float)
        A[:, 0] = [0, -1, 0]
        A[:, 2] = [0.0, -math.sin(tilt), math.cos(tilt)]
        A[:, 1] = np.cross(A[:, 2], A[:, 0])
        sheath = rounded_box("Sheath", c, (0.04, 0.022, 0.13), M["holster"], axes=A, bevel_w=0.006)
        set_weights_from_body(sheath, B, rigid="pelvis")
        pieces.append(sheath)

    # ---------------- thigh holster on his right leg (viewer's left)
    th, kn = J["thigh_r"], J["calf_r"]
    rbvh = tbvh
    strap = ring_band("Holster_Straps", [rbvh, B.bvh], th, kn, [(0.46, 0.50), (0.70, 0.74)], 0.004, M["belt"], n=48,
                      start=0.115, ref=[-1, 0, 0])
    solidify(strap, 0.003)
    set_weights_from_body(strap, B)
    pieces.append(strap)
    axis = (kn - th) / np.linalg.norm(kn - th)
    mid = th + (kn - th) * 0.5
    hit, nrm, _, _ = rbvh.ray_cast(Vector(mid + np.array([-0.3, 0, 0])), Vector((1, 0, 0)), 1.0)
    if hit is not None:
        base = np.array(hit) + np.array([-0.026, 0.0, 0.0])
        A = np.zeros((3, 3))
        A[:, 2] = -axis
        A[:, 0] = [0, -1, 0]
        A[:, 1] = np.cross(A[:, 2], A[:, 0])
        hol = rounded_box("Holster", base, (0.06, 0.045, 0.2), M["holster"], axes=A, bevel_w=0.008)
        grip = rounded_box("Pistol_Grip", base + np.array([0, 0.01, 0.13]), (0.032, 0.026, 0.1),
                           M["gun"], axes=A @ np.array([[1, 0, 0], [0, math.cos(-0.35), -math.sin(-0.35)],
                                                        [0, math.sin(-0.35), math.cos(-0.35)]]), bevel_w=0.005)
        for ob in (hol, grip):
            set_weights_from_body(ob, B, rigid="thigh_r")
            pieces.append(ob)

    # ---------------- boots
    bm_ = (z < boot_top) & (z > 0.07) & ((w_foot + w_leg) > 0.3)
    b_off = np.where(z > 0.1, 0.014, 0.011)
    boots, _ = shell("Boots", B, bm_, b_off, M["boot"], smooth=10, clear=np.where(z > 0.1, 0.012, 0.009))
    solidify(boots, 0.003)
    set_weights_from_body(boots, B)
    pieces.append(boots)
    bootbvh = bvh_of(boots)
    for side, sx in (("l", 1), ("r", -1)):
        kn, ft = J[f"calf_{side}"], J[f"foot_{side}"]
        bands = ring_band(f"Boot_Straps_{side}", [bootbvh], ft, kn, [(0.04, 0.09), (0.27, 0.32), (0.50, 0.55)], 0.004,
                          M["metal"], n=48, start=0.12)
        solidify(bands, 0.003)
        set_weights_from_body(bands, B)
        pieces.append(bands)
        # foot part of the boot: hull of the foot (no toes), remeshed smooth
        fm = ((w_foot > 0.2) | ((w_leg > 0.2) & (z < 0.16))) & (v[:, 0] * sx > 0) & (z < 0.16)
        fp = v[fm] + B.n[fm] * 0.011
        hull = ConvexHull(fp)
        foot = new_object(f"Boot_Foot_{side}", fp, [tuple(f) for f in hull.simplices], M["boot"])
        bpy.context.view_layer.objects.active = foot
        for o in bpy.context.view_layer.objects:
            o.select_set(o is foot)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        rm = foot.modifiers.new("Remesh", "REMESH")
        rm.mode = "VOXEL"
        rm.voxel_size = 0.006
        sm = foot.modifiers.new("Smooth", "SMOOTH")
        sm.iterations = 6
        apply_mods(foot)
        for p in foot.data.polygons:
            p.use_smooth = True
        set_weights_from_body(foot, B)
        pieces.append(foot)
        # sole: outline of the foot, extruded down
        fm = (w_foot > 0.3) & (v[:, 0] * sx > 0) & (z < 0.05)
        pts = v[fm][:, :2]
        hull = ConvexHull(pts)
        ring = pts[hull.vertices]
        c2 = ring.mean(axis=0)
        ring = c2 + (ring - c2) * 1.0 + (ring - c2) / np.linalg.norm(ring - c2, axis=1)[:, None] * 0.016
        top, bot = 0.022, -0.024
        sv = [(p[0], p[1], top) for p in ring] + [(p[0], p[1], bot) for p in ring]
        k = len(ring)
        sf = [tuple(range(k))[::-1], tuple(range(k, 2 * k))]
        for i in range(k):
            sf.append((i, (i + 1) % k, k + (i + 1) % k, k + i))
        sole = new_object(f"Sole_{side}", sv, sf, M["sole"], smooth=False)
        bevel(sole, 0.005, 2)
        set_weights_from_body(sole, B, rigid=f"foot_{side}")
        pieces.append(sole)

    # ---------------- gloves + grey cuffs
    gm = (w_hand > 0.3) | ((w_arm > 0.3) & (ax > wrist_x - 0.06))
    gloves, _ = shell("Gloves", B, gm, np.where(w_hand > 0.5, 0.0025, 0.01), M["glove"], smooth=3,
                      clear=np.where(w_hand > 0.5, 0.0015, 0.008))
    solidify(gloves, 0.0015)
    set_weights_from_body(gloves, B)
    pieces.append(gloves)
    jbvh = bvh_of(jacket)
    del jbvh
    for side, sx in (("l", 1), ("r", -1)):
        h, la = J[f"hand_{side}"], J[f"lowerarm_{side}"]
        cuff = ring_band(f"Cuff_{side}", [bvh_of(gloves), bvh_of(jacket)], h + (la - h) * 0.33, h + (la - h) * 0.0,
                         [(0.0, 0.75)], 0.003, M["metal_cuff"], n=40, start=0.14, ref=[0, 0, 1], rows=5,
                         straight=False)
        solidify(cuff, 0.004)
        set_weights_from_body(cuff, B)
        pieces.append(cuff)
        # plate on the back of the glove
        hit, nrm, _, _ = bvh_of(gloves).ray_cast(Vector(h + np.array([sx * 0.045, 0, 0.3])), Vector((0, 0, -1)), 1.0)
        if hit is not None:
            A = np.eye(3)
            plate_ = rounded_box(f"Glove_Plate_{side}", np.array(hit) + np.array([0, 0, 0.004]), (0.06, 0.05, 0.006),
                                 M["metal_cuff"], axes=A, bevel_w=0.002)
            set_weights_from_body(plate_, B, rigid=f"hand_{side}")
            pieces.append(plate_)

    for ob in pieces:
        if ob.name.startswith(("Jacket", "Trousers", "Boots", "Gloves", "Undersuit", "Belt", "Helmet")):
            smart_uv(ob)
            scale_uv(ob, materials.TILE_M.get(ob.data.materials[0].name, 0.25))
        elif not ob.data.uv_layers:
            smart_uv(ob)
            scale_uv(ob, 0.25)
    return pieces
