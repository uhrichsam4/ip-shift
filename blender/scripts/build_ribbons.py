"""IP SHIFT background light ribbons: 5 silky swept surfaces, U along length 0-1, V across 0-1.
Laid out as a deep background band behind the stage (Blender +Y = away from camera)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
import lib_common as L

L.reset()
C = L.collection("Ribbons")
M = L.mat_emit("H_Ribbon", "#4C86FF")
M.use_backface_culling = False

ROWS, COLS = 160, 7          # along length, across
specs = [  # (y depth, z base, amplitude, phase, width, twist, length)
    (4.0, 0.6, 0.55, 0.0, 0.9, 0.8, 14.0),
    (4.6, 1.3, 0.70, 1.3, 1.2, 1.2, 15.0),
    (5.2, 0.2, 0.45, 2.4, 0.7, 0.6, 13.0),
    (5.8, 1.9, 0.80, 3.7, 1.4, 1.4, 16.0),
    (6.4, 1.0, 0.60, 5.0, 1.0, 1.0, 15.5),
]
for k, (y0, z0, amp, ph, width, tw, ln) in enumerate(specs, 1):
    u = np.linspace(0, 1, ROWS)
    x = (u - 0.5) * ln
    z = z0 + amp * np.sin(u * 2 * math.pi * 1.1 + ph) + 0.25 * np.sin(u * 2 * math.pi * 2.7 + ph * 1.7)
    y = y0 + 0.5 * np.sin(u * 2 * math.pi * 0.8 + ph)
    centre = np.stack([x, y, z], 1)
    t = np.gradient(centre, axis=0); t /= np.linalg.norm(t, axis=1, keepdims=True)
    up = np.array([0, -0.25, 1.0]); up /= np.linalg.norm(up)
    verts, uvs, faces = [], [], []
    for i in range(ROWS):
        n = up - (up @ t[i]) * t[i]; n /= np.linalg.norm(n)
        b = np.cross(t[i], n)
        ang = tw * math.sin(u[i] * math.pi * 2 + ph)
        acr = math.cos(ang) * n + math.sin(ang) * b
        wv = width * (0.35 + 0.65 * math.sin(math.pi * u[i]) ** 0.6)
        for j in range(COLS):
            v = j / (COLS - 1)
            bow = 0.06 * math.sin(math.pi * v)          # slight silky curl across
            verts.append(tuple(centre[i] + acr * (v - 0.5) * wv + np.cross(t[i], acr) * bow))
            uvs.append((u[i], v))
    for i in range(ROWS - 1):
        for j in range(COLS - 1):
            a = i * COLS + j
            faces.append((a, a + 1, a + COLS + 1, a + COLS))
    o = L.mesh_obj(f"Ribbon_{k}", verts, faces, C, uvs)
    L.assign(o, M); L.shade_smooth(o, 80)

L.save_blend("ribbons")
p, tris = L.export_glb(C, "ribbons")
L.validate_glb(p, [f"Ribbon_{i}" for i in range(1, 6)], ["H_Ribbon"])
