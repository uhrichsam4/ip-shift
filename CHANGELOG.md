# Changelog

## 1.0.0 — 2026-11-02

### Added
- Native macOS app (Swift, AppKit and WKWebView) with a secure custom-scheme web host and an allow-listed bridge.
- Networking core:
  - real Wi-Fi interface detection, snapshot (IPv4, router, DNS, DHCP lease, Wi-Fi metrics) and live change monitoring
  - authorized DHCP lease renewal via SystemConfiguration, with no shell
  - optional Wi-Fi reconnect with a guaranteed power restore
  - internet probe, public IP lookup and diagnostics
  - history and settings persistence
- Switch engine with five real stages, per-stage timeouts, single-flight, and honest outcomes (changed, unchanged, failed, cancelled).
- React, TypeScript and Vite front end:
  - design tokens and three themes
  - GSAP motion system
  - Dashboard, Network, History, Diagnostics and Settings pages
  - SWITCH IP button state machine, results panel, confirm sheet
  - accessibility and reduced-motion support
- Real-time 3D stage (React Three Fiber):
  - Blender-made router, laptop, pedestals, holo kit, globe and ribbons, with a Blender-rendered HDRI
  - shader FX and a staged camera choreography keyed to real operation phases
  - quality tiers with auto-tuning
- Settings → Graphics: presets plus 16 per-feature options (anti-aliasing modes, render scale, frame-rate cap, shadows, AO, planar reflections, bloom, DOF, volumetrics, particles, texture filtering, film effects, tone mapping, FPS counter), persisted natively.
- Performance: lower default render scale, frame-rate cap, one-time contact shadows, no per-frame React work, and hidden scene groups skipped.
- Blender asset pipeline scripts, the launch film pipeline (Blender, synthesized sound design, FFmpeg), and build, DMG and dev scripts.
- Docs: DESIGN.md, ARCHITECTURE.md, TASKS.md, docs/RESEARCH.md.
