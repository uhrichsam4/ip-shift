"""IP SHIFT launch film - scene builder (Blender 5.1, EEVEE).
blender -b --factory-startup -P film/scripts/build_film.py -- [--fps 30]
Builds film/source/ip_shift_launch.blend with five Blender scenes (S1..S5) sharing collections.
Each scene renders its global frame range straight to H.264 (no frame sequences).
"""
import bpy, bmesh, math, os, sys, glob
import numpy as np
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FPS = int(argv[argv.index('--fps') + 1]) if '--fps' in argv else 30
HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.normpath(os.path.join(HERE, '..'))
ROOT = os.path.normpath(os.path.join(FILM, '..'))
SRC = os.path.join(ROOT, 'blender', 'source')
GLB = os.path.join(ROOT, 'web', 'public', 'assets', 'models')
HDR = os.path.join(ROOT, 'web', 'public', 'assets', 'env', 'studio.hdr')
FONT = os.path.join(ROOT, 'blender', 'fonts', 'Unbounded-Variable.ttf')
CAP = os.path.join(FILM, 'captures')
rng = np.random.default_rng(11)
REPORT = {}

def F(sec): return int(round(sec * FPS)) + 1
SCENES = [('S1_Reveal', 0, 6), ('S2_Network', 6, 15), ('S3_Technology', 15, 25), ('S4_Product', 25, 36), ('S5_Brand', 36, 42)]

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple([(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c] + [1.0])

# ---------------------------------------------------------------- reset
bpy.ops.wm.read_factory_settings(use_empty=True)
base = bpy.context.scene; base.name = 'S1_Reveal'

def coll(name):
    c = bpy.data.collections.new(name); return c
C = {k: coll(k) for k in ['C_Router', 'C_Pedestals', 'C_Laptop', 'C_Holo', 'C_LogoA', 'C_LogoB', 'C_Particles',
                          'C_Network', 'C_Screen', 'C_Brand', 'C_L1', 'C_L2', 'C_L3', 'C_L4', 'C_L5', 'C_Cams']}

def link(o, c):
    for uc in list(o.users_collection): uc.objects.unlink(o)
    C[c].objects.link(o); return o

# ---------------------------------------------------------------- materials
def mat_nodes(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); return m, nt, out

def fader(m, nt, shader_socket, out, start=1.0):
    """mix shader with transparent; returns value node (1 = visible)"""
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    v = nt.nodes.new('ShaderNodeValue'); v.name = 'FADE'; v.outputs[0].default_value = start
    nt.links.new(v.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(shader_socket, mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs[0])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    return v

def key_val(m, frame, val, node='FADE', interp='BEZIER'):
    n = m.node_tree.nodes[node]; n.outputs[0].default_value = val
    n.outputs[0].keyframe_insert('default_value', frame=frame)

def emis(name, hexc, strength=5.0, fade=True):
    m, nt, out = mat_nodes(name)
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = srgb(hexc); e.inputs[1].default_value = strength
    e.name = 'EM'
    if fade: fader(m, nt, e.outputs[0], out)
    else: nt.links.new(e.outputs[0], out.inputs[0])
    return m

def key_em(m, frame, s):
    n = m.node_tree.nodes['EM']; n.inputs[1].default_value = s; n.inputs[1].keyframe_insert('default_value', frame=frame)

def pbr(name, hexc, metal=1.0, rough=0.3, fade=False):
    m, nt, out = mat_nodes(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.inputs['Base Color'].default_value = srgb(hexc)
    b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if fade: fader(m, nt, b.outputs[0], out)
    else: nt.links.new(b.outputs[0], out.inputs[0])
    return m

def gradient_mat(name):
    """logo gradient #7BE6FF -> #2F6BFF (top-left to bottom-right), glossy + emissive"""
    m, nt, out = mat_nodes(name)
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'SUBTRACT'
    nt.links.new(sep.outputs[2], mth.inputs[0]); nt.links.new(sep.outputs[0], mth.inputs[1])
    mp = nt.nodes.new('ShaderNodeMapRange'); mp.inputs[1].default_value = -1.4; mp.inputs[2].default_value = 1.4
    nt.links.new(mth.outputs[0], mp.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('#2F6BFF'); ramp.color_ramp.elements[1].color = srgb('#7BE6FF')
    nt.links.new(mp.outputs[0], ramp.inputs[0])
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.inputs['Metallic'].default_value = 0.9; b.inputs['Roughness'].default_value = 0.3
    m3 = nt.nodes.new('ShaderNodeMix'); m3.data_type = 'RGBA'; m3.inputs[0].default_value = 0.55
    m3.inputs[6].default_value = srgb('#070C1C'); nt.links.new(ramp.outputs[0], m3.inputs[7]); nt.links.new(m3.outputs[2], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.3
    b.inputs['Specular IOR Level'].default_value = 0.15
    nt.links.new(ramp.outputs[0], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 2.2
    b.name = 'BSDF'
    fader(m, nt, b.outputs[0], out, 0.0)
    return m

def holo_mat(name, hexc='#35D6FF', strength=2.0, alpha=0.35):
    m, nt, out = mat_nodes(name)
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = srgb(hexc); e.inputs[1].default_value = strength; e.name = 'EM'
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs[0].default_value = 0.3
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY_ADD'; mm.inputs[1].default_value = 1 - alpha; mm.inputs[2].default_value = alpha
    nt.links.new(lw.outputs['Facing'], mm.inputs[0])
    v = nt.nodes.new('ShaderNodeValue'); v.name = 'FADE'; v.outputs[0].default_value = 0.0
    m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'
    nt.links.new(mm.outputs[0], m2.inputs[0]); nt.links.new(v.outputs[0], m2.inputs[1])
    nt.links.new(m2.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    return m

def stream_mat(name, c1='#2F6BFF', c2='#35D6FF', c3='#9A73FF'):
    """emission along UV.u: reveal (PROG) + travelling pulses (TIME)"""
    m, nt, out = mat_nodes(name)
    uv = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uv.outputs['UV'], sep.inputs[0]); u = sep.outputs[0]
    prog = nt.nodes.new('ShaderNodeValue'); prog.name = 'PROG'; prog.outputs[0].default_value = 0
    tim = nt.nodes.new('ShaderNodeValue'); tim.name = 'TIME'; tim.outputs[0].default_value = 0
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; nt.links.new(u, lt.inputs[0]); nt.links.new(prog.outputs[0], lt.inputs[1])
    s1 = nt.nodes.new('ShaderNodeMath'); s1.operation = 'MULTIPLY_ADD'; s1.inputs[1].default_value = 3.0
    nt.links.new(u, s1.inputs[0]); s2 = nt.nodes.new('ShaderNodeMath'); s2.operation = 'SUBTRACT'
    nt.links.new(s1.outputs[0], s2.inputs[0]); nt.links.new(tim.outputs[0], s2.inputs[1])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(s2.outputs[0], fr.inputs[0])
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 12
    nt.links.new(fr.outputs[0], pw.inputs[0])
    st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY_ADD'; st.inputs[1].default_value = 40; st.inputs[2].default_value = 4
    nt.links.new(pw.outputs[0], st.inputs[0])
    st2 = nt.nodes.new('ShaderNodeMath'); st2.operation = 'MULTIPLY'; nt.links.new(st.outputs[0], st2.inputs[0]); nt.links.new(lt.outputs[0], st2.inputs[1])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); r = ramp.color_ramp
    r.elements[0].color = srgb(c1); r.elements[1].color = srgb(c3); r.elements.new(0.5).color = srgb(c2)
    nt.links.new(u, ramp.inputs[0])
    e = nt.nodes.new('ShaderNodeEmission'); nt.links.new(ramp.outputs[0], e.inputs[0]); nt.links.new(st2.outputs[0], e.inputs[1])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lt.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    return m

# ---------------------------------------------------------------- mesh helpers
def mesh_obj(name, verts, faces, c, uvs=None, mat=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        loops = np.array([uvs[me.loops[i].vertex_index] for i in range(len(me.loops))]).ravel()
        uvl.data.foreach_set('uv', loops)
    o = bpy.data.objects.new(name, me); C[c].objects.link(o)
    if mat: o.data.materials.append(mat)
    return o

def tube(name, pts, radius, c, mat, sides=8):
    """mesh tube along a polyline (or list of polylines) with U = 0..1 along length"""
    if isinstance(pts, np.ndarray) and pts.ndim == 2: pts = [pts]
    V, Fc, U = [], [], []
    for P in pts:
        n = len(P); off = len(V)
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1); L = np.concatenate([[0], np.cumsum(seg)]); L /= L[-1]
        for i in range(n):
            t = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]; t /= np.linalg.norm(t) + 1e-9
            a = np.array([0, 0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0, 0])
            b1 = np.cross(t, a); b1 /= np.linalg.norm(b1); b2 = np.cross(t, b1)
            for k in range(sides):
                ang = 2 * math.pi * k / sides
                V.append(P[i] + radius * (math.cos(ang) * b1 + math.sin(ang) * b2)); U.append((L[i], k / sides))
        for i in range(n - 1):
            for k in range(sides):
                a0 = off + i * sides + k; a1 = off + i * sides + (k + 1) % sides
                Fc.append((a0, a1, a1 + sides, a0 + sides))
    o = mesh_obj(name, V, Fc, c, U, mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def bez(p0, p1, p2, n=120):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2

def text_obj(name, body, c, size=0.3, extrude=0.02, mat=None, align='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body
    try: cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    except Exception as e: print('FONT FAIL', e)
    cu.size = size; cu.extrude = extrude; cu.bevel_depth = extrude * 0.25; cu.bevel_resolution = 2
    cu.align_x = align; cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name, cu); C[c].objects.link(o)
    o.rotation_euler = (math.radians(90), 0, 0)
    if mat: cu.materials.append(mat)
    return o

def empty(name, c, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None); o.location = loc; C[c].objects.link(o); return o

def key(o, frame, loc=None, rot=None, scale=None):
    if loc is not None: o.location = loc; o.keyframe_insert('location', frame=frame)
    if rot is not None: o.rotation_euler = rot; o.keyframe_insert('rotation_euler', frame=frame)
    if scale is not None: o.scale = (scale,) * 3 if np.isscalar(scale) else scale; o.keyframe_insert('scale', frame=frame)

def linear_all(o):
    ad = o.animation_data
    if ad and ad.action:
        try:
            for fc in ad.action.fcurves:
                for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
        except Exception:
            for layer in ad.action.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        for fc in cb.fcurves:
                            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'

# ---------------------------------------------------------------- assets
def bbox(objs):
    pts = []; dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type in ('MESH', 'CURVE', 'FONT'):
            oe = o.evaluated_get(dg)
            pts += [oe.matrix_world @ Vector(c) for c in oe.bound_box]
    if not pts: return None
    a = np.array([tuple(p) for p in pts]); return a.min(0), a.max(0)

def load_asset(stem, c, target_width, place_bottom=(0, 0, 0)):
    blend = os.path.join(SRC, stem + '.blend'); glb = os.path.join(GLB, stem + '.glb')
    before = set(bpy.data.objects)
    src = None
    if os.path.exists(blend):
        try:
            with bpy.data.libraries.load(blend, link=False) as (s, d): d.objects = list(s.objects)
            src = 'blend'
        except Exception as e: print('APPEND FAIL', stem, e)
    if src is None and os.path.exists(glb):
        bpy.ops.import_scene.gltf(filepath=glb); src = 'glb'
    new = [o for o in bpy.data.objects if o not in before]
    REPORT[stem] = src or 'MISSING'
    if not new: return None, {}
    keep = []
    for o in new:
        if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o); continue
        keep.append(o)
    for o in keep:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        C[c].objects.link(o)
    root = empty('ROOT_' + stem, c)
    for o in keep:
        if o.parent is None or o.parent not in keep:
            mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
    bpy.context.view_layer.update()
    bb = bbox(keep)
    if bb:
        lo, hi = bb; w = max(hi[0] - lo[0], hi[1] - lo[1]); s = target_width / max(w, 1e-6)
        ctr = (lo + hi) / 2
        root.scale = (s, s, s)
        root.location = Vector(place_bottom) - Vector((ctr[0] * s, ctr[1] * s, lo[2] * s))
    bpy.context.view_layer.update()
    names = {o.name.split('.')[0]: o for o in keep}
    return root, names

def top_z(c):
    bb = bbox(C[c].all_objects); return bb[1][2] if bb else 0.0

# pedestals
ped_root, ped = load_asset('pedestal', 'C_Pedestals', 1.5, (0, 0, -1.0))
ROUTER_Z = top_z('C_Pedestals') if ped_root else -0.3
rt_root, rt = load_asset('router', 'C_Router', 1.1, (0, 0, ROUTER_Z))
LAP_POS = Vector((-2.6, 1.2, -1.0))
ped2_root = None
if ped_root:
    ped2_root, _ = load_asset('pedestal', 'C_Pedestals', 1.5, tuple(LAP_POS))
LAP_Z = top_z('C_Pedestals') if ped_root else -0.3
lap_root, lap = load_asset('laptop', 'C_Laptop', 1.0, (LAP_POS.x, LAP_POS.y, LAP_Z))
if lap_root: lap_root.rotation_euler = (0, 0, math.radians(-35))
hk_root, hk = load_asset('holo_kit', 'C_Holo', 2.2, (0, 0, ROUTER_Z - 0.05))
bpy.context.view_layer.update()
rbb = bbox(C['C_Router'].all_objects)
RCTR = Vector(((rbb[0] + rbb[1]) / 2)) if rbb else Vector((0, 0, ROUTER_Z + 0.2))
RTOP = rbb[1][2] if rbb else ROUTER_Z + 0.4

# antennas fold-up (servo) 7.0-8.05 s
for i in range(1, 5):
    a = rt.get('Antenna_%d' % i)
    if a:
        r0 = a.rotation_euler.copy(); t = 7.0 + 0.35 * (i - 1)
        a.rotation_euler = (r0.x - math.radians(75), r0.y, r0.z); a.keyframe_insert('rotation_euler', frame=F(t))
        a.rotation_euler = r0; a.keyframe_insert('rotation_euler', frame=F(t + 0.4))

# holo_kit pieces: keep only rings/wifi/panel; hide the rest
if hk_root:
    for nm, o in hk.items():
        if not any(nm.startswith(k) for k in ('Holo_Ring', 'Holo_WiFi')): o.hide_render = True; o.hide_viewport = True
    for nm in ('Holo_Ring_A', 'Holo_Ring_B', 'Holo_Ring_Segmented'):
        o = hk.get(nm)
        if o:
            o.rotation_mode = 'XYZ'; r = o.rotation_euler.copy()
            key(o, F(6), rot=(r.x, r.y, r.z)); key(o, F(15), rot=(r.x, r.y, r.z + math.radians(90 if nm[-1] == 'A' else -70)))
    if hk.get('Holo_WiFi'):
        hk['Holo_WiFi'].hide_render = True  # we use our own big Wi-Fi portal

# boost router emissives at reveal
for m in bpy.data.materials:
    if m.name.startswith(('E_', 'H_')) and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'EMISSION':
                s0 = max(n.inputs[1].default_value, 3.0)
                n.inputs[1].default_value = 0.0; n.inputs[1].keyframe_insert('default_value', frame=F(0.6))
                n.inputs[1].default_value = s0; n.inputs[1].keyframe_insert('default_value', frame=F(4.0))

# ---------------------------------------------------------------- logo
def make_logo(name, c, loc, scale):
    root = empty(name, c, loc)
    gms = {k: gradient_mat(name + '_Grad' + k) for k in ('Top', 'Left', 'Right')}
    for k, v in (('Top', 0.85), ('Left', 0.35), ('Right', 1.4)): gms[k].node_tree.nodes['BSDF'].inputs['Emission Strength'].default_value = v
    wm = pbr(name + '_Word', '#F3F6FC', 0.85, 0.22, fade=True)
    wm.node_tree.nodes['FADE'].outputs[0].default_value = 0
    s30, c30 = 0.5, math.cos(math.radians(30))
    ctr = np.array([0, 0, 0.0])
    faces = {
        'Top': [ctr, (c30, 0, s30), (0, 0, 1), (-c30, 0, s30)],
        'Left': [ctr, (-c30, 0, s30), (-c30, 0, -s30), (0, 0, -1)],
        'Right': [ctr, (0, 0, -1), (c30, 0, -s30), (c30, 0, s30)],
    }
    for fn, q in faces.items():
        q = np.array(q, float) * 0.55; cen = q.mean(0); q = cen + (q - cen) * 0.86
        o = mesh_obj(name + '_Mark_' + fn, q, [(0, 1, 2, 3)], c, None, gms[fn])
        sol = o.modifiers.new('S', 'SOLIDIFY'); sol.thickness = 0.08; sol.offset = 0
        bev = o.modifiers.new('B', 'BEVEL'); bev.width = 0.025; bev.segments = 3; bev.limit_method = 'ANGLE'
        o.parent = root
        if fn == 'Right':
            o.location = (0.11, -0.12, -0.09)  # the shifted face
        o.location = Vector(o.location) + Vector((-1.1, 0, 0))
    t = text_obj(name + '_Word', 'IP SHIFT', c, 0.62, 0.06, wm, 'LEFT'); t.parent = root
    t.location = (-0.42, 0, 0)
    root.scale = (scale,) * 3
    return root, list(gms.values()) + [wm]

logoA, logoA_m = make_logo('LogoA', 'C_LogoA', (RCTR.x, RCTR.y - 0.2, RTOP + 0.6), 0.32)
logoB, logoB_m = make_logo('LogoB', 'C_LogoB', (RCTR.x, RCTR.y - 1.4, RTOP + 0.8), 0.3)
# center logos (wordmark width unknown until eval) - approximate offset
bpy.context.view_layer.update()
for L, objs in ((logoA, C['C_LogoA'].objects), (logoB, C['C_LogoB'].objects)):
    L.location.x -= 0.0  # mark + wordmark are laid out around x=0
# fade logo A in 3.6-5.6 s with slight rise
for m in logoA_m: key_val(m, F(3.4), 0.0); key_val(m, F(5.4), 1.0)
key(logoA, F(3.4), loc=tuple(logoA.location - Vector((0, 0, 0.12)))); key(logoA, F(6.0), loc=tuple(logoA.location + Vector((0, 0, 0.12))))
# logo B: final reveal 39.6 s
for m in logoB_m: key_val(m, F(39.4), 0.0); key_val(m, F(39.9), 1.0)
key(logoB, F(39.4), scale=0.28); key(logoB, F(42), scale=0.31)

# ---------------------------------------------------------------- particles (geometry nodes)
def particle_field(name, c, n, half, rad, mat, center=(0, 0, 0)):
    P = (rng.random((n, 3)) * 2 - 1) * np.array(half) + np.array(center)
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in P], [], []); me.update()
    o = bpy.data.objects.new(name, me); C[c].objects.link(o)
    ng = bpy.data.node_groups.new(name + '_GN', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = ng.nodes.new('NodeGroupInput'); go = ng.nodes.new('NodeGroupOutput')
    ico = ng.nodes.new('GeometryNodeMeshIcoSphere'); ico.inputs['Radius'].default_value = rad; ico.inputs['Subdivisions'].default_value = 1
    iop = ng.nodes.new('GeometryNodeInstanceOnPoints')
    rv = ng.nodes.new('FunctionNodeRandomValue'); rv.inputs[2].default_value = 0.3; rv.inputs[3].default_value = 1.6
    sm = ng.nodes.new('GeometryNodeSetMaterial'); sm.inputs['Material'].default_value = mat
    ng.links.new(gi.outputs[0], iop.inputs['Points']); ng.links.new(ico.outputs['Mesh'], iop.inputs['Instance'])
    ng.links.new(rv.outputs[1], iop.inputs['Scale'])
    ng.links.new(iop.outputs[0], sm.inputs['Geometry']); ng.links.new(sm.outputs[0], go.inputs[0])
    md = o.modifiers.new('GN', 'NODES'); md.node_group = ng
    return o

pm = emis('E_Particle', '#7BE6FF', 6.0, fade=False)
dust = particle_field('Dust', 'C_Particles', 2500, (7, 7, 3.5), 0.0035, pm, (RCTR.x, RCTR.y, RCTR.z))
key(dust, F(0), loc=(0, 0, -0.3), rot=(0, 0, 0)); key(dust, F(42), loc=(0, 0, 0.6), rot=(0, 0, math.radians(25))); linear_all(dust)

# ---------------------------------------------------------------- scene 1/2 holo + energy (own elements)
ring_mats = []
for i, (r, hexc, th) in enumerate(((1.05, '#2F6BFF', 0.012), (1.35, '#35D6FF', 0.008), (1.7, '#2F6BFF', 0.005))):
    m = emis('E_NetRing%d' % i, hexc, 0.0, fade=False); ring_mats.append(m)
    ang = np.linspace(0, 2 * np.pi, 180)
    pts = np.stack([np.cos(ang) * r, np.sin(ang) * r, np.full_like(ang, ROUTER_Z + 0.02)], 1) + np.array([RCTR.x, RCTR.y, 0])
    o = tube('NetRing%d' % i, pts, th, 'C_Holo', m, 6)
    key_em(m, F(8.4 + 0.25 * i), 0.0); key_em(m, F(8.9 + 0.25 * i), 14.0); key_em(m, F(10 + 0.25 * i), 5.0)
    o.location = (0, 0, 0)

# energy stream laptop -> router
lp_ = Vector((LAP_POS.x, LAP_POS.y, LAP_Z + 0.35)); rp_ = Vector((RCTR.x, RCTR.y, RCTR.z))
smat = stream_mat('E_Stream')
spts = bez(np.array(lp_), np.array((lp_ + rp_) / 2 + Vector((0, -0.3, 1.2))), np.array(rp_), 160)
stream = tube('EnergyStream', spts, 0.012, 'C_Holo', smat, 8)
key_val(smat, F(11.0), 0.0, 'PROG'); key_val(smat, F(12.2), 1.02, 'PROG')
key_val(smat, F(11.0), 0.0, 'TIME'); key_val(smat, F(15.0), 6.0, 'TIME')
smat2 = stream_mat('E_Stream2'); 
stream2 = tube('EnergyStreamCore', spts, 0.035, 'C_Holo', smat2, 8)
key_val(smat2, F(11.1), 0.0, 'PROG'); key_val(smat2, F(12.3), 1.02, 'PROG')
key_val(smat2, F(11.0), 0.0, 'TIME'); key_val(smat2, F(15.0), 6.0, 'TIME')
smat2.node_tree.nodes['Math.006'].inputs[1].default_value = 0.25 if 'Math.006' in smat2.node_tree.nodes else 0

# holographic info panels
panel_specs = [('LEASE RENEWAL', 'DHCP · READY', (1.25, -0.3, RTOP + 0.35), -25),
               ('GATEWAY', 'ONLINE', (-1.2, -0.5, RTOP + 0.15), 30),
               ('SIGNAL', '5 GHz · STRONG', (0.6, 0.9, RTOP + 0.75), -10)]
panel_mats = []
for i, (h, sub, loc, yaw) in enumerate(panel_specs):
    pe = empty('Panel%d' % i, 'C_Holo', loc); pe.rotation_euler = (0, 0, math.radians(yaw))
    pmt = holo_mat('H_Panel%d' % i, '#2F6BFF', 1.2, 0.18); panel_mats.append(pmt)
    pl = mesh_obj('PanelGlass%d' % i, [(-0.5, 0, -0.28), (0.5, 0, -0.28), (0.5, 0, 0.28), (-0.5, 0, 0.28)], [(0, 1, 2, 3)], 'C_Holo', None, pmt)
    pl.parent = pe
    fm = holo_mat('H_PanelEdge%d' % i, '#7BE6FF', 6.0, 1.0); panel_mats.append(fm)
    fr = mesh_obj('PanelEdge%d' % i, [(-0.5, 0, -0.28), (0.5, 0, -0.28), (0.5, 0, 0.28), (-0.5, 0, 0.28)], [(0, 1, 2, 3)], 'C_Holo', None, fm)
    wf = fr.modifiers.new('W', 'WIREFRAME'); wf.thickness = 0.008; fr.parent = pe; fr.location = (0, -0.002, 0)
    tm = holo_mat('H_PanelText%d' % i, '#F3F6FC', 4.0, 1.0); panel_mats.append(tm)
    t1 = text_obj('PanelH%d' % i, h, 'C_Holo', 0.085, 0.0, tm, 'LEFT'); t1.parent = pe; t1.location = (-0.42, -0.01, 0.12)
    t2 = text_obj('PanelS%d' % i, sub, 'C_Holo', 0.06, 0.0, tm, 'LEFT'); t2.parent = pe; t2.location = (-0.42, -0.01, -0.06)
    bar = mesh_obj('PanelBar%d' % i, [(-0.42, -0.01, -0.2), (0.25 - 0.15 * i, -0.01, -0.2), (0.25 - 0.15 * i, -0.01, -0.17), (-0.42, -0.01, -0.17)], [(0, 1, 2, 3)], 'C_Holo', None, fm)
    bar.parent = pe
    t0 = 12.8 + 0.3 * i
    for mm in panel_mats[-3:]: key_val(mm, F(t0), 0.0); key_val(mm, F(t0 + 0.35), 1.0)
    key(pe, F(t0), scale=(0.6, 0.6, 0.05)); key(pe, F(t0 + 0.35), scale=1.0)

# Wi-Fi portal symbol above router
wifi_m = holo_mat('H_WiFi', '#35D6FF', 8.0, 1.0)
WIFI_C = Vector((RCTR.x, RCTR.y - 0.1, RTOP + 0.55))
for i, r in enumerate((0.18, 0.32, 0.46)):
    ang = np.linspace(math.radians(45), math.radians(135), 60)
    pts = np.stack([np.cos(ang) * r, np.zeros_like(ang), np.sin(ang) * r - 0.12], 1) + np.array(WIFI_C)
    tube('WiFiArc%d' % i, pts, 0.022, 'C_Holo', wifi_m, 8)
dot = mesh_obj('WiFiDot', [], [], 'C_Holo')
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.04); bm.to_mesh(dot.data); bm.free()
dot.location = WIFI_C + Vector((0, 0, -0.12)); dot.data.materials.append(wifi_m)
key_val(wifi_m, F(9.5), 0.0); key_val(wifi_m, F(10.5), 1.0)
wifi_m.node_tree.nodes['EM'].inputs[1].default_value = 8; wifi_m.node_tree.nodes['EM'].inputs[1].keyframe_insert('default_value', frame=F(13.6))
wifi_m.node_tree.nodes['EM'].inputs[1].default_value = 80; wifi_m.node_tree.nodes['EM'].inputs[1].keyframe_insert('default_value', frame=F(15.0))

# ---------------------------------------------------------------- scene 3: network space (far away at X=200)
NX = Vector((200, 0, 0))
node_m = emis('E_Node', '#2F6BFF', 10.0, fade=False)
node_m2 = emis('E_NodeHot', '#7BE6FF', 25.0, fade=False)
path_m = stream_mat('E_Path', '#2F6BFF', '#35D6FF', '#7A4DFF')
key_val(path_m, F(15.0), 0.15, 'PROG'); key_val(path_m, F(16.8), 1.02, 'PROG')
key_val(path_m, F(15), 0.0, 'TIME'); key_val(path_m, F(25), 5.0, 'TIME')
NN = 160
nodes = rng.normal(size=(NN, 3)) * np.array([14, 30, 7]) + np.array(NX)
nodes[:, 1] = np.abs(nodes[:, 1]) * 1.4 + NX.y  # spread ahead of camera (+Y)
nodes[0] = np.array(NX) + np.array([0, 4, 0])          # client (DHCP client)
SERVER = np.array(NX) + np.array([3, 34, 2.5]); nodes[1] = SERVER
paths = []
for i in range(NN):
    d = np.linalg.norm(nodes - nodes[i], axis=1); idx = np.argsort(d)[1:3]
    for j in idx:
        if i < j or i not in np.argsort(np.linalg.norm(nodes - nodes[j], axis=1))[1:3]:
            mid = (nodes[i] + nodes[j]) / 2 + rng.normal(size=3) * 0.8
            paths.append(bez(nodes[i], mid, nodes[j], 24))
tube('NetPaths', paths, 0.025, 'C_Network', path_m, 5)
# nodes as instanced spheres
def points_obj(name, P, rad, mat, c):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in P], [], []); me.update()
    o = bpy.data.objects.new(name, me); C[c].objects.link(o)
    ng = bpy.data.node_groups.new(name + '_GN', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = ng.nodes.new('NodeGroupInput'); go = ng.nodes.new('NodeGroupOutput')
    ico = ng.nodes.new('GeometryNodeMeshUVSphere'); ico.inputs['Radius'].default_value = rad
    iop = ng.nodes.new('GeometryNodeInstanceOnPoints')
    rv = ng.nodes.new('FunctionNodeRandomValue'); rv.inputs[2].default_value = 0.4; rv.inputs[3].default_value = 1.8
    sm = ng.nodes.new('GeometryNodeSetMaterial'); sm.inputs['Material'].default_value = mat
    ng.links.new(gi.outputs[0], iop.inputs['Points']); ng.links.new(ico.outputs['Mesh'], iop.inputs['Instance'])
    ng.links.new(rv.outputs[1], iop.inputs['Scale']); ng.links.new(iop.outputs[0], sm.inputs['Geometry']); ng.links.new(sm.outputs[0], go.inputs[0])
    o.modifiers.new('GN', 'NODES').node_group = ng
    return o
points_obj('NetNodes', nodes[2:], 0.14, node_m, 'C_Network')
hub = points_obj('NetHubs', nodes[:2], 0.5, node_m2, 'C_Network')
for i, hc in enumerate(nodes[:2]):
    ang = np.linspace(0, 2 * np.pi, 120)
    for k, r in enumerate((1.0, 1.4)):
        pts = np.stack([np.cos(ang) * r, np.zeros_like(ang), np.sin(ang) * r], 1) + hc
        tube('HubRing%d_%d' % (i, k), pts, 0.02, 'C_Network', node_m2, 6)
netdust_m = emis('E_NetDust', '#8AAEFF', 5.0, fade=False)
particle_field('NetDust', 'C_Network', 12000, (40, 45, 16), 0.012, netdust_m, tuple(NX + Vector((0, 30, 0))))
lbl_m = emis('E_Label', '#F3F6FC', 3.0)
lblA = text_obj('LblClient', 'CLIENT', 'C_Network', 0.32, 0.0, lbl_m); lblA.location = Vector(nodes[0]) + Vector((0, 0, 0.95))
lbl_m2 = emis('E_Label2', '#7BE6FF', 4.0)
lblR = text_obj('LblReq', 'DHCP REQUEST', 'C_Network', 0.32, 0.0, lbl_m2); lblR.location = Vector(nodes[0]) + Vector((0, 1.0, -1.1))
lbl_m3 = emis('E_Label3', '#2FD98B', 4.0)
lblK = text_obj('LblAck', 'DHCP ACK · NEW LEASE', 'C_Network', 0.32, 0.0, lbl_m3); lblK.location = Vector(nodes[0]) + Vector((0, 1.0, -1.1))
lblS = text_obj('LblServer', 'DHCP SERVER', 'C_Network', 0.9, 0.0, lbl_m); lblS.location = Vector(SERVER) + Vector((0, 0, 1.9))
key_val(lbl_m, F(15.5), 0); key_val(lbl_m, F(16.5), 1)
key_val(lbl_m2, F(16.8), 0); key_val(lbl_m2, F(17.2), 1); key_val(lbl_m2, F(20.6), 1); key_val(lbl_m2, F(21.0), 0)
key_val(lbl_m3, F(21.0), 0); key_val(lbl_m3, F(21.4), 1)
# pulses: requests out (17,18,19 s) client->server, ACK back (21.3 s)
req_m = emis('E_Pulse', '#C2F5FF', 80.0, fade=False); ack_m = emis('E_PulseAck', '#2FD98B', 80.0, fade=False)
def pulse(name, a, b, t0, t1, mat, size=0.22):
    o = mesh_obj(name, [], [], 'C_Network')
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=size); bm.to_mesh(o.data); bm.free()
    o.data.materials.append(mat)
    mid = (a + b) / 2 + np.array([rng.normal() * 3, 0, 3 + rng.random() * 2])
    P = bez(a, mid, b, 30)
    o.scale = (0, 0, 0); o.location = tuple(P[0]); o.keyframe_insert('scale', frame=F(t0) - 1); o.keyframe_insert('location', frame=F(t0) - 1)
    o.scale = (1, 1, 1); o.keyframe_insert('scale', frame=F(t0))
    for k, p in enumerate(P):
        o.location = tuple(p); o.keyframe_insert('location', frame=F(t0) + int((F(t1) - F(t0)) * k / (len(P) - 1)))
    o.scale = (0, 0, 0); o.keyframe_insert('scale', frame=F(t1) + 2)
    linear_all(o)
    return o
for i, t0 in enumerate((17.0, 18.0, 19.0)):
    tgt = SERVER if i == 2 else nodes[rng.integers(2, NN)]
    pulse('Req%d' % i, nodes[0], tgt, t0, t0 + 1.6, req_m)
    for k in range(3):  # broadcast fan-out sparkles
        pulse('ReqFan%d_%d' % (i, k), nodes[0], nodes[rng.integers(2, NN)], t0 + 0.05 * k, t0 + 1.2, req_m, 0.1)
pulse('Ack', SERVER, nodes[0], 20.4, 22.4, ack_m, 0.32)
# client hub flash on ACK
key_em(node_m2, F(22.2), 25); key_em(node_m2, F(22.5), 120); key_em(node_m2, F(23.4), 25)

# ---------------------------------------------------------------- scene 4: floating glass screen with UI captures
SC = Vector((-2.2, 4.2, 1.6))
def img(p):
    if os.path.exists(p): return bpy.data.images.load(p, check_existing=True)
    return None
caps = [img(os.path.join(CAP, n)) for n in ('ui_idle.png', 'ui_dhcp.png', 'ui_results.png')]
REPORT['captures'] = [bool(c) for c in caps]
def ui_mat(name, crop=None):
    m, nt, out = mat_nodes(name)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mpn = nt.nodes.new('ShaderNodeMapping')
    nt.links.new(tc.outputs['UV'], mpn.inputs[0])
    if crop: mpn.inputs['Location'].default_value = (crop[0], 0, 0); mpn.inputs['Scale'].default_value = (crop[1], 1, 1)
    texs = []
    for i, im in enumerate(caps):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = im if im else None; t.extension = 'EXTEND'
        nt.links.new(mpn.outputs[0], t.inputs[0]); texs.append(t)
    m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = 'RGBA'; m1.name = 'MIX1'
    m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.name = 'MIX2'
    nt.links.new(texs[0].outputs[0], m1.inputs[6]); nt.links.new(texs[1].outputs[0], m1.inputs[7])
    nt.links.new(m1.outputs[2], m2.inputs[6]); nt.links.new(texs[2].outputs[0], m2.inputs[7])
    e = nt.nodes.new('ShaderNodeEmission'); e.name = 'EM'; e.inputs[1].default_value = 1.0
    nt.links.new(m2.outputs[2], e.inputs[0]); nt.links.new(e.outputs[0], out.inputs[0])
    for nm, t0 in (('MIX1', 29.0), ('MIX2', 32.5)):
        s = nt.nodes[nm].inputs[0]; s.default_value = 0; s.keyframe_insert('default_value', frame=F(t0) - 1)
        s.default_value = 1; s.keyframe_insert('default_value', frame=F(t0) + 2)
    key_em(m, F(29.0) - 2, 1.0); key_em(m, F(29.0) + 1, 3.0); key_em(m, F(29.0) + 12, 1.7)  # dhcp capture is dark: lift it
    key_em(m, F(32.5) - 2, 1.7); key_em(m, F(32.5) + 1, 2.6); key_em(m, F(32.5) + 12, 1.0)
    key_em(m, F(25.0), 0.0); key_em(m, F(25.8), 1.0)
    return m
scr_m = ui_mat('E_UIScreen')
W, H = 3.2, 1.8
scr = mesh_obj('UIScreen', [(-W / 2, 0, -H / 2), (W / 2, 0, -H / 2), (W / 2, 0, H / 2), (-W / 2, 0, H / 2)], [(0, 1, 2, 3)], 'C_Screen', [(0, 0), (1, 0), (1, 1), (0, 1)], scr_m)
scr.location = SC
glass_m = pbr('M_ScreenGlass', '#0A0F1A', 0.0, 0.05)
gl = mesh_obj('UIScreenGlass', [(-W / 2 - .06, 0, -H / 2 - .06), (W / 2 + .06, 0, -H / 2 - .06), (W / 2 + .06, 0, H / 2 + .06), (-W / 2 - .06, 0, H / 2 + .06)], [(0, 1, 2, 3)], 'C_Screen', None, glass_m)
gl.location = SC + Vector((0, 0.03, 0)); s_ = gl.modifiers.new('S', 'SOLIDIFY'); s_.thickness = 0.04
edge_m = emis('E_ScreenEdge', '#4C86FF', 6.0, fade=False)
ed = mesh_obj('UIScreenEdge', [(-W / 2 - .06, 0, -H / 2 - .06), (W / 2 + .06, 0, -H / 2 - .06), (W / 2 + .06, 0, H / 2 + .06), (-W / 2 - .06, 0, H / 2 + .06)], [(0, 1, 2, 3)], 'C_Screen', None, edge_m)
ed.location = SC + Vector((0, -0.005, 0)); w_ = ed.modifiers.new('W', 'WIREFRAME'); w_.thickness = 0.012
for t0 in (29.0, 32.5): key_em(edge_m, F(t0) - 2, 6); key_em(edge_m, F(t0) + 1, 40); key_em(edge_m, F(t0) + 15, 6)
if lap.get('Laptop_Screen'):
    ls = lap['Laptop_Screen']; lm = ui_mat('E_LaptopUI', (0.05, 0.9))
    ls.data.materials.clear(); ls.data.materials.append(lm)

# ---------------------------------------------------------------- scene 5: brand ring + tagline
brand_m = emis('E_BrandRing', '#2F6BFF', 0.0, fade=False)
ang = np.linspace(0, 2 * np.pi, 240)
br_pts = np.stack([np.cos(ang) * 1.25, np.sin(ang) * 1.25, np.zeros_like(ang)], 1) + np.array(RCTR)
br = tube('BrandRing', br_pts, 0.018, 'C_Brand', brand_m, 8)
br2_m = emis('E_BrandRing2', '#7BE6FF', 0.0, fade=False)
br2 = tube('BrandRing2', br_pts * np.array([1.12, 1.12, 1]) + np.array(RCTR) * np.array([-0.12, -0.12, 0]), 0.006, 'C_Brand', br2_m, 6)
key_em(brand_m, F(36.6), 0); key_em(brand_m, F(37.3), 40); key_em(brand_m, F(38.5), 12)
key_em(br2_m, F(36.9), 0); key_em(br2_m, F(37.6), 20); key_em(br2_m, F(38.5), 8)
for o in (br, br2):
    o.rotation_mode = 'XYZ'
tag_m = emis('E_Tag', '#F3F6FC', 3.0)
tag = text_obj('Tagline', 'YOUR NETWORK. YOUR CONTROL.', 'C_Brand', 0.16, 0.0, tag_m)
tag.location = (RCTR.x, RCTR.y - 1.4, RTOP + 0.8)
key_val(tag_m, F(37.8), 0); key_val(tag_m, F(38.3), 1); key_val(tag_m, F(39.2), 1); key_val(tag_m, F(39.5), 0)
# router dims behind the final logo via a dark veil? keep: lights fade instead

# ---------------------------------------------------------------- world: HDRI lighting (camera sees void) + volumetric fog
world = bpy.data.worlds.new('W_Studio'); world.use_nodes = True; wn = world.node_tree; wn.nodes.clear()
wo = wn.nodes.new('ShaderNodeOutputWorld')
bg = wn.nodes.new('ShaderNodeBackground'); bg.inputs[1].default_value = 0.35; bg.name = 'BG'
if os.path.exists(HDR):
    et = wn.nodes.new('ShaderNodeTexEnvironment'); et.image = bpy.data.images.load(HDR); wn.links.new(et.outputs[0], bg.inputs[0])
else: bg.inputs[0].default_value = srgb('#0A1228')
void = wn.nodes.new('ShaderNodeBackground'); void.inputs[0].default_value = srgb('#03050A'); void.inputs[1].default_value = 1
lpth = wn.nodes.new('ShaderNodeLightPath'); mx = wn.nodes.new('ShaderNodeMixShader')
wn.links.new(lpth.outputs['Is Camera Ray'], mx.inputs[0]); wn.links.new(bg.outputs[0], mx.inputs[1]); wn.links.new(void.outputs[0], mx.inputs[2])
wn.links.new(mx.outputs[0], wo.inputs['Surface'])
vs = wn.nodes.new('ShaderNodeVolumePrincipled'); vs.inputs['Density'].default_value = 0.0035; vs.inputs['Anisotropy'].default_value = 0.55
vs.inputs['Color'].default_value = srgb('#8AAEFF')
wn.links.new(vs.outputs[0], wo.inputs['Volume'])
bpy.data.worlds['W_Studio'].node_tree.nodes['BG'].inputs[1].default_value = 0.0
bg.inputs[1].keyframe_insert('default_value', frame=F(0.8))
bg.inputs[1].default_value = 0.45; bg.inputs[1].keyframe_insert('default_value', frame=F(5.0))

# ---------------------------------------------------------------- lights
def area(name, c, loc, rot, color, energy, size=1.0, kind='AREA'):
    ld = bpy.data.lights.new(name, kind); ld.color = srgb(color)[:3]; ld.energy = energy
    if kind == 'AREA': ld.size = size
    if kind == 'SPOT': ld.spot_size = math.radians(40); ld.spot_blend = 0.6
    if kind == 'POINT': ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]; C[c].objects.link(o)
    return o
def light_key(o, frame, e):
    o.data.energy = e; o.data.keyframe_insert('energy', frame=frame)
def look(o, target):
    d = Vector(target) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

# S1: blue point -> rim sweep -> key
bp = area('L1_BluePoint', 'C_L1', RCTR + Vector((0, -0.9, 0.05)), (0, 0, 0), '#2F6BFF', 0, 0.02, 'POINT')
light_key(bp, F(0.5), 0); light_key(bp, F(1.1), 25); light_key(bp, F(6), 40)
bpd = mesh_obj('BluePointGlow', [], [], 'C_L1'); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.012); bm.to_mesh(bpd.data); bm.free()
bpg = emis('E_BluePoint', '#4C86FF', 0.0, fade=False); bpd.data.materials.append(bpg); bpd.location = bp.location
key_em(bpg, F(0.5), 0); key_em(bpg, F(1.0), 300); key_em(bpg, F(3.0), 120); key_em(bpg, F(5.5), 0)
rim_piv = empty('RimPivot', 'C_L1', RCTR)
rim = area('L1_Rim', 'C_L1', RCTR + Vector((0, 2.2, 0.9)), (0, 0, 0), '#2F6BFF', 0, 1.6); rim.parent = rim_piv; rim.location = (0, 2.2, 0.9)
look(rim, Vector((0, 0, 0)) + Vector((0, 0, 0)))
rim.rotation_euler = (Vector((0, 0, 0)) - Vector((0, 2.2, 0.9))).to_track_quat('-Z', 'Y').to_euler()
key(rim_piv, F(1.2), rot=(0, 0, math.radians(-80))); key(rim_piv, F(6), rot=(0, 0, math.radians(70)))
light_key(rim, F(1.0), 0); light_key(rim, F(2.5), 350); light_key(rim, F(6), 350)
key1 = area('L1_Key', 'C_L1', RCTR + Vector((-1.6, -1.8, 2.2)), (0, 0, 0), '#DCE6FF', 0, 1.5); look(key1, RCTR)
light_key(key1, F(2.5), 0); light_key(key1, F(5.5), 220)
cy1 = area('L1_LogoLight', 'C_L1', logoA.location + Vector((0, -1.5, 0.6)), (0, 0, 0), '#7BE6FF', 0, 1.0); look(cy1, logoA.location)
light_key(cy1, F(3.4), 0); light_key(cy1, F(5.4), 25)
# S2 / S4 shared studio rig
def rig(c, prefix, scale=1.0):
    k = area(prefix + '_Key', c, RCTR + Vector((-2.0, -2.4, 3.0)), (0, 0, 0), '#DCE6FF', 380 * scale, 2.0); look(k, RCTR)
    r = area(prefix + '_Rim', c, RCTR + Vector((0.5, 2.6, 1.2)), (0, 0, 0), '#2F6BFF', 900 * scale, 2.0); look(r, RCTR)
    f = area(prefix + '_Fill', c, RCTR + Vector((-3.0, 0.5, 0.6)), (0, 0, 0), '#7A4DFF', 120 * scale, 2.0); look(f, RCTR)
    s = area(prefix + '_Spot', c, Vector((LAP_POS.x, LAP_POS.y, LAP_Z + 3.5)), (0, 0, 0), '#8AAEFF', 600 * scale, 0.3, 'SPOT'); look(s, (LAP_POS.x, LAP_POS.y, LAP_Z))
    s2 = area(prefix + '_SpotR', c, RCTR + Vector((0, 0, 3.6)), (0, 0, 0), '#4C86FF', 700 * scale, 0.3, 'SPOT'); look(s2, RCTR)
    return k, r, f, s, s2
rig('C_L2', 'L2'); l4 = rig('C_L4', 'L4', 0.6)
lt4 = area('L4_ScreenSpill', 'C_L4', SC + Vector((0, -1.2, 0)), (0, 0, 0), '#4C86FF', 150, 3.0); look(lt4, SC + Vector((0, 3, 0)))
# S3: network lit mostly by emission; faint fill
area('L3_Fill', 'C_L3', NX + Vector((0, 10, 12)), (0, 0, 0), '#4C86FF', 3000, 10)
# S5
r5 = area('L5_Rim', 'C_L5', RCTR + Vector((0, 2.4, 1.0)), (0, 0, 0), '#2F6BFF', 0, 2.0); look(r5, RCTR)
light_key(r5, F(36), 300); light_key(r5, F(37.3), 1200); light_key(r5, F(39.4), 900); light_key(r5, F(40.0), 250)
k5 = area('L5_Key', 'C_L5', RCTR + Vector((-1.5, -2.5, 2.5)), (0, 0, 0), '#DCE6FF', 0, 1.5); look(k5, RCTR)
light_key(k5, F(36), 120); light_key(k5, F(39.4), 120); light_key(k5, F(40.0), 20)
lb = area('L5_Logo', 'C_L5', logoB.location + Vector((0, -2.0, 0.8)), (0, 0, 0), '#7BE6FF', 0, 1.5); look(lb, logoB.location)
light_key(lb, F(39.4), 0); light_key(lb, F(39.8), 60)
ringlight = area('L5_RingGlow', 'C_L5', RCTR + Vector((0, 0, 0.05)), (0, 0, 0), '#2F6BFF', 0, 1.2, 'POINT')
light_key(ringlight, F(36.6), 0); light_key(ringlight, F(37.3), 400); light_key(ringlight, F(38.5), 150)

# ---------------------------------------------------------------- cameras
def camera(name, lens=50, fstop=2.0):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    cd.clip_start = 0.05; cd.clip_end = 400
    o = bpy.data.objects.new(name, cd); C['C_Cams'].objects.link(o)
    tgt = empty(name + '_Target', 'C_Cams'); cd.dof.focus_object = tgt
    tc = o.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
    return o, tgt
def orbit(c, r, ang_deg, h):
    a = math.radians(ang_deg); return (c.x + r * math.sin(a), c.y - r * math.cos(a), c.z + h)

cam1, t1 = camera('CAM_S1', 50, 2.8)
for sec, ang, r, h, tz in ((0, -40, 4.6, 0.25, 0.0), (3.0, -15, 4.2, 0.4, 0.1), (6.0, 12, 4.4, 0.7, 0.55)):
    key(cam1, F(sec), loc=orbit(RCTR, r, ang, h)); key(t1, F(sec), loc=tuple(RCTR + Vector((0, 0, tz))))
key(t1, F(6.0), loc=tuple((RCTR + logoA.location) / 2))
cam2, t2 = camera('CAM_S2', 40, 2.8)
mid = (RCTR + LAP_POS) / 2
for sec, loc, tg in ((6.0, orbit(RCTR, 3.2, 25, 0.6), RCTR), (9.5, orbit(RCTR, 4.6, -10, 1.0), RCTR + Vector((-0.6, 0.2, 0))),
                     (12.0, orbit(mid, 5.2, -30, 1.4), mid + Vector((0, 0, 0.3))), (13.6, orbit(RCTR, 3.0, -5, 1.0), WIFI_C),
                     (15.0, tuple(WIFI_C + Vector((0, -0.05, -0.02))), WIFI_C + Vector((0, 2, 0)))):
    key(cam2, F(sec), loc=loc); key(t2, F(sec), loc=tuple(tg))
cam3, t3 = camera('CAM_S3', 28, 4.0)
c0 = Vector(nodes[0])
for sec, loc, tg in ((15.0, c0 + Vector((0, -6, 0.6)), c0 + Vector((0, 10, 0))), (17.0, c0 + Vector((-3, -5, 2.0)), c0 + Vector((0, 4, 0.5))),
                     (20.0, c0 + Vector((-9, 1, 6.5)), c0 + Vector((1, 18, 1))), (22.6, c0 + Vector((4, -7, 2.5)), c0),
                     (25.0, c0 + Vector((2, -4.5, 1.2)), c0)):
    key(cam3, F(sec), loc=tuple(loc)); key(t3, F(sec), loc=tuple(tg))
cam4, t4 = camera('CAM_S4', 45, 3.2)
for sec, loc, tg in ((25.0, SC + Vector((-2.4, -5.2, -0.2)), SC + Vector((-0.4, 0, -0.4))), (28.8, SC + Vector((-0.6, -3.6, 0.0)), SC),
                     (29.15, SC + Vector((-0.5, -3.3, 0.0)), SC), (32.4, SC + Vector((0.7, -3.4, 0.1)), SC), (36.0, SC + Vector((0.1, -2.8, 0.05)), SC)):
    key(cam4, F(sec), loc=tuple(loc)); key(t4, F(sec), loc=tuple(tg))
cam5, t5 = camera('CAM_S5', 50, 2.2)
T5 = Vector((RCTR.x, RCTR.y - 1.0, (RCTR.z + RTOP + 0.8) / 2 + 0.1))
for sec, loc, tg in ((36.0, orbit(RCTR, 2.3, -20, 0.6), RCTR), (38.0, orbit(RCTR, 4.6, -4, 0.6), T5), (39.3, orbit(RCTR, 5.2, 0, 0.6), T5),
                     (42.0, orbit(RCTR, 5.5, 0, 0.6), T5)):
    key(cam5, F(sec), loc=loc); key(t5, F(sec), loc=tuple(tg))

# transition flash card in front of S2 end / S3 start
flash_m = emis('E_Flash', '#C2F5FF', 30.0)
for cam, a, b in ((cam2, (14.5, 0.0), (15.0, 1.0)), (cam3, (15.0, 1.0), (15.6, 0.0))):
    fc = mesh_obj('Flash_' + cam.name, [(-1, -1, -0.2), (1, -1, -0.2), (1, 1, -0.2), (-1, 1, -0.2)], [(0, 1, 2, 3)], 'C_Cams', None, flash_m)
    fc.parent = cam
key_val(flash_m, F(14.55), 0.0); key_val(flash_m, F(15.0), 1.0); key_val(flash_m, F(15.6), 0.0)

# ---------------------------------------------------------------- scenes, render settings, compositor
def vignette_image():
    w, h = 1920, 1080
    y, x = np.mgrid[0:h, 0:w]; nx = (x / w - 0.5) * 2; ny = (y / h - 0.5) * 2
    v = 1 - 0.38 * np.clip((nx ** 2 * 0.8 + ny ** 2) - 0.25, 0, None) ** 1.3
    v = np.clip(v, 0, 1).astype(np.float32)
    im = bpy.data.images.new('Vignette', w, h, alpha=True, float_buffer=True)
    px = np.stack([v, v, v, np.ones_like(v)], -1).ravel(); im.pixels.foreach_set(px); im.pack()
    return im
vig = vignette_image()
def make_comp(sc):
  comp = bpy.data.node_groups.new('IPS_Post_' + sc.name, 'CompositorNodeTree')
  comp.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
  rl = comp.nodes.new('CompositorNodeRLayers'); rl.scene = sc
  gl_ = comp.nodes.new('CompositorNodeGlare')
  setin(gl_, 'Type', 'Bloom'); setin(gl_, 'Threshold', 0.8); setin(gl_, 'Strength', 0.9); setin(gl_, 'Size', 0.75)
  ld_ = comp.nodes.new('CompositorNodeLensdist'); setin(ld_, 'Distortion', -0.015); setin(ld_, 'Dispersion', 0.012); setin(ld_, 'Fit', True)
  vi = comp.nodes.new('CompositorNodeImage'); vi.image = vig
  mu = comp.nodes.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'; mu.inputs[0].default_value = 1.0
  go = comp.nodes.new('NodeGroupOutput')
  comp.links.new(rl.outputs['Image'], gl_.inputs['Image']); comp.links.new(gl_.outputs[0], ld_.inputs['Image'])
  comp.links.new(ld_.outputs[0], mu.inputs[6]); comp.links.new(vi.outputs[0], mu.inputs[7]); comp.links.new(mu.outputs[2], go.inputs[0])
  return comp
def setin(n, k, v):
    try: n.inputs[k].default_value = v
    except Exception as e: print('SETIN FAIL', k, v, e)

LINKS = {'S1_Reveal': ['C_Router', 'C_Pedestals', 'C_LogoA', 'C_Particles', 'C_L1', 'C_Cams'],
         'S2_Network': ['C_Router', 'C_Pedestals', 'C_Laptop', 'C_Holo', 'C_Particles', 'C_L2', 'C_Cams'],
         'S3_Technology': ['C_Network', 'C_L3', 'C_Cams'],
         'S4_Product': ['C_Screen', 'C_Laptop', 'C_Pedestals', 'C_Router', 'C_Particles', 'C_L4', 'C_Cams'],
         'S5_Brand': ['C_Router', 'C_Brand', 'C_LogoB', 'C_Particles', 'C_L5', 'C_Cams']}
CAMS = {'S1_Reveal': cam1, 'S2_Network': cam2, 'S3_Technology': cam3, 'S4_Product': cam4, 'S5_Brand': cam5}
for i, (nm, a, b) in enumerate(SCENES):
    sc = base if i == 0 else bpy.data.scenes.new(nm)
    for cn in LINKS[nm]: sc.collection.children.link(C[cn])
    sc.world = world; sc.camera = CAMS[nm]
    sc.frame_start = F(a); sc.frame_end = F(b) - 1
    r = sc.render; r.engine = 'BLENDER_EEVEE'; r.fps = FPS; r.resolution_x = 1920; r.resolution_y = 1080; r.resolution_percentage = 100
    r.use_motion_blur = True; r.motion_blur_shutter = 0.5
    e = sc.eevee; e.taa_render_samples = int(os.environ.get('FILM_SAMPLES', '16'))
    e.use_raytracing = False; e.volumetric_tile_size = '8'; e.volumetric_samples = 48; e.use_volumetric_shadows = True
    e.volumetric_end = 120
    try: e.use_shadows = True
    except Exception: pass
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    sc.compositing_node_group = make_comp(sc)
    try: r.use_compositing = True
    except Exception: pass
    ims = r.image_settings; ims.media_type = 'VIDEO'; ims.file_format = 'FFMPEG'
    r.ffmpeg.format = 'MPEG4'; r.ffmpeg.codec = 'H264'; r.ffmpeg.constant_rate_factor = 'PERC_LOSSLESS'
    r.ffmpeg.ffmpeg_preset = 'GOOD'; r.ffmpeg.audio_codec = 'NONE'
    r.filepath = os.path.join(FILM, 'renders', 'seg%d_' % (i + 1))
    # hide flash cards of other cams
for o in C['C_Cams'].objects:
    if o.type == 'CAMERA': o.data.sensor_width = 36
bpy.context.window_manager  # noqa
os.makedirs(os.path.join(FILM, 'source'), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(FILM, 'source', 'ip_shift_launch.blend'))
# Keep the project file portable and private: relative external paths, relative render output.
for _sc in bpy.data.scenes:
    if _sc.render.filepath and not _sc.render.filepath.startswith('//'):
        _sc.render.filepath = '//../renders/' + os.path.basename(_sc.render.filepath.rstrip('/'))
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_mainfile()
print('BUILD_REPORT', REPORT, 'FPS', FPS)
