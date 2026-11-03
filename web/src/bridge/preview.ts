/**
 * PREVIEW BRIDGE — browser development and the launch film ONLY.
 * Every value here is ILLUSTRATIVE. The UI shows a persistent "PREVIEW · ILLUSTRATIVE DATA" badge
 * whenever this bridge is active. It is never used inside the native app.
 *
 * URL params for deterministic captures:
 *   ?state=idle|initialise|wifi|dhcp|reconnect|results-changed|results-unchanged|results-failed
 *   ?page=dashboard|network|history|diagnostics|settings
 */
import type {
  AppInfo,
  BridgeEvent,
  BridgeReply,
  CommandName,
  Commands,
  DiagnosticReport,
  HistoryEntry,
  NetworkSnapshot,
  OperationEvent,
  OperationResult,
  Settings,
  StageId,
  StageState,
  SwitchMode,
  WifiMetrics,
} from './protocol';
import { DEFAULT_GRAPHICS } from '../state/graphics';

export type FrozenState =
  | 'idle'
  | 'initialise'
  | 'wifi'
  | 'dhcp'
  | 'reconnect'
  | 'results-changed'
  | 'results-unchanged'
  | 'results-failed';

export interface PreviewBridge {
  call<K extends CommandName>(cmd: K, args: Commands[K]['args']): Promise<BridgeReply<Commands[K]['result']>>;
  frozen: FrozenState | null;
}

const FROZEN_STATES: FrozenState[] = ['idle', 'initialise', 'wifi', 'dhcp', 'reconnect', 'results-changed', 'results-unchanged', 'results-failed'];

// A fixed illustrative "now" for frozen captures so screenshots are deterministic.
const FROZEN_NOW = Date.parse('2026-11-02T14:32:08.000Z');

const ILLUSTRATIVE = {
  before: '192.168.1.42',
  after: '192.168.1.86',
  router: '192.168.1.1',
  publicIP: '203.0.113.24', // RFC 5737 documentation range
  ssid: 'Studio 5G',
  bssid: 'a4:2b:b0:1c:7e:90',
  mac: '3e:91:5d:a2:0f:c4',
};

function iso(ms: number) {
  return new Date(ms).toISOString();
}

export function createPreviewBridge(emit: (e: BridgeEvent) => void): PreviewBridge {
  const params = new URLSearchParams(location.search);
  const fs = params.get('state') as FrozenState | null;
  const frozen: FrozenState | null = fs && FROZEN_STATES.includes(fs) ? fs : null;
  const win = params.get('platform') === 'windows';
  const osVersion = win ? '11 (26100)' : '27.2';
  const now = () => (frozen ? FROZEN_NOW : Date.now());

  let currentIP = ILLUSTRATIVE.before;
  let settings: Settings = {
    mode: 'renew',
    confirmBeforeSwitch: true,
    publicIPLookup: true,
    publicIPProvider: 'cloudflare',
    quality: 'auto',
    graphics: { ...DEFAULT_GRAPHICS },
    reducedMotion: 'system',
    theme: 'midnight',
    sound: false,
  };
  let leaseStart = now() - 3 * 3600_000 - 14 * 60_000;
  let wifiUp = true;
  let running: { id: string; events: OperationEvent[] } | null = null;

  const t0 = now();
  let history: HistoryEntry[] = [
    histEntry('op-p3', t0 - 26 * 60_000, 'renew', '192.168.1.42', '192.168.1.42', 'unchanged', 5200),
    histEntry('op-p2', t0 - 3 * 3600_000, 'reconnect', '192.168.1.23', '192.168.1.42', 'changed', 9800),
    histEntry('op-p1', t0 - 27 * 3600_000, 'renew', '192.168.1.23', '192.168.1.23', 'failed', 2100),
  ];

  function histEntry(id: string, start: number, mode: SwitchMode, prev: string, cur: string, outcome: OperationResult['outcome'], d: number): HistoryEntry {
    return {
      id,
      mode,
      interfaceName: 'en0',
      ssid: ILLUSTRATIVE.ssid,
      startedAt: iso(start),
      finishedAt: iso(start + d),
      durationMs: d,
      previousIP: prev,
      currentIP: cur,
      outcome,
      leaseRenewed: outcome !== 'failed',
      leaseStart: outcome !== 'failed' ? iso(start + d - 800) : null,
      dhcpServer: outcome !== 'failed' ? ILLUSTRATIVE.router : null,
      internet: outcome === 'failed' ? 'notChecked' : 'restored',
      internetLatencyMs: outcome === 'failed' ? null : 31,
      publicIPBefore: ILLUSTRATIVE.publicIP,
      publicIPAfter: outcome === 'failed' ? null : ILLUSTRATIVE.publicIP,
      failure: outcome === 'failed' ? { stage: 'dhcp', code: 'authorizationDenied', message: 'Authorization was cancelled at the macOS password prompt.' } : undefined,
    };
  }

  function snapshot(): NetworkSnapshot {
    const n = now();
    return {
      capturedAt: iso(n),
      wifi: {
        interfaceName: 'en0',
        hardwarePort: 'Wi-Fi',
        powerOn: true,
        associated: wifiUp,
        ssid: wifiUp ? ILLUSTRATIVE.ssid : null,
        ssidAvailability: wifiUp ? 'available' : 'notAssociated',
        bssid: wifiUp ? ILLUSTRATIVE.bssid : null,
        rssi: wifiUp ? -52 : null,
        noise: wifiUp ? -94 : null,
        txRateMbps: wifiUp ? 1201 : null,
        channel: 149,
        band: '5GHz',
        channelWidthMHz: 80,
        security: 'WPA3 Personal',
        phyMode: '802.11ax',
        hardwareAddress: ILLUSTRATIVE.mac,
      },
      ipv4: { address: wifiUp ? currentIP : null, subnetMask: '255.255.255.0', router: ILLUSTRATIVE.router, isSelfAssigned: false },
      ipv6: ['fe80::1c4a:9bff:fe3e:21d0'],
      dhcp: {
        status: 'bound',
        serverIdentifier: ILLUSTRATIVE.router,
        leaseStart: iso(leaseStart),
        leaseExpires: iso(leaseStart + 86_400_000),
        leaseSeconds: 86_400,
        dns: ['192.168.1.1', '1.1.1.1'],
      },
      connectivity: {
        path: wifiUp ? 'satisfied' : 'unsatisfied',
        internet: wifiUp ? 'online' : 'offline',
        lastProbe: { ok: wifiUp, latencyMs: wifiUp ? 34 : null, at: iso(n - 4000), target: 'captive.apple.com' },
      },
      publicIP: settings.publicIPLookup
        ? { status: 'ok', address: ILLUSTRATIVE.publicIP, provider: settings.publicIPProvider === 'cloudflare' ? 'Cloudflare' : 'ipify', fetchedAt: iso(n - 60_000) }
        : { status: 'disabled', address: null, provider: null, fetchedAt: null },
      primaryInterface: 'en0',
      macOSVersion: osVersion,
      locationAuthorization: 'authorized',
    };
  }

  /* ---------------------------------------------------------- metrics */
  let mi = 0;
  function metricAt(i: number, t: number): WifiMetrics {
    const rssi = Math.round(-54 + Math.sin(i / 5) * 3 + Math.sin(i / 1.7) * 1.4);
    return { at: iso(t), rssi, noise: -94, txRateMbps: 1201 - (i % 7) * 24 };
  }
  // prefill 60 samples
  queueMicrotask(() => {
    for (let i = 0; i < 60; i++) emit({ type: 'metrics', payload: metricAt(mi++, now() - (60 - i) * 1000) });
  });
  if (!frozen) {
    setInterval(() => {
      if (!wifiUp) emit({ type: 'metrics', payload: { at: iso(now()), rssi: null, noise: null, txRateMbps: null } });
      else emit({ type: 'metrics', payload: metricAt(mi++, now()) });
    }, 1000);
  }

  /* ---------------------------------------------------------- operation script */
  type Step = { at: number; stage: StageId; state: StageState; phase: string; message: string; data?: OperationEvent['data']; fx?: () => void };

  function script(mode: SwitchMode, outcome: 'changed' | 'unchanged' | 'failed'): Step[] {
    const s: Step[] = [];
    let t = 0;
    const add = (dt: number, stage: StageId, state: StageState, phase: string, message: string, data?: Step['data'], fx?: () => void) => {
      t += dt;
      s.push({ at: t, stage, state, phase, message, data, fx });
    };
    add(0, 'initialise', 'active', 'baseline.captured', `Baseline captured · en0 · ${ILLUSTRATIVE.before}`, { ip: ILLUSTRATIVE.before });
    add(1600, 'initialise', 'done', 'baseline.captured', 'Interface en0 on “Studio 5G” verified');
    if (mode === 'reconnect') {
      add(500, 'wifi', 'active', 'wifi.powerOff.requested', 'Wi-Fi power off requested');
      add(900, 'wifi', 'active', 'wifi.linkDown', 'Wi-Fi link is down', undefined, () => (wifiUp = false));
      add(1400, 'wifi', 'active', 'wifi.powerOn.requested', 'Wi-Fi power on requested');
      add(2200, 'wifi', 'done', 'wifi.associated', 'Re-associated with “Studio 5G”', undefined, () => (wifiUp = true));
    } else {
      add(500, 'wifi', 'active', 'wifi.verified', 'Wi-Fi link verified · −52 dBm');
      add(1300, 'wifi', 'done', 'wifi.verified', 'Wi-Fi link stays up during a lease renewal');
    }
    add(400, 'dhcp', 'active', 'dhcp.authorizing', 'Waiting for macOS administrator authorization');
    if (outcome === 'failed') {
      add(1800, 'dhcp', 'failed', 'dhcp.authorizing', 'Authorization was cancelled at the macOS password prompt');
      return s;
    }
    add(1800, 'dhcp', 'active', 'dhcp.authorized', 'Authorized');
    add(300, 'dhcp', 'active', 'dhcp.refreshRequested', 'DHCP refresh requested on en0');
    add(400, 'dhcp', 'active', 'dhcp.waitingForLease', 'Waiting for the router to acknowledge a lease');
    const ip = outcome === 'changed' ? ILLUSTRATIVE.after : ILLUSTRATIVE.before;
    add(1900, 'dhcp', 'done', 'dhcp.leaseAcknowledged', `Lease acknowledged by ${ILLUSTRATIVE.router}`, { server: ILLUSTRATIVE.router }, () => {
      currentIP = ip;
      leaseStart = now();
    });
    add(300, 'reconnect', 'active', 'reconnect.ipAssigned', `IPv4 address ${ip} assigned`, { ip });
    add(700, 'reconnect', 'active', 'reconnect.pathSatisfied', 'Network path satisfied');
    add(1100, 'reconnect', 'done', 'reconnect.internetVerified', 'Internet verified · 31 ms', { latencyMs: 31 });
    add(500, 'results', 'done', 'results.ready', outcome === 'changed' ? `Address changed to ${ip}` : 'Lease renewed — same address');
    return s;
  }

  function resultFor(id: string, mode: SwitchMode, outcome: 'changed' | 'unchanged' | 'failed', start: number, end: number): OperationResult {
    const failed = outcome === 'failed';
    return {
      id,
      mode,
      interfaceName: 'en0',
      ssid: ILLUSTRATIVE.ssid,
      startedAt: iso(start),
      finishedAt: iso(end),
      durationMs: end - start,
      previousIP: ILLUSTRATIVE.before,
      currentIP: outcome === 'changed' ? ILLUSTRATIVE.after : ILLUSTRATIVE.before,
      outcome,
      leaseRenewed: !failed,
      leaseStart: failed ? null : iso(end - 2800),
      dhcpServer: failed ? null : ILLUSTRATIVE.router,
      internet: failed ? 'notChecked' : 'restored',
      internetLatencyMs: failed ? null : 31,
      publicIPBefore: ILLUSTRATIVE.publicIP,
      publicIPAfter: failed ? null : ILLUSTRATIVE.publicIP,
      failure: failed ? { stage: 'dhcp', code: 'authorizationDenied', message: 'Authorization was cancelled at the macOS password prompt.' } : undefined,
    };
  }

  let runCount = 0;
  function startRun(mode: SwitchMode) {
    const id = `op-preview-${Date.now().toString(36)}`;
    // alternate illustrative outcomes so both verdicts can be seen
    const outcome: 'changed' | 'unchanged' = runCount++ % 2 === 0 ? 'changed' : 'unchanged';
    if (outcome === 'changed' && currentIP === ILLUSTRATIVE.after) currentIP = ILLUSTRATIVE.before;
    const steps = script(mode, outcome);
    running = { id, events: [] };
    const start = Date.now();
    steps.forEach((st, i) => {
      setTimeout(() => {
        st.fx?.();
        const ev: OperationEvent = { operationId: id, seq: i + 1, at: iso(Date.now()), stage: st.stage, state: st.state, phase: st.phase, message: st.message, data: st.data };
        running?.events.push(ev);
        emit({ type: 'operation', payload: ev });
        if (st.phase === 'wifi.linkDown' || st.phase === 'wifi.associated' || st.phase === 'dhcp.leaseAcknowledged') emit({ type: 'snapshot', payload: snapshot() });
        if (i === steps.length - 1) {
          setTimeout(() => {
            const res = resultFor(id, mode, outcome, start, Date.now());
            res.currentIP = currentIP;
            history = [res, ...history];
            running = null;
            emit({ type: 'operationResult', payload: res });
            emit({ type: 'history', payload: history });
          }, 300);
        }
      }, st.at);
    });
    return id;
  }

  /* ---------------------------------------------------------- frozen states */
  if (frozen && frozen !== 'idle') {
    const target: Record<Exclude<FrozenState, 'idle'>, { mode: SwitchMode; outcome: 'changed' | 'unchanged' | 'failed'; untilPhase?: string; stage?: StageId }> = {
      initialise: { mode: 'renew', outcome: 'changed', untilPhase: 'baseline.captured', stage: 'initialise' },
      wifi: { mode: 'reconnect', outcome: 'changed', untilPhase: 'wifi.linkDown' },
      dhcp: { mode: 'renew', outcome: 'changed', untilPhase: 'dhcp.waitingForLease' },
      reconnect: { mode: 'renew', outcome: 'changed', untilPhase: 'reconnect.pathSatisfied' },
      'results-changed': { mode: 'renew', outcome: 'changed' },
      'results-unchanged': { mode: 'renew', outcome: 'unchanged' },
      'results-failed': { mode: 'renew', outcome: 'failed' },
    };
    const cfg = target[frozen];
    const steps = script(cfg.mode, cfg.outcome);
    let cut = steps.length;
    if (cfg.untilPhase) {
      cut = steps.findIndex((s) => s.phase === cfg.untilPhase) + 1;
    }
    const id = 'op-preview-frozen';
    const evs: OperationEvent[] = steps.slice(0, cut).map((st, i) => {
      st.fx?.();
      return { operationId: id, seq: i + 1, at: iso(FROZEN_NOW - 9000 + st.at), stage: st.stage, state: st.state, phase: st.phase, message: st.message, data: st.data };
    });
    if (cfg.untilPhase) {
      running = { id, events: evs };
    } else {
      const res = resultFor(id, cfg.mode, cfg.outcome, FROZEN_NOW - 12000, FROZEN_NOW);
      currentIP = res.currentIP ?? currentIP;
      history = [res, ...history];
      queueMicrotask(() => {
        for (const e of evs) emit({ type: 'operation', payload: e });
        emit({ type: 'operationResult', payload: res });
      });
    }
  }

  /* ---------------------------------------------------------- commands */
  const ok = <T,>(data: T): BridgeReply<T> => ({ ok: true, data });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, frozen ? 0 : ms));

  async function call<K extends CommandName>(cmd: K, args: Commands[K]['args']): Promise<BridgeReply<Commands[K]['result']>> {
    type R = BridgeReply<Commands[K]['result']>;
    await wait(40);
    switch (cmd) {
      case 'app.info': {
        const info: AppInfo = { platform: win ? 'windows' : 'macos', osName: win ? 'Windows' : 'macOS', version: '1.0.0', build: 'preview', macOSVersion: osVersion, arch: win ? 'x64' : 'arm64', bridge: 'preview' };
        return ok(info) as R;
      }
      case 'network.snapshot':
        return ok(snapshot()) as R;
      case 'network.refresh':
        await wait(700);
        return ok(snapshot()) as R;
      case 'switch.start': {
        if (running) return { ok: false, error: { code: 'busy', message: 'A switch is already running.' } } as R;
        const mode = (args as { mode: SwitchMode }).mode;
        return ok({ operationId: startRun(mode) }) as R;
      }
      case 'switch.cancel':
        return ok({ cancelled: false }) as R;
      case 'switch.state':
        return ok({ running: !!running, operationId: running?.id ?? null, events: running?.events ?? [] }) as R;
      case 'history.list':
        return ok(history) as R;
      case 'history.clear': {
        const n = history.length;
        history = [];
        emit({ type: 'history', payload: history });
        return ok({ cleared: n }) as R;
      }
      case 'history.export':
        await wait(300);
        return ok({ path: '~/Downloads/IP SHIFT History (preview).csv' }) as R;
      case 'settings.get':
        return ok(settings) as R;
      case 'settings.update':
        {
          const a = args as Partial<Settings>;
          settings = { ...settings, ...a, graphics: { ...settings.graphics, ...(a.graphics ?? {}) } };
        }
        return ok(settings) as R;
      case 'diagnostics.run': {
        await wait(1400);
        const report: DiagnosticReport = {
          ranAt: iso(now()),
          checks: [
            { id: 'interface', label: 'Wi-Fi interface', status: 'pass', detail: 'en0 (Wi-Fi) detected', durationMs: 4 },
            { id: 'power', label: 'Wi-Fi power', status: 'pass', detail: 'On', durationMs: 2 },
            { id: 'association', label: 'Association', status: 'pass', detail: 'Connected to “Studio 5G” · −52 dBm', durationMs: 6 },
            { id: 'ipv4', label: 'IPv4 address', status: 'pass', detail: `${currentIP} / 255.255.255.0`, durationMs: 3 },
            { id: 'dhcpLease', label: 'DHCP lease', status: 'pass', detail: 'Bound · 20 h 46 m remaining', durationMs: 5 },
            { id: 'router', label: 'Router reachable', status: 'pass', detail: '192.168.1.1 answered in 3 ms', durationMs: 41 },
            { id: 'dns', label: 'DNS resolution', status: 'pass', detail: 'Resolved in 18 ms via 192.168.1.1', durationMs: 22 },
            { id: 'internet', label: 'Internet', status: 'pass', detail: 'Online · 34 ms', durationMs: 120 },
            { id: 'publicIP', label: 'Public IP lookup', status: 'warn', detail: 'Lookup took 1.2 s (slow provider response)', durationMs: 1210 },
            { id: 'location', label: 'Location permission', status: 'skipped', detail: 'Already authorized — no prompt needed', durationMs: 0 },
          ],
        };
        return ok(report) as R;
      }
      case 'permissions.requestLocation':
        return ok({ status: 'authorized' }) as R;
      case 'system.openSettings':
        return ok({ opened: false }) as R;
      case 'clipboard.write': {
        try {
          await navigator.clipboard.writeText((args as { text: string }).text);
          return ok({ written: true }) as R;
        } catch {
          return ok({ written: false }) as R;
        }
      }
      default:
        return { ok: false, error: { code: 'unknownCommand', message: `Unknown command ${String(cmd)}` } } as R;
    }
  }

  return { call, frozen };
}
