"""IP SHIFT pedestal: multi-tier circular display plinth, diameter 0.56 m, root at floor centre."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix
import lib_common as L

L.reset()
C = L.collection("Pedestal")
N = 96
M_MET = L.mat_pbr("M_PedestalMetal", "#1A1F29", 1.0, 0.34)
M_GL = L.mat_pbr("M_PedestalGlass", "#9FB8E8", 0.0, 0.04, coat=1.0, alpha=0.32)
E_B = L.mat_emit("E_RingBlue", "#2F6BFF")
E_C = L.mat_emit("E_RingCyan", "#35D6FF")
c = lambda r: L.circle(r, N)

# base: two stepped metal tiers with chamfers and an outer channel
base = L.loft("Pedestal_Base", [
    (c(0.268), 0.0), (c(0.280), 0.006), (c(0.280), 0.030), (c(0.277), 0.034),
    (c(0.272), 0.034), (c(0.272), 0.031), (c(0.262), 0.031), (c(0.262), 0.036),  # outer ring channel
    (c(0.256), 0.038), (c(0.250), 0.038), (c(0.250), 0.062), (c(0.247), 0.065),
    (c(0.240), 0.065)], C, cap_top=True)
wn = base.modifiers.new("WN", 'WEIGHTED_NORMAL'); wn.keep_sharp = True
L.assign(base, M_MET); L.shade_smooth(base, 30)

# outer emissive ring in the channel
ro = L.ring_solid("Pedestal_RingOuter", 0.2625, 0.2715, 0.0312, 0.0332, N, C)
L.assign(ro, E_B)

# segmented ring detail: 72 raised blocks on the mid tier wall
segs = []
for i in range(96):
    a0 = 2 * math.pi * i / 96
    a1 = a0 + 2 * math.pi / 96 * 0.45
    pts = [(0.2513 * math.cos(a0), 0.2513 * math.sin(a0)), (0.2513 * math.cos(a1), 0.2513 * math.sin(a1)),
           (0.2490 * math.cos(a1), 0.2490 * math.sin(a1)), (0.2490 * math.cos(a0), 0.2490 * math.sin(a0))]
    pts.reverse()
    segs.append(L.prism("seg", pts, 0.042, 0.060, C))
sg = L.join(segs, "Pedestal_Segments"); L.assign(sg, E_C)

# top: glass rim ring + dark metal top disc with concentric steps and inner channel
top = L.loft("Pedestal_TopDisc", [
    (c(0.222), 0.065), (c(0.222), 0.082), (c(0.219), 0.085),
    (c(0.184), 0.085), (c(0.184), 0.0825), (c(0.172), 0.0825), (c(0.172), 0.085),   # inner channel
    (c(0.120), 0.085), (c(0.118), 0.0862), (c(0.0, 0.0) if False else c(0.001), 0.0862)], C)
wn = top.modifiers.new("WN", 'WEIGHTED_NORMAL'); wn.keep_sharp = True
L.assign(top, M_MET)
glass = L.ring_solid("glassrim", 0.2225, 0.2395, 0.065, 0.088, 192, C, chamfer=0.002)
L.assign(glass, M_GL)
M_GL.use_backface_culling = True
top = L.join([top, glass], "Pedestal_Top"); L.shade_smooth(top, 50)

ri = L.ring_solid("Pedestal_RingInner", 0.1725, 0.1835, 0.0826, 0.0842, N, C)
L.assign(ri, E_C)

root = L.empty("Pedestal", C)
for o in (base, ro, sg, top, ri):
    L.set_parent(o, root)
L.bake_textured_metal(M_MET, [base, top], "#1A1F29", 1.0, 0.34, size=1024, seed=5, samples=32,
                      brushed=0.03, smudge=0.05)
L.save_blend("pedestal")
path, tris = L.export_glb(C, "pedestal")
L.validate_glb(path, ["Pedestal", "Pedestal_Base", "Pedestal_Top", "Pedestal_RingInner",
                      "Pedestal_RingOuter", "Pedestal_Segments"],
               ["M_PedestalMetal", "M_PedestalGlass", "E_RingBlue", "E_RingCyan"])
for o in C.objects:
    if o.type == 'MESH':
        print(f"  {o.name:20s} tris={L.tri_count(o)}")
