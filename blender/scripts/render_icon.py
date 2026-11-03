"""App icon 1024x1024: IP SHIFT logo mark (isometric hex cube with one shifted face,
gradient #7BE6FF -> #2F6BFF) on a deep navy macOS squircle (824 px), transparent outside,
blue rim light. Flat emission shading with vertex colours, orthographic EEVEE render."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
import lib_common as L

L.reset()
C = L.collection("Icon")
S = 824 / 1024 / 2  # squircle half-size in metres (1 m = 1024 px)

def lin(h):
    return np.array(L.hexc(h)[:3])

def vc_mat(name, alpha=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ca.outputs["Color"], em.inputs["Color"])
    if alpha:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mx = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(ca.outputs["Alpha"], mx.inputs[0])
        nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
        m.surface_render_method = 'BLENDED'
    else:
        nt.links.new(em.outputs[0], out.inputs[0])
    return m

def mesh_vc(name, verts, faces, cols, z, mat):
    o = L.mesh_obj(name, [(x, y, z) for x, y in verts], faces, C)
    me = o.data
    ca = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols):
        ca.data[i].color = (c[0], c[1], c[2], c[3] if len(c) > 3 else 1.0)
    L.assign(o, mat)
    return o

def squircle(k, n=256, p=5.0):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        pts.append((k * S * math.copysign(abs(c) ** (2 / p), c), k * S * math.copysign(abs(s) ** (2 / p), s)))
    return pts

def fan_rings(scales, colfn, z, mat, name, n=256):
    verts, cols, faces = [], [], []
    rings = [squircle(k, n) for k in scales]
    for r in rings:
        for (x, y) in r:
            verts.append((x, y)); cols.append(colfn(x, y))
    for a in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((a * n + i, a * n + j, (a + 1) * n + j, (a + 1) * n + i))
    return mesh_vc(name, verts, faces, cols, z, mat)

MAT = vc_mat("IconFlat"); MATA = vc_mat("IconAlpha", alpha=True)
top, bot = lin("#13224A"), lin("#04070F")
def bg(x, y):
    t = (y / S + 1) / 2
    c = bot * (1 - t) + top * t
    g = math.exp(-((x + 0.02) ** 2 + (y - 0.05) ** 2) / 0.06)      # soft central bloom
    c = c + lin("#1A3C8F") * 0.55 * g
    return (*c, 1)
scales = [0.0001] + list(np.linspace(0.05, 0.97, 30))
fan_rings(scales, bg, 0.0, MAT, "Squircle")
# rim: brighter on the upper-left (key) and right (blue rim)
def rim(x, y):
    a = math.atan2(y, x)
    k = 0.35 + 0.65 * max(0, math.cos(a - math.radians(120))) ** 2 + 0.5 * max(0, math.cos(a)) ** 4
    return (*(lin("#2F6BFF") * 0.10 + lin("#7BE6FF") * 0.28 * k), 1)
def rim_in(x, y):
    a = math.atan2(y, x)
    k = 0.35 + 0.65 * max(0, math.cos(a - math.radians(120))) ** 2 + 0.5 * max(0, math.cos(a)) ** 4
    c = bot * 0.6 + lin("#2F6BFF") * 0.12 * k
    return (*c, 1)
r = fan_rings([0.975, 0.993], lambda x, y: rim_in(x, y) if abs(x) ** 5 + abs(y) ** 5 < (0.98 * S) ** 5 else rim(x, y), 0.0005, MAT, "Rim")
edge = fan_rings([0.993, 1.0], rim, 0.0006, MAT, "RimEdge")

# glow behind the mark
gv, gc, gf = [(0, 0.0)], [(*lin("#2F6BFF") * 0.9, 0.55)], []
n = 96
for ring, (rad, a) in enumerate([(0.12, 0.35), (0.24, 0.12), (0.34, 0.0)]):
    for i in range(n):
        t = 2 * math.pi * i / n
        gv.append((rad * math.cos(t), rad * math.sin(t))); gc.append((*lin("#2F6BFF") * 0.9, a))
for i in range(n):
    gf.append((0, 1 + i, 1 + (i + 1) % n))
for ring in range(2):
    a0, b0 = 1 + ring * n, 1 + (ring + 1) * n
    for i in range(n):
        j = (i + 1) % n
        gf.append((a0 + i, a0 + j, b0 + j, b0 + i))
mesh_vc("Glow", gv, gf, gc, 0.001, MATA)

# isometric hex cube with one shifted face
RH = 0.205
P = {a: (RH * math.cos(math.radians(a)), RH * math.sin(math.radians(a)) + 0.0) for a in (30, 90, 150, 210, 270, 330)}
O = (0.0, 0.0)
faces = {"top": [O, P[30], P[90], P[150]], "left": [O, P[150], P[210], P[270]], "right": [O, P[270], P[330], P[30]]}
shade = {"top": 1.15, "left": 0.85, "right": 0.62}
shift = {"right": (0.034 * math.cos(math.radians(-30)), 0.034 * math.sin(math.radians(-30)))}
g0, g1 = lin("#7BE6FF"), lin("#2F6BFF")
def grad(x, y, k):
    t = np.clip(((-x + y) / (2 * RH) * -1 + 0.5), 0, 1)     # top-left bright -> bottom-right deep
    c = (g0 * (1 - t) + g1 * t) * k
    return (*c, 1)
for name, quad in faces.items():
    cx = sum(p[0] for p in quad) / 4; cy = sum(p[1] for p in quad) / 4
    q = [(cx + (x - cx) * 0.91, cy + (y - cy) * 0.91) for x, y in quad]
    dx, dy = shift.get(name, (0, 0))
    q = [(x + dx, y + dy) for x, y in q]
    # subdivide for smooth gradient
    N = 12
    verts, cols, fcs = [], [], []
    for i in range(N + 1):
        for j in range(N + 1):
            u, v = i / N, j / N
            a = (q[0][0] * (1 - u) + q[1][0] * u, q[0][1] * (1 - u) + q[1][1] * u)
            b = (q[3][0] * (1 - u) + q[2][0] * u, q[3][1] * (1 - u) + q[2][1] * u)
            x, y = a[0] * (1 - v) + b[0] * v, a[1] * (1 - v) + b[1] * v
            verts.append((x, y)); cols.append(grad(x, y, shade[name]))
    for i in range(N):
        for j in range(N):
            k = i * (N + 1) + j
            fcs.append((k, k + N + 1, k + N + 2, k + 1))
    o = mesh_vc("Face_" + name, verts, fcs, cols, 0.003 if name == "right" else 0.002, MAT)
    L.fix_normals(o)

cam = L.camera("IconCam", (0, 0, 2), (0, 0, 0))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.0
cam.rotation_euler = (0, 0, 0)
scn = bpy.context.scene
scn.world = bpy.data.worlds.new("none"); scn.world.color = (0, 0, 0)
L.use_eevee(16)
scn.view_settings.view_transform = 'Standard'; scn.view_settings.exposure = 0
scn.render.film_transparent = True
scn.render.resolution_x = scn.render.resolution_y = 1024
scn.render.image_settings.file_format = 'PNG'
scn.render.image_settings.color_mode = 'RGBA'
out = os.path.join(L.ICON, "icon_1024.png")
scn.render.filepath = out
bpy.ops.render.render(write_still=True)
print("ICON", out, os.path.getsize(out))
