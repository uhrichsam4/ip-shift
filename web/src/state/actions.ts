/** Wires bridge events into the store and exposes UI actions. */
import { call, onBridgeEvent, isNative, getPreview, BridgeCallError } from '../bridge/client';
import type { BridgeEvent, OperationEvent, Settings, StageId } from '../bridge/protocol';
import { EMPTY_STAGES, useAppStore, type Page, type SceneMode } from './store';
import { useUI } from './ui';
import { resolveGraphics } from './graphics';

const S = () => useAppStore.getState();
const STAGE_ORDER: StageId[] = ['initialise', 'wifi', 'dhcp', 'reconnect', 'results'];
export const STAGE_TITLES: Record<StageId, string> = {
  initialise: 'Initialise',
  wifi: 'Wi-Fi link',
  dhcp: 'DHCP lease',
  reconnect: 'Reconnect',
  results: 'Results',
};

/* -------------------------------------------------------- derived settings */
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

function applySettings(settings: Settings) {
  const reducedMotion = settings.reducedMotion === 'on' ? true : settings.reducedMotion === 'off' ? false : !!mq?.matches;
  const cur = S().quality;
  const quality =
    settings.quality === 'auto' ? (S().settings.quality === 'auto' ? cur : 'balanced') : settings.quality === 'custom' ? cur : settings.quality;
  useAppStore.setState({ settings, reducedMotion, quality });
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
}
mq?.addEventListener('change', () => applySettings(S().settings));

/* effective graphics: recompute whenever the preset, custom values or auto tier change */
let benchOverride = false;
/** Bench-only: while true, store.graphics/quality are driven by src/bench and not re-derived from settings. */
export function setBenchOverride(on: boolean) {
  benchOverride = on;
  if (!on) syncGraphics();
}
function syncGraphics() {
  if (benchOverride) return;
  const s = S();
  const g = resolveGraphics(s.settings.quality, s.settings.graphics, s.quality);
  if (JSON.stringify(g) !== JSON.stringify(s.graphics)) useAppStore.setState({ graphics: g });
}
useAppStore.subscribe((st, prev) => {
  if (st.settings !== prev.settings || st.quality !== prev.quality) syncGraphics();
});

/* -------------------------------------------------------- events */
function linkFromSnapshot(): 'up' | 'down' | 'unknown' {
  const w = S().snapshot?.wifi;
  if (!w) return 'unknown';
  return w.associated ? 'up' : 'down';
}

function applyOperationEvent(ev: OperationEvent) {
  const s = S();
  const op = s.operation;
  const isNew = op.operationId !== ev.operationId;
  const events = isNew ? [ev] : op.events.some((e) => e.seq === ev.seq) ? op.events : [...op.events, ev].sort((a, b) => a.seq - b.seq);
  const stages = isNew ? { ...EMPTY_STAGES } : { ...op.stages };
  stages[ev.stage] = ev.state;
  // earlier still-active stages are implicitly finished once a later one starts
  const idx = STAGE_ORDER.indexOf(ev.stage);
  for (let i = 0; i < idx; i++) if (stages[STAGE_ORDER[i]] === 'active') stages[STAGE_ORDER[i]] = 'done';

  const prevMode = s.sceneMode;
  const sceneMode: SceneMode = ev.stage as SceneMode;

  let link = s.sceneSignals.link;
  if (ev.phase === 'wifi.linkDown') link = 'down';
  else if (ev.phase === 'wifi.powerOn.requested') link = 'negotiating';
  else if (ev.phase === 'wifi.associated' || ev.phase === 'wifi.verified') link = 'up';
  const leaseAckAt = ev.phase === 'dhcp.leaseAcknowledged' ? performance.now() : s.sceneSignals.leaseAckAt;

  useAppStore.setState({
    operation: { ...op, running: ev.stage !== 'results' && ev.state !== 'failed' ? true : op.running, operationId: ev.operationId, events, stages, lastPhase: ev.phase, result: isNew ? null : op.result, mode: op.mode },
    sceneMode,
    sceneSignals: { ...s.sceneSignals, link, leaseAckAt },
  });
  if (prevMode !== sceneMode || isNew) useUI.getState().announce(`${STAGE_TITLES[ev.stage]}: ${ev.message}`);
}

function handle(e: BridgeEvent) {
  switch (e.type) {
    case 'snapshot': {
      useAppStore.setState({ snapshot: e.payload });
      if (!S().operation.running) S().signal({ link: linkFromSnapshot() });
      break;
    }
    case 'metrics': {
      const m = [...S().metrics, e.payload];
      useAppStore.setState({ metrics: m.length > 60 ? m.slice(m.length - 60) : m });
      break;
    }
    case 'operation':
      applyOperationEvent(e.payload);
      break;
    case 'operationResult': {
      const r = e.payload;
      const op = S().operation;
      const stages = { ...op.stages };
      if (r.outcome !== 'failed' && r.outcome !== 'cancelled') stages.results = 'done';
      for (const k of STAGE_ORDER) if (stages[k] === 'active') stages[k] = r.outcome === 'failed' ? 'failed' : 'done';
      useAppStore.setState({
        operation: { ...op, running: false, operationId: r.id, mode: r.mode, result: r, stages },
        resultsOpen: true,
        sceneMode: 'results',
      });
      const verdict =
        r.outcome === 'changed'
          ? `Address changed from ${r.previousIP ?? 'unknown'} to ${r.currentIP ?? 'unknown'}.`
          : r.outcome === 'unchanged'
            ? 'Lease renewed. Your router kept the same address.'
            : r.outcome === 'cancelled'
              ? 'Switch cancelled.'
              : `Switch failed. ${r.failure?.message ?? ''}`;
      useUI.getState().announce(verdict);
      // keep the latest snapshot fresh after a run
      call('network.snapshot').then((snap) => useAppStore.setState({ snapshot: snap })).catch(() => {});
      break;
    }
    case 'history':
      useAppStore.setState({ history: e.payload });
      break;
    case 'menu': {
      const { action, target } = e.payload;
      if (action === 'refresh') refresh();
      else if (action === 'switch') requestSwitch();
      else if (action === 'diagnostics') S().setPage('diagnostics');
      else if (action === 'navigate' && target) S().setPage(target as Page);
      break;
    }
    case 'window':
      break;
  }
}

onBridgeEvent(handle);

/* -------------------------------------------------------- actions */
function errText(err: unknown) {
  return err instanceof BridgeCallError || err instanceof Error ? err.message : 'Something went wrong.';
}

export async function init() {
  useAppStore.setState({ bridgeKind: isNative ? 'native' : 'preview' });
  const params = new URLSearchParams(location.search);
  const page = params.get('page') as Page | null;
  if (page && ['dashboard', 'network', 'history', 'diagnostics', 'settings'].includes(page)) S().setPage(page);

  const tasks: Promise<unknown>[] = [
    call('app.info').then((appInfo) => {
      const platform = appInfo.platform ?? S().platform;
      document.documentElement.dataset.platform = platform;
      useAppStore.setState({ appInfo, platform });
    }),
    call('settings.get').then(applySettings),
    call('network.snapshot').then((snapshot) => {
      useAppStore.setState({ snapshot });
      if (!S().operation.running) S().signal({ link: linkFromSnapshot() });
    }),
    call('history.list').then((history) => useAppStore.setState({ history })),
    call('switch.state').then((st) => {
      if (st.running && st.events.length) {
        useAppStore.setState({ operation: { ...S().operation, running: true, operationId: st.operationId } });
        for (const ev of st.events) applyOperationEvent(ev);
      }
    }),
  ];
  const results = await Promise.allSettled(tasks);
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) useUI.getState().set({ lastError: errText(failed.reason) });
  if (getPreview()?.frozen) useUI.getState().set({ introDone: true });
}

export async function refresh() {
  const ui = useUI.getState();
  if (ui.refreshing) return;
  ui.set({ refreshing: true });
  try {
    const snap = await call('network.refresh', { includePublicIP: S().settings.publicIPLookup });
    useAppStore.setState({ snapshot: snap });
    if (!S().operation.running) S().signal({ link: linkFromSnapshot() });
    ui.toast('Network details refreshed', 'success');
  } catch (err) {
    ui.toast(errText(err), 'danger');
  } finally {
    useUI.getState().set({ refreshing: false });
  }
}

/** Why the switch is unavailable right now (null = available). */
export function switchBlockedReason(): string | null {
  const s = S();
  if (s.operation.running) return 'A switch is already running';
  const w = s.snapshot?.wifi;
  if (!s.snapshot) return 'Reading network state…';
  if (!w) return 'No Wi-Fi interface detected';
  if (!w.powerOn) return 'Wi-Fi is turned off';
  if (!w.associated) return 'Not connected to a Wi-Fi network';
  return null;
}

/** Entry point for button / ⌘⏎ / menu: shows confirm if enabled. */
export function requestSwitch() {
  if (switchBlockedReason()) return;
  if (S().resultsOpen) dismissResults();
  S().setPage('dashboard');
  if (S().settings.confirmBeforeSwitch) useUI.getState().set({ confirmOpen: true });
  else startSwitch();
}

export async function startSwitch() {
  useUI.getState().set({ confirmOpen: false });
  if (switchBlockedReason()) return;
  const mode = S().settings.mode;
  S().signal({ pressAt: performance.now() });
  useAppStore.setState({
    operation: { running: true, operationId: null, mode, events: [], stages: { ...EMPTY_STAGES }, lastPhase: null, result: null },
    resultsOpen: false,
  });
  try {
    const { operationId } = await call('switch.start', { mode });
    const op = S().operation;
    if (!op.operationId) useAppStore.setState({ operation: { ...op, operationId } });
  } catch (err) {
    useAppStore.setState({ operation: { ...S().operation, running: false }, sceneMode: 'idle' });
    useUI.getState().toast(errText(err), 'danger');
  }
}

export function dismissResults() {
  const op = S().operation;
  useAppStore.setState({ resultsOpen: false, sceneMode: 'idle', operation: { ...op, stages: { ...EMPTY_STAGES }, events: [], lastPhase: null } });
  S().signal({ link: linkFromSnapshot() });
}

export async function updateSettings(patch: Partial<Settings>) {
  const prev = S().settings;
  applySettings({ ...prev, ...patch });
  try {
    const next = await call('settings.update', patch);
    applySettings(next);
  } catch (err) {
    applySettings(prev);
    useUI.getState().toast(errText(err), 'danger');
  }
}

export async function copyText(text: string, label = 'Copied') {
  try {
    const r = await call('clipboard.write', { text });
    if (!r.written) throw new Error('Clipboard unavailable');
    useUI.getState().toast(`${label} · ${text.length > 40 ? text.slice(0, 40) + '…' : text}`, 'success');
  } catch {
    useUI.getState().toast('Could not copy to the clipboard', 'danger');
  }
}

export async function requestLocation() {
  try {
    const r = await call('permissions.requestLocation');
    if (r.status === 'denied' || r.status === 'restricted') {
      await call('system.openSettings', { pane: 'location' }).catch(() => {});
      useUI.getState().toast('Location is off for IP SHIFT — enable it in System Settings', 'info');
    }
    const snap = await call('network.snapshot');
    useAppStore.setState({ snapshot: snap });
  } catch (err) {
    useUI.getState().toast(errText(err), 'danger');
  }
}

export async function runDiagnostics() {
  const ui = useUI.getState();
  ui.set({ diagnosticsRunning: true, diagnostics: null });
  try {
    const report = await call('diagnostics.run');
    useUI.getState().set({ diagnostics: report });
  } catch (err) {
    ui.toast(errText(err), 'danger');
  } finally {
    useUI.getState().set({ diagnosticsRunning: false });
  }
}

export async function exportHistory() {
  try {
    const r = await call('history.export');
    useUI.getState().toast(r.path ? `Exported to ${r.path}` : 'Export cancelled', r.path ? 'success' : 'info');
  } catch (err) {
    useUI.getState().toast(errText(err), 'danger');
  }
}

export async function clearHistory() {
  useUI.getState().set({ clearHistoryOpen: false });
  try {
    const r = await call('history.clear');
    useAppStore.setState({ history: [] });
    useUI.getState().toast(`Cleared ${r.cleared} ${r.cleared === 1 ? 'entry' : 'entries'}`, 'success');
  } catch (err) {
    useUI.getState().toast(errText(err), 'danger');
  }
}

/** True only when the failed run never reached a step that changes network configuration. */
export function noChangesMade(events: OperationEvent[]) {
  return !events.some((e) => ['dhcp.refreshRequested', 'wifi.powerOff.requested', 'wifi.linkDown'].includes(e.phase));
}
