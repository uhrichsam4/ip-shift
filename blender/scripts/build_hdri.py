"""Render env/studio.hdr: original dark studio, 2048x1024 equirect, Cycles."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, math
import lib_common as L

scn = L.reset()
c = L.collection("Studio")
black = L.mat_pbr("StudioBlack", "#050608", 0.0, 0.45)
floor = L.mat_pbr("StudioFloor", "#030304", 0.0, 0.25)

def panel(name, w, h, loc, rot, mat):
    o = L.prism(name, L.rrect(w, h, min(w, h) * 0.1, 4), 0, 0.01, c)
    o.location = loc
    o.rotation_euler = rot
    L.assign(o, mat)
    return o

# room
room = L.prism("Room", L.rrect(14, 14, 1.0, 6), -1.6, 5.0, c)
L.fix_normals(room)
room.data.flip_normals() if hasattr(room.data, "flip_normals") else None
L.assign(room, black)
fl = L.prism("Floor", L.circle(6.8, 64), -1.62, -1.6, c); L.assign(fl, floor)

top = L.mat_emit("SoftTop", "#E6EEFF", 14.0)
cyan = L.mat_emit("StripCyan", "#35D6FF", 22.0)
blue = L.mat_emit("StripBlue", "#2F6BFF", 26.0)
vio = L.mat_emit("RimViolet", "#7A4DFF", 5.0)
dim = L.mat_emit("FrontDim", "#9FB4E8", 1.2)

panel("TopSoftbox", 3.2, 2.2, (0, -0.4, 3.2), (math.pi, 0, 0), top)
panel("StripLeft", 0.35, 3.0, (-3.4, 0.2, 0.6), (0, math.radians(90), 0), cyan)
panel("StripRight", 0.35, 3.0, (3.4, 0.2, 0.6), (0, math.radians(-90), 0), blue)
panel("RimBack", 2.6, 0.9, (0, 4.2, 0.9), (math.radians(90), 0, 0), vio)
panel("FrontFill", 2.0, 0.6, (0, -4.6, 1.4), (math.radians(-80), 0, 0), dim)

cam = L.camera("Pano", (0, 0, 0), (0, 1, 0), coll=c)
cam.rotation_euler = (math.radians(90), 0, 0)
cd = cam.data
cd.type = 'PANO'
try:
    cd.panorama_type = 'EQUIRECTANGULAR'
except Exception:
    cd.cycles.panorama_type = 'EQUIRECTANGULAR'
scn.world = bpy.data.worlds.new("Black")
scn.world.color = (0, 0, 0)

L.use_cycles(96)
scn.view_settings.view_transform = 'Standard'
scn.render.resolution_x, scn.render.resolution_y = 2048, 1024
scn.render.resolution_percentage = 100
scn.render.image_settings.file_format = 'HDR'
out = os.path.join(L.ENV, "studio.hdr")
scn.render.filepath = out
bpy.ops.render.render(write_still=True)
print("HDRI", out, os.path.getsize(out))
