# IP SHIFT — Architecture

## Overview

```
┌──────────────────────────── IP SHIFT.app (AppKit, non-sandboxed) ─────────────────────────────┐
│  IPShiftApp (Swift)                                                                            │
│   NSWindow (transparent titlebar) ─ WKWebView ── ipshift://app/  ← AppSchemeHandler (bundle)   │
│        ▲  callAsyncJavaScript(event)          │  postMessage({cmd,args}) → reply               │
│        │                                      ▼                                                │
│   Bridge (allow-listed commands, arg validation, origin check)                                 │
│        │                                                                                       │
│  IPShiftCore (Swift library)                                                                   │
│   WiFiInterfaceLocator · NetworkReader · NetworkMonitor · DHCPLeaseReader                       │
│   SwitchEngine (actor, single-flight) ─ PrivilegedDHCPRenewer · WiFiPowerController            │
│   ConnectivityProbe · PublicIPService · Diagnostics · HistoryStore · SettingsStore             │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
       Web front end (web/, React 19 + TS + Vite): bridge client → zustand store →
       UI (pages, motion system, SWITCH button)  +  R3F Stage (Blender GLBs, shaders, camera rig)
```

## ADR-001: Native Swift + WKWebView instead of Tauri

- The product's core is macOS-only networking: CoreWLAN, SystemConfiguration, Authorization Services, CoreLocation and Network.framework. These are first-class in Swift. In Rust they would need hand-written FFI for private-feeling SC calls and an Objective-C delegate for location permission.
- Tauri on macOS also renders through WKWebView, so the 3D front end (React, TypeScript, Vite, Three.js, GSAP) is identical either way.
- Rust is not installed on this Mac, while Xcode 27.2 and Swift 6.4 are.
- We replicate Tauri's security model ourselves: custom scheme serving only bundled files, strict CSP, navigation lock, allow-listed and validated IPC, and origin checks on every message.

## Bridge

- Contract: `web/src/bridge/protocol.ts` (source of truth), mirrored by `native/Sources/IPShiftCore/Models.swift`.
- JS → native goes through `WKScriptMessageHandlerWithReply` (`ipshift`). Each call returns `{ok,data}` or `{ok:false,error}`.
- Native → JS uses `callAsyncJavaScript` with the event passed as an argument, never string-interpolated. Event types: `snapshot`, `metrics`, `operation`, `operationResult`, `history`, `menu`, `window`.
- When there is no native handler (a plain browser), `web/src/bridge/preview.ts` provides clearly labelled illustrative data with a persistent "PREVIEW · ILLUSTRATIVE DATA" badge. It is only for development and the launch film. The shipped app always runs on the native bridge.

## Networking implementation

| Need | API | Privilege |
|---|---|---|
| Detect Wi-Fi interface | `SCNetworkInterfaceCopyAll` (type IEEE80211) cross-checked with `CWWiFiClient.interfaceNames` | none |
| IPv4, mask, router, DNS | `SCDynamicStore` `State:/Network/Interface/<if>/IPv4`, `State:/Network/Global/IPv4`, `/DNS`; IPv6 via `getifaddrs` | none |
| DHCP lease | `State:/Network/Service/<id>/DHCP`: `LeaseStartTime`, `LeaseExpirationTime`, `Option_51/54/6` | none (verified) |
| SSID/BSSID | CoreWLAN, which macOS redacts until Location Services is authorised (`NSLocationUsageDescription`) | user consent |
| RSSI, noise, channel, PHY | CoreWLAN | none (verified) |
| Live changes | SCDynamicStore notifications, CoreWLAN event delegate, `NWPathMonitor` | none |
| Internet check | HTTP probe `captive.apple.com/hotspot-detect.html` (ephemeral session, 5 s timeout) and DNS resolve | none |
| Public IP | Cloudflare `1.1.1.1/cdn-cgi/trace` or `api.ipify.org` (user-selectable, can be disabled) | network |
| **Renew DHCP lease** | `AuthorizationCopyRights("system.services.systemconfiguration.network")` → `SCPreferencesCreateWithAuthorization` → service interface → `SCNetworkInterfaceForceConfigurationRefresh` (routes through Apple's SCHelper) | admin password prompt (rule `authenticate-admin-nonshared` on macOS 27.2) |
| Reconnect Wi-Fi | `CWInterface.setPower(false/true)` with link-state confirmation | user (unless the admin-for-Wi-Fi-toggle system setting is on) |
| Router ping (diagnostics) | `/sbin/ping` via `Process` with an argument array and a validated IPv4 | none |

There is no shell anywhere: `ping` is the only child process. No MAC spoofing, VPNs, proxies or router reboots.

## Switch pipeline (SwitchEngine)

```
initialise ──► wifi ──► dhcp ──► reconnect ──► results
 baseline      renew: verify link        authorize → refresh →      IPv4 assigned → path      compare IPs read back
 (IP, lease,   reconnect: power off →    wait LeaseStartTime >      satisfied → HTTP probe    from macOS, persist,
 SSID, public) link down → power on →    baseline (25 s); in        (3 tries / 10 s)          emit result
               associated (30 s)         reconnect mode wait 12 s
                                         for auto-lease first
```

- Each transition emits an `OperationEvent` with a phase code only after the real event is observed.
- Timeouts are per stage and produce distinct failure codes.
- **Invariants:**
  - Single-flight: a second start returns `busy`.
  - If the engine turned Wi-Fi off, it restores it on every exit path, including app quit.
  - No network change happens without an explicit `switch.start` that follows a UI confirmation (on by default).
  - Outcomes come only from measured values: `changed`, `unchanged`, `failed` or `cancelled`.
- Lease renewal does not guarantee a different address. Most routers reassign the same address to the same device. The UI says so plainly.

## Front end

- **State:** `web/src/state/store.ts` (zustand) is the single contract between UI and scene. Scene visuals derive from `sceneMode`, `operation.lastPhase` and `sceneSignals`, which are set only from bridge events.
- **UI:** pages (Dashboard, Network, History, Diagnostics, Settings), a GSAP motion system (CustomEase curves, Flip, staggered presence, odometer), the SWITCH button state machine, the results panel and the confirm sheet.
- **Scene:** one persistent R3F `<Canvas>` loads the Blender GLBs (Draco) and the Blender-rendered HDRI. It adds shader FX (energy stream, globe, ribbons, particles, packets), a camera rig with a shot list per `sceneMode`, a network-space group for the warp sequence, and post-processing gated by quality tier with `PerformanceMonitor` auto-tuning. Rendering pauses when the window is hidden.

## Asset pipeline

`blender/scripts/*.py` (headless Blender 5.1) → `blender/source/*.blend` → `web/public/assets/models/*.glb` (Draco, WebP textures), `env/studio.hdr`, `icon/icon_1024.png`. The node and material names are a contract (DESIGN.md §21). The film appends the same `.blend` sources.

## Build and packaging

- `scripts/build-app.sh` runs `vite build`, then `swift build -c release`, then assembles `dist/IP SHIFT.app` (Info.plist, icns, web resources), then signs it (Apple Development identity if present, otherwise ad-hoc).
- `scripts/make-dmg.sh` produces `dist/IP-SHIFT-1.0.0.dmg`.
- `scripts/dev.sh` runs Vite HMR plus the debug app pointed at it.

## Testing

- Unit tests (`swift test`): validators, DHCP option parsing, outcome computation, history persistence, and the engine with fakes for changed, unchanged, auth denied, refresh failed, power failure, reconnect timeout, no internet, missing interface, busy, and Wi-Fi restore on failure.
- Read-only live checks: `ipshift-cli snapshot` and `ipshift-cli diagnostics`.
- Live switching changes the user's real network and needs their admin password, so the user runs it (see TASKS.md).

## Directory layout

```
DESIGN.md ARCHITECTURE.md TASKS.md README.md CHANGELOG.md
docs/            research notes, renders
native/          SwiftPM: IPShiftCore, IPShiftApp, ipshift-cli, tests
web/             React + R3F front end (src/bridge, state, design, motion, ui, pages, scene)
blender/         scripts, source .blend files, fonts (OFL)
film/            launch film scripts, audio, source .blend, outputs
scripts/         build-app.sh, make-dmg.sh, dev.sh, Info.plist
```
