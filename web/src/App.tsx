import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Stage } from './scene/Stage';
import { gsap } from './motion/eases';
import { reduced, staggerIn } from './motion';
import { dur } from './design/tokens';
import { useAppStore, type Page } from './state/store';
import { useUI } from './state/ui';
import { refresh, requestSwitch, dismissResults } from './state/actions';
import { Sidebar, NAV } from './ui/Sidebar';
import { EventLog, ResultsPanel, StageHUD, TopChips } from './ui/Dashboard.parts';
import { Toasts } from './ui/primitives';
import { Intro } from './ui/Intro';
import { Benchmark } from './bench/Benchmark';

const BENCH = new URLSearchParams(location.search).get('bench') === '1';
import { Dashboard } from './pages/Dashboard';
import { NetworkPage } from './pages/Network';
import { HistoryPage } from './pages/History';
import { DiagnosticsPage } from './pages/Diagnostics';
import { SettingsPage } from './pages/Settings';

/** A 3D failure must never take down the UI: fall back to the plain void background. */
class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[stage] 3D scene failed; UI continues without it', err);
    useAppStore.setState({ assetsReady: true });
  }
  render() {
    return this.state.failed ? <div style={{ position: 'absolute', inset: 0, background: 'var(--void)' }} /> : this.props.children;
  }
}

const PAGES: Record<Page, () => React.JSX.Element> = {
  dashboard: Dashboard,
  network: NetworkPage,
  history: HistoryPage,
  diagnostics: DiagnosticsPage,
  settings: SettingsPage,
};

/** Page transition controller: exit timeline on the outgoing page, then staggered entrance of the incoming one. */
function PageHost() {
  const page = useAppStore((s) => s.page);
  const [shown, setShown] = useState<Page>(page);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (page === shown || !ref.current) return;
    const el = ref.current;
    gsap.killTweensOf(el);
    const rm = reduced();
    const tl = gsap.to(el, {
      opacity: 0,
      y: rm ? 0 : -8,
      duration: dur.fast,
      ease: 'ip.exit',
      onComplete: () => setShown(page),
    });
    return () => {
      tl.kill();
    };
  }, [page, shown]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { opacity: 1, y: 0 });
    el.scrollTop = 0;
    staggerIn(el.querySelectorAll('.page-anim'), { each: 0.06 });
  }, [shown]);

  const P = PAGES[shown];
  return (
    <main ref={ref} className={`page-host page-${shown}`} aria-label={NAV.find((n) => n.page === shown)?.label}>
      <P />
    </main>
  );
}

function useKeyboard() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const win = useAppStore.getState().platform === 'windows';
      const mod = win ? e.ctrlKey && !e.metaKey : e.metaKey;
      if (mod && !e.shiftKey && !e.altKey) {
        const n = Number(e.key);
        if (n >= 1 && n <= 5) {
          e.preventDefault();
          useAppStore.getState().setPage(NAV[n - 1].page);
          return;
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          refresh();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          requestSwitch();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (useUI.getState().confirmOpen) useUI.getState().set({ confirmOpen: false });
        else if (useAppStore.getState().resultsOpen) dismissResults();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}

function PreviewBadge() {
  const kind = useAppStore((s) => s.bridgeKind);
  if (kind !== 'preview') return null;
  return (
    <div className="preview-badge t-micro" role="note" title="Running in a browser with the preview bridge. No real network data is shown.">
      <span className="pb-dot" />
      Preview · Illustrative data
    </div>
  );
}

export default function App() {
  useKeyboard();
  const page = useAppStore((s) => s.page);
  const sceneMode = useAppStore((s) => s.sceneMode);
  const announcement = useUI((s) => s.announcement);
  const introDone = useUI((s) => s.introDone);
  const flying = sceneMode !== 'idle' && sceneMode !== 'results';
  const shellRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (introDone && shellRef.current) {
      gsap.fromTo(shellRef.current, { opacity: 0 }, { opacity: 1, duration: reduced() ? dur.fast : dur.slow, ease: 'ip.standard' });
    }
  }, [introDone]);

  return (
    <div className="app">
      <div className="stage-layer" aria-hidden>
        <StageBoundary>
          <Stage />
        </StageBoundary>
      </div>
      <div className={`stage-veil ${page !== 'dashboard' ? 'on' : ''}`} aria-hidden />
      <div className="drag-region top-drag" />
      <div className="shell" ref={shellRef} style={{ opacity: introDone ? undefined : 0 }}>
        <div className={`sidebar-host ${flying ? 'dimmed' : ''}`}>
          <Sidebar />
        </div>
        <div className="content">
          <div className={`content-top ${flying ? 'dimmed' : ''}`}>
            <PreviewBadge />
            <TopChips />
          </div>
          <PageHost />
          <StageHUD />
          <EventLog />
          <ResultsPanel />
        </div>
      </div>
      <Toasts />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Intro />
      {BENCH && introDone && <Benchmark />}
    </div>
  );
}
