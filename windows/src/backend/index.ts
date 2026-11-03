import * as os from 'os';
import * as dns from 'dns';
import { randomUUID } from 'crypto';
import type {
  AppInfo, BridgeEvent, Commands, DiagnosticReport, NetworkSnapshot, OperationEvent, OperationResult, PublicIPInfo,
  StageId, StageState, SwitchMode, WifiInfo,
} from '../shared/protocol';
import { Backend, BackendCommand, BackendError, BackendOptions } from './contract';
import { Store } from './store';
import * as w from './win32';

const iso = (d: Date | number = new Date()) => new Date(d).toISOString();
const isIPv4 = (s: string | null): boolean => !!s && /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
const selfAssigned = (s: string | null) => !!s && s.startsWith('169.254.');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function windowsVersion(): string {
  if (process.platform !== 'win32') return `${os.type()} ${os.release()} (development)`;
  const [maj, , build] = os.release().split('.').map(Number);
  return `${maj === 10 && build >= 22000 ? '11' : String(maj)} (${build})`;
}

interface State {
  wifi: w.WlanInfo | null; adapter: w.AdapterInfo | null;
}

function readState(): State {
  const wl = w.wlanInterfaces()[0] ?? null;
  const adapters = w.getAdaptersInfo();
  const adapter = wl
    ? adapters.find((a) => a.adapterName.toUpperCase() === wl.guid) ?? null
    : adapters.find((a) => a.type === w.IF_TYPE_IEEE80211) ?? null;
  return { wifi: wl, adapter };
}

async function probe(): Promise<{ internet: 'online' | 'offline' | 'captive'; latencyMs: number | null; at: string; target: string }> {
  const target = 'http://www.msftconnecttest.com/connecttest.txt';
  const t0 = Date.now();
  try {
    const r = await fetch(target, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    const body = await r.text();
    const ms = Date.now() - t0;
    return { internet: r.status === 200 && body.trim() === 'Microsoft Connect Test' ? 'online' : 'captive', latencyMs: ms, at: iso(), target };
  } catch {
    return { internet: 'offline', latencyMs: null, at: iso(), target };
  }
}

export function createWindowsBackend(opts: BackendOptions): Backend {
  const store = new Store(opts.dataDir);
  const listeners = new Set<(e: BridgeEvent) => void>();
  const emitEv = (e: BridgeEvent) => listeners.forEach((l) => { try { l(e); } catch { /* ignore */ } });
  const isWin = process.platform === 'win32';
  const guard = () => { if (!isWin) throw new BackendError('internal', w.NON_WINDOWS); };

  let lastProbe: Awaited<ReturnType<typeof probe>> | null = null;
  let pub: PublicIPInfo | null = null;
  let pubAt = 0;

  async function publicIP(force: boolean): Promise<PublicIPInfo> {
    const s = store.getSettings();
    if (!s.publicIPLookup) return { status: 'disabled', address: null, provider: null, fetchedAt: null };
    if (!force && pub && pub.status === 'ok' && Date.now() - pubAt < 60_000) return pub;
    const order = s.publicIPProvider === 'ipify' ? ['ipify', 'cloudflare'] : ['cloudflare', 'ipify'];
    let err = 'Lookup failed.';
    for (const p of order) {
      try {
        const r = await fetch(p === 'ipify' ? 'https://api.ipify.org' : 'https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(5000) });
        const body = await r.text();
        const v = p === 'ipify' ? body.trim() : (body.split('\n').find((l) => l.startsWith('ip=')) ?? '').slice(3).trim();
        if (isIPv4(v) || (v.includes(':') && /^[0-9a-fA-F:.]+$/.test(v))) {
          pub = { status: 'ok', address: v, provider: p === 'ipify' ? 'ipify' : 'Cloudflare', fetchedAt: iso() };
          pubAt = Date.now();
          return pub;
        }
        err = 'Unexpected response.';
      } catch (e) { err = (e as Error).message; }
    }
    pub = { status: 'error', address: null, provider: null, fetchedAt: iso(), error: err };
    pubAt = Date.now();
    return pub;
  }

  function snapshot(): NetworkSnapshot {
    guard();
    const { wifi: wl, adapter: a } = readState();
    const assoc = wl?.state === 1;
    const wifi: WifiInfo | null = wl ? {
      interfaceName: wl.description, hardwarePort: 'Wi-Fi', powerOn: wl.state !== 0, // radio state opcode not read yet
      associated: assoc, ssid: wl.ssid,
      ssidAvailability: !assoc ? 'notAssociated' : wl.locationDenied ? 'needsLocationPermission' : wl.ssid ? 'available' : 'unknown',
      bssid: wl.bssid, rssi: wl.rssi, noise: null, txRateMbps: wl.txKbps != null ? Math.round(wl.txKbps / 1000) : null,
      channel: wl.channel, band: w.band(wl.channel, wl.phy), channelWidthMHz: null,
      security: wl.auth != null ? w.AUTH[wl.auth] ?? null : null, phyMode: wl.phy != null ? w.PHY[wl.phy] ?? null : null,
      hardwareAddress: a?.mac ?? null,
    } : null;
    const ip = a?.ipv4 ?? null;
    const lease = a && a.leaseObtained > 0 ? a.leaseObtained : null;
    const exp = a && a.leaseExpires > 0 ? a.leaseExpires : null;
    const ipv6: string[] = [];
    for (const list of Object.values(os.networkInterfaces())) for (const n of list ?? []) {
      if (n.family === 'IPv6' && a?.mac && n.mac.toLowerCase() === a.mac) ipv6.push(n.address);
    }
    return {
      capturedAt: iso(), wifi,
      ipv4: { address: ip, subnetMask: a?.mask ?? null, router: a?.gateway ?? null, isSelfAssigned: selfAssigned(ip) },
      ipv6,
      dhcp: {
        status: !a || !ip ? 'unknown' : selfAssigned(ip) ? 'selfAssigned' : !a.dhcpEnabled ? 'none' : a.dhcpServer ? 'bound' : 'unknown',
        serverIdentifier: a?.dhcpServer ?? null, leaseStart: lease ? iso(lease * 1000) : null, leaseExpires: exp ? iso(exp * 1000) : null,
        leaseSeconds: lease && exp ? exp - lease : null, dns: dns.getServers(),
      },
      connectivity: {
        path: 'unknown', internet: lastProbe?.internet ?? 'unknown',
        lastProbe: lastProbe ? { ok: lastProbe.internet === 'online', latencyMs: lastProbe.latencyMs, at: lastProbe.at, target: lastProbe.target } : null,
      },
      publicIP: pub ?? { status: 'pending', address: null, provider: null, fetchedAt: null },
      primaryInterface: null, macOSVersion: windowsVersion(),
      locationAuthorization: wl?.locationDenied ? 'denied' : assoc && wl?.ssid ? 'authorized' : 'notDetermined',
    };
  }

  // ---------------- switch engine (renew mode) ----------------
  let running: { id: string; cancelled: boolean } | null = null;
  let opId: string | null = null;
  let events: OperationEvent[] = [];
  let seq = 0;

  function ev(stage: StageId, state: StageState, phase: string, message: string, data?: OperationEvent['data']) {
    const e: OperationEvent = { operationId: opId!, seq: ++seq, at: iso(), stage, state, phase, message, ...(data ? { data } : {}) };
    events.push(e);
    emitEv({ type: 'operation', payload: e });
  }

  async function waitFor(ms: number, cond: () => boolean): Promise<boolean> {
    const end = Date.now() + ms;
    for (;;) {
      if (running?.cancelled) throw new BackendError('cancelled', 'Cancelled.');
      if (cond()) return true;
      if (Date.now() >= end) return false;
      await sleep(250);
    }
  }

  async function run(id: string, mode: SwitchMode) {
    const started = Date.now();
    let stage: StageId = 'initialise';
    let base = readState();
    let publicBefore: string | null = null;
    let leaseRenewed = false;
    let internet: OperationResult['internet'] = 'notChecked';
    let latency: number | null = null;
    let failure: OperationResult['failure'];
    let cancelled = false;
    const check = () => { if (running?.cancelled) throw new BackendError('cancelled', 'Cancelled.'); };
    try {
      if (!base.wifi || !base.adapter) throw new BackendError('noWifiInterface', 'No Wi-Fi interface detected. No changes were made.', 'initialise');
      if (mode === 'reconnect') throw new BackendError('internal', 'Reconnect mode is not available yet on Windows. Use Renew. No changes were made.', 'initialise');
      const p = await publicIP(false);
      publicBefore = p.status === 'ok' ? p.address : null;
      base = readState();
      ev('initialise', 'done', 'baseline.captured', 'Captured the current network state.', {
        interfaceName: base.wifi!.description, ip: base.adapter!.ipv4, router: base.adapter!.gateway, ssid: base.wifi!.ssid, publicIP: publicBefore,
      });
      check();
      stage = 'wifi';
      if (base.wifi!.state !== 1) throw new BackendError('notAssociated', 'Wi-Fi is not connected to a network. No changes were made.', 'wifi');
      ev('wifi', 'done', 'wifi.verified', 'Wi-Fi is connected.');
      check();
      stage = 'dhcp';
      const baseLease = base.adapter!.leaseObtained;
      const rc = await w.ipRenew(base.adapter!.index);
      if (rc === w.ERROR_ACCESS_DENIED) {
        let msg = 'Windows needs administrator rights to renew the DHCP lease. No changes were made.';
        if (!opts.isElevated && opts.requestElevation) {
          const r = await opts.requestElevation();
          msg = r === 'relaunching'
            ? 'IP SHIFT is restarting as administrator. Start the switch again after it reopens. No changes were made.'
            : 'Administrator rights were declined, so the DHCP lease was not renewed. No changes were made.';
        }
        throw new BackendError('authorizationDenied', msg, 'dhcp');
      }
      if (rc !== 0) throw new BackendError('refreshFailed', `Windows could not renew the DHCP lease (error ${rc}).`, 'dhcp');
      ev('dhcp', 'active', 'dhcp.refreshRequested', 'Windows renewed the DHCP lease request.');
      ev('dhcp', 'active', 'dhcp.waitingForLease', 'Waiting for the router to acknowledge the lease.');
      let cur = readState();
      if (await waitFor(25_000, () => { cur = readState(); return (cur.adapter?.leaseObtained ?? 0) > baseLease; })) {
        leaseRenewed = true;
        ev('dhcp', 'done', 'dhcp.leaseAcknowledged', 'The router acknowledged the lease.', { ip: cur.adapter?.ipv4 ?? null });
      } else if (isIPv4(cur.adapter?.ipv4 ?? null) && !selfAssigned(cur.adapter!.ipv4)) {
        ev('dhcp', 'done', 'dhcp.leaseUnchangedTimestamp', 'Windows did not report a new lease time; the address is still assigned.', { ip: cur.adapter!.ipv4 });
      } else throw new BackendError('timeout', 'No DHCP lease was received within 25 seconds.', 'dhcp');
      check();
      stage = 'reconnect';
      const got = await waitFor(20_000, () => { const s = readState().adapter?.ipv4 ?? null; return isIPv4(s) && !selfAssigned(s); });
      if (!got) throw new BackendError('timeout', 'No IPv4 address was assigned within 20 seconds.', 'reconnect');
      ev('reconnect', 'active', 'reconnect.ipAssigned', 'An IPv4 address is assigned.', { ip: readState().adapter?.ipv4 ?? null });
      let online = false;
      for (let i = 1; i <= 3; i++) {
        check();
        lastProbe = await probe();
        if (lastProbe.internet === 'online') { online = true; latency = lastProbe.latencyMs; break; }
        if (i < 3) await sleep(3000);
      }
      internet = online ? 'restored' : 'unavailable';
      if (online) ev('reconnect', 'done', 'reconnect.internetVerified', 'Internet restored.', { latencyMs: latency });
      else ev('reconnect', 'done', 'reconnect.internetUnavailable', 'The local network is up but the internet check did not succeed.');
    } catch (e) {
      const be = e instanceof BackendError ? e : new BackendError('internal', (e as Error)?.message ?? String(e));
      if (be.code === 'cancelled') cancelled = true;
      else {
        const st = be.stage ?? stage;
        failure = { stage: st, code: be.code, message: be.message };
        ev(st, 'failed', `${st}.failed`, be.message);
      }
    }
    let fin: State = { wifi: null, adapter: null };
    try { fin = readState(); } catch { /* keep nulls */ }
    let publicAfter: string | null = null;
    if (!failure && !cancelled) { const p = await publicIP(true); publicAfter = p.status === 'ok' ? p.address : null; }
    const prev = base.adapter?.ipv4 ?? null;
    const curIP = fin.adapter?.ipv4 ?? null;
    let outcome: OperationResult['outcome'] = cancelled ? 'cancelled' : failure ? 'failed'
      : !isIPv4(curIP) || selfAssigned(curIP) ? 'failed' : !prev ? 'changed' : prev === curIP ? 'unchanged' : 'changed';
    if (outcome === 'failed' && !failure) failure = { stage: 'reconnect', code: 'internal', message: 'No valid IPv4 address could be read back from Windows.' };
    const finished = Date.now();
    const lease = fin.adapter && fin.adapter.leaseObtained > 0 ? iso(fin.adapter.leaseObtained * 1000) : null;
    const result: OperationResult = {
      id, mode, interfaceName: base.wifi?.description ?? null, ssid: fin.wifi?.ssid ?? base.wifi?.ssid ?? null,
      startedAt: iso(started), finishedAt: iso(finished), durationMs: finished - started, previousIP: prev, currentIP: curIP,
      outcome, leaseRenewed, leaseStart: lease, dhcpServer: fin.adapter?.dhcpServer ?? base.adapter?.dhcpServer ?? null,
      internet, internetLatencyMs: latency, publicIPBefore: publicBefore, publicIPAfter: publicAfter, ...(failure ? { failure } : {}),
    };
    const msg = outcome === 'changed' ? 'Address changed.' : outcome === 'unchanged' ? 'Lease renewed — same address.' : outcome === 'cancelled' ? 'Cancelled.' : failure?.message ?? 'The switch did not complete.';
    ev('results', 'done', 'results.ready', msg, { outcome });
    let all = store.history();
    try { all = store.addHistory(result); } catch { /* keep */ }
    running = null;
    emitEv({ type: 'operationResult', payload: result });
    emitEv({ type: 'history', payload: all });
  }

  // ---------------- polling ----------------
  let visible = true;
  let lastKey = '';
  if (isWin) {
    const tick = () => {
      try {
        const s = snapshot();
        const key = JSON.stringify({ ...s, capturedAt: '' });
        if (key !== lastKey) { lastKey = key; emitEv({ type: 'snapshot', payload: s }); }
      } catch { /* transient */ }
    };
    setInterval(tick, 1000).unref();
    setInterval(() => {
      if (!visible) return;
      try {
        const wl = w.wlanInterfaces()[0];
        emitEv({ type: 'metrics', payload: { at: iso(), rssi: wl?.rssi ?? null, noise: null, txRateMbps: wl?.txKbps != null ? Math.round(wl.txKbps / 1000) : null } });
      } catch { /* transient */ }
    }, 2000).unref();
    const probeLoop = async () => { lastProbe = await probe(); void publicIP(false); };
    void probeLoop();
    setInterval(() => void probeLoop(), 30_000).unref();
  }

  async function diagnostics(): Promise<DiagnosticReport> {
    guard();
    const checks: DiagnosticReport['checks'] = [];
    const t = Date.now();
    const s = snapshot();
    const d = Date.now() - t;
    checks.push({ id: 'interface', label: 'Wi-Fi interface', status: s.wifi ? 'pass' : 'fail', detail: s.wifi?.interfaceName ?? 'No Wi-Fi adapter found.', durationMs: d });
    checks.push({ id: 'association', label: 'Association', status: s.wifi?.associated ? 'pass' : 'fail', detail: s.wifi?.associated ? s.wifi.ssid ?? 'Connected (network name hidden).' : 'Not connected.', durationMs: 0 });
    checks.push({ id: 'ipv4', label: 'IPv4 address', status: s.ipv4.address && !s.ipv4.isSelfAssigned ? 'pass' : 'fail', detail: s.ipv4.address ?? 'None.', durationMs: 0 });
    checks.push({ id: 'dhcpLease', label: 'DHCP lease', status: s.dhcp.status === 'bound' ? 'pass' : 'warn', detail: s.dhcp.leaseExpires ? `Expires ${s.dhcp.leaseExpires}` : s.dhcp.status, durationMs: 0 });
    checks.push({ id: 'router', label: 'Router reachable', status: 'skipped', detail: 'Router ping is not available yet on Windows.', durationMs: 0 });
    const t2 = Date.now();
    const dnsOk = await dns.promises.lookup('www.microsoft.com').then((r) => r.address, () => null);
    checks.push({ id: 'dns', label: 'DNS', status: dnsOk ? 'pass' : 'fail', detail: dnsOk ? `www.microsoft.com → ${dnsOk}` : 'Lookup failed.', durationMs: Date.now() - t2 });
    const t3 = Date.now();
    lastProbe = await probe();
    checks.push({ id: 'internet', label: 'Internet', status: lastProbe.internet === 'online' ? 'pass' : lastProbe.internet === 'captive' ? 'warn' : 'fail', detail: lastProbe.internet, durationMs: Date.now() - t3 });
    const t4 = Date.now();
    const p = await publicIP(true);
    checks.push({ id: 'publicIP', label: 'Public IP', status: p.status === 'ok' ? 'pass' : p.status === 'disabled' ? 'skipped' : 'warn', detail: p.address ?? p.error ?? p.status, durationMs: Date.now() - t4 });
    checks.push({ id: 'location', label: 'Location permission', status: s.locationAuthorization === 'denied' ? 'warn' : 'pass', detail: s.locationAuthorization, durationMs: 0 });
    return { ranAt: iso(), checks };
  }

  const handlers: { [K in BackendCommand]: (a: Commands[K]['args']) => Promise<Commands[K]['result']> | Commands[K]['result'] } = {
    'app.info': (): AppInfo => ({ version: opts.appVersion, build: opts.appVersion, macOSVersion: windowsVersion(), arch: process.arch, bridge: 'native', platform: 'windows', osName: 'Windows' }),
    'network.snapshot': () => snapshot(),
    'network.refresh': async (a) => { guard(); lastProbe = await probe(); if (a?.includePublicIP) await publicIP(true); return snapshot(); },
    'switch.start': (a) => {
      guard();
      if (running) throw new BackendError('busy', 'A switch is already running.');
      const mode: SwitchMode = a?.mode === 'reconnect' ? 'reconnect' : 'renew';
      const id = randomUUID();
      running = { id, cancelled: false };
      opId = id; events = []; seq = 0;
      void run(id, mode).catch(() => { running = null; });
      return { operationId: id };
    },
    'switch.cancel': () => { if (!running) return { cancelled: false }; running.cancelled = true; return { cancelled: true }; },
    'switch.state': () => ({ running: !!running, operationId: opId, events }),
    'history.list': () => store.history(),
    'history.clear': () => { const n = store.clearHistory(); emitEv({ type: 'history', payload: [] }); return { cleared: n }; },
    'settings.get': () => store.getSettings(),
    'settings.update': (a) => store.updateSettings((a ?? {}) as Record<string, unknown>),
    'diagnostics.run': () => diagnostics(),
  };

  return {
    async call(cmd, args) {
      const h = handlers[cmd] as ((a: unknown) => unknown) | undefined;
      if (!h) throw new BackendError('unknownCommand', `Unknown command '${String(cmd)}'.`);
      return (await h(args)) as never;
    },
    onEvent(l) { listeners.add(l); return () => listeners.delete(l); },
    setWindowVisible(v) { visible = v; },
    async prepareForQuit() {
      // Renew mode never disconnects Wi-Fi, so there is nothing to restore. Cancel and wait briefly.
      if (running) { running.cancelled = true; const end = Date.now() + 5000; while (running && Date.now() < end) await sleep(50); }
    },
    historySnapshot: () => store.history(),
  };
}
