/**
 * Contract between the Electron main process (windows/src/main.ts) and the Windows networking
 * backend (windows/src/backend/**). Shapes come from web/src/bridge/protocol.ts (single source of truth).
 *
 * The backend owns: network.*, switch.*, history.list/clear, settings.*, diagnostics.run,
 * and the data for app.info. The main process owns UI-shell commands: history.export (save dialog),
 * system.openSettings, clipboard.write, permissions.requestLocation (opens ms-settings).
 */
import type { BridgeError, BridgeEvent, CommandName, Commands, HistoryEntry, StageId } from '../shared/protocol';

export type BackendCommand = Exclude<
  CommandName,
  'history.export' | 'system.openSettings' | 'clipboard.write' | 'permissions.requestLocation'
>;

export class BackendError extends Error {
  constructor(
    public readonly code: BridgeError['code'],
    message: string,
    public readonly stage?: StageId,
  ) {
    super(message);
  }
}

export interface Backend {
  /** Throws BackendError for expected failures (busy, authorizationDenied, ...). */
  call<K extends BackendCommand>(cmd: K, args: Commands[K]['args']): Promise<Commands[K]['result']>;
  /** Network snapshots, metrics, operation progress, results, history updates. */
  onEvent(listener: (event: BridgeEvent) => void): () => void;
  /** Main process forwards window visibility (pause metrics polling when hidden). */
  setWindowVisible(visible: boolean): void;
  /** Called on quit: if a switch disconnected Wi-Fi, reconnect it (≤ 5 s) before resolving. */
  prepareForQuit(): Promise<void>;
  /** Used by history.export in the main process. */
  historySnapshot(): HistoryEntry[];
}

export interface BackendOptions {
  /** %APPDATA%/IP SHIFT (app.getPath('userData')). */
  dataDir: string;
  appVersion: string;
  /** True when the process runs elevated (needed if IpRenewAddress returns ERROR_ACCESS_DENIED). */
  isElevated: boolean;
  /**
   * Called by the engine when IpRenewAddress returns ERROR_ACCESS_DENIED and the process is not elevated.
   * The main process asks the user (native dialog) and, if they agree, relaunches elevated via UAC.
   * The engine then fails the run with code 'authorizationDenied' (and an honest message) either way.
   */
  requestElevation?: () => Promise<'relaunching' | 'declined'>;
}

/**
 * Preload ↔ renderer transport (window.ipshiftNative), implemented by windows/src/preload.ts and
 * consumed by web/src/bridge/client.ts:
 *   window.ipshiftNative = {
 *     platform: 'windows',
 *     invoke(cmd: string, args: unknown): Promise<BridgeReply<unknown>>,   // ipcRenderer.invoke('ipshift:invoke', { cmd, args })
 *     onEvent(listener: (e: BridgeEvent) => void): () => void,            // ipcRenderer.on('ipshift:event', ...)
 *   }
 */
