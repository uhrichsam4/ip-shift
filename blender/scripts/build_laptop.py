"""IP SHIFT laptop: original aluminium laptop (no logos). Z-up, front = -Y.
Base 0.31 x 0.217 x 0.0155 m, lid open at 110 deg, pivot on the hinge axis."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix
import lib_common as L

L.reset()
C = L.collection("Laptop")
W, D, R, H = 0.310, 0.217, 0.0125, 0.0155
SEG = 8
FY, BY = -D / 2, D / 2

M_ALU = L.mat_pbr("M_LaptopAlu", "#A9AFB8", 1.0, 0.3, aniso=0.5)
M_KEYS = L.mat_pbr("M_Keys", "#0A0B0E", 0.0, 0.46)
M_PAD = L.mat_pbr("M_TrackpadGlass", "#2A2E34", 0.25, 0.36, coat=0.5, coat_rough=0.15)
M_BEZ = L.mat_pbr("M_Bezel", "#020306", 0.0, 0.06, coat=1.0)
M_RUB = L.mat_pbr("M_Rubber", "#0B0D11", 0.0, 0.8)
E_SCR = L.mat_emit("E_Screen", "#0E1A38")

def outl(off=0.0):
    return L.offset_rrect(W, D, R, off, SEG)

# ---------------------------------------------------------------- base
base = L.loft("Laptop_Base", [
    (outl(-0.0042), 0.0), (outl(-0.0016), 0.0018), (outl(0), 0.0052),
    (outl(0), H - 0.0007), (outl(-0.0006), H)], C)
L.bevel(base, 0.0007, 3, 20); L.apply_mods(base)
KW, KD, KY = 0.2775, 0.1185, 0.031
well = L.loft("cut_well", [(L.rrect(KW, KD, 0.006, 6), H - 0.0013),
                           (L.rrect(KW, KD, 0.006, 6), H - 0.0002),
                           (L.rrect(KW + 0.0008, KD + 0.0008, 0.0064, 6), H + 0.0001),
                           (L.rrect(KW + 0.0008, KD + 0.0008, 0.0064, 6), H + 0.01)], C)
well.data.transform(Matrix.Translation((0, KY, 0)))
L.boolean(base, well); L.delete(well)
TW, TD, TY = 0.136, 0.085, -0.0595
tp = L.prism("cut_pad", L.rrect(TW + 0.001, TD + 0.001, 0.0065, 8, cy=TY), H - 0.0004, H + 0.01, C)
L.boolean(base, tp); L.delete(tp)
# thumb scoop at the front edge
sc = L.axis_prism("cut_scoop", L.rrect(0.07, 0.03, 0.0149, 10, cy=0.0), 0, 1, 'X', C)
sc.data.transform(Matrix.Translation((0, 0, 0)))
L.delete(sc)
scoop = L.axis_loft("cut_scoop", [(L.rrect(0.06, 0.006, 0.0029, 8, cy=H + 0.0016), FY - 0.01),
                                  (L.rrect(0.06, 0.006, 0.0029, 8, cy=H + 0.0016), FY + 0.006)], 'Y', C)
L.boolean(base, scoop); L.delete(scoop)
# side ports: left 2x USB-C + audio, right USB-C
pc = []
for y in (0.045, 0.025):
    pc.append(L.axis_prism("usb", L.rrect(0.0088, 0.0031, 0.00155, 6, cx=y, cy=0.0078), -W / 2 - 0.01, -W / 2 + 0.006, 'X', C))
pc.append(L.axis_prism("usb", L.rrect(0.0088, 0.0031, 0.00155, 6, cx=0.03, cy=0.0078), W / 2 - 0.006, W / 2 + 0.01, 'X', C))
pc.append(L.axis_prism("aud", L.circle(0.0018, 20, -0.02, 0.0078), W / 2 - 0.006, W / 2 + 0.01, 'X', C))
pcut = L.join(pc, "cut_ports")
L.boolean(base, pcut); L.delete(pcut)
# inner port tongues
tg = []
for (y, x0, x1) in ((0.045, -W / 2 + 0.0055, -W / 2 + 0.001), (0.025, -W / 2 + 0.0055, -W / 2 + 0.001),
                    (0.03, W / 2 - 0.0055, W / 2 - 0.001)):
    t = L.axis_prism("tg", L.rrect(0.0062, 0.0007, 0.0003, 2, cx=y, cy=0.0078), min(x0, x1), max(x0, x1), 'X', C)
    tg.append(t)
tgo = L.join(tg, "tongues"); L.assign(tgo, M_KEYS)
# hinge barrel (aluminium) across the rear
HY, HZ = BY - 0.0062, 0.0088
barrel = L.axis_loft("barrel", [(L.circle(0.0052, 40, 0, 0), -0.124), (L.circle(0.0052, 40, 0, 0), 0.124)], 'X', C)
barrel.data.transform(Matrix.Translation((0, HY, HZ)))
L.bevel(barrel, 0.0008, 3, 30); L.apply_mods(barrel)
# rubber feet
feet = []
for sx in (-1, 1):
    for sy in (-1, 1):
        f = L.loft("foot", [(L.circle(0.0055, 32), -0.0009), (L.circle(0.0065, 32), -0.0003), (L.circle(0.0065, 32), 0.0004)], C)
        f.data.transform(Matrix.Translation((sx * 0.128, sy * 0.082, 0)))
        feet.append(f)
fo = L.join(feet, "feet"); L.assign(fo, M_RUB)
L.assign(base, M_ALU); L.assign(barrel, M_ALU)
base = L.join([base, barrel, tgo, fo], "Laptop_Base")
L.shade_smooth(base, 35)
wn = base.modifiers.new("WN", 'WEIGHTED_NORMAL'); wn.keep_sharp = True
L.apply_mods(base)
# base floats on its feet: lift so feet touch the floor
base.data.transform(Matrix.Translation((0, 0, 0.0009)))
LIFT = 0.0009

# ---------------------------------------------------------------- keys
U = 0.2700 / 14.5
GAP = 0.0026
ROWS = [  # (row height factor, [widths in u])
    (0.55, [1.0 + 0.5 / 14] * 14),
    (1.0, [1] * 13 + [1.5]),
    (1.0, [1.5] + [1] * 13),
    (1.0, [1.75] + [1] * 11 + [1.75]),
    (1.0, [2.25] + [1] * 10 + [2.25]),
    (1.0, [1, 1, 1, 1.25, 5.0, 1.25, 1, "arrows"]),
]
keys = []
ztop = H - 0.0013 + LIFT
LABELS = [
    ["esc"] + [f"F{i}" for i in range(1, 13)] + ["o"],
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "delete"],
    ["tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "return"],
    ["shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "shift"],
    ["fn", "ctrl", "opt", "cmd", "", "cmd", "opt", "<", "v", ">", "^"],
]
flat = [l for row in LABELS for l in row]
GRID = 12
CW = 1.0 / GRID
keyinfo = []
def keycap(x0, y0, w, h):
    o = L.loft("k", [(L.rrect(w, h, 0.0017, 3, cx=x0 + w / 2, cy=y0 - h / 2), ztop),
                     (L.rrect(w, h, 0.0017, 3, cx=x0 + w / 2, cy=y0 - h / 2), ztop + 0.0012),
                     (L.rrect(w - 0.0007, h - 0.0007, 0.0014, 3, cx=x0 + w / 2, cy=y0 - h / 2), ztop + 0.00145)], C, cap_bottom=False)
    idx = len(keys)
    col, row = idx % GRID, GRID - 1 - idx // GRID
    L.planar_uv(o, (0, 1), ((x0 - (col) * w, x0 + (GRID - col) * w), (y0 - h - row * h, y0 - h + (GRID - row) * h)))
    keyinfo.append((col, row, w, h, flat[idx] if idx < len(flat) else ""))
    keys.append(o)
y = KY + KD / 2 - 0.0042
x_start = -14.5 * U / 2
for hf, widths in ROWS:
    rh = U * hf
    x = x_start
    for w in widths:
        if w == "arrows":
            aw = U - GAP
            hh = (rh - GAP) / 2 - 0.0004
            for i in range(3):
                ax = x + i * U + GAP / 2
                keycap(ax, y - GAP / 2 - (rh - GAP) / 2 - 0.0004, aw, hh)   # left/down/right lower half
            keycap(x + U + GAP / 2, y - GAP / 2, aw, hh)                    # up
            x += 3 * U
            continue
        keycap(x + GAP / 2, y - GAP / 2, w * U - GAP, rh - GAP)
        x += w * U
    y -= rh
keys_o = L.join(keys, "Laptop_Keys")
L.assign(keys_o, M_KEYS); L.shade_smooth(keys_o, 35)

# legend atlas: rendered in a throwaway scene, low-contrast backlit-style legends
def render_key_atlas(path, size=1024):
    main = bpy.context.scene
    sc = bpy.data.scenes.new("KeyAtlas")
    col = bpy.data.collections.new("AtlasText"); sc.collection.children.link(col)
    lm = L.mat_emit("AtlasLegend", "#4A505B")
    for (c, r, w, h, lab) in keyinfo:
        if not lab:
            continue
        word = len(lab) > 2
        t = L.text_mesh("lab", lab, CW * (0.20 if word else 0.36), 0.0, None)
        L.link(t, col)
        sx = h / w      # key is squashed into a square cell: pre-compress horizontally
        t.scale = (sx, 1, 1)
        if word:
            t.location = ((c + 0.5) * CW, (r + 0.24) * CW, 0)
        else:
            t.location = ((c + 0.5) * CW, (r + 0.5) * CW, 0)
        L.assign(t, lm)
    for o in list(col.objects):
        for cc in list(o.users_collection):
            if cc is not col:
                cc.objects.unlink(o)
    camd = bpy.data.cameras.new("AtlasCam"); camd.type = 'ORTHO'; camd.ortho_scale = 1.0
    cam = bpy.data.objects.new("AtlasCam", camd); col.objects.link(cam)
    cam.location = (0.5, 0.5, 1.0); sc.camera = cam
    sc.world = bpy.data.worlds.new("AtlasBG"); sc.world.color = L.hexc("#0A0B0E")[:3]
    sc.world.use_nodes = True
    bgn = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND')
    bgn.inputs[0].default_value = L.hexc("#0A0B0E"); bgn.inputs[1].default_value = 1.0
    sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 16
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    bpy.data.scenes.remove(sc)
    im = bpy.data.images.load(path); im.pack()
    os.remove(path)
    return im
atlas = render_key_atlas(os.path.join(L.SRC, "_key_atlas_tmp.png"))
atlas.name = "M_Keys_Legends"
nt = M_KEYS.node_tree
tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = atlas
nt.links.new(tx.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])

# ---------------------------------------------------------------- trackpad
pad = L.loft("Laptop_Trackpad", [(L.rrect(TW, TD, 0.0062, 8, cy=TY), H - 0.0016 + LIFT),
                                 (L.rrect(TW, TD, 0.0062, 8, cy=TY), H - 0.0002 + LIFT),
                                 (L.rrect(TW - 0.0006, TD - 0.0006, 0.0059, 8, cy=TY), H - 0.00005 + LIFT)], C)
L.assign(pad, M_PAD); L.shade_smooth(pad, 30)

# ---------------------------------------------------------------- lid (built in hinge space, then rotated)
LW, LH, LT = 0.3095, 0.2105, 0.0058
Z0 = 0.0045
lo = lambda off=0.0: L.offset_rrect(LW, LH, 0.0115, off, SEG)
def shift(pts, dz):
    return [(x, z + dz) for x, z in pts]
cz = Z0 + LH / 2
lid = L.axis_loft("Laptop_Lid", [
    (shift(lo(-0.0012), cz), -0.0026), (shift(lo(0), cz), -0.0018),
    (shift(lo(0), cz), 0.0020), (shift(lo(-0.0018), cz), LT - 0.0026)], 'Y', C)
L.bevel(lid, 0.0006, 3, 20); L.apply_mods(lid)
L.assign(lid, M_ALU); L.shade_smooth(lid, 35)
bez = L.axis_loft("Laptop_Bezel", [(shift(L.offset_rrect(LW, LH, 0.0115, -0.0012, SEG), cz), -0.0030),
                                   (shift(L.offset_rrect(LW, LH, 0.0115, -0.0016, SEG), cz), -0.0026)], 'Y', C)
cam = L.axis_prism("camdot", L.circle(0.0011, 16, 0, Z0 + LH - 0.0068), -0.00305, -0.0029, 'Y', C)
L.assign(bez, M_BEZ); L.assign(cam, M_KEYS)
bez = L.join([bez, cam], "Laptop_Bezel")
# screen: 16:10, clean 0-1 UVs, upright
SW = 0.2860; SH = SW / 1.6
sz0 = Z0 + 0.0175
sverts = [(-SW / 2, -0.00315, sz0), (SW / 2, -0.00315, sz0), (SW / 2, -0.00315, sz0 + SH), (-SW / 2, -0.00315, sz0 + SH)]
scr = L.mesh_obj("Laptop_Screen", sverts, [(0, 1, 2, 3)], C, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
L.assign(scr, E_SCR)
# lid sits on the hinge axis
for o in (lid, bez, scr):
    o.location = (0, HY, HZ + LIFT)
bez.parent = lid; bez.location = (0, 0, 0)
scr.parent = lid; scr.location = (0, 0, 0)
lid.rotation_euler = (math.radians(-20), 0, 0)   # 110 deg opening

# ---------------------------------------------------------------- hierarchy, bake, export
root = L.empty("Laptop", C)
for o in (base, keys_o, pad, lid):
    L.set_parent(o, root)
L.bake_textured_metal(M_ALU, [base, lid], "#A9AFB8", 1.0, 0.3, size=1024, seed=11,
                      samples=40, brushed=0.035, smudge=0.06)
L.save_blend("laptop")
path, tris = L.export_glb(C, "laptop")
L.validate_glb(path, ["Laptop", "Laptop_Base", "Laptop_Keys", "Laptop_Trackpad", "Laptop_Lid",
                      "Laptop_Screen", "Laptop_Bezel"],
               ["M_LaptopAlu", "M_Keys", "M_TrackpadGlass", "M_Bezel", "E_Screen"])
for o in C.objects:
    if o.type == 'MESH':
        print(f"  {o.name:18s} tris={L.tri_count(o)}")
