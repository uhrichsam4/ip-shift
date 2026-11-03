# IP SHIFT — Design Specification

The single design source of truth. Tokens are implemented in `web/src/design/tokens.css` (CSS custom properties) and `web/src/design/tokens.ts` (the same values for GSAP and Three.js). Blender materials mirror the 3D colours below. No component may use a raw value that is not a token.

## 1. Philosophy

1. **An honest instrument.** Every number, animation and verdict reflects a measured state. The app never shows a "new IP" it has not read back from macOS, and never implies the router must hand out a different address.
2. **Cinematic, then calm.** The scene is alive at idle (slow, quiet motion). It becomes theatrical only when the user presses SWITCH IP, and it always settles back.
3. **One button.** The SWITCH IP button is the brightest, most tactile object on screen. Everything else is at least 30% dimmer.
4. **Native manners.** macOS traffic lights, menus, keyboard shortcuts, Reduce Motion, VoiceOver and system fonts are respected.
5. **One light colour does the work.** Electric blue and cyan carry the light. Purple is an accent below 5% of the screen. Green, amber and red appear only as status.

## 2. Visual direction and composition (north star = the user's mockup)

- macOS window with traffic lights over a dark navy sidebar (logo, five nav items, live network-status card with sparkline at the bottom).
- The centre is a full-bleed real-time 3D stage: **laptop on a lit circular pedestal (left)**, **router on a lit pedestal (right)**, an **electric energy stream** arcing between them, a **holographic globe** behind, floating **glass labels** ("Your Mac · 192.168.x.x", "Wi-Fi Router · Connected"), and slowly flowing **blue/violet light ribbons** in the deep background, so the background is always moving.
- The bottom centre holds the enormous pill-shaped **SWITCH IP** button with a lightning glyph and its energy ring, and the caption "Request a fresh local IP from your router ›".
- The right side holds a glass **info panel** (Local IP, Public IP, Wi-Fi Network, Interface, Status, Internet, DHCP).
- The bottom holds a glass **Recent Activity** strip (latest three history rows, View All →).
- The top right holds a chip with the real macOS version (no Apple logo).
- Changes from the mockup: no Apple logos anywhere (trademark), real data only, honest copy.

## 3. Colour palette

| Token | HEX | Use |
|---|---|---|
| `--void` | `#03050A` | Window background, 3D clear colour |
| `--bg` | `#060912` | App base |
| `--navy-900` | `#070C1C` | Sidebar base |
| `--navy-800` | `#0A1228` | Raised navy surface |
| `--navy-700` | `#0E1A38` | Active fills |
| `--graphite-900` | `#0B0E14` | Neutral surface |
| `--graphite-800` | `#11151D` | Table rows |
| `--graphite-700` | `#171C26` | Inputs |
| `--graphite-600` | `#202734` | Pressed |
| `--line-1` | `rgba(148,178,255,0.08)` | Hairline dividers |
| `--line-2` | `rgba(148,178,255,0.14)` | Panel borders |
| `--line-3` | `rgba(148,178,255,0.26)` | Focus/hover borders |
| `--text-1` | `#F3F6FC` | Primary text, numbers |
| `--text-2` | `#A6B1C8` | Secondary |
| `--text-3` | `#76829C` | Tertiary, labels (≥4.5:1 on `--bg`) |
| `--text-4` | `#4A546B` | Disabled |
| `--blue-500` | `#2F6BFF` | Electric blue (primary light) |
| `--blue-400` | `#4C86FF` | Hover |
| `--blue-300` | `#8AAEFF` | Soft text accent |
| `--cyan-400` | `#35D6FF` | Live / data light |
| `--cyan-300` | `#7BE6FF` | Focus ring |
| `--cyan-200` | `#C2F5FF` | Hot highlights |
| `--violet-500` | `#7A4DFF` | Accent (≤5%) |
| `--violet-400` | `#9A73FF` | Accent highlight |
| `--success` | `#2FD98B` | Connected / online / changed |
| `--warning` | `#FFB547` | Unchanged-with-caveat, captive portal |
| `--danger` | `#FF4D6D` | Failed / offline |

**3D emissives (linear, toneMapped=false):** LED cyan `#35D6FF` ×4, LED blue `#2F6BFF` ×5, LED white `#EAF2FF` ×3, status green `#2FD98B` ×3, amber `#FFB547` ×3, red `#FF4D6D` ×3. The energy stream gradient is `#2F6BFF → #35D6FF → #9A73FF`.

**Themes** (Settings): `midnight` (default, the palette above); `graphite` (navy surfaces swapped for graphite, cyan as the primary light); `aurora` (violet raised to a secondary light at ≤15%, blue primary).

## 4. Typography

| Role | Family | Notes |
|---|---|---|
| Display | **Unbounded Variable** (SIL OFL, bundled) | Wordmark, SWITCH IP label, page and stage titles |
| UI | `system-ui` (SF Pro) | Body, labels, controls |
| Data | `ui-monospace` (SF Mono) | IPs, MACs, timestamps, logs. Always `font-variant-numeric: tabular-nums slashed-zero` |

| Token | Size / line height | Weight | Tracking | Font |
|---|---|---|---|---|
| `micro` | 10/12 | 600 | 0.14em, uppercase | UI |
| `caption` | 11/14 | 500 | 0.04em | UI |
| `body-s` | 12/16 | 400 | 0 | UI |
| `body` | 13/18 | 400 | 0 | UI |
| `body-l` | 15/22 | 400 | 0 | UI |
| `title-s` | 15/20 | 600 | 0 | UI |
| `title` | 18/24 | 600 | -0.005em | UI |
| `headline` | 24/30 | 600 | -0.01em | Display |
| `display` | 40/44 | 600 | -0.015em | Display |
| `data-l` | 22/26 | 500 | -0.01em | Data |
| `hero-data` | 64/68 | 400 | -0.03em | Data (results IP) |
| `button-xl` | 30/34 | 700 | 0.03em | Display (SWITCH IP) |

Huge numerals use a light weight, tight tracking and a faint top-to-bottom gradient (`--text-1 → #BFD0F0`). They never use bold plus glow.

## 5. Spacing scale (4-pt)

`--sp-0_5:2` `--sp-1:4` `--sp-1_5:6` `--sp-2:8` `--sp-3:12` `--sp-4:16` `--sp-5:20` `--sp-6:24` `--sp-8:32` `--sp-10:40` `--sp-12:48` `--sp-16:64` `--sp-20:80` (px). The sidebar is 232px. Panel padding is 20px. Window edge gutter is 24px.

## 6. Radius

`--r-xs:6` `--r-sm:8` `--r-md:12` `--r-lg:16` `--r-xl:20` `--r-2xl:28` `--r-pill:999`. Panels use `lg`, glass labels use `md`, nav items use `md`, the SWITCH button uses `pill`, and chips use `pill`.

## 7. Surfaces and glass

| Token | Recipe |
|---|---|
| `glass-1` (panels) | bg `linear-gradient(180deg, rgba(20,28,52,.62), rgba(8,12,26,.74))`, `backdrop-filter: blur(20px) saturate(140%)`, border 1px `--line-2`, inset top highlight `inset 0 1px 0 rgba(255,255,255,.06)` |
| `glass-2` (active/raised) | as `glass-1` plus bg tint `rgba(47,107,255,.14)`, border `rgba(76,134,255,.40)` |
| `glass-3` (holo labels) | bg `rgba(10,22,58,.55)`, border `rgba(90,150,255,.45)`, glow `0 0 24px rgba(47,107,255,.25)`, 1px inner scanline texture at 4% |
| `sidebar` | `linear-gradient(180deg,#0A1330 0%,#070C1C 60%,#060A16 100%)` at 92% opacity, right hairline `--line-1` |

All glass gets a 2% noise overlay to prevent banding.

## 8. Shadows and glow

`--e1: 0 1px 2px rgba(0,0,0,.45)` · `--e2: 0 8px 24px -8px rgba(0,0,0,.6)` · `--e3: 0 24px 60px -20px rgba(0,0,0,.72)` · `--e4: 0 40px 100px -30px rgba(0,0,0,.85)` · `--glow-s: 0 0 12px rgba(47,107,255,.35)` · `--glow-m: 0 0 32px rgba(47,107,255,.40)` · `--glow-l: 0 0 64px rgba(53,214,255,.35)`. DOM glow radius never exceeds 64px. Large bloom belongs to the 3D scene.

## 9. Lighting (3D)

- **Environment:** Blender-rendered HDRI `studio.hdr` (dark studio, cool top softbox, cyan and blue strip lights, faint violet rim) via PMREM, `environmentIntensity 0.9`, no visible background.
- **Three-point setup:** key = rect area light, cool white `#DCE6FF`, from top-front-left. Rim = blue `#2F6BFF` behind the router. Fill = faint violet `#7A4DFF` at low intensity from the left. Pedestal rings add emissive bounce.
- **Tone mapping:** ACES Filmic by default (AgX and Neutral selectable), exposure 1.0. Fog: exp2 `#03050A`, density 0.06.
- **Post (quality-gated):** Bloom (mipmap blur, threshold 0.85, intensity 0.9) · Depth of field (focus driven by camera shot) · N8AO ambient occlusion (High+) · Vignette 0.35 · Noise 0.025 · subtle chromatic aberration only during warp transitions.
- **Volumetrics:** additive fresnel light cones above the pedestals plus fog. No raymarching.

## 10. Motion system

**Curves** (registered as GSAP `CustomEase` with the same names):

| Name | cubic-bezier | Use |
|---|---|---|
| `ip.standard` | `0.2, 0, 0, 1` | Default UI |
| `ip.enter` | `0.05, 0.7, 0.1, 1` | Entrances |
| `ip.exit` | `0.3, 0, 0.8, 0.15` | Exits |
| `ip.camera` | `0.65, 0, 0.35, 1` | Camera dollies and orbits |
| `ip.warp` | `0.7, 0, 0.84, 0` → `expo.out` | Fly-in and fly-out |
| `ip.spring` | GSAP `back.out(1.35)` | Panels, overshoot ≤ 4% |
| `ip.press` | `0.3, 0, 0.2, 1` | Button depress |

**Durations (ms):** instant 80 · micro 140 · fast 200 · base 320 · moderate 450 · slow 640 · deliberate 900 · camera-short 1200 · camera 1800 · camera-long 2600 · ambient loops 6–20 s. **Stagger:** list rows 35 ms, panels 60 ms, characters 18 ms.

**Rules**
- One hero motion at a time. UI chrome dims and blurs (opacity 0.35, 6px) while the camera flies, then restores.
- Page transition: the outgoing page fades, rises 8px and blurs 4px over 200 ms (`ip.exit`). The incoming page's children stagger in (opacity, y 12→0) over 450 ms (`ip.enter`). The 3D canvas persists across pages and is never remounted. On non-dashboard pages it recedes (camera pulls back, scene dims to 40%).
- Sidebar active pill moves with GSAP Flip (320 ms, `ip.spring`).
- Panels, modals and dropdowns scale from 0.96 with opacity over 320 ms (`ip.spring`). The backdrop blur ramps from 0 to 12px.
- IP address changes animate per digit: an odometer roll with 30 ms stagger. Status changes crossfade colour over 450 ms, and dots pulse once.
- No abrupt `display` toggles: everything mounts with an entrance and unmounts after its exit timeline.

## 11. Camera principles and shot list (metres, Y up)

Scene layout: laptop pedestal at `(-0.55, 0, 0.05)`, router pedestal at `(0.55, 0, -0.10)`, globe centre at `(0, 0.75, -2.4)` with radius 1.1, ribbons at z ≈ -5 to -8. The network space group sits at `(0, 0, -40)`.

| Shot | Position | Target | FOV | Notes |
|---|---|---|---|---|
| HERO (idle) | `(0, 0.62, 2.05)` | `(0, 0.16, 0)` | 30 | 14 s sine sway ±0.05 m, pointer parallax ±0.04 m, OrbitControls (damped, polar 55–85°, distance 1.4–3.5, no pan) |
| S1 ORBIT (initialise) | radius 0.95 around router, height 0.35 | router `(0.55,0.22,-0.1)` | 28 | Slow orbit while the stage is active. Scene isolates (other objects dim to 25%). LEDs ramp |
| S1 SYMBOL | `(0.62, 0.55, 0.62)` | `(0.55, 0.66, -0.1)` | 28 | Holographic Wi-Fi symbol rises above the router |
| S2 WARP-IN (wifi) | through the symbol | — | 28→70→38 | 1.4 s `ip.warp`, flash and chromatic aberration at the threshold, arrive in the network space |
| NET WIDE | rel `(-0.6, 0.35, 3.2)` | link midpoint | 38 | Mac node ⟷ router node; the link breaks and re-forms on real Wi-Fi events |
| NET TRACK (dhcp) | trucks x -1.2 → 1.0 asymptotically | link | 38 | Packets flow while the real lease request is pending |
| NET RISE (reconnect) | `(0, 1.6, 3.4)` rel | network centre | 40 | Pathways light as each real check passes |
| S5 WARP-OUT (results) | reverse warp to WIDE `(0, 0.95, 3.1)` | `(0,0.2,0)` | 34 | Then settles to HERO over 1.8 s; the results panel enters |

Depth of field follows the shot target (focus range 0.4). Motion blur is not used in real time (no reliable WebGL support); it is used in the launch film only.

## 12. SWITCH IP button

Anatomy: outer energy ring (SVG, dashed conic stroke rotating at 12 s per turn) → glass rim (2px gradient border `#8AAEFF → #2F6BFF → #7A4DFF`) → body (deep navy gradient `#16245A → #0A1230`, inner top highlight) → lightning glyph plus "SWITCH IP" (`button-xl`) → underline light bar (violet-blue gradient). Size: 440×96px (regular) or 380×84 (compact).

| State | Behaviour |
|---|---|
| Idle | Breathing glow (opacity .55↔.8, 4 s). The ring rotates slowly |
| Hover | Elevates (translateY -3px, shadow `--e3` plus `--glow-m`) in 200 ms. A light sweep crosses the body (700 ms). The ring speeds to 4 s per turn and brightens. The 3D pedestal rings brighten 20% |
| Pressed | Depresses (translateY +2px, scale .975, inner shadow) in 90 ms `ip.press`. On release: a radial energy ripple (two rings, 900 ms), a scene flash event (the 3D bloom spikes and the environment rings pulse), then the sequence starts |
| Confirming | If confirm-before-switch is on, an anchored glass confirm sheet explains exactly what will happen (password prompt, brief Wi-Fi drop in reconnect mode) |
| Running | Morphs (450 ms) into a progress capsule: stage index "2/4", live stage label, ring as a determinate stage meter. Disabled and `aria-busy` |
| Result | Brief tint: success-cyan (changed), neutral blue (unchanged), danger (failed). Returns to idle after the results panel closes |
| Disabled | 40% opacity, no glow, tooltip with the reason (no Wi-Fi, Wi-Fi off, running) |

## 13. Hover behaviour

Interactive elements lift their border to `--line-3` and brighten their text one step in 140 ms. Rows get a 4% blue wash. Icons shift 1px. The cursor is a pointer only on actionable elements. 3D: hovering the router or laptop raises its label glow and shows a tooltip. Clicking the router focuses the camera on it (S1-style orbit, Esc returns).

## 14. States

- **Loading (app start):** the logo mark draws on (stroke, 900 ms) while assets load. A thin progress hairline sits under the wordmark. The scene fades in from black with the camera dollying from 1.3× distance. If loading takes more than 6 s, the text "Preparing 3D scene…" appears.
- **Loading (data):** values show a shimmer skeleton in place (same width, no layout shift). Never show "0.0.0.0".
- **Success:** "Address changed" (success colour) or "Lease renewed — same address" (blue, with an explanation). Internet is reported separately: "Internet restored · 38 ms".
- **Error:** factual title, cause and next step, e.g. "Authorization cancelled — no changes were made. [Try again]". Wi-Fi left off is never possible: the engine always restores power.
- **Empty:** History shows "No switches yet" with a muted 3D-styled glyph and a primary "Switch IP" link. No Wi-Fi hardware shows "No Wi-Fi interface detected" and the button is disabled. SSID hidden shows "Hidden by macOS · Allow Location" (action button).

## 15. Copy rules

Local IP and public IP are always labelled separately. The public IP note reads: "Assigned by your internet provider — switching your local IP doesn't change it." Never write "new IP" until it has been verified. The unchanged verdict reads: "Your router renewed the lease and kept the same address. Many routers reserve one address per device."

## 16. Layout and responsiveness

Minimum window 1100×700, default 1440×900. Breakpoints by content width: **compact** < 1280 (info panel narrows to 280px, Recent Activity shows two rows, button 380px), **regular** 1280–1679, **wide** ≥ 1680 (scene gets more breathing room, panels cap at 360px). The 3D camera FOV adapts to aspect so both devices stay framed. Full screen is supported.

## 17. Accessibility

- Text contrast ≥ 4.5:1 (labels use `--text-3` or lighter). The focus ring is 2px `--cyan-300` with a 2px offset plus `--glow-s`, always visible on keyboard focus.
- Keyboard: Tab order follows visual order. ⌘1–⌘5 navigate. ⌘R refreshes. ⌘⏎ starts Switch (via confirm). Esc closes overlays and results. Space/Enter activate. Arrow keys work in segmented controls.
- A `aria-live="polite"` region announces each real stage change and the final result. The 3D canvas is `aria-hidden` with a text equivalent in the info panel.
- All icons have labels. Hit targets are ≥ 28px.

## 18. Reduced motion

Triggered by macOS Reduce Motion (`prefers-reduced-motion`) unless overridden in Settings. Camera flights become 400 ms crossfades between static framings. No orbit sway, parallax, warp or chromatic aberration. Particles freeze. Ribbons slow to 10%. The odometer becomes a crossfade. Stage progress, real data and verdicts are unchanged.

## 19. Graphics settings and quality tiers (Settings → Graphics)

Presets (Auto · Low · Balanced · High · Ultra · Custom) fill 16 per-feature options defined in `GraphicsSettings` (`protocol.ts`) and `web/src/state/graphics.ts`. The options are anti-aliasing (Off/FXAA/SMAA/MSAA 2×/4×/8×), render scale (50–100%), frame-rate cap (30/60/120/display), shadows, screen-space AO, planar reflections, bloom, depth of field, volumetric light, particles, texture filtering (1–16×), chromatic aberration, film grain, vignette, tone mapping (ACES/AgX/Neutral) and an FPS counter. Editing any option switches to Custom. Each control shows a cost tag. WebGL has no hardware ray tracing, so reflections are planar mirrors and AO is screen-space. The summary below gives the rough intent of each preset; the exact values live in `graphics.ts`.


| Tier | DPR | Post | Particles | Shadows / AO | Other |
|---|---|---|---|---|---|
| Low | 1 | tone mapping only | 600 | baked AO only | ribbons 1 layer, 30 fps idle cap |
| Balanced | ≤1.5 | bloom, vignette, noise | 2 500 | contact shadows 512 | DOF in sequence only |
| High | ≤2 | + DOF, N8AO half-res, SMAA | 6 000 | contact shadows 1024 | — |
| Ultra | 2 | + N8AO full, CA in warps | 12 000 | contact 2048 | floor reflections |
| Auto | starts Balanced, drei `PerformanceMonitor` steps up or down | | | | |

Rendering pauses when the window is hidden.

## 20. 3D modelling specification

- Units: metres at real scale, Y-up in glTF (Blender Z-up, converted on export). Router ≈ 0.32 × 0.06 × 0.22 m. Laptop ≈ 0.31 × 0.016 × 0.22 m (lid open ~110°). Pedestal Ø 0.56 m.
- Topology: quads where it matters, beveled edges (2–3 segments, 0.6–1.5 mm), weighted normals, no n-gons on curved surfaces, applied modifiers on export.
- Budgets (triangles): router ≤ 70k, laptop ≤ 45k, pedestal ≤ 12k each, holo kit ≤ 25k, globe ≤ 20k, ribbons ≤ 12k. The whole scene stays under 250k triangles and 120 draw calls.
- Pivots: antennas pivot at their hinge. The laptop lid pivots at the hinge axis. Every root sits at the floor centre.

## 21. Blender asset specification

The files and node names are the contract with the web scene. Scripts live in `blender/scripts/`, sources in `blender/source/*.blend`, and exports in `web/public/assets/models/`.

| File | Required nodes (exact names) | Required materials |
|---|---|---|
| `router.glb` | `Router` (root), `Router_Body`, `Router_Glass`, `Router_Vents`, `Router_Ports`, `Antenna_1`…`Antenna_4` (pivots at hinge), `LED_Power`, `LED_Internet`, `LED_WiFi`, `LED_LAN`, `Router_LightBar`, `Router_CoreGlow` (internal illumination plane) | `M_Aluminium`, `M_GlassSmoked`, `M_PortMetal`, `M_Rubber`, `E_LED_Power`, `E_LED_Internet`, `E_LED_WiFi`, `E_LED_LAN`, `E_LightBar`, `E_CoreGlow` |
| `laptop.glb` | `Laptop` (root), `Laptop_Base`, `Laptop_Keys`, `Laptop_Trackpad`, `Laptop_Lid` (pivot at hinge), `Laptop_Screen` (UVs 0–1 upright, 16:10), `Laptop_Bezel` | `M_LaptopAlu`, `M_Keys`, `M_TrackpadGlass`, `M_Bezel`, `E_Screen` |
| `pedestal.glb` | `Pedestal` (root), `Pedestal_Base`, `Pedestal_Top`, `Pedestal_RingInner`, `Pedestal_RingOuter`, `Pedestal_Segments` | `M_PedestalMetal`, `M_PedestalGlass`, `E_RingBlue`, `E_RingCyan` |
| `holo_kit.glb` | `Holo_WiFi` (3 arcs plus dot, children `Holo_WiFi_Arc1..3`, `Holo_WiFi_Dot`), `Holo_Node`, `Holo_Ring_A`, `Holo_Ring_B`, `Holo_Ring_Segmented`, `Holo_Particle`, `Holo_Panel` (rounded glass panel 1×0.56), `Holo_Wave` (signal arc), `Holo_Path` (curved tube with 0–1 U along length) | `H_Holo` (emissive cyan, used as a template) |
| `globe.glb` | `Globe` (root), `Globe_Dots` (dotted sphere), `Globe_Grid` (lat/long lines), `Globe_Arcs` (network arcs with U along length) | `H_GlobeDots`, `H_GlobeGrid`, `H_GlobeArcs` |
| `ribbons.glb` | `Ribbon_1`…`Ribbon_5` (swept surfaces, U along length 0–1, V across 0–1) | `H_Ribbon` |
| `env/studio.hdr` | 2048×1024 equirect, rendered in Cycles | — |
| `icon/icon_1024.png` | App icon render | — |

Materials are PBR Principled BSDF: aluminium metallic 1, roughness 0.28–0.38 with a baked smudge or brushed roughness map. Smoked glass is base `#0A0F1A`, roughness 0.05, clearcoat. Port metal is metallic 1, roughness 0.2. Rubber is roughness 0.8. Emissives are pure emission (the web replaces intensities at runtime). Textures are ≤ 2048, baked AO plus roughness variation, WebP inside the GLB, Draco geometry compression (level 6). Size targets: router ≤ 4 MB, laptop ≤ 3 MB, others ≤ 1 MB each.

## 22. Iconography

Custom inline SVG set on a 24px grid: 1.5px stroke, round caps and joins, `currentColor`. Set: dashboard, network, history, diagnostics, settings, bolt, wifi (0–3 bars), router, laptop, globe, refresh, copy, check, warning, error, chevron, arrow-right, lock, location, info, external. The logo mark is an isometric hexagonal cube with one shifted face (original), gradient `#7BE6FF → #2F6BFF`.

## 23. Components

| Component | Spec |
|---|---|
| Sidebar | 232px. Traffic-light safe area of 52px at the top. Logo (32px mark plus wordmark in Display 18/600). Nav list with 4px gap. Network Status card at the bottom (glass-1, sparkline 160×40 of RSSI or latency, status dot plus label) |
| NavItem | 40px tall, `r-md`, icon 20px plus `body-l`. Hover: 4% wash. Active: `glass-2` pill (Flip-animated), icon in `--blue-400` |
| StatusChip | Pill 28px, glass-1, dot plus `caption` |
| InfoPanel | glass-1, `r-lg`, 20px padding, rows 36px with `--line-1` dividers. Label in `body-l --text-2`, value in `title-s` mono for IPs, aligned right. Status dot 8px with a soft glow. Copy-on-click for IPs |
| HoloLabel | glass-3 card anchored to a 3D point (projected each frame), icon plus two lines (`caption` label, `data-l` value), hairline leader to its object |
| StageHUD | Top-centre: stage title in Display `headline`, letter-stagger reveal. Five-step tracker with hairline connectors, each step pending/active (pulsing)/done/failed/skipped |
| EventLog | Bottom-left during a run: mono `body-s` lines (`HH:MM:SS.mmm phase · message`), newest at the bottom, max 6 visible, fade-out top mask |
| ResultsPanel | Centred glass-1 at 560px. Previous → current IP in `hero-data` with odometer. Verdict badge, internet line, lease line, public IP line. Buttons: Try again (primary), View history, Done |
| ConfirmSheet | Anchored above the button. Title, the exact steps that will happen, Cancel / Switch IP |
| HistoryTable | Summary strip (total, changed %, average duration) plus a timeline. Rows: time, mode, previous → new, verdict badge, internet, duration. Expand for failure detail. Export and Clear (with confirm) |
| DiagnosticsList | Each check: icon state, label, detail, duration. "Run diagnostics" button. Copy report |
| Settings controls | Segmented control (pill, Flip highlight), toggle (36×20, spring knob), select (glass dropdown) |
| Toast | Bottom-right glass-1, 3.2 s auto-dismiss, for copy and refresh feedback |

## 24. Launch film art direction

Same palette, lighting and assets as the app. Black to a single blue point light, then the router reveal, network rings, laptop and energy stream, the warp into the Wi-Fi symbol, the network space, the app on screen (clearly labelled illustrative data), the final ring and logo, then "YOUR NETWORK. YOUR CONTROL." then "IP SHIFT". Original synthesized sound design (sub impacts, electrical crackle, whooshes, mechanical clicks, final hit). Pipeline: `film/README.md`.
