# IP SHIFT — Tasks

Status: ✅ done and verified · 🟡 done, not fully verified · ⏳ in progress · ⬜ outstanding

## Phase 1: Research and planning
- ✅ Environment inspection (macOS 27.2, Xcode 27.2, Swift 6.4, Node 26, Blender 5.1.2, ffmpeg, signing identity, ~6 GB free disk)
- ✅ Toolkit, AI, mobile and design research (docs/RESEARCH.md)
- ✅ macOS networking API verification (read-only probes)
- ✅ ARCHITECTURE.md, DESIGN.md, bridge contract (`web/src/bridge/protocol.ts`), store contract (`web/src/state/store.ts`)

## Phase 2: Visual development
- ✅ Blender asset library: router 27k tris, laptop, pedestal, holo kit, globe, ribbons, HDRI, icon. One-command rebuild (`blender/scripts/build_all.py`), GLB names validated.
- ✅ Design tokens, motion system, app shell, all five pages, graphics menu, FPS overlay
- 🟡 R3F stage, lighting, shaders, camera choreography. The idle and preview states are verified visually; the live sequence choreography has not been seen with real native events.

## Phase 3: Networking
- ✅ Interface detection, snapshot, live monitoring, DHCP lease reading (verified with real data in the app and with `ipshift-cli`)
- 🟡 Authorized DHCP renewal, Wi-Fi reconnect, switch engine with safety invariants. Unit-tested with fakes and reviewed; not run live (needs the user's password and drops Wi-Fi).
- ✅ Connectivity probe, public IP, diagnostics (9/9 pass via CLI), history and settings persistence

## Phase 4: Integration
- 🟡 Native bridge ↔ store ↔ scene: the snapshot, metrics and settings round-trip are verified in the native app. Operation events are verified only via the preview simulation.

## Phase 5: Testing and refinement
- ✅ 26 unit tests pass (changed, unchanged, auth denied, refresh failed, power failure, reconnect timeout, no internet, missing interface, busy, Wi-Fi restore with retries, failed phase codes, graphics settings)
- ⬜ **Live switch on real hardware (user):** needs the admin password and briefly interrupts Wi-Fi, so it was not run by the agent. Steps are in README → "Verifying a live switch".
- ⬜ Location permission flow (user consent dialog)
- 🟡 Visual QA: dashboard, network, settings, results and sequence states captured and fixed (grey wash, framing, black canvas from MSAA 8×). Transitions were not reviewed frame by frame.

## Launch film
- ✅ `film/IP-SHIFT-LAUNCH.mp4`: 42 s, 1080p30, H.264 plus AAC, −16 LUFS, with thumbnail, .blend and scripts. 4K60 was not feasible in the time and disk budget.

## Performance (in-app benchmark, native WKWebView, M4 Pro, 120 Hz)
Run with `IPSHIFT_BENCH=1 "dist/IP SHIFT.app/Contents/MacOS/IPShift"`. Each pass runs 6 s and the first 1 s is discarded.

| Pass | avg fps | p95 | p99 | max | frames >16.7 ms |
|---|---|---|---|---|---|
| Low, idle | 120.0 | 10 ms | 11 ms | 14 ms | 0% |
| Balanced, idle | **120.0** | 10 ms | 10 ms | 12 ms | 0% |
| High, idle | 108.1 (AO since removed from High) | 10 ms | 11 ms | 12 ms | 0% |
| Ultra, idle | 58.5 (since retuned: 0.9 scale, AO low, DOF only during switch) | 18 ms | 20 ms | 51 ms | 72% |
| Balanced, switch sequence | 118.2 (46 ms DOF-rebuild hitch since fixed) | 9 ms | 11 ms | 46 ms | 0.5% |

After the round-2 critic fixes (final build): Low 119.6 · **Balanced 120.0 (p95 9 ms, p99 10 ms)** · High 119.8 · Ultra 115.8 · Balanced switch sequence 115.1 (one 159 ms hitch). The window was not focused for every pass, so these numbers are conservative.

- Before this work: 17–25 fps. The causes were:
  - WebKit's default 60 fps rAF cap (`PreferPageRenderingUpdatesNear60FPSEnabled`)
  - live backdrop blur over the canvas
  - a lit full-screen floor
  - double-sided additive ribbons
  - filtered SVG animations
  - Balanced capped at 60
- Rendering bugs the benchmark exposed, all fixed:
  - the canvas remounted on AA changes
  - N8AO halfRes drew into an unallocated target
  - the capped `advance()` loop broke the viewport
- ✅ Fixed: the white floor after toggling reflections. The two floor variants were unkeyed siblings, so React reused one mesh, and dropping its `material` prop reset it to three's default white material.
- ⬜ Outstanding: one 159 ms hitch in the switch sequence; mesh merging (about 130 draw calls).

## Known issues / next
- ⬜ Live switch test by the user (see README).
- ⬜ Film: 60 fps and 4K render, smoother scene transitions, a brighter scene-4 capture.
- ⬜ Router glass shows one large flat reflection; keycaps have no legends.

## Windows port (Electron + Win32)
- ✅ `windows/`: an Electron shell with a secure `app://` protocol, the `window.ipshiftNative` transport, menus, and a UAC relaunch for lease renewal. The backend uses koffi FFI to iphlpapi (GetAdaptersInfo, IpRenewAddress) and wlanapi (current connection, channel, RSSI), with no shell.
- ✅ Installer built from macOS: `windows/release/IP-SHIFT-Setup-1.0.0-x64.exe` (unsigned; SmartScreen will warn).
- 🟡 Untested on real Windows. Win32 struct layouts are hand-checked against the Microsoft headers.
- ⬜ Reconnect mode and the ICMP router ping are stubbed on Windows; Windows unit tests, arm64/portable builds and the .ico icon are still to do.
