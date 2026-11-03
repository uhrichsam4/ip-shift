"""Make .blend files self-contained and free of local absolute paths before publishing.

Usage (run from a neutral folder with a neutral HOME so nothing local is captured):
  HOME=/tmp/blendhome Blender -b --factory-startup -P blender/scripts/make_portable.py -- path/to/file.blend

- Opens the file WITHOUT its saved UI (the UI can hold file-browser paths such as your home folder).
- Packs external images/fonts/sounds into the file.
- Rewrites every stored path to '//<basename>'. Blender saves fixed-size path buffers verbatim, so
  each field is first overwritten with a long filler, otherwise the tail of the old path survives.
"""
import bpy, os, sys

target = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=target, load_ui=False)
try:
    bpy.ops.file.pack_all()
except Exception as exc:  # nothing to pack
    print('pack_all skipped:', exc)

FILL = '//' + 'x' * 240


def scrub(obj, attr):
    value = getattr(obj, attr, '')
    if value and value != '<builtin>':
        short = '//' + os.path.basename(value.rstrip('/'))
        setattr(obj, attr, FILL)
        setattr(obj, attr, short)


for scene in bpy.data.scenes:
    scrub(scene.render, 'filepath')
for coll in (bpy.data.images, bpy.data.fonts, bpy.data.sounds, bpy.data.movieclips, bpy.data.libraries):
    for block in coll:
        for attr in ('filepath_raw', 'filepath'):
            try:
                scrub(block, attr)
                break
            except (AttributeError, TypeError, RuntimeError):
                continue
        for packed in getattr(block, 'packed_files', []):
            scrub(packed, 'filepath')

bpy.ops.wm.save_mainfile(compress=True)
print('PORTABLE', os.path.basename(target))
