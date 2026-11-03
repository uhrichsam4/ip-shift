# Research and tooling decisions (2026-11-02)

Read-only research by `research` subagents plus local probes on this Mac. Nothing below was installed.

## Claude Code toolkits (Part 6)

| Repo | What it is | Footprint / security | Verdict |
|---|---|---|---|
| garrytan/gstack | Role-based slash-command skills plus a headless QA browser | Global install into `~/.claude/skills`, needs Bun, hourly auto-update check | **Borrow ideas** (QA and design-review checklists) |
| affaan-m/everything-claude-code | 71 agents, 314 skills, hooks, rules | Writes rules, agents and skills into `~/.claude` and edits settings.json | **Skip**: duplicates our builder, reviewer and research agents |
| ruvnet/claude-flow (ruflo) | Swarm orchestration, MCP server, daemon | `curl \| bash`, background workers, hooks | **Skip**: worst security profile, overlaps the Workflow tool |
| oh-my-claudecode | Multi-agent teams with tmux workers. The given URL Yuyz0112/… returns 404; the real repo is Yeachan-Heo/oh-my-claudecode | npm postinstall, native deps, settings edits | **Skip** |
| addyosmani/agent-skills | Markdown engineering skills (debugging, review, TDD, frontend) | Markdown only | **Borrow selectively** (no install needed for this build) |
| thedotmack/claude-mem | AI-compressed session memory | Hooks, persistent Bun worker, optional cloud sync | **Skip**: built-in memory covers it |
| mksglu/context-mode | Keeps tool output out of context | Hooks, MCP, postinstall, unclear licence | **Borrow idea**. Revisit if context bloat becomes a problem |
| stablyai/orca | Electron app for parallel agents in worktrees | Separate app, telemetry opt-out | **Skip**: the desktop app already does worktrees |

**Workflow used:** the built-in coordinated setup, with no extra framework. A lead plans and writes the specs (DESIGN.md, ARCHITECTURE.md, `protocol.ts`, `store.ts`). `research` agents gather outside facts. Five parallel `builder` agents own disjoint folders (native, Blender assets, web UI, web scene, film). `reviewer` checks the result against the brief. The Blender MCP server already connected in this session made a second Blender MCP unnecessary.

## AI and architecture references (Part 6)

LangChain, LangGraph, CrewAI, Ollama, Qdrant, awesome-llm-apps and ai-agents-for-beginners are **not adopted**, because IP SHIFT has no genuine AI requirement. Patterns borrowed:

- An explicit typed state machine for the pipeline (from LangGraph): a Swift enum mirrored by a TypeScript union, with every visual keyed off state names.
- A serialisable operation state so a reload can resume (`switch.state`).
- Per-stage timeouts, single-flight with a run ID, post-condition health checks, and retry with backoff for the public-IP lookup only. The lease renewal is never auto-retried. (From system-design-primer.)

## Mobile references (Part 7)

No React Native dependency is adopted. Patterns borrowed:

- Token and theme structure (Tamagui, gluestack): one token file feeding CSS, GSAP and Three.js.
- Interruptible, velocity-aware spring motion (Reanimated, bottom-sheet), mapped to GSAP `overwrite:auto`, `back.out` settles and Flip.
- Shader-driven transitions (Skia SkSL), ported to GLSL.
- A minimal gradient sparkline (gifted-charts), hand-rolled in SVG.

## Design research (Part 9)

- **Primary reference:** the user's mockup (DESIGN.md §2).
- **Awwwards 3D collection (checked 2026-11-02):** recurring traits among Sites of the Day, e.g. Spyker Cars and Dont Look Up, are a single hero object, staged camera choreography, quiet UI during camera moves, and restrained luminous accents on near-black. Principles adopted:
  - one dominant light colour
  - a luminance hierarchy with the CTA brightest
  - hairlines for structure and fills only for active state
  - glow only on live elements
  - one hero motion at a time
  - tabular, light-weight huge numerals
  - low-opacity grain and vignette
- **onepagelove's dark tag** returned 404 and **godly** redirects to recent.design. Neither was used.
- **Subframe MCP:** it exists (`https://mcp.subframe.com/mcp`, needs an account token; docs-only server at `docs.subframe.com/mcp`). It was not connected: it only exposes designs built in Subframe, and IP SHIFT's UI is a bespoke R3F/React surface.
- **DESIGN.md tools:** designmd.me (credit-based generator; its section list of Colours / Typography / Spacing / Radius / Elevation / Components / Breakpoints informed our structure) and styles.refero.design (library). design-md.hyperbrowser.ai, designmd.supply, typeui.sh and neuform.ai were unreachable or irrelevant. None was needed.

## macOS facts verified on this Mac (macOS 27.2, M4 Pro)

- Wi-Fi is `en0`, detected via CoreWLAN and SystemConfiguration. RSSI, noise, Tx rate, channel (6 GHz ch 37, 160 MHz) and PHY are readable without privileges.
- The SSID is redacted (`ipconfig getsummary` shows `<redacted>`, `networksetup -getairportnetwork` reports not associated, and CoreWLAN returns nil until Location is authorised).
- The DHCP entity (`LeaseStartTime`, `LeaseExpirationTime`, options 1/3/6/51/53/54) is readable as a normal user.
- `system.services.systemconfiguration.network` = 1 of {is-root, entitled, _mbsetupuser-nonshared, authenticate-admin-nonshared}, so the renewal shows the macOS admin prompt.
- Sources: apple-oss-distributions/configd `SCNetworkInterface.c` and `helper/SCHelper_server.c`.
