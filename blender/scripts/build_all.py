"""Rebuild the whole IP SHIFT asset library with one command:
  "$B" -b --factory-startup -P blender/scripts/build_all.py
Each step runs in its own Blender process so scenes never leak into each other."""
import os, sys, subprocess, json, struct

HERE = os.path.dirname(os.path.abspath(__file__))
B = sys.argv[0] if os.path.basename(sys.argv[0]).lower().startswith("blender") else \
    "/Applications/Blender.app/Contents/MacOS/Blender"
try:
    import bpy
    B = bpy.app.binary_path
except Exception:
    pass

STEPS = ["build_hdri.py", "build_router.py", "build_laptop.py", "build_pedestal.py",
         "build_holo_kit.py", "build_globe.py", "build_ribbons.py", "render_icon.py",
         "render_previews.py", "render_composite.py"]

def run(script):
    print(f"==> {script}", flush=True)
    r = subprocess.run([B, "-b", "--factory-startup", "-P", os.path.join(HERE, script)],
                       capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.startswith(("EXPORTED", "VALIDATE", "RENDERED", "SAVED", "HDRI", "ICON", "  ")) or "Error" in line:
            print("   ", line)
    if r.returncode != 0:
        print(r.stderr[-2000:])
        raise SystemExit(f"{script} failed")

only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else STEPS
for s in only:
    run(s if s.endswith(".py") else s + ".py")
print("ALL DONE")
