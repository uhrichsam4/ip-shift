"""Shared helpers for the IP SHIFT Blender asset library.

Geometry builders (loft / sweep / rounded outlines), contract materials,
bevel + weighted normals, AO/roughness texture baking, glTF export and
GLB validation. Blender 5.1, run headless with --factory-startup.
"""
import bpy, bmesh, math, os, json, struct, sys
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(ROOT, "blender", "source")
MODELS = os.path.join(ROOT, "web", "public", "assets", "models")
ENV = os.path.join(ROOT, "web", "public", "assets", "env")
ICON = os.path.join(ROOT, "web", "public", "assets", "icon")
RENDERS = os.path.join(ROOT, "docs", "renders")
FONT = os.path.join(ROOT, "blender", "fonts", "Unbounded-Variable.ttf")
for d in (SRC, MODELS, ENV, ICON, RENDERS):
    os.makedirs(d, exist_ok=True)

# ----------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1.0
    return s

def collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c

def link(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj

def empty(name, coll, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    coll.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e

def set_parent(child, parent, keep=True):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    if keep:
        child.matrix_world = mw

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT') if bpy.context.mode == 'OBJECT' else None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]

# ----------------------------------------------------------------- colour
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexc(h, a=1.0):
    h = h.lstrip('#')
    return (srgb_to_lin(int(h[0:2], 16) / 255), srgb_to_lin(int(h[2:4], 16) / 255),
            srgb_to_lin(int(h[4:6], 16) / 255), a)

# ----------------------------------------------------------------- materials
def _new_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m

def mat_pbr(name, color, metallic=0.0, roughness=0.5, coat=0.0, coat_rough=0.03,
            alpha=1.0, transmission=0.0, ior=1.5, aniso=0.0):
    m = _new_mat(name)
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = hexc(color) if isinstance(color, str) else color
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = coat_rough
    p.inputs["Alpha"].default_value = alpha
    p.inputs["Transmission Weight"].default_value = transmission
    p.inputs["IOR"].default_value = ior
    if aniso:
        p.inputs["Anisotropic"].default_value = aniso
    m.use_backface_culling = alpha >= 1.0 and transmission == 0.0
    if alpha < 1.0:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return m

def mat_emit(name, color, strength=1.0):
    """Plain emission (web drives intensity at runtime)."""
    m = _new_mat(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hexc(color) if isinstance(color, str) else color
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    m.diffuse_color = em.inputs["Color"].default_value
    m.use_backface_culling = True
    return m

def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj

def add_mat(obj, mat):
    obj.data.materials.append(mat)
    return len(obj.data.materials) - 1

# ----------------------------------------------------------------- geometry
def rrect(w, d, r, seg=8, cx=0.0, cy=0.0):
    """Rounded rectangle outline CCW, list of (x, y)."""
    r = min(r, w / 2 - 1e-5, d / 2 - 1e-5)
    pts = []
    corners = [(w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90),
               (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)]
    for (x, y, a0) in corners:
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + x + r * math.cos(a), cy + y + r * math.sin(a)))
    return pts

def circle(r, n=64, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]

def scale_outline(pts, sx, sy=None):
    sy = sx if sy is None else sy
    return [(x * sx, y * sy) for x, y in pts]

def offset_rrect(w, d, r, off, seg=8):
    return rrect(w + 2 * off, d + 2 * off, max(r + off, 0.0005), seg)

def mesh_obj(name, verts, faces, coll=None, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        # uvs: per-vertex list -> per loop
        lv = np.zeros(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        uv = np.asarray(uvs, dtype=np.float32)[lv]
        uvl.data.foreach_set("uv", uv.ravel())
    me.validate()
    me.update()
    o = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    return o

def loft(name, rings, coll=None, cap_bottom=True, cap_top=True):
    """rings: list of (outline_pts, z). All outlines share vertex count."""
    n = len(rings[0][0])
    verts, faces = [], []
    for pts, z in rings:
        verts += [(x, y, z) for x, y in pts]
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap_bottom:
        faces.append(tuple(reversed(range(0, n))))
    if cap_top:
        base = (len(rings) - 1) * n
        faces.append(tuple(range(base, base + n)))
    o = mesh_obj(name, verts, faces, coll)
    fix_normals(o)
    return o

def prism(name, pts, z0, z1, coll=None):
    return loft(name, [(pts, z0), (pts, z1)], coll)

def fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()

def frames_along(pts, up_hint=(0, 0, 1)):
    pts = np.asarray(pts, dtype=float)
    t = np.gradient(pts, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12
    up = np.array(up_hint, dtype=float)
    # parallel transport
    n0 = np.cross(t[0], up)
    if np.linalg.norm(n0) < 1e-6:
        n0 = np.cross(t[0], (1, 0, 0))
    n0 /= np.linalg.norm(n0)
    N = [n0]
    for i in range(1, len(pts)):
        n = N[-1] - np.dot(N[-1], t[i]) * t[i]
        nl = np.linalg.norm(n)
        N.append(n / nl if nl > 1e-9 else N[-1])
    N = np.array(N)
    Bn = np.cross(t, N)
    return t, N, Bn

def sweep(name, pts, profile, coll=None, closed_profile=True, closed_path=False,
          up_hint=(0, 0, 1), cap=False, frames=None):
    """Sweep a 2D profile [(a, b)] along pts. UV: U along length (0-1, arc length),
    V across the profile (0-1)."""
    pts = np.asarray(pts, dtype=float)
    if frames is None:
        t, N, Bn = frames_along(pts, up_hint)
    else:
        N, Bn = frames
    m = len(profile)
    seglen = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seglen)])
    u = s / s[-1]
    verts, uvs, faces = [], [], []
    mp = m + 1 if closed_profile else m  # duplicate seam column for clean V
    for i, p in enumerate(pts):
        for k in range(mp):
            a, b = profile[k % m]
            verts.append(p + N[i] * a + Bn[i] * b)
            uvs.append((u[i], k / (mp - 1)))
    rows = len(pts)
    for i in range(rows - 1):
        for k in range(mp - 1):
            a0 = i * mp + k
            faces.append((a0, a0 + 1, a0 + mp + 1, a0 + mp))
    o = mesh_obj(name, verts, faces, coll, uvs)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7) if False else None
    bm.free()
    return o

def tube_profile(r, n=12):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]

def axis_loft(name, rings, axis='Y', coll=None):
    """loft() with outlines in (x, z) [axis Y] or (y, z) [axis X]."""
    o = loft(name, rings, coll)
    M = {'Y': Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))),
         'X': Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))}.get(axis)
    if M:
        o.data.transform(M)
        fix_normals(o)
    return o

def axis_prism(name, pts, a0, a1, axis='Z', coll=None):
    """Prism of a 2D outline extruded along an axis.
    axis 'Y': outline is (x, z), extruded a0..a1 along Y.
    axis 'X': outline is (y, z), extruded a0..a1 along X."""
    o = loft(name, [(pts, a0), (pts, a1)], coll)
    if axis == 'Y':
        M = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    elif axis == 'X':
        M = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    else:
        return o
    o.data.transform(M)
    fix_normals(o)
    return o

def ring_solid(name, r_in, r_out, z0, z1, n=128, coll=None, chamfer=0.0):
    """Annulus solid (washer) with optional top chamfer on both edges."""
    rings_o = [(circle(r_out, n), z0), (circle(r_out, n), z1 - chamfer)]
    if chamfer:
        rings_o.append((circle(r_out - chamfer, n), z1))
    rings_i = [(circle(r_in + chamfer, n), z1)] if chamfer else []
    rings_i += [(circle(r_in, n), z1 - chamfer), (circle(r_in, n), z0)]
    allr = rings_o + rings_i
    verts, faces = [], []
    for pts, z in allr:
        verts += [(x, y, z) for x, y in pts]
    k = len(allr)
    for r in range(k):
        a, b = r * n, ((r + 1) % k) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    o = mesh_obj(name, verts, faces, coll)
    fix_normals(o)
    return o

def cylinder(name, r, h, n=32, coll=None, z0=0.0):
    return prism(name, circle(r, n), z0, z0 + h, coll)

def text_mesh(name, body, size, extrude, coll=None, align='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.resolution_u = 4
    o = bpy.data.objects.new(name, cu)
    (coll or bpy.context.scene.collection).objects.link(o)
    select_only([o])
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    return o

# ----------------------------------------------------------------- modifiers
def bevel(o, width=0.001, seg=3, angle=35, harden=True, clamp=True):
    m = o.modifiers.new("Bevel", 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.use_clamp_overlap = clamp
    m.harden_normals = False
    wn = o.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    wn.mode = 'FACE_AREA'
    return m

def boolean(o, cutter, op='DIFFERENCE', apply_now=True, solver='EXACT'):
    m = o.modifiers.new("Bool", 'BOOLEAN')
    m.operation = op
    m.object = cutter
    m.solver = solver
    if solver == "EXACT":
        m.use_self = True
    if apply_now:
        n0 = len(o.data.polygons)
        apply_mods(o, only=[m.name])
        if os.environ.get("IPS_DEBUG"):
            print(f"BOOL {o.name} - {cutter.name}: {n0} -> {len(o.data.polygons)} faces")
    return m

def apply_mods(o, only=None):
    select_only([o])
    for m in list(o.modifiers):
        if only and m.name not in only:
            continue
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            print("modifier apply failed", o.name, m.name, e)
            o.modifiers.remove(m)

def shade_smooth(o, angle=40):
    for p in o.data.polygons:
        p.use_smooth = True
    try:
        o.data.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass

def join(objs, name):
    objs = [o for o in objs if o]
    select_only(objs)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o

def delete(o):
    bpy.data.objects.remove(o, do_unlink=True)

def set_origin(o, point):
    """Move object origin to world point without moving geometry."""
    point = Vector(point)
    mw = o.matrix_world
    local = mw.inverted() @ point
    o.data.transform(Matrix.Translation(-local))
    o.matrix_world = mw @ Matrix.Translation(local)

def apply_transform(o):
    select_only([o])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

def tri_count(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    ev.to_mesh_clear()
    return n

def coll_tris(coll):
    return sum(tri_count(o) for o in coll.all_objects if o.type == 'MESH')

def smart_uv(objs, angle=66, margin=0.003):
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')

# ----------------------------------------------------------------- textures
def _value_noise(size, cells, rng):
    g = rng.random((cells + 1, cells + 1))
    x = np.linspace(0, cells, size, endpoint=False)
    xi = x.astype(int); xf = x - xi
    xf = xf * xf * (3 - 2 * xf)
    a = g[np.ix_(xi, xi)]; b = g[np.ix_(xi + 1, xi)]
    c = g[np.ix_(xi, xi + 1)]; d = g[np.ix_(xi + 1, xi + 1)]
    fx = xf[:, None]; fy = xf[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def roughness_map(size, base, seed=1, brushed=0.04, smudge=0.07):
    rng = np.random.default_rng(seed)
    r = np.full((size, size), base, dtype=np.float32)
    # brushed streaks: noise stretched along one axis
    streak = rng.random((size, 1)).astype(np.float32)
    streak = np.repeat(streak, size, axis=1)
    k = _value_noise(size, 6, rng)
    r += (streak - 0.5) * brushed * (0.6 + 0.8 * k)
    # smudges: low-frequency blotches + fingerprint-ish blobs
    f = sum(_value_noise(size, c, rng) * w for c, w in ((3, 0.5), (9, 0.3), (27, 0.2)))
    r += (f - 0.5) * 2 * smudge
    return np.clip(r, 0.05, 1.0)

def new_image(name, size, data=False, alpha=False):
    im = bpy.data.images.get(name)
    if im:
        bpy.data.images.remove(im)
    im = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=False)
    if data:
        im.colorspace_settings.name = 'Non-Color'
    return im

def gltf_output_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", 'ShaderNodeTree')
    g.interface.new_socket("Occlusion", in_out='INPUT', socket_type='NodeSocketFloat')
    return g

def bake_textured_metal(mat, objs, color, metallic, rough, size=1024, seed=3, samples=48,
                        brushed=0.05, smudge=0.06):
    """Bake AO for objs (shared UV atlas) and build base colour + ORM textures for mat.
    Base colour gets AO multiplied in; ORM = (AO, roughness, metallic) with
    glTF Material Output occlusion hookup."""
    scn = bpy.context.scene
    prev_engine = scn.render.engine
    use_cycles(samples)
    smart_uv(objs)
    nt = mat.node_tree
    ao_img = new_image(mat.name + "_AO_tmp", size, data=True)
    temps = []
    for mm in {m for o in objs for m in o.data.materials if m}:
        tn = mm.node_tree.nodes.new("ShaderNodeTexImage"); tn.image = ao_img
        mm.node_tree.nodes.active = tn
        temps.append((mm, tn))
    select_only(objs)
    scn.render.bake.margin = 6
    bpy.ops.object.bake(type='AO', use_clear=True, margin=6)
    ao = np.array(ao_img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., 0]
    for mm, tn in temps:
        mm.node_tree.nodes.remove(tn)
    bpy.data.images.remove(ao_img)
    ao = np.clip(ao, 0, 1) ** 0.8
    rgh = roughness_map(size, rough, seed, brushed, smudge)
    col = np.array(hexc(color)[:3], dtype=np.float32)
    # base colour (stored sRGB) with soft AO
    shade = 0.55 + 0.45 * ao
    lin = col[None, None, :] * shade[..., None]
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    bc = new_image(mat.name + "_BaseColor", size)
    px = np.ones((size, size, 4), dtype=np.float32); px[..., :3] = srgb
    bc.pixels.foreach_set(px.ravel())
    orm = new_image(mat.name + "_ORM", size, data=True)
    px2 = np.ones((size, size, 4), dtype=np.float32)
    px2[..., 0] = ao; px2[..., 1] = rgh; px2[..., 2] = metallic
    orm.pixels.foreach_set(px2.ravel())
    for im in (bc, orm):
        im.pack()
    p = nt.nodes.get("Principled BSDF")
    t1 = nt.nodes.new("ShaderNodeTexImage"); t1.image = bc; t1.location = (-600, 300)
    t2 = nt.nodes.new("ShaderNodeTexImage"); t2.image = orm; t2.location = (-600, -100)
    sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-300, -100)
    nt.links.new(t1.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(t2.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], p.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], p.inputs["Metallic"])
    grp = nt.nodes.new("ShaderNodeGroup"); grp.node_tree = gltf_output_group(); grp.location = (200, -300)
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    scn.render.engine = prev_engine

# ----------------------------------------------------------------- render
def use_cycles(samples=64):
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scn.cycles.device = 'GPU'
    except Exception as e:
        print("GPU setup failed", e)
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    return scn

def use_eevee(samples=64):
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    e = scn.eevee
    e.taa_render_samples = samples
    for attr, val in (("use_raytracing", True), ("use_shadows", True), ("use_gtao", True),
                      ("use_bloom", True)):
        if hasattr(e, attr):
            setattr(e, attr, val)
    try:
        e.ray_tracing_options.resolution_scale = '2'
    except Exception:
        pass
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.exposure = -0.4
    try:
        scn.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    return scn

def studio_world(strength=0.9, bg="#03050A"):
    scn = bpy.context.scene
    w = bpy.data.worlds.new("Studio")
    scn.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    hdr = os.path.join(ENV, "studio.hdr")
    mix = nt.nodes.new("ShaderNodeMixShader")
    lp = nt.nodes.new("ShaderNodeLightPath")
    bgc = nt.nodes.new("ShaderNodeBackground"); bgc.inputs[0].default_value = hexc(bg)
    bge = nt.nodes.new("ShaderNodeBackground"); bge.inputs[1].default_value = strength
    if os.path.exists(hdr):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdr, check_existing=True)
        nt.links.new(env.outputs[0], bge.inputs[0])
    else:
        bge.inputs[0].default_value = hexc("#0A1228")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(bge.outputs[0], mix.inputs[1])
    nt.links.new(bgc.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return w

def area_light(name, loc, target, color, power, size=0.5, size_y=None, coll=None):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE'
    ld.size = size; ld.size_y = size_y or size
    ld.color = hexc(color)[:3]
    ld.energy = power
    o = bpy.data.objects.new(name, ld)
    (coll or bpy.context.scene.collection).objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o

def camera(name, loc, target, lens=50, coll=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    o = bpy.data.objects.new(name, cd)
    (coll or bpy.context.scene.collection).objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o
    return o

def studio_rig(coll, scale=1.0, floor=True, center=(0, 0, 0)):
    """Three-point rig per DESIGN §9 plus a dark reflective floor."""
    cx, cy, cz = center
    s = scale
    area_light("Key", (cx - 0.8 * s, cy - 1.0 * s, cz + 1.4 * s), center, "#DCE6FF", 60 * s * s, 1.0 * s, coll=coll)
    area_light("Rim", (cx + 0.3 * s, cy + 1.2 * s, cz + 0.5 * s), center, "#2F6BFF", 220 * s * s, 0.8 * s, 0.2 * s, coll=coll)
    area_light("Fill", (cx - 1.4 * s, cy + 0.0, cz + 0.3 * s), center, "#7A4DFF", 25 * s * s, 0.8 * s, coll=coll)
    area_light("StripCyan", (cx + 1.2 * s, cy - 0.4 * s, cz + 0.4 * s), center, "#35D6FF", 40 * s * s, 0.15 * s, 1.0 * s, coll=coll)
    if floor:
        f = prism("Floor", circle(20, 64), -0.002, 0.0, coll)
        fm = mat_pbr("RenderFloor", "#05070C", 0.0, 0.32, coat=0.4)
        assign(f, fm)

def render_jpg(path, res=(1280, 720), quality=90):
    scn = bpy.context.scene
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.image_settings.file_format = 'JPEG'
    scn.render.image_settings.quality = quality
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)

def make_portable(bpy, os):
    """Store every external path relative to the .blend so project files never embed local absolute paths."""
    for sc in bpy.data.scenes:
        fp = sc.render.filepath
        if fp and not fp.startswith('//'):
            sc.render.filepath = '//' + os.path.basename(fp.rstrip('/'))
    bpy.ops.file.make_paths_relative()

# ----------------------------------------------------------------- export
def save_blend(name):
    p = os.path.join(SRC, name + ".blend")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=p, compress=True)
    make_portable(bpy, os)
    bpy.ops.wm.save_mainfile(compress=True)
    print("SAVED", p)
    return p

def export_glb(coll, name):
    path = os.path.join(MODELS, name + ".glb")
    lc = bpy.context.view_layer.layer_collection.children.get(coll.name)
    bpy.context.view_layer.active_layer_collection = lc
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_active_collection=True,
        use_active_collection_with_nested=True, export_yup=True, export_apply=True,
        export_materials='EXPORT', export_image_format='WEBP', export_image_quality=88,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_cameras=False, export_lights=False, export_texcoords=True, export_normals=True,
        export_extras=False)
    tris = coll_tris(coll)
    print(f"EXPORTED {name}.glb  {os.path.getsize(path)/1024:.1f} KB  tris={tris}")
    return path, tris

def read_glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    clen, ctype = struct.unpack_from('<II', data, 12)
    return json.loads(data[20:20 + clen].decode('utf-8'))

def validate_glb(path, nodes, materials):
    j = read_glb_json(path)
    have_n = {n.get('name') for n in j.get('nodes', [])}
    have_m = {m.get('name') for m in j.get('materials', [])}
    miss_n = [n for n in nodes if n not in have_n]
    miss_m = [m for m in materials if m not in have_m]
    ok = not miss_n and not miss_m
    print(f"VALIDATE {os.path.basename(path)}: {'OK' if ok else 'FAIL'} nodes={len(have_n)} "
          f"materials={len(have_m)} missing_nodes={miss_n} missing_mats={miss_m} "
          f"ext={j.get('extensionsUsed')}")
    return ok

# ----------------------------------------------------------------- extra texture helpers
def planar_uv(o, axes=(0, 1), bounds=None):
    """Planar UVs from object-space coordinates mapped to 0-1 over bounds ((min_a,max_a),(min_b,max_b))."""
    me = o.data
    uvl = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    if bounds is None:
        bounds = [(co[:, a].min(), co[:, a].max()) for a in axes]
    lv = np.zeros(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", lv)
    c = co[lv]
    u = (c[:, axes[0]] - bounds[0][0]) / (bounds[0][1] - bounds[0][0])
    v = (c[:, axes[1]] - bounds[1][0]) / (bounds[1][1] - bounds[1][0])
    uvl.data.foreach_set("uv", np.stack([u, v], 1).astype(np.float32).ravel())

def _img_from(name, arr, data):
    h, w = arr.shape[:2]
    im = bpy.data.images.get(name)
    if im:
        bpy.data.images.remove(im)
    im = bpy.data.images.new(name, w, h, alpha=False)
    if data:
        im.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), dtype=np.float32); px[..., :arr.shape[2]] = arr
    im.pixels.foreach_set(px.ravel()); im.pack()
    return im

def link_rough_metal(mat, rough, metallic):
    """Roughness array (HxW) -> ORM texture wired via Separate Color (G rough, B metal)."""
    arr = np.stack([np.ones_like(rough), rough, np.full_like(rough, metallic)], -1)
    im = _img_from(mat.name + "_RM", arr, True)
    nt = mat.node_tree; p = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = im
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], p.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], p.inputs["Metallic"])
    return im

def link_base_color(mat, rgb_srgb):
    im = _img_from(mat.name + "_BC", rgb_srgb, False)
    nt = mat.node_tree; p = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = im
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
    return im, t

def fingerprint_map(size, base, peak, seed=2, count=9):
    """Roughness with soft smudges and a few fingerprint whorls."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size] / size
    r = np.full((size, size), base, np.float32)
    f = sum(_value_noise(size, c, rng) * w for c, w in ((4, 0.6), (13, 0.4)))
    r += (f - 0.5) * (peak - base) * 0.6
    for _ in range(count):
        cx, cy = rng.random(2); sx, sy = rng.uniform(0.03, 0.06, 2); ang = rng.uniform(0, np.pi)
        dx, dy = xx - cx, yy - cy
        u = (dx * np.cos(ang) + dy * np.sin(ang)) / sx; v = (-dx * np.sin(ang) + dy * np.cos(ang)) / sy
        d = np.sqrt(u * u + v * v)
        env = np.exp(-d ** 2 * 1.6)
        ridges = 0.5 + 0.5 * np.sin(d * 38 + rng.uniform(0, 6))
        r += env * (0.45 + 0.55 * ridges) * (peak - base)
    return np.clip(r, 0.02, 1.0)
