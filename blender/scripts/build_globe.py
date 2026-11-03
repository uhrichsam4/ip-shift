"""IP SHIFT holographic globe, radius 1.0 m: dotted Earth (Fibonacci dots kept only on land),
faint 30-degree graticule, great-circle network arcs between real cities (U along length),
and a fresnel atmosphere shell. Root at globe centre (it floats).

Land source: blender/source/data/ne_110m_land.geojson (Natural Earth, public domain) when
present, otherwise the hand-authored blender/source/data/land_coarse.geojson."""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
import lib_common as L

L.reset()
C = L.collection("Globe")
MD = L.mat_emit("H_GlobeDots", "#35D6FF")
MG = L.mat_emit("H_GlobeGrid", "#123A8C")
MA = L.mat_emit("H_GlobeArcs", "#7BE6FF")
R = 1.0
DATA = os.path.join(L.SRC, "data")

# ---------------------------------------------------------------- land polygons
src = os.path.join(DATA, "ne_110m_land.geojson")
if not os.path.exists(src):
    src = os.path.join(DATA, "land_coarse.geojson")
print("LAND SOURCE", os.path.basename(src))
rings = []
for f in json.load(open(src))["features"]:
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for poly in polys:
        rings.append(np.asarray(poly[0], dtype=float))   # outer ring only (holes are tiny lakes)

def on_land(lon, lat):
    inside = np.zeros(lon.shape, bool)
    for ring in rings:
        x, y = ring[:, 0], ring[:, 1]
        mn, mx = ring.min(0), ring.max(0)
        m = (lon >= mn[0]) & (lon <= mx[0]) & (lat >= mn[1]) & (lat <= mx[1])
        if not m.any():
            continue
        px, py = lon[m], lat[m]
        c = np.zeros(px.shape, bool)
        x0, y0 = x, y
        x1, y1 = np.roll(x, -1), np.roll(y, -1)
        for a, b, c2, d in zip(x0, y0, x1, y1):
            cond = ((b > py) != (d > py)) & (px < (c2 - a) * (py - b) / (d - b + 1e-12) + a)
            c ^= cond
        inside[m] |= c
    return inside

# ---------------------------------------------------------------- dots
n = 52000
i = np.arange(n) + 0.5
phi = np.arccos(1 - 2 * i / n)
th = math.pi * (1 + 5 ** 0.5) * i
P = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
lat = np.degrees(np.arcsin(P[:, 2]))
lon = np.degrees(np.arctan2(P[:, 1], P[:, 0]))
keep = on_land(lon, lat) & (lat > -62)
P = P[keep]
print("dots", len(P))
rd = 0.0042
up = np.array([0, 0, 1.0])
a = np.cross(P, up); a[np.linalg.norm(a, axis=1) < 1e-4] = (1, 0, 0)
a /= np.linalg.norm(a, axis=1, keepdims=True); b = np.cross(P, a)
V = np.concatenate([P * R + rd * (math.cos(t) * a + math.sin(t) * b)
                    for t in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)], 1).reshape(-1, 3)
F = (np.arange(len(P))[:, None] * 4 + np.arange(4)[None, :])
dots = L.mesh_obj("Globe_Dots", V, F, C)
L.assign(dots, MD)

# ---------------------------------------------------------------- faint graticule (every 30 deg)
w = 0.0011
def band(name, pts):
    pts = np.asarray(pts)
    nrm = pts / np.linalg.norm(pts, axis=1, keepdims=True)
    t = np.gradient(pts, axis=0); t /= np.linalg.norm(t, axis=1, keepdims=True)
    return L.sweep(name, pts, [(-w, 0), (w, 0)], C, closed_profile=False, frames=(np.cross(nrm, t), nrm))
grid = []
for la in (-60, -30, 0, 30, 60):
    z = math.sin(math.radians(la)); r = math.cos(math.radians(la))
    grid.append(band("lat", [(1.001 * r * math.cos(t), 1.001 * r * math.sin(t), 1.001 * z) for t in np.linspace(0, 2 * math.pi, 121)]))
for lo in range(0, 180, 30):
    al = math.radians(lo)
    grid.append(band("lon", [(1.001 * math.cos(t) * math.cos(al), 1.001 * math.cos(t) * math.sin(al), 1.001 * math.sin(t))
                             for t in np.linspace(0, 2 * math.pi, 121)]))
g = L.join(grid, "Globe_Grid"); L.assign(g, MG)

# ---------------------------------------------------------------- city arcs
CITY = {"SF": (37.77, -122.42), "NYC": (40.71, -74.01), "LON": (51.51, -0.13), "FRA": (50.11, 8.68),
        "TYO": (35.68, 139.69), "SIN": (1.35, 103.82), "SYD": (-33.87, 151.21), "SAO": (-23.55, -46.63)}
PAIRS = [("SF", "NYC"), ("NYC", "LON"), ("LON", "FRA"), ("FRA", "SIN"), ("SIN", "TYO"),
         ("SIN", "SYD"), ("SAO", "NYC"), ("SF", "TYO")]
def sph(la, lo):
    la, lo = math.radians(la), math.radians(lo)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
arcs, ends = [], []
for p, q in PAIRS:
    A, B = sph(*CITY[p]), sph(*CITY[q])
    om = math.acos(np.clip(A @ B, -1, 1))
    pts = []
    for t in np.linspace(0, 1, 48):
        v = (math.sin((1 - t) * om) * A + math.sin(t * om) * B) / math.sin(om)
        pts.append(v / np.linalg.norm(v) * (1.003 + (0.02 + 0.13 * om / math.pi) * math.sin(math.pi * t)))
    arcs.append(L.sweep("arc", pts, L.tube_profile(0.0028, 6), C))
for k, (la, lo) in CITY.items():   # small city markers (rings) belong to the arcs node
    c = sph(la, lo) * 1.002
    a1 = np.cross(c, up); a1 /= np.linalg.norm(a1); b1 = np.cross(c, a1)
    ring = [tuple(c + 0.012 * (math.cos(t) * a1 + math.sin(t) * b1)) for t in np.linspace(0, 2 * math.pi, 33)]
    nrm = np.tile(c, (33, 1)); tt = np.gradient(np.array(ring), axis=0); tt /= np.linalg.norm(tt, axis=1, keepdims=True)
    arcs.append(L.sweep("cityring", ring, [(-0.002, 0), (0.002, 0)], C, closed_profile=False, frames=(np.cross(nrm, tt), nrm)))
ga = L.join(arcs, "Globe_Arcs"); L.assign(ga, MA)

# ---------------------------------------------------------------- atmosphere (fresnel rim)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.06)
atm = bpy.context.active_object; atm.name = "Globe_Atmosphere"; atm.data.name = "Globe_Atmosphere"
L.link(atm, C); L.shade_smooth(atm, 180)
am = bpy.data.materials.new("H_GlobeAtmo"); am.use_nodes = True
nt = am.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
lw = nt.nodes.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.2
pw = nt.nodes.new("ShaderNodeMath"); pw.operation = 'POWER'; pw.inputs[1].default_value = 3.5
nt.links.new(lw.outputs["Facing"], pw.inputs[0])
em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = L.hexc("#35D6FF"); em.inputs["Strength"].default_value = 1.4
tr = nt.nodes.new("ShaderNodeBsdfTransparent")
mx = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(pw.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
nt.links.new(mx.outputs[0], out.inputs[0])
am.surface_render_method = 'BLENDED'; am.use_backface_culling = True
am.diffuse_color = L.hexc("#35D6FF", 0.25)
L.assign(atm, am)

root = L.empty("Globe", C)
for o in (dots, g, ga, atm):
    L.set_parent(o, root)
L.save_blend("globe")
p, tris = L.export_glb(C, "globe")
L.validate_glb(p, ["Globe", "Globe_Dots", "Globe_Grid", "Globe_Arcs", "Globe_Atmosphere"],
               ["H_GlobeDots", "H_GlobeGrid", "H_GlobeArcs", "H_GlobeAtmo"])
for o in C.objects:
    if o.type == 'MESH':
        print(f"  {o.name:20s} tris={L.tri_count(o)}")
