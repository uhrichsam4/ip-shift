import { useLayoutEffect, useRef } from 'react';
import { Flip } from '../motion/eases';
import { reduced } from '../motion';
import { dur } from '../design/tokens';
import { modKey, useAppStore, type Page } from '../state/store';
import { IconDashboard, IconDiagnostics, IconHistory, IconNetwork, IconSettings, LogoMark } from '../design/icons';
import { memo } from 'react';
import { Dot, Sparkline, useThrottledRssi } from './primitives';

export const NAV: { page: Page; label: string; Icon: typeof IconDashboard }[] = [
  { page: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { page: 'network', label: 'Network', Icon: IconNetwork },
  { page: 'history', label: 'History', Icon: IconHistory },
  { page: 'diagnostics', label: 'Diagnostics', Icon: IconDiagnostics },
  { page: 'settings', label: 'Settings', Icon: IconSettings },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const platform = useAppStore((s) => s.platform);
  const listRef = useRef<HTMLUListElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const prevPage = useRef(page);

  // capture before React commits the new active item
  if (prevPage.current !== page && listRef.current) {
    flipState.current = Flip.getState(listRef.current.querySelector('.nav-pill'));
    prevPage.current = page;
  }
  useLayoutEffect(() => {
    if (flipState.current && listRef.current && !reduced()) {
      Flip.from(flipState.current, { targets: listRef.current.querySelector('.nav-pill'), duration: dur.base, ease: 'ip.spring' });
    }
    flipState.current = null;
  }, [page]);

  return (
    <aside className="sidebar">
      <div className="drag-region sidebar-top" />
      <div className="brand">
        <LogoMark size={32} id="side" />
        <span className="wordmark">IP SHIFT</span>
      </div>
      <nav aria-label="Main">
        <ul ref={listRef} className="nav">
          {NAV.map(({ page: p, label, Icon }, i) => (
            <li key={p}>
              <button
                className={`nav-item ${page === p ? 'active' : ''}`}
                aria-current={page === p ? 'page' : undefined}
                onClick={() => setPage(p)}
                title={`${label} (${modKey(platform)}${i + 1})`}
              >
                {page === p && <span className="nav-pill glass-2" data-flip-id="nav-pill" />}
                <Icon size={20} className="nav-icon" />
                <span className="t-body-l">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-spacer" />
      <NetworkStatusCard />
    </aside>
  );
}

const NetworkStatusCard = memo(function NetworkStatusCard() {
  const rssi = useThrottledRssi(500);
  const snap = useAppStore((s) => s.snapshot);
  const hasRssi = rssi.some((x) => x !== null);
  const internet = snap?.connectivity.internet;
  const online = internet === 'online';
  const tone = !snap ? 'neutral' : online ? 'success' : internet === 'captive' || internet === 'checking' ? 'warning' : internet === 'offline' ? 'danger' : 'neutral';
  const label = !snap ? 'Checking…' : online ? 'Online' : internet === 'captive' ? 'Captive portal' : internet === 'checking' ? 'Checking…' : internet === 'offline' ? 'Offline' : 'Unknown';
  const latest = [...rssi].reverse().find((x) => x !== null) ?? null;
  return (
    <section className="status-card glass-1" aria-label="Network status">
      <div className="status-head">
        <span className="t-micro" style={{ color: 'var(--text-3)' }}>Network Status</span>
        <span className="status-sig mono t-caption">{latest !== null ? `${latest} dBm` : '—'}</span>
      </div>
      <Sparkline values={hasRssi ? rssi : []} width={166} height={40} label="Wi-Fi signal strength" />
      <div className="status-foot">
        <Dot tone={tone} />
        <span className="t-title-s">{label}</span>
        {snap?.connectivity.lastProbe?.latencyMs != null && online && (
          <span className="mono t-caption" style={{ color: 'var(--text-3)', marginLeft: 'auto' }}>
            {snap.connectivity.lastProbe.latencyMs} ms
          </span>
        )}
      </div>
    </section>
  );
});
