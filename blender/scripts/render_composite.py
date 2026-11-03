"""docs/renders/scene_composite.jpg: mockup composition assembled from the asset .blend files.
Laptop on pedestal (left), router on pedestal (right), globe behind, ribbons far back."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import lib_common as L

L.reset()
scn = bpy.context.scene

def append(name, coll):
    with bpy.data.libraries.load(os.path.join(L.SRC, name + ".blend"), link=False) as (src, dst):
        dst.collections = [coll]
    c = dst.collections[0]
    scn.collection.children.link(c)
    roots = [o for o in c.objects if o.parent is None]
    return c, roots

PT = 0.0862  # pedestal top height
_, p1 = append("pedestal", "Pedestal")
_, p2 = append("pedestal", "Pedestal")
for r in p1: r.location = (-0.42, 0, 0)
for r in p2: r.location = (0.42, 0, 0)
_, lap = append("laptop", "Laptop")
for r in lap:
    r.location = (-0.42, 0, PT); r.rotation_euler = (0, 0, math.radians(24))
_, rou = append("router", "Router")
for r in rou:
    r.location = (0.42, 0, PT); r.rotation_euler = (0, 0, math.radians(-24))
_, glb = append("globe", "Globe")
for r in glb:
    r.location = (0.0, 3.0, 0.8); r.scale = (0.9, 0.9, 0.9); r.rotation_euler = (0.3, 0, 0.6)
rc, _ = append("ribbons", "Ribbons")
# preview-only soft additive look (the web drives its own ribbon shader)
pm = bpy.data.materials.new("RibbonPreview"); pm.use_nodes = True
nt = pm.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(tc.outputs["UV"], sp.inputs[0])
def math_node(op, a, b=None, val=None):
    m = nt.nodes.new("ShaderNodeMath"); m.operation = op
    nt.links.new(a, m.inputs[0])
    if b is not None: nt.links.new(b, m.inputs[1])
    if val is not None: m.inputs[1].default_value = val
    return m.outputs[0]
v = math_node('SINE', math_node('MULTIPLY', sp.outputs["Y"], val=math.pi))
u = math_node('SINE', math_node('MULTIPLY', sp.outputs["X"], val=math.pi))
fade = math_node('MULTIPLY', math_node('POWER', v, val=3.0), math_node('POWER', u, val=0.7))
fade = math_node("MULTIPLY", fade, val=0.32)
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = L.hexc("#2F6BFF"); ramp.color_ramp.elements[1].color = L.hexc("#9A73FF")
nt.links.new(sp.outputs["X"], ramp.inputs[0])
em = nt.nodes.new("ShaderNodeEmission"); em.inputs[1].default_value = 1.4
nt.links.new(ramp.outputs[0], em.inputs[0])
add = nt.nodes.new("ShaderNodeAddShader"); tr = nt.nodes.new("ShaderNodeBsdfTransparent")
mx = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(fade, mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
nt.links.new(mx.outputs[0], out.inputs[0])
pm.surface_render_method = 'BLENDED'
for o in rc.objects:
    o.data.materials[0] = pm

rig = L.collection("Rig")
L.area_light("Key", (-0.9, -1.2, 1.6), (0, 0, 0.15), "#DCE6FF", 90, 1.2, coll=rig)
L.area_light("Rim", (0.6, 0.9, 0.6), (0.42, 0, 0.12), "#2F6BFF", 160, 1.0, 0.25, coll=rig)
L.area_light("Fill", (-1.6, 0.0, 0.4), (-0.42, 0, 0.1), "#7A4DFF", 30, 0.8, coll=rig)
f = L.prism("Floor", L.circle(30, 96), -0.002, 0.0, rig)
L.assign(f, L.mat_pbr("RenderFloor", "#020306", 0.0, 0.8))
L.camera("Cam", (0.0, -1.85, 0.42), (0.0, 0.4, 0.3), 30, rig)
L.studio_world(0.3)
L.use_eevee(64)
L.render_jpg(os.path.join(L.RENDERS, "scene_composite.jpg"))
