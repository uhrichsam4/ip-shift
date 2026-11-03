/**
 * App store — the contract between the UI layer (src/ui, src/pages) and the 3D scene (src/scene).
 * UI owns the logic that fills it from the bridge (src/bridge/client.ts); the scene only READS it
 * (plus `sceneSignals` it may consume). Every visual state must be derivable from real bridge data.
 */
import { create } from 'zustand';
import type {
  HistoryEntry,
  NetworkSnapshot,
  OperationEvent,
  OperationResult,
  Settings,
  StageId,
  StageState,
  SwitchMode,
  WifiMetrics,
  AppInfo,
  GraphicsSettings,
  HostPlatform,
} from '../bridge/protocol';
import { DEFAULT_GRAPHICS } from './graphics';

export type Page = 'dashboard' | 'network' | 'history' | 'diagnostics' | 'settings';
export type QualityTier = 'low' | 'balanced' | 'high' | 'ultra';

/** What the scene should be showing. Derived only from real operation events. */
export type SceneMode =
  | 'idle'
  | 'initialise' // baseline being captured: isolate router, LEDs ramp, orbit, Wi-Fi symbol rises
  | 'wifi' // warp into the network space; link reflects real wifi phases
  | 'dhcp' // packets flow while the real lease request is pending
  | 'reconnect' // pathways light as real checks pass
  | 'results'; // warp out, results panel

export interface OperationView {
  running: boolean;
  operationId: string | null;
  mode: SwitchMode | null;
  events: OperationEvent[];
  stages: Record<StageId, StageState | 'pending'>;
  /** Latest phase code received (e.g. 'wifi.linkDown'); the scene keys link/packet visuals off this. */
  lastPhase: string | null;
  result: OperationResult | null;
}

export interface SceneSignals {
  /** performance.now() timestamp of the last SWITCH button press (scene flash / ripple). */
  pressAt: number;
  /** true while the pointer is over the SWITCH button (pedestal rings brighten). */
  buttonHover: boolean;
  /** Wi-Fi link as reported by real events/snapshots: drives the energy stream. */
  link: 'up' | 'down' | 'negotiating' | 'unknown';
  /** performance.now() of the last real lease acknowledgement (final ACK packet lands). */
  leaseAckAt: number;
}

export interface AppState {
  bridgeKind: 'native' | 'preview' | 'connecting';
  appInfo: AppInfo | null;
  /** Host OS: appInfo.platform ?? transport guess. Drives chrome, shortcuts and copy. */
  platform: HostPlatform;
  page: Page;
  snapshot: NetworkSnapshot | null;
  metrics: WifiMetrics[]; // rolling 60 samples for sparklines
  settings: Settings;
  history: HistoryEntry[];
  operation: OperationView;
  sceneMode: SceneMode;
  sceneSignals: SceneSignals;
  /** Resolved from settings + prefers-reduced-motion + auto quality monitor. */
  reducedMotion: boolean;
  quality: QualityTier;
  /** Effective per-feature graphics (resolveGraphics(settings.quality, settings.graphics, quality)). The scene reads ONLY this for rendering features. */
  graphics: GraphicsSettings;
  /** Measured frames per second, written by the scene ~2×/s (for the FPS overlay). */
  fps: number;
  assetsReady: boolean;
  resultsOpen: boolean;

  set: (partial: Partial<AppState>) => void;
  setPage: (page: Page) => void;
  signal: (partial: Partial<SceneSignals>) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'renew',
  confirmBeforeSwitch: true,
  publicIPLookup: true,
  publicIPProvider: 'cloudflare',
  quality: 'auto',
  graphics: DEFAULT_GRAPHICS,
  reducedMotion: 'system',
  theme: 'midnight',
  sound: false,
};

export const EMPTY_STAGES: OperationView['stages'] = {
  initialise: 'pending',
  wifi: 'pending',
  dhcp: 'pending',
  reconnect: 'pending',
  results: 'pending',
};

function initialPlatform(): HostPlatform {
  if (typeof window === 'undefined') return 'macos';
  if (window.ipshiftNative) return 'windows';
  if (!window.webkit?.messageHandlers?.ipshift && new URLSearchParams(location.search).get('platform') === 'windows') return 'windows';
  return 'macos';
}
const PLATFORM0 = initialPlatform();
if (typeof document !== 'undefined') document.documentElement.dataset.platform = PLATFORM0;

/** Primary shortcut modifier label for the current host. */
export const modKey = (p: HostPlatform) => (p === 'windows' ? 'Ctrl+' : '⌘');

export const useAppStore = create<AppState>((set) => ({
  bridgeKind: 'connecting',
  appInfo: null,
  platform: PLATFORM0,
  page: 'dashboard',
  snapshot: null,
  metrics: [],
  settings: DEFAULT_SETTINGS,
  history: [],
  operation: {
    running: false,
    operationId: null,
    mode: null,
    events: [],
    stages: { ...EMPTY_STAGES },
    lastPhase: null,
    result: null,
  },
  sceneMode: 'idle',
  sceneSignals: { pressAt: 0, buttonHover: false, link: 'unknown', leaseAckAt: 0 },
  reducedMotion: false,
  quality: 'balanced',
  graphics: DEFAULT_GRAPHICS,
  fps: 0,
  assetsReady: false,
  resultsOpen: false,

  set: (partial) => set(partial),
  setPage: (page) => set({ page }),
  signal: (partial) => set((s) => ({ sceneSignals: { ...s.sceneSignals, ...partial } })),
}));

// Dev-only handle for automated rendering checks (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __ipshiftStore: typeof useAppStore }).__ipshiftStore = useAppStore;
