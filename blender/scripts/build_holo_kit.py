"""IP SHIFT holographic kit: Wi-Fi symbol, network node, energy rings, particle, glass panel,
signal wave and network pathway. Pieces are laid out along X for the preview; each node's
origin is its own centre so the web/film can re-place them freely."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Matrix
import lib_common as L

L.reset()
C = L.collection("HoloKit")
H = L.mat_emit("H_Holo", "#35D6FF")
HG = L.mat_pbr("H_HoloGlass", "#7BE6FF", 0.0, 0.05, coat=1.0, alpha=0.18)

def place(o, loc):
    o.location = loc
    return o

def bevel_apply(o, w, seg=2, ang=30):
    L.bevel(o, w, seg, ang); L.apply_mods(o)

# ---------------------------------------------------------------- Wi-Fi symbol (upright, faces -Y)
wifi = L.empty("Holo_WiFi", C, loc=(0, 0, 0.35))
def sector(r0, r1, a0=45, a1=135, n=40):
    rm, hw = (r0 + r1) / 2, (r1 - r0) / 2
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); pts.append((r1 * math.cos(a), r1 * math.sin(a)))
    ca = math.radians(a1)
    for i in range(1, 12):
        t = math.pi * i / 12
        cx, cy = rm * math.cos(ca), rm * math.sin(ca)
        pts.append((cx + hw * math.cos(ca + t), cy + hw * math.sin(ca + t)))
    for i in range(n + 1):
        a = math.radians(a1 - (a1 - a0) * i / n); pts.append((r0 * math.cos(a), r0 * math.sin(a)))
    ca = math.radians(a0)
    for i in range(1, 12):
        t = math.pi * i / 12
        cx, cy = rm * math.cos(ca), rm * math.sin(ca)
        pts.append((cx + hw * math.cos(ca + math.pi + t), cy + hw * math.sin(ca + math.pi + t)))
    return pts
OFF = -0.17  # symbol centre so the whole glyph is centred on the node origin
for i, (r0, r1) in enumerate([(0.085, 0.13), (0.175, 0.22), (0.265, 0.31)], 1):
    pts = [(x, y + OFF) for x, y in sector(r0, r1)]
    o = L.axis_prism(f"Holo_WiFi_Arc{i}", pts, -0.016, 0.016, 'Y', C)
    bevel_apply(o, 0.004, 3, 30); L.assign(o, H); L.shade_smooth(o, 35)
    o.parent = wifi
dot = L.axis_prism("Holo_WiFi_Dot", L.circle(0.035, 48, 0, OFF), -0.016, 0.016, 'Y', C)
bevel_apply(dot, 0.004, 3, 30); L.assign(dot, H); L.shade_smooth(dot, 35); dot.parent = wifi

# ---------------------------------------------------------------- network node: glass shell + core
def ico(name, r, sub):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); C.objects.link(o); return o
node = ico("Holo_Node", 0.08, 4); L.assign(node, HG); L.shade_smooth(node, 80)
core = ico("Holo_Node_Core", 0.032, 1); L.assign(core, H)
cage = ico("cage", 0.058, 1)
# wire cage: thin struts around the core
bm = bmesh.new(); bm.from_mesh(cage.data)
bmesh.ops.wireframe(bm, faces=bm.faces, thickness=0.003, offset=0.0, use_replace=True)
bm.to_mesh(cage.data); bm.free()
L.assign(cage, H)
core = L.join([core, cage], "Holo_Node_Core")
core.parent = node
place(node, (0.75, 0, 0.35))

# ---------------------------------------------------------------- energy rings
def ring_path(r, n=192):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), 0) for i in range(n + 1)]
def rect_prof(w, h):
    return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
ra = L.sweep("Holo_Ring_A", ring_path(0.5), rect_prof(0.012, 0.003), C, up_hint=(0, 0, 1))
rb = L.sweep("Holo_Ring_B", ring_path(0.38), rect_prof(0.004, 0.006), C, up_hint=(0, 0, 1))
for o in (ra, rb):
    L.assign(o, H); L.shade_smooth(o, 30)
segs = []
for i in range(40):
    a0 = 2 * math.pi * i / 40; a1 = a0 + 2 * math.pi / 40 * 0.7
    pth = [(0.6 * math.cos(a0 + (a1 - a0) * k / 6), 0.6 * math.sin(a0 + (a1 - a0) * k / 6), 0) for k in range(7)]
    segs.append(L.sweep("s", pth, rect_prof(0.02, 0.004), C, cap=True))
rs = L.join(segs, "Holo_Ring_Segmented"); L.assign(rs, H)
for o in (ra, rb, rs):
    place(o, (-1.4, 0, 0.0))

# ---------------------------------------------------------------- particle (octahedron)
pv = [(0.01, 0, 0), (-0.01, 0, 0), (0, 0.01, 0), (0, -0.01, 0), (0, 0, 0.016), (0, 0, -0.016)]
pf = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
part = L.mesh_obj("Holo_Particle", pv, pf, C); L.fix_normals(part); L.assign(part, H)
place(part, (0.75, 0, 0.6))

# ---------------------------------------------------------------- glass panel 1 x 0.56, UV 0-1
pan = L.axis_loft("Holo_Panel", [(L.rrect(1.0, 0.56, 0.045, 10), -0.004), (L.rrect(1.0, 0.56, 0.045, 10), 0.004)], 'Y', C)
bevel_apply(pan, 0.002, 2, 30)
uvl = pan.data.uv_layers.new(name="UVMap")
for loop in pan.data.loops:
    v = pan.data.vertices[loop.vertex_index].co
    uvl.data[loop.index].uv = ((v.x + 0.5) / 1.0, (v.z + 0.28) / 0.56)
L.assign(pan, HG)
edge = L.axis_loft("panel_edge", [(L.rrect(1.004, 0.564, 0.047, 10), -0.0045), (L.rrect(1.004, 0.564, 0.047, 10), 0.0045)], 'Y', C)
inner = L.axis_loft("pe_i", [(L.rrect(0.996, 0.556, 0.043, 10), -0.01), (L.rrect(0.996, 0.556, 0.043, 10), 0.01)], 'Y', C)
L.boolean(edge, inner); L.delete(inner); L.assign(edge, H)
pan = L.join([pan, edge], "Holo_Panel")
place(pan, (0, 0.6, 1.1))

# ---------------------------------------------------------------- signal wave arc (U along length)
wv = [(0.35 * math.cos(math.radians(a)), 0, 0.35 * math.sin(math.radians(a))) for a in np.linspace(35, 145, 96)]
wave = L.sweep("Holo_Wave", wv, [(-0.0025, -0.012), (0.0025, -0.012), (0.0025, 0.012), (-0.0025, 0.012)], C, up_hint=(0, 1, 0))
L.assign(wave, H); L.shade_smooth(wave, 30)
place(wave, (1.5, 0, 0.1))

# ---------------------------------------------------------------- network pathway tube (U along length)
t = np.linspace(0, 1, 160)
p0, p1, p2, p3 = np.array([-0.9, 0, 0]), np.array([-0.4, -0.3, 0.55]), np.array([0.4, 0.3, 0.55]), np.array([0.9, 0, 0])
bez = ((1 - t) ** 3)[:, None] * p0 + (3 * (1 - t) ** 2 * t)[:, None] * p1 + (3 * (1 - t) * t ** 2)[:, None] * p2 + (t ** 3)[:, None] * p3
path = L.sweep("Holo_Path", bez, L.tube_profile(0.006, 10), C)
L.assign(path, H); L.shade_smooth(path, 60)
place(path, (0, -0.4, 0.0))

for o in list(C.objects):
    if o.parent is None:
        pass
L.save_blend("holo_kit")
pth, tris = L.export_glb(C, "holo_kit")
L.validate_glb(pth, ["Holo_WiFi", "Holo_WiFi_Arc1", "Holo_WiFi_Arc2", "Holo_WiFi_Arc3", "Holo_WiFi_Dot",
                     "Holo_Node", "Holo_Ring_A", "Holo_Ring_B", "Holo_Ring_Segmented", "Holo_Particle",
                     "Holo_Panel", "Holo_Wave", "Holo_Path"], ["H_Holo"])
for o in C.objects:
    if o.type == 'MESH':
        print(f"  {o.name:20s} tris={L.tri_count(o)}")
