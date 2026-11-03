/**
 * IP SHIFT bridge protocol — SINGLE SOURCE OF TRUTH.
 * The Swift side (native/Sources/IPShiftCore/Models.swift) mirrors these shapes exactly (Codable, camelCase).
 *
 * Transport
 *  JS -> native : window.webkit.messageHandlers.ipshift.postMessage({ cmd, args })
 *                 (WKScriptMessageHandlerWithReply) resolves to BridgeReply<T>.
 *  native -> JS : window.__IPSHIFT__.dispatch(event: BridgeEvent)
 *                 called via callAsyncJavaScript with the event passed as an argument (never string-interpolated).
 * All timestamps are ISO-8601 strings (UTC). Unknown values are null, never invented.
 */

export type ISODate = string;

export type BridgeReply<T> =
  | { ok: true; data: T }
  | { ok: false; error: BridgeError };

export interface BridgeError {
  code:
    | 'busy' // an operation is already running
    | 'noWifiInterface'
    | 'wifiOff'
    | 'notAssociated'
    | 'authorizationDenied' // user cancelled / failed the macOS admin prompt
    | 'authorizationFailed'
    | 'refreshFailed' // SCNetworkInterfaceForceConfigurationRefresh returned false
    | 'powerToggleFailed'
    | 'timeout'
    | 'cancelled'
    | 'invalidArgument'
    | 'unknownCommand'
    | 'internal';
  message: string; // human readable, honest, no blame
  stage?: StageId;
}

/* ------------------------------------------------------------------ network */

export type LocationAuthorization = 'notDetermined' | 'denied' | 'restricted' | 'authorized';

export interface WifiInfo {
  interfaceName: string; // detected (never assumed en0)
  hardwarePort: string; // e.g. "Wi-Fi"
  powerOn: boolean;
  associated: boolean;
  ssid: string | null; // null when hidden by macOS privacy or not associated
  ssidAvailability: 'available' | 'needsLocationPermission' | 'notAssociated' | 'unknown';
  bssid: string | null;
  rssi: number | null; // dBm
  noise: number | null; // dBm
  txRateMbps: number | null;
  channel: number | null;
  band: '2.4GHz' | '5GHz' | '6GHz' | null;
  channelWidthMHz: number | null;
  security: string | null; // e.g. "WPA3 Personal"
  phyMode: string | null; // e.g. "802.11ax"
  hardwareAddress: string | null; // current (possibly private) Wi-Fi address, read-only
}

export interface IPv4Info {
  address: string | null;
  subnetMask: string | null;
  router: string | null;
  isSelfAssigned: boolean; // 169.254.x.x
}

export interface DhcpInfo {
  status: 'bound' | 'selfAssigned' | 'none' | 'unknown';
  serverIdentifier: string | null; // DHCP option 54
  leaseStart: ISODate | null;
  leaseExpires: ISODate | null;
  leaseSeconds: number | null; // option 51
  dns: string[];
}

export interface PublicIPInfo {
  status: 'ok' | 'pending' | 'disabled' | 'error';
  address: string | null;
  provider: string | null; // "Cloudflare" | "ipify"
  fetchedAt: ISODate | null;
  error?: string;
}

export interface ConnectivityInfo {
  path: 'satisfied' | 'unsatisfied' | 'requiresConnection' | 'unknown'; // NWPathMonitor
  internet: 'online' | 'offline' | 'captive' | 'checking' | 'unknown'; // HTTP probe
  lastProbe: { ok: boolean; latencyMs: number | null; at: ISODate; target: string } | null;
}

export interface NetworkSnapshot {
  capturedAt: ISODate;
  wifi: WifiInfo | null; // null = no Wi-Fi hardware found
  ipv4: IPv4Info;
  ipv6: string[];
  dhcp: DhcpInfo;
  connectivity: ConnectivityInfo;
  publicIP: PublicIPInfo;
  primaryInterface: string | null;
  macOSVersion: string; // e.g. "27.2"
  locationAuthorization: LocationAuthorization;
}

export interface WifiMetrics {
  at: ISODate;
  rssi: number | null;
  noise: number | null;
  txRateMbps: number | null;
}

/* ---------------------------------------------------------------- operation */

export type SwitchMode = 'renew' | 'reconnect';
export type StageId = 'initialise' | 'wifi' | 'dhcp' | 'reconnect' | 'results';
export type StageState = 'active' | 'done' | 'skipped' | 'failed';

/**
 * Phase codes are emitted only when the corresponding real thing happened.
 * initialise: baseline.captured
 * wifi:       wifi.verified | wifi.powerOff.requested | wifi.linkDown | wifi.powerOn.requested | wifi.associated
 * dhcp:       dhcp.authorizing | dhcp.authorized | dhcp.refreshRequested | dhcp.waitingForLease | dhcp.leaseAcknowledged | dhcp.leaseUnchangedTimestamp
 * reconnect:  reconnect.ipAssigned | reconnect.pathSatisfied | reconnect.internetVerified | reconnect.internetUnavailable
 * results:    results.ready
 * any stage:  <stage>.failed (state 'failed'), e.g. 'dhcp.failed' — never a success code on failure
 */
export interface OperationEvent {
  operationId: string;
  seq: number;
  at: ISODate;
  stage: StageId;
  state: StageState;
  phase: string;
  message: string; // human readable, factual
  data?: Record<string, string | number | boolean | null>;
}

export type Outcome = 'changed' | 'unchanged' | 'failed' | 'cancelled';

export interface OperationResult {
  id: string; // == operationId
  mode: SwitchMode;
  interfaceName: string | null;
  ssid: string | null;
  startedAt: ISODate;
  finishedAt: ISODate;
  durationMs: number;
  previousIP: string | null;
  currentIP: string | null;
  outcome: Outcome;
  leaseRenewed: boolean; // LeaseStartTime moved forward during the operation
  leaseStart: ISODate | null;
  dhcpServer: string | null;
  internet: 'restored' | 'unavailable' | 'notChecked';
  internetLatencyMs: number | null;
  publicIPBefore: string | null;
  publicIPAfter: string | null;
  failure?: { stage: StageId; code: BridgeError['code']; message: string };
}

export type HistoryEntry = OperationResult;

/* ----------------------------------------------------------------- settings */

/**
 * Advanced graphics options (Settings → Graphics). WebGL in WKWebView has no hardware ray tracing, so
 * "reflections" are planar mirror reflections and "ambientOcclusion" is screen-space (N8AO).
 * Defaults = the 'balanced' preset in web/src/state/graphics.ts.
 */
export interface GraphicsSettings {
  antiAliasing: 'off' | 'fxaa' | 'smaa' | 'msaa2' | 'msaa4' | 'msaa8'; // default 'smaa'
  renderScale: number; // 0.5–1.0 of the device pixel ratio (capped at 2); default 0.75
  frameRateCap: 0 | 30 | 60 | 120; // 0 = display refresh; default 60
  shadows: 'off' | 'low' | 'medium' | 'high'; // default 'medium'
  ambientOcclusion: 'off' | 'low' | 'high'; // default 'off'
  reflections: 'off' | 'low' | 'high'; // default 'off'
  bloom: 'off' | 'low' | 'high'; // default 'high'
  depthOfField: 'off' | 'sequence' | 'always'; // default 'sequence'
  volumetrics: 'off' | 'low' | 'high'; // default 'low'
  particles: 'low' | 'medium' | 'high' | 'ultra'; // default 'medium'
  textureFiltering: 1 | 2 | 4 | 8 | 16; // anisotropy; default 8
  chromaticAberration: boolean; // warps only; default true
  filmGrain: boolean; // default true
  vignette: boolean; // default true
  toneMapping: 'aces' | 'agx' | 'neutral'; // default 'aces'
  showFps: boolean; // default false
}

export interface Settings {
  mode: SwitchMode; // default 'renew'
  confirmBeforeSwitch: boolean; // default true
  publicIPLookup: boolean; // default true
  publicIPProvider: 'cloudflare' | 'ipify'; // default 'cloudflare'
  quality: 'auto' | 'low' | 'balanced' | 'high' | 'ultra' | 'custom'; // preset; default 'auto'
  graphics: GraphicsSettings; // per-feature values; editing one sets quality to 'custom'
  reducedMotion: 'system' | 'on' | 'off'; // default 'system'
  theme: 'midnight' | 'graphite' | 'aurora'; // default 'midnight'
  sound: boolean; // default false
}

/* -------------------------------------------------------------- diagnostics */

export interface DiagnosticCheck {
  id:
    | 'interface'
    | 'power'
    | 'association'
    | 'ipv4'
    | 'dhcpLease'
    | 'router'
    | 'dns'
    | 'internet'
    | 'publicIP'
    | 'location';
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  detail: string;
  durationMs: number;
}

export interface DiagnosticReport {
  ranAt: ISODate;
  checks: DiagnosticCheck[];
}

/**
 * Host platform. Optional for backward compatibility: absent = 'macos'.
 * On Windows, `macOSVersion` (legacy field name, here and in NetworkSnapshot) carries the Windows
 * version string, e.g. "11 24H2 (26100)", and the UI prefixes it with `osName`.
 */
export type HostPlatform = 'macos' | 'windows';

export interface AppInfo {
  platform?: HostPlatform;
  osName?: string; // "macOS" | "Windows"
  version: string;
  build: string;
  macOSVersion: string;
  arch: string;
  bridge: 'native' | 'preview';
}

/* ----------------------------------------------------------------- commands */

export interface Commands {
  'app.info': { args: void; result: AppInfo };
  'network.snapshot': { args: void; result: NetworkSnapshot };
  'network.refresh': { args: { includePublicIP?: boolean }; result: NetworkSnapshot };
  'switch.start': { args: { mode: SwitchMode }; result: { operationId: string } };
  'switch.cancel': { args: void; result: { cancelled: boolean } };
  'switch.state': { args: void; result: { running: boolean; operationId: string | null; events: OperationEvent[] } };
  'history.list': { args: void; result: HistoryEntry[] };
  'history.clear': { args: void; result: { cleared: number } };
  'history.export': { args: void; result: { path: string | null } };
  'settings.get': { args: void; result: Settings };
  'settings.update': { args: Partial<Settings>; result: Settings };
  'diagnostics.run': { args: void; result: DiagnosticReport };
  'permissions.requestLocation': { args: void; result: { status: LocationAuthorization } };
  'system.openSettings': { args: { pane: 'location' | 'network' | 'wifi' }; result: { opened: boolean } };
  'clipboard.write': { args: { text: string }; result: { written: boolean } };
}

export type CommandName = keyof Commands;

/* ------------------------------------------------------------------- events */

export type BridgeEvent =
  | { type: 'snapshot'; payload: NetworkSnapshot }
  | { type: 'metrics'; payload: WifiMetrics }
  | { type: 'operation'; payload: OperationEvent }
  | { type: 'operationResult'; payload: OperationResult }
  | { type: 'history'; payload: HistoryEntry[] }
  | { type: 'menu'; payload: { action: 'refresh' | 'switch' | 'navigate' | 'diagnostics'; target?: string } }
  | { type: 'window'; payload: { visible: boolean } };
