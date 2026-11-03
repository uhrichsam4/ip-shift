"""Preview renders (EEVEE, 1280x720, HDRI studio) for each asset .blend.
Usage: blender -b --factory-startup -P render_previews.py -- [asset ...]"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib_common as L

# per-asset camera: (direction from target, distance factor, lens, target z factor)
VIEWS = {
    "router": ((-0.55, -1.0, 0.5), 2.1, 60),
    "router_back": ((0.7, 1.0, 0.3), 1.9, 60),
    "laptop": ((-0.6, -1.0, 0.42), 2.0, 60),
    "pedestal": ((-0.3, -1.0, 0.5), 1.7, 55),
    "holo_kit": ((0.0, -1.0, 0.25), 1.4, 45),
    "globe": ((0.0, -1.0, 0.2), 1.6, 50),
    "ribbons": ((0.0, -1.0, 0.1), 1.2, 35),
}

def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx

def render_asset(name):
    src = name.split("_back")[0]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(L.SRC, src + ".blend"))
    scn = bpy.context.scene
    objs = [o for o in scn.objects if o.type == 'MESH']
    mn, mx = bbox(objs)
    ctr = (mn + mx) / 2
    size = (mx - mn).length
    rig = L.collection("PreviewRig")
    L.studio_rig(rig, scale=max(size, 0.4), floor=name not in ("holo_kit", "globe", "ribbons"),
                 center=tuple(ctr))
    if name in ("holo_kit", "globe", "ribbons"):
        for o in rig.objects:
            if o.type == 'LIGHT':
                o.data.energy *= 0.3
    d, f, lens = VIEWS.get(name, ((0, -1, 0.4), 1.6, 50))
    dv = Vector(d).normalized()
    dist = size * f * (lens / 50)
    L.camera("PreviewCam", tuple(ctr + dv * dist), tuple(ctr), lens, rig)
    L.studio_world(0.9)
    L.use_eevee(64)
    L.render_jpg(os.path.join(L.RENDERS, name + ".jpg"))

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(VIEWS)
    for a in args:
        if os.path.exists(os.path.join(L.SRC, a.split("_back")[0] + ".blend")):
            render_asset(a)
