"""IP SHIFT router: original futuristic Wi-Fi router (Blender Z-up, front = -Y).
Footprint 0.32 x 0.22 m, chassis + glass height 0.06 m. Root at floor centre."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix
import lib_common as L
import numpy as np

L.reset()
C = L.collection("Router")
W, D, R = 0.32, 0.22, 0.034
SEG = 10
Z0, ZB, ZT = 0.004, 0.008, 0.046      # chassis bottom, full width start, deck
FY, BY = -D / 2, D / 2

# ---------------------------------------------------------------- materials
M_ALU = L.mat_pbr("M_Aluminium", "#5E646E", 1.0, 0.32, aniso=0.55)
M_GLASS = L.mat_pbr("M_GlassSmoked", "#0A0F1A", 0.0, 0.05, coat=1.0, alpha=0.78)
M_PORT = L.mat_pbr("M_PortMetal", "#C9CED6", 1.0, 0.2)
M_RUB = L.mat_pbr("M_Rubber", "#0B0D11", 0.0, 0.8)
M_BOARD = L.mat_pbr("M_Internal", "#05070B", 0.3, 0.55)
E = {n: L.mat_emit(n, c) for n, c in (
    ("E_LED_Power", "#EAF2FF"), ("E_LED_Internet", "#2FD98B"), ("E_LED_WiFi", "#35D6FF"),
    ("E_LED_LAN", "#2F6BFF"), ("E_LightBar", "#35D6FF"), ("E_CoreGlow", "#2F6BFF"))}

def outl(off=0.0):
    return L.offset_rrect(W, D, R, off, SEG)

# ---------------------------------------------------------------- body
body = L.loft("Router_Body", [
    (outl(-0.0045), 0.0035), (outl(-0.0012), Z0 + 0.0028), (outl(0), ZB),
    (outl(0), ZT - 0.0016), (outl(-0.0016), ZT)], C)
L.bevel(body, 0.0011, 3, 25)
L.apply_mods(body)

# top pocket for glass + grille, flared 1 mm chamfer at the rim
PW, PD, PR = W - 0.024, D - 0.024, R - 0.012
pocket = L.loft("cut_pocket", [
    (L.rrect(PW, PD, PR, SEG), 0.0395), (L.rrect(PW, PD, PR, SEG), ZT - 0.001),
    (L.rrect(PW + 0.0024, PD + 0.0024, PR + 0.0012, SEG), ZT + 0.0002),
    (L.rrect(PW + 0.0024, PD + 0.0024, PR + 0.0012, SEG), ZT + 0.01)], C)
L.boolean(body, pocket); L.delete(pocket)

# panel seam groove around the walls
ring_o = L.prism("cut_seam", outl(0.004), 0.0118, 0.0126, C)
ring_i = L.prism("cut_seam_i", outl(-0.0007), 0.010, 0.014, C)
L.boolean(ring_o, ring_i); L.delete(ring_i)
L.boolean(body, ring_o); L.delete(ring_o)

# side vents: recessed rounded slots on both side walls
cutters = []
for side in (-1, 1):
    for i in range(9):
        y = -0.048 + i * 0.012
        sl = L.axis_prism("slot", L.rrect(0.0042, 0.016, 0.0021, 6, cx=y, cy=0.028),
                          side * W / 2 - 0.006, side * W / 2 + 0.006, 'X', C)
        cutters.append(sl)
side_cut = L.join(cutters, "cut_side")
L.boolean(body, side_cut); L.delete(side_cut)

# front: light-bar groove, LED recesses
fr = [L.axis_prism("g", L.rrect(0.184, 0.0034, 0.0017, 6, cx=0.0, cy=0.024), FY - 0.01, FY + 0.003, 'Y', C)]
LEDX = [-0.132, -0.122, -0.112, -0.102]
for x in LEDX:
    fr.append(L.axis_prism("l", L.rrect(0.0062, 0.0026, 0.0013, 5, cx=x, cy=0.024), FY - 0.01, FY + 0.0025, 'Y', C))
fcut = L.join(fr, "cut_front")
L.boolean(body, fcut); L.delete(fcut)

# rear: port openings (power, USB-C, WAN, LAN1-4, reset)
PZ = 0.022
PORTS = {"power": -0.122, "usbc": -0.104, "wan": -0.082, "lan": [-0.058, -0.040, -0.022, -0.004], "reset": 0.016}
rj = [PORTS["wan"]] + PORTS["lan"]
rc = []
for x in rj:
    o = L.axis_prism("rj", L.rrect(0.0149, 0.0122, 0.0009, 2, cx=x, cy=PZ), BY - 0.013, BY + 0.01, 'Y', C)
    n = L.axis_prism("rjn", L.rrect(0.0062, 0.0040, 0.0004, 2, cx=x, cy=PZ - 0.0072), BY - 0.013, BY + 0.01, 'Y', C)
    rc += [o, n]
rc.append(L.axis_prism("usb", L.rrect(0.0092, 0.0034, 0.0016, 6, cx=PORTS["usbc"], cy=PZ), BY - 0.008, BY + 0.01, 'Y', C))
rc.append(L.axis_prism("pwr", L.circle(0.0044, 32, PORTS["power"], PZ), BY - 0.012, BY + 0.01, 'Y', C))
rc.append(L.axis_prism("rst", L.circle(0.0009, 16, PORTS["reset"], PZ), BY - 0.006, BY + 0.01, 'Y', C))
rcut = L.join(rc, "cut_rear")
L.boolean(body, rcut); L.delete(rcut)
L.assign(body, M_ALU)

# internal board under the glass/grille (dark), part of the body node
board = L.prism("board", L.rrect(PW - 0.002, PD - 0.002, PR, SEG), 0.0392, 0.0396, C)
L.assign(board, M_BOARD)
L.planar_uv(board, (0, 1), ((-PW / 2, PW / 2), (-PD / 2, PD / 2)))
def hex_plate(wpx, hpx, cell):
    yy, xx = np.mgrid[0:hpx, 0:wpx].astype(np.float32)
    s3 = math.sqrt(3)
    q = (xx * s3 / 3 - yy / 3) / cell; r = yy * 2 / 3 / cell
    # cube rounding to nearest hex centre -> distance to centre
    x, z = q, r; y = -x - z
    rx, ry, rz = np.round(x), np.round(y), np.round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    m1 = (dx > dy) & (dx > dz); m2 = ~m1 & (dy > dz)
    rx = np.where(m1, -ry - rz, rx); ry = np.where(m2, -rx - rz, ry); rz = np.where(~m1 & ~m2, -rx - ry, rz)
    cxp = cell * s3 * (rx + rz / 2); cyp = cell * 1.5 * rz
    d = np.sqrt((xx - cxp) ** 2 + (yy - cyp) ** 2) / cell
    hole = np.clip((0.55 - d) * 6, 0, 1)                    # perforation
    return hole
hp = hex_plate(1536, 1024, 5.2)
col = np.stack([0.018 + 0.0 * hp, 0.024 + 0.0 * hp, 0.036 + 0.0 * hp], -1)
col = col * (1 - hp[..., None]) + np.array([0.003, 0.004, 0.008]) * hp[..., None]
L.link_base_color(M_BOARD, col)
L.link_rough_metal(M_BOARD, (0.42 + 0.4 * hp).astype(np.float32), 0.6)
# antenna hinge bosses on the rear top edge
ANTX = [-0.128, -0.046, 0.046, 0.128]
HY, HZ = BY + 0.006, ZT - 0.004
boss = []
for x in ANTX:
    b = L.axis_prism("boss", L.rrect(0.022, 0.012, 0.004, 6, cx=x, cy=HZ - 0.002), BY - 0.004, HY + 0.003, 'Y', C)
    L.bevel(b, 0.0008, 2, 30); L.apply_mods(b)
    L.assign(b, M_ALU)
    boss.append(b)
body = L.join([body] + boss, "Router_Body")
board.name = "Router_Internal"; board.data.name = "Router_Internal"
L.shade_smooth(body, 35)
wn = body.modifiers.new("WN", 'WEIGHTED_NORMAL'); wn.keep_sharp = True
L.apply_mods(body)

# ---------------------------------------------------------------- glass + grille
GD = 0.124; GY = -PD / 2 + 0.0015 + GD / 2
GWo, GR = PW - 0.003, PR - 0.0015
# cushioned smoked glass: rounded shoulder into a gentle crown
gr = [(L.rrect(GWo, GD, GR, SEG), 0.0405), (L.rrect(GWo, GD, GR, SEG), 0.0560)]
for k, t in enumerate(np.linspace(0, 1, 9)[1:]):
    a = t * math.pi / 2
    off = -0.0040 * (1 - math.cos(a))            # shoulder radius ~4 mm
    gr.append((L.offset_rrect(GWo, GD, GR, off, SEG), 0.0560 + 0.0036 * math.sin(a)))
for off, dz in ((-0.010, 0.00045), (-0.018, 0.0008), (-0.028, 0.00105), (-0.040, 0.0012), (-0.052, 0.00125)):
    gr.append((L.offset_rrect(GWo, GD, GR, off, SEG), 0.0596 + dz))
glass = L.loft("Router_Glass", gr, C)
glass.location.y = GY
L.assign(glass, M_GLASS); L.shade_smooth(glass, 60)
L.planar_uv(glass, (0, 1), ((-GWo / 2, GWo / 2), (-GD / 2, GD / 2)))
L.link_rough_metal(M_GLASS, L.fingerprint_map(1024, 0.05, 0.22, seed=9, count=7), 0.0)

VD = PD - GD - 0.0045 - 0.003
VY = PD / 2 - 0.0015 - VD / 2
vents = L.loft("Router_Vents", [
    (L.rrect(PW - 0.003, VD, PR - 0.0015, SEG), 0.0405),
    (L.rrect(PW - 0.003, VD, PR - 0.0015, SEG), 0.0548),
    (L.rrect(PW - 0.006, VD - 0.003, PR - 0.003, SEG), 0.0562)], C)
L.bevel(vents, 0.0005, 2, 25); L.apply_mods(vents)
sl = []
n_sl = 34
for i in range(n_sl):
    x = (i - (n_sl - 1) / 2) * 0.0077
    sl.append(L.prism("vs", L.rrect(0.0036, VD - 0.016, 0.0018, 6, cx=x), 0.036, 0.07, C))
vcut = L.join(sl, "cut_vents")
L.boolean(vents, vcut); L.delete(vcut)
vents.location.y = VY
L.assign(vents, M_ALU); L.shade_smooth(vents, 35)

# ---------------------------------------------------------------- core glow (light guides)
cg = []
for k, (w, d, t) in enumerate([(0.27, 0.17, 0.0028), (0.20, 0.11, 0.0022), (0.13, 0.06, 0.0018)]):
    o = L.prism("cgo", L.rrect(w, d, 0.02, SEG), 0.0397, 0.0400, C)
    i = L.prism("cgi", L.rrect(w - 2 * t, d - 2 * t, 0.02 - t, SEG), 0.039, 0.041, C)
    L.boolean(o, i); L.delete(i); cg.append(o)
cg.append(L.prism("cgc", L.circle(0.012, 48), 0.0397, 0.0401, C))
core = L.join(cg, "Router_CoreGlow")
L.assign(core, E["E_CoreGlow"])

# ---------------------------------------------------------------- front LEDs + light bar
for x, n in zip(LEDX, ("LED_Power", "LED_Internet", "LED_WiFi", "LED_LAN")):
    o = L.axis_prism(n, L.rrect(0.0054, 0.0019, 0.00095, 5, cx=x, cy=0.024), FY + 0.0006, FY + 0.0022, 'Y', C)
    L.assign(o, E["E_" + n])
    L.shade_smooth(o)
lb = L.axis_prism("Router_LightBar", L.rrect(0.178, 0.0024, 0.0012, 6, cx=0, cy=0.024), FY + 0.0008, FY + 0.0028, 'Y', C)
L.assign(lb, E["E_LightBar"]); L.shade_smooth(lb)

# ---------------------------------------------------------------- ports inner detail
parts = []
for x in rj:
    back = L.axis_prism("pb", L.rrect(0.015, 0.0125, 0.0005, 2, cx=x, cy=PZ), BY - 0.0135, BY - 0.0125, 'Y', C)
    L.assign(back, M_RUB); parts.append(back)
    shell = L.axis_prism("ps", L.rrect(0.0145, 0.0118, 0.0008, 2, cx=x, cy=PZ), BY - 0.0125, BY - 0.0004, 'Y', C)
    inner = L.axis_prism("pi", L.rrect(0.0137, 0.011, 0.0005, 2, cx=x, cy=PZ), BY - 0.02, BY + 0.01, 'Y', C)
    L.boolean(shell, inner); L.delete(inner); L.assign(shell, M_PORT); parts.append(shell)
    for k in range(8):
        cx = x - 0.0045 + k * 0.0013
        pin = L.axis_prism("pin", L.rrect(0.00055, 0.0042, 0.0001, 1, cx=cx, cy=PZ + 0.0032), BY - 0.0125, BY - 0.004, 'Y', C)
        L.assign(pin, M_PORT); parts.append(pin)
    # status mini LEDs above each RJ45 are part of ports (non-emissive lens)
# USB-C: shell + tongue
us = L.axis_prism("us", L.rrect(0.0090, 0.0032, 0.0015, 6, cx=PORTS["usbc"], cy=PZ), BY - 0.0075, BY - 0.0003, 'Y', C)
ui = L.axis_prism("ui", L.rrect(0.0084, 0.0026, 0.0012, 6, cx=PORTS["usbc"], cy=PZ), BY - 0.02, BY + 0.01, 'Y', C)
L.boolean(us, ui); L.delete(ui); L.assign(us, M_PORT); parts.append(us)
tg = L.axis_prism("tg", L.rrect(0.0066, 0.0007, 0.0003, 2, cx=PORTS["usbc"], cy=PZ), BY - 0.0078, BY - 0.0015, 'Y', C)
L.assign(tg, M_RUB); parts.append(tg)
pb = L.axis_prism("pwb", L.circle(0.0043, 32, PORTS["power"], PZ), BY - 0.0125, BY - 0.0115, 'Y', C)
L.assign(pb, M_RUB); parts.append(pb)
pr = L.axis_prism("pwr", L.circle(0.0042, 32, PORTS["power"], PZ), BY - 0.0115, BY - 0.0004, 'Y', C)
pri = L.axis_prism("pwri", L.circle(0.0036, 32, PORTS["power"], PZ), BY - 0.02, BY + 0.01, 'Y', C)
L.boolean(pr, pri); L.delete(pri); L.assign(pr, M_PORT); parts.append(pr)
pin = L.axis_prism("pwp", L.circle(0.0011, 16, PORTS["power"], PZ), BY - 0.0115, BY - 0.003, 'Y', C)
L.assign(pin, M_PORT); parts.append(pin)
rs = L.axis_prism("rsb", L.circle(0.001, 12, PORTS["reset"], PZ), BY - 0.0062, BY - 0.0055, 'Y', C)
L.assign(rs, M_RUB); parts.append(rs)
ports = L.join(parts, "Router_Ports")
L.shade_smooth(ports, 30)

# ---------------------------------------------------------------- feet, screws, badge
feet = []
for sx in (-1, 1):
    for sy in (-1, 1):
        f = L.cylinder("foot", 0.0105, 0.0036, 40, C, z0=0.0)
        f.data.transform(Matrix.Translation((sx * 0.118, sy * 0.072, 0)))
        L.bevel(f, 0.0012, 3, 30); L.apply_mods(f)
        feet.append(f)
feet_o = L.join(feet, "Router_Feet"); L.assign(feet_o, M_RUB); L.shade_smooth(feet_o, 30)

screws = []
hexo = [(0.0011 * math.cos(math.pi / 3 * i), 0.0011 * math.sin(math.pi / 3 * i)) for i in range(6)]
spots = [((sx * 0.06, sy * 0.06, 0.0035), 'Z') for sx in (-1, 1) for sy in (-1, 1)]
spots += [((x, BY, 0.036), 'Y') for x in (-0.09, 0.09)]
for (p, ax) in spots:
    if ax == 'Z':
        h = L.loft("sc", [(L.circle(0.0021, 32), 0.0028), (L.circle(0.0026, 32), 0.0030), (L.circle(0.0026, 32), 0.0037)], C)
        hx = L.prism("hx", hexo, 0.0020, 0.0032, C)
        L.boolean(h, hx); L.delete(hx)
        h.data.transform(Matrix.Translation((p[0], p[1], 0)))
    else:
        h = L.axis_prism("sc", L.circle(0.0021, 32, p[0], p[2]), BY - 0.0003, BY + 0.0006, 'Y', C)
        hx = L.axis_prism("hx", [(p[0] + a, p[2] + b) for a, b in hexo], BY + 0.0002, BY + 0.003, 'Y', C)
        L.boolean(h, hx); L.delete(hx)
    screws.append(h)
screws_o = L.join(screws, "Router_Screws"); L.assign(screws_o, M_PORT); L.shade_smooth(screws_o, 30)

badge = L.text_mesh("Router_Badge", "IP SHIFT", 0.0086, 0.0003, C)
badge.rotation_euler = (math.pi / 2, 0, 0)
badge.location = (0.106, FY - 0.0003, 0.0238)
L.apply_transform(badge)
badge.data.transform(Matrix.Translation(badge.location)); badge.location = (0, 0, 0)
L.assign(badge, M_PORT)

# ---------------------------------------------------------------- antennas
def antenna(i, x, splay):
    parts = []
    # hinge barrel along X with knuckle rings
    bar = L.axis_prism("bar", L.circle(0.0056, 32), -0.0062, 0.0062, 'X', C)
    L.bevel(bar, 0.0006, 2, 30); L.apply_mods(bar); L.assign(bar, M_PORT); parts.append(bar)
    for s in (-1, 1):
        k = L.axis_prism("kn", L.circle(0.0050, 32), s * 0.0062, s * 0.0078, 'X', C)
        L.assign(k, M_RUB); parts.append(k)
    cap = L.axis_prism("cap", L.circle(0.0016, 16), 0.0062, 0.0081, 'X', C)
    L.assign(cap, M_PORT); parts.append(cap)
    # neck
    neck = L.loft("neck", [(L.rrect(0.0108, 0.0062, 0.0029, 6), 0.0), (L.rrect(0.0108, 0.0062, 0.0029, 6), 0.012),
                           (L.rrect(0.0172, 0.0074, 0.0035, 6), 0.022)], C)
    L.assign(neck, M_ALU); parts.append(neck)
    # blade: tapered, rounded top, 0.17 m
    rings = []
    H = 0.172
    for t in [0.0, 0.25, 0.5, 0.75, 0.9]:
        w = 0.0172 - 0.0036 * t
        dd = 0.0074 - 0.0012 * t
        rings.append((L.rrect(w, dd, dd / 2 - 0.0002, 6), 0.022 + t * (H - 0.03)))
    top = 0.022 + 0.9 * (H - 0.03)
    for a in (25, 50, 70, 85):
        f = math.cos(math.radians(a))
        rings.append((L.rrect(0.0136 * max(f, 0.15) + 0.002, 0.0062 * max(f, 0.3), 0.0029 * max(f, 0.3), 6),
                      top + 0.008 * math.sin(math.radians(a))))
    blade = L.loft("blade", rings, C)
    L.assign(blade, M_ALU); parts.append(blade)
    # accent seam band near the base
    band = L.loft("band", [(L.rrect(0.0176, 0.0078, 0.0037, 6), 0.026), (L.rrect(0.0176, 0.0078, 0.0037, 6), 0.0272)], C)
    L.assign(band, M_RUB); parts.append(band)
    a = L.join(parts, f"Antenna_{i}")
    L.shade_smooth(a, 40)
    wn = a.modifiers.new("WN", 'WEIGHTED_NORMAL'); wn.keep_sharp = True
    L.apply_mods(a)
    a.location = (x, HY, HZ + 0.006)
    a.rotation_euler = (math.radians(-12), math.radians(splay), 0)
    return a

ants = [antenna(i + 1, x, s) for i, (x, s) in enumerate(zip(ANTX, (-9, -3, 3, 9)))]

# ---------------------------------------------------------------- hierarchy, bake, export
root = L.empty("Router", C)
for o in list(C.objects):
    if o is not root and o.parent is None:
        L.set_parent(o, root)
L.bake_textured_metal(M_ALU, [body, vents] + ants, "#5E646E", 1.0, 0.32, size=2048, seed=7,
                      samples=48, brushed=0.03, smudge=0.06)
L.save_blend("router")
path, tris = L.export_glb(C, "router")
L.validate_glb(path, ["Router", "Router_Body", "Router_Glass", "Router_Vents", "Router_Ports",
                      "Antenna_1", "Antenna_2", "Antenna_3", "Antenna_4", "LED_Power", "LED_Internet",
                      "LED_WiFi", "LED_LAN", "Router_LightBar", "Router_CoreGlow"],
               ["M_Aluminium", "M_GlassSmoked", "M_PortMetal", "M_Rubber", "E_LED_Power",
                "E_LED_Internet", "E_LED_WiFi", "E_LED_LAN", "E_LightBar", "E_CoreGlow"])
for o in C.objects:
    if o.type == 'MESH':
        print(f"  {o.name:18s} tris={L.tri_count(o)}")
