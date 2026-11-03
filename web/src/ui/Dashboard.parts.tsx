import { useLayoutEffect, useRef } from 'react';
import { gsap } from '../motion/eases';
import { LetterReveal, Odometer, Presence, reduced, staggerIn } from '../motion';
import { modKey, useAppStore } from '../state/store';
import { useUI } from '../state/ui';
import { copyText, dismissResults, noChangesMade, refresh, requestLocation, requestSwitch, STAGE_TITLES } from '../state/actions';
import { DASH, duration, logTime, relDay, timeOfDay } from '../state/format';
import { IconArrowRight, IconCheck, IconChip, IconCopy, IconError, IconInfo, IconLocation, IconRefresh, IconWarning } from '../design/icons';
import type { StageId } from '../bridge/protocol';
import { Btn, Dot, Skel } from './primitives';
import { OS } from '../state/os';

/* ---------------------------------------------------------------- InfoPanel */
export function InfoPanel() {
  const snap = useAppStore((s) => s.snapshot);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) staggerIn(ref.current.querySelectorAll('.info-row'), { delay: 0.1 });
  }, []);

  const w = snap?.wifi;
  const ip = snap?.ipv4.address ?? null;
  const pub = snap?.publicIP;
  const inet = snap?.connectivity.internet;
  const dhcp = snap?.dhcp;

  const row = (label: string, value: React.ReactNode, key?: string) => (
    <div className="info-row" key={key ?? label}>
      <span className="info-label t-body-l">{label}</span>
      <span className="info-value">{snap ? value : <Skel />}</span>
    </div>
  );

  const ipBtn = (val: string | null, label: string) =>
    val ? (
      <button className="copy-ip mono t-title-s" onClick={() => copyText(val, `${label} copied`)} title={`Copy ${label}`} aria-label={`${label} ${val}, click to copy`}>
        <Odometer value={val} />
        <IconCopy size={14} className="copy-icon" />
      </button>
    ) : (
      <span className="mono t-title-s muted">{DASH}</span>
    );

  let ssidNode: React.ReactNode;
  if (!w) ssidNode = <span className="muted">No Wi-Fi interface</span>;
  else if (w.ssid) ssidNode = <span className="t-title-s">{w.ssid}</span>;
  else if (w.ssidAvailability === 'needsLocationPermission')
    ssidNode = (
      <span className="hidden-ssid">
        <span className="muted t-body">Hidden by {OS}</span>
        <button className="link-btn t-caption" onClick={requestLocation}>
          <IconLocation size={13} /> Allow Location
        </button>
      </span>
    );
  else if (w.ssidAvailability === 'notAssociated') ssidNode = <span className="muted">Not connected</span>;
  else ssidNode = <span className="muted">{DASH}</span>;

  const statusTone = !w ? 'danger' : !w.powerOn ? 'danger' : w.associated ? 'success' : 'warning';
  const statusText = !w ? 'No Wi-Fi' : !w.powerOn ? 'Wi-Fi off' : w.associated ? 'Connected' : 'Not connected';
  const inetTone = inet === 'online' ? 'success' : inet === 'offline' ? 'danger' : inet === 'captive' || inet === 'checking' ? 'warning' : 'neutral';
  const inetText = inet === 'online' ? 'Online' : inet === 'offline' ? 'Offline' : inet === 'captive' ? 'Captive portal' : inet === 'checking' ? 'Checking…' : 'Unknown';
  const latency = snap?.connectivity.lastProbe?.latencyMs;
  const dhcpText = !dhcp ? DASH : dhcp.status === 'bound' ? 'Enabled · Bound' : dhcp.status === 'selfAssigned' ? 'Self-assigned' : dhcp.status === 'none' ? 'Off' : 'Unknown';

  return (
    <section className="info-panel glass-1" aria-label="Connection details" ref={ref}>
      {row('Local IP', ipBtn(ip, 'Local IP'))}
      {row(
        'Public IP',
        pub?.status === 'ok' ? ipBtn(pub.address, 'Public IP') : pub?.status === 'pending' ? <Skel /> : <span className="muted t-body">{pub?.status === 'disabled' ? 'Lookup off' : 'Unavailable'}</span>,
      )}
      {row('Wi-Fi Network', ssidNode)}
      {row('Interface', <span className="mono t-title-s">{w ? `${w.interfaceName} · ${w.hardwarePort}` : snap?.primaryInterface ?? DASH}</span>)}
      {row(
        'Status',
        <span className="status-val">
          <Dot tone={statusTone} />
          <span className="t-title-s">{statusText}</span>
        </span>,
      )}
      {row(
        'Internet',
        <span className="status-val">
          <Dot tone={inetTone} />
          <span className="t-title-s">{inetText}</span>
          {inet === 'online' && latency != null && <span className="mono t-caption muted">{latency} ms</span>}
        </span>,
      )}
      {row('DHCP', <span className="t-title-s">{dhcpText}</span>)}
    </section>
  );
}

/* ---------------------------------------------------------------- Recent activity */
export function RecentActivity({ rows = 3 }: { rows?: number }) {
  const history = useAppStore((s) => s.history);
  const setPage = useAppStore((s) => s.setPage);
  const items = history.slice(0, rows);
  return (
    <section className="recent glass-1" aria-label="Recent activity">
      <header className="recent-head">
        <span className="t-title-s">Recent Activity</span>
        <button className="link-btn t-caption" onClick={() => setPage('history')}>
          View All <IconArrowRight size={13} />
        </button>
      </header>
      {items.length === 0 ? (
        <p className="recent-empty t-body muted">No switches yet — your results will appear here.</p>
      ) : (
        <ul className="recent-list">
          {items.map((h) => {
            const tone = h.outcome === 'changed' ? 'success' : h.outcome === 'unchanged' ? 'live' : h.outcome === 'failed' ? 'danger' : 'neutral';
            return (
              <li key={h.id} className="recent-row">
                <span className="mono t-caption muted recent-time">
                  {relDay(h.startedAt)} · {timeOfDay(h.startedAt)}
                </span>
                <span className="t-body recent-op">{h.mode === 'renew' ? 'Renew lease' : 'Reconnect + renew'}</span>
                <span className="mono t-body recent-ips">
                  {h.outcome === 'changed' ? (
                    <>
                      <span className="muted">{h.previousIP ?? DASH}</span>
                      <IconArrowRight size={12} />
                      <span>{h.currentIP ?? DASH}</span>
                    </>
                  ) : h.outcome === 'failed' ? (
                    <span className="muted">Failed · no change</span>
                  ) : (
                    <span className="muted">No change</span>
                  )}
                </span>
                <Dot tone={tone} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- Top chip */
export function TopChips() {
  const snap = useAppStore((s) => s.snapshot);
  const info = useAppStore((s) => s.appInfo);
  const refreshing = useUI((s) => s.refreshing);
  const ver = snap?.macOSVersion ?? info?.macOSVersion;
  const platform = useAppStore((s) => s.platform);
  const osName = info?.osName ?? (platform === 'windows' ? 'Windows' : 'macOS');
  const mk = modKey(platform);
  const iconRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!iconRef.current) return;
    if (refreshing && !reduced()) {
      const t = gsap.to(iconRef.current, { rotation: '+=360', duration: 0.9, ease: 'none', repeat: -1 });
      return () => {
        t.kill();
        gsap.to(iconRef.current, { rotation: 0, duration: 0.2 });
      };
    }
  }, [refreshing]);
  return (
    <div className="top-chips no-drag">
      <span className="chip glass-1 t-caption">
        <IconChip size={14} />
        {ver ? `${osName} ${ver}` : <Skel w="7ch" />}
      </span>
      <FpsChip />
      <button className="chip chip-btn glass-1" onClick={refresh} aria-label={`Refresh network details (${mk}R)`} title={`Refresh (${mk}R)`} disabled={refreshing}>
        <span ref={iconRef} style={{ display: 'inline-flex' }}>
          <IconRefresh size={15} />
        </span>
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Stage HUD */
const ORDER: StageId[] = ['initialise', 'wifi', 'dhcp', 'reconnect', 'results'];
export function StageHUD() {
  const op = useAppStore((s) => s.operation);
  const sceneMode = useAppStore((s) => s.sceneMode);
  const show = (op.running || sceneMode !== 'idle') && sceneMode !== 'results';
  const stage = sceneMode !== 'idle' && sceneMode !== 'results' ? (sceneMode as StageId) : 'initialise';
  return (
    <Presence show={show} kind="rise" className="hud">
      <div className="hud-inner">
        <span className="t-micro hud-kicker">{op.mode === 'reconnect' ? 'Reconnect Wi-Fi + renew' : 'Renew lease'}</span>
        <LetterReveal key={stage} text={STAGE_TITLES[stage]} className="t-headline hud-title" />
        <ol className="tracker" aria-label="Progress">
          {ORDER.map((s, i) => {
            const st = op.stages[s];
            return (
              <li key={s} className={`trk trk-${st}`}>
                {i > 0 && <span className="trk-line" />}
                <span className="trk-dot" aria-hidden>
                  {st === 'done' ? <IconCheck size={11} strokeWidth={2.2} /> : st === 'failed' ? <IconError size={11} strokeWidth={2} /> : null}
                </span>
                <span className="t-caption trk-label">{STAGE_TITLES[s]}</span>
                <span className="sr-only">{st}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </Presence>
  );
}

/* ---------------------------------------------------------------- Event log */
export function EventLog() {
  const op = useAppStore((s) => s.operation);
  const sceneMode = useAppStore((s) => s.sceneMode);
  const show = op.events.length > 0 && sceneMode !== 'idle' && sceneMode !== 'results';
  const listRef = useRef<HTMLOListElement>(null);
  const n = op.events.length;
  useLayoutEffect(() => {
    const last = listRef.current?.lastElementChild;
    if (last && !reduced()) gsap.fromTo(last, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.32, ease: 'ip.enter' });
  }, [n]);
  return (
    <Presence show={show} kind="fade" className="eventlog">
      <ol ref={listRef} className="mono t-body-s" aria-label="Event log">
        {op.events.slice(-6).map((e) => (
          <li key={e.seq} className={`ev ev-${e.state}`}>
            <span className="ev-time">{logTime(e.at)}</span> <span className="ev-phase">{e.phase}</span> · {e.message}
          </li>
        ))}
      </ol>
    </Presence>
  );
}

/* ---------------------------------------------------------------- Results */
export function ResultsPanel() {
  const open = useAppStore((s) => s.resultsOpen);
  const r = useAppStore((s) => s.operation.result);
  const events = useAppStore((s) => s.operation.events);
  const setPage = useAppStore((s) => s.setPage);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    staggerIn(panelRef.current.querySelectorAll('.res-anim'), { each: 0.06, delay: 0.15 });
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismissResults();
      }
    };
    window.addEventListener('keydown', k, true);
    (panelRef.current.querySelector('.btn-secondary.done') as HTMLButtonElement | null)?.focus();
    return () => window.removeEventListener('keydown', k, true);
  }, [open]);

  if (!r) return null;
  const changed = r.outcome === 'changed';
  const unchanged = r.outcome === 'unchanged';
  const failed = r.outcome === 'failed' || r.outcome === 'cancelled';
  const safe = failed && noChangesMade(events.length ? events : []);

  return (
    <Presence show={open} kind="panel" className="results-layer">
      <div className={`results glass-1 res-${r.outcome}`} role="dialog" aria-modal="true" aria-labelledby="res-title" ref={panelRef}>
        <div className={`verdict res-anim verdict-${r.outcome}`}>
          {changed ? <IconCheck size={16} strokeWidth={2} /> : unchanged ? <IconInfo size={16} /> : <IconWarning size={16} />}
          <span id="res-title" className="t-title-s">
            {changed ? 'Address changed' : unchanged ? 'Lease renewed — same address' : r.outcome === 'cancelled' ? 'Switch cancelled' : 'Switch failed'}
          </span>
        </div>

        <div className="res-ips res-anim">
          <div className="res-prev-line">
            <span className="t-micro muted">Previous</span>
            <span className="t-data-l mono muted">{r.previousIP ?? DASH}</span>
          </div>
          <div className="res-ip res-ip-cur">
            <span className="t-micro muted">{changed ? `Current · verified by ${OS}` : 'Current'}</span>
            <span className="t-hero-data grad-num">
              <Odometer value={r.currentIP} />
            </span>
          </div>
        </div>

        <p className="res-explain t-body-l res-anim">
          {changed && `${OS} reports a different local address on this network. Devices that knew your old address will need the new one.`}
          {unchanged && 'Your router renewed the lease and kept the same address. Many routers reserve one address per device.'}
          {failed && (
            <>
              {r.failure?.message ?? 'The switch did not complete.'}
              {safe && <strong> No changes were made.</strong>}
            </>
          )}
        </p>

        <dl className="res-lines res-anim">
          <div>
            <dt className="muted">Internet</dt>
            <dd>
              {r.internet === 'restored' ? (
                <>
                  <Dot tone="success" /> Internet restored{r.internetLatencyMs != null ? ` · ${r.internetLatencyMs} ms` : ''}
                </>
              ) : r.internet === 'unavailable' ? (
                <>
                  <Dot tone="danger" /> Internet unavailable after the switch
                </>
              ) : (
                <span className="muted">Not checked</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="muted">Lease</dt>
            <dd>
              {r.leaseRenewed ? `Renewed at ${timeOfDay(r.leaseStart)}${r.dhcpServer ? ` by ${r.dhcpServer}` : ''}` : 'Not renewed'}
            </dd>
          </div>
          <div>
            <dt className="muted">Public IP</dt>
            <dd>
              <span className="mono">{r.publicIPAfter ?? r.publicIPBefore ?? DASH}</span>
              <span className="res-note t-caption muted">Assigned by your internet provider — switching your local IP doesn't change it.</span>
            </dd>
          </div>
          <div>
            <dt className="muted">Duration</dt>
            <dd className="mono">{duration(r.durationMs)}</dd>
          </div>
        </dl>

        <div className="res-actions res-anim">
          <Btn
            variant="primary"
            onClick={() => {
              dismissResults();
              requestSwitch();
            }}
          >
            Try again
          </Btn>
          <Btn
            variant="secondary"
            onClick={() => {
              dismissResults();
              setPage('history');
            }}
          >
            View history
          </Btn>
          <Btn variant="secondary" className="done" onClick={dismissResults}>
            Done
          </Btn>
        </div>
      </div>
    </Presence>
  );
}

function FpsChip() {
  const show = useAppStore((s) => s.graphics.showFps);
  const fps = useAppStore((s) => s.fps);
  if (!show) return null;
  return (
    <span className="fps-chip glass-1 mono t-caption" aria-label={`${Math.round(fps)} frames per second`}>
      {fps > 0 ? Math.round(fps) : '—'} fps
    </span>
  );
}
