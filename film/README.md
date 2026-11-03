# IP SHIFT launch film

Product launch film made in Blender 5.1.2 (EEVEE). The sound design is synthesized in numpy and the edit is assembled with FFmpeg.

## Deliverables
| File | What |
|---|---|
| `IP-SHIFT-LAUNCH.mp4` | Final film. 1920×1080, 30 fps, H.264 High, yuv420p, CRF 18, AAC 320 kbps 48 kHz stereo, faststart, 42.0 s |
| `IP-SHIFT-LAUNCH-THUMBNAIL.png` | 1920×1080 hero/logo frame (S5, frame 1250, 16 samples) |
| `source/ip_shift_launch.blend` | Saved project: five scenes `S1_Reveal` … `S5_Brand` that share collections and use global frame numbers |
| `scripts/build_film.py` | Builds the whole .blend from scratch: appends assets, logo, particles, network space, lights, cameras, compositor |
| `scripts/make_audio.py` | Original sound design → `audio/ip_shift_launch_mix.wav` + `audio/cue_sheet.csv` |
| `scripts/assemble.sh` | Runs audio → build → parallel segment renders → final mux |
| `captures/` | UI captures (headless Chrome, 1920×1080) and the caption overlay |
| `renders/check_*.jpg` | One verification still per scene |

## Reproduce
```sh
# optional: fresh UI captures (needs `pnpm --dir web dev --port 5175`)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=metal --enable-gpu \
  --ignore-gpu-blocklist --window-size=1920,1080 --virtual-time-budget=9000 \
  --screenshot=film/captures/ui_idle.png "http://localhost:5175/?state=idle"   # also ?state=dhcp → ui_dhcp.png, ?state=results-changed → ui_results.png
zsh film/scripts/assemble.sh            # audio + build + render + assemble (about 8 min on this Mac)
zsh film/scripts/assemble.sh --no-build # re-render the existing .blend
zsh film/scripts/assemble.sh --no-build --no-render   # re-mux only
```
Each segment renders straight to H.264 (`renders/part_SSSS-EEEE.mp4`, no PNG sequences). Three Blender processes run in parallel. The final pass concatenates the parts, overlays the "Illustrative demo data" caption (25–36 s), fades to black (41–42 s) and muxes the audio.

## Render settings and timing
- EEVEE, 1920×1080, **30 fps**, 8 TAA samples, motion blur (shutter 0.5), depth of field on every camera, world volumetric fog (Principled Volume, density 0.0035), AgX (Medium High Contrast). Raytracing is off.
- The compositor applies Glare (Bloom, threshold 0.8), Lens Distortion (−0.015, dispersion 0.012) and a multiplied vignette.
- **Measured render time:** 1.15 s/frame with one process at 16 samples. With three processes at 8 samples it drops to 0.46 s/frame effective, so the 1,260 frames take about 10 min (the final run took 7.5 min for build plus render: 22:06 to 22:13). At 60 fps the film would take about 19–20 min, which is over the ~18 min budget, so I chose 30 fps.
- **4K was not feasible** in the time budget (about 4× the pixels means 40+ min of rendering).

## Edit (global time → scene)
| Time | Scene | Content |
|---|---|---|
| 0–6 s | S1 Reveal | Black, then a blue point light. The rim light sweeps across the router and the camera orbits through floating particles. The IP SHIFT logo (isometric hex-cube mark with one shifted face, #7BE6FF→#2F6BFF, plus extruded Unbounded wordmark) fades in |
| 6–15 s | S2 Network | Camera arcs around the router. The antennas rise (servo cues), holo_kit and network rings activate, and the laptop sits on its pedestal. The energy stream travels laptop→router (UV-driven emission) and three holographic panels appear. The camera then pushes into the Wi-Fi symbol (flash transition) |
| 15–25 s | S3 Technology | Network space: 160 nodes, curved pathways and 12k GN-instanced particles. Three DHCP REQUEST pulses travel out from CLIENT, then a DHCP ACK pulse returns from DHCP SERVER and the client hub flashes |
| 25–36 s | S4 Product | Floating glass screen with the real UI captures, and the laptop/pedestals in the background. idle → (29.0 s SWITCH IP press: flash + edge-light surge) → dhcp → (32.5 s) results. The caption "Illustrative demo data" is on screen |
| 36–42 s | S5 Brand | Pull back. The router floats in darkness and a blue energy ring ignites. "YOUR NETWORK. YOUR CONTROL." (37.8–39.5 s), then the IP SHIFT logo on the final hit (39.6 s), fading to black |

## Sound design and cue sheet
48 kHz stereo, 16-bit, about −16 LUFS integrated, peak about −1.6 dBFS (soft limiter, measured with ffmpeg ebur128). The full list is in `audio/cue_sheet.csv`. Key cues:
0.0 drone bed · 0.6 light ping · 1.4 rim-sweep air · 4.4 logo sub + riser · **6.0 impact** · 7.0–8.05 four antenna servos/clicks · 8.6 ring crackle · 10.0 laptop thud · 11.0 energy zap · 12.8–13.4 panel blips · 13.5 riser + 13.8 fly-in whoosh · **15.0 deep impact** · 17/18/19 DHCP request pulses · 21.3 ACK return · 22.5 lease chime · 23.4 riser · **25.0 app reveal** · 29.0 SWITCH IP click + thump · 32.5 results chime · 34.2 riser · **36.0 pull-back whoosh + sub** · 36.8 ring ignition · 38.0 tagline hit · **39.6 final logo hit + tail** · 40.5 fade.

## What is illustrative
- Scene 4 uses the app's `?state=` preview captures. They show **illustrative data** (IP addresses, lease and timing values), carry the app's "PREVIEW · ILLUSTRATIVE DATA" badge, and the film adds the caption "Illustrative demo data".
- The holographic panel labels (LEASE RENEWAL, GATEWAY ONLINE, SIGNAL 5 GHz) and the S3 DHCP visualisation are stylised, not measurements.

## Assets used
`blender/source/router.blend`, `pedestal.blend` (two instances), `laptop.blend`, and `holo_kit.blend` (rings only; Wi-Fi symbol, panels, energy stream and network space are built by `build_film.py`). The HDRI is `web/public/assets/env/studio.hdr` (lighting only; the camera sees #03050A). `globe.blend` and `ribbons.blend` are not used.

## Known shortcomings
- The logo gradient reads as pale cyan to blue under AgX and bloom rather than a fully saturated #7BE6FF→#2F6BFF.
- The `?state=dhcp` capture is mostly dark (a modal dims the app), so part of scene 4 (29–32.5 s) is dim even with the brightness lift.
- Volumetric fog shows faint blocky shafts in places (EEVEE volume tile size 8 was kept for speed).
- Scene changes are hard cuts with sound hits. Only S2→S3 has a light-flash transition.
- 8 TAA samples (for speed): motion-blurred particles show slight noise.
