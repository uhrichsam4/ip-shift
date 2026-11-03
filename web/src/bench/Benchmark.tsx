/**
 * BENCHMARK HARNESS — bench-only. Mounted when the URL has ?bench=1 (native: IPSHIFT_BENCH=1).
 * Drives store.graphics / store.quality / store.sceneMode directly; never persists settings.
 */
import { useEffect, useState } from 'react';
import { useAppStore, type QualityTier, type SceneMode } from '../state/store';
import { PRESETS } from '../state/graphics';
import { setBenchOverride } from '../state/actions';

const PASS_MS = 6000;
const WARMUP_MS = 1000;
const SEQ: SceneMode[] = ['initialise', 'wifi', 'dhcp', 'reconnect', 'results'];

interface PassDef {
  name: string;
  tier: QualityTier;
  sequence: boolean;
}
const PASSES: PassDef[] = [
  { name: 'low · idle', tier: 'low', sequence: false },
  { name: 'balanced · idle', tier: 'balanced', sequence: false },
  { name: 'high · idle', tier: 'high', sequence: false },
  { name: 'ultra · idle', tier: 'ultra', sequence: false },
  { name: 'balanced · switch sequence', tier: 'balanced', sequence: true },
];

export interface PassResult {
  pass: string;
  frames: number;
  avgFps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  over8_33: number; // % of frames
  over16_7: number; // % of frames
  dropped: number;
  displayIntervalMs: number;
  focused: boolean;
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Snap a measured median frame time to the nearest common refresh interval. */
function displayInterval(warmup: number[]): number {
  if (!warmup.length) return 1000 / 60;
  const med = [...warmup].sort((a, b) => a - b)[Math.floor(warmup.length / 2)];
  const rates = [240, 165, 144, 120, 90, 60, 48, 30];
  let best = 60;
  for (const hz of rates) if (Math.abs(1000 / hz - med) < Math.abs(1000 / best - med)) best = hz;
  return 1000 / best;
}

function runPass(def: PassDef): Promise<PassResult> {
  return new Promise((resolve) => {
    const st = useAppStore.getState();
    useAppStore.setState({ quality: def.tier, graphics: { ...PRESETS[def.tier], showFps: st.graphics.showFps }, sceneMode: 'idle', page: 'dashboard' });
    const warm: number[] = [];
    const deltas: number[] = [];
    let focused = document.hasFocus();
    let start = 0;
    let last = 0;
    let seqTimer: number | undefined;
    if (def.sequence) {
      // bench-only: cycle scene modes through the store exactly like the preview bridge's operation events do
      let i = 0;
      const step = () => {
        const mode = SEQ[i % SEQ.length];
        const link = mode === 'wifi' ? (i % 2 ? 'negotiating' : 'down') : 'up';
        useAppStore.setState((s) => ({ sceneMode: mode, sceneSignals: { ...s.sceneSignals, link, leaseAckAt: mode === 'reconnect' ? performance.now() : s.sceneSignals.leaseAckAt } }));
        i++;
      };
      step();
      seqTimer = window.setInterval(step, (PASS_MS - WARMUP_MS) / SEQ.length);
    }
    const frame = (t: number) => {
      if (!start) {
        start = last = t;
        requestAnimationFrame(frame);
        return;
      }
      const d = t - last;
      last = t;
      focused = focused && document.hasFocus();
      if (t - start < WARMUP_MS) warm.push(d);
      else deltas.push(d);
      if (t - start < PASS_MS) {
        requestAnimationFrame(frame);
        return;
      }
      if (seqTimer) clearInterval(seqTimer);
      const di = displayInterval(warm.concat(deltas));
      const sorted = [...deltas].sort((a, b) => a - b);
      const total = deltas.reduce((a, b) => a + b, 0);
      const n = deltas.length || 1;
      resolve({
        pass: def.name,
        frames: deltas.length,
        avgFps: r2((deltas.length / total) * 1000),
        p50: r2(pct(sorted, 50)),
        p95: r2(pct(sorted, 95)),
        p99: r2(pct(sorted, 99)),
        max: r2(sorted[sorted.length - 1] ?? 0),
        over8_33: r2((deltas.filter((x) => x > 8.33).length / n) * 100),
        over16_7: r2((deltas.filter((x) => x > 16.7).length / n) * 100),
        dropped: deltas.filter((x) => x > di * 1.5).length,
        displayIntervalMs: r2(di),
        focused,
      });
    };
    requestAnimationFrame(frame);
  });
}

export function Benchmark() {
  const assetsReady = useAppStore((s) => s.assetsReady);
  const [results, setResults] = useState<PassResult[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const go = async () => {
      // wait for assets (or 6 s), then a short settle
      const t0 = performance.now();
      while (!useAppStore.getState().assetsReady && performance.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return; // StrictMode dev double-mount: only the surviving mount runs
      const saved = useAppStore.getState();
      const restore = { quality: saved.quality, graphics: saved.graphics, sceneMode: saved.sceneMode, sceneSignals: saved.sceneSignals };
      setBenchOverride(true);
      const out: PassResult[] = [];
      for (const p of PASSES) {
        if (cancelled) {
          useAppStore.setState(restore);
          setBenchOverride(false);
          return;
        }
        setCurrent(p.name);
        out.push(await runPass(p));
        setResults([...out]);
      }
      useAppStore.setState(restore);
      setBenchOverride(false);
      setCurrent(null);
      setDone(true);
      const summary = {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        viewport: [window.innerWidth, window.innerHeight],
        focusedThroughout: out.every((r) => r.focused),
        passes: out,
      };
      console.log('IPSHIFT_BENCH ' + JSON.stringify(summary));
      (window as unknown as { __IPSHIFT_BENCH__?: unknown }).__IPSHIFT_BENCH__ = summary;
    };
    go();
    return () => {
      cancelled = true;
      setBenchOverride(false);
    };
  }, []);

  const focusedAll = results.every((r) => r.focused);
  return (
    <div className="bench glass-1 mono" role="status" aria-live="polite">
      <div className="bench-head">
        <span className="t-micro">Benchmark · bench mode</span>
        <span className="t-caption muted">{done ? 'Complete' : current ? `Running: ${current}` : assetsReady ? 'Settling…' : 'Waiting for assets…'}</span>
      </div>
      <table className="bench-table t-body-s">
        <thead>
          <tr>
            <th>Pass</th>
            <th>avg fps</th>
            <th>p50</th>
            <th>p95</th>
            <th>p99</th>
            <th>max</th>
            <th>&gt;8.33</th>
            <th>&gt;16.7</th>
            <th>drop</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.pass} className={r.avgFps >= 118 ? 'ok' : r.avgFps >= 58 ? 'mid' : 'bad'}>
              <td>{r.pass}</td>
              <td>{r.avgFps.toFixed(1)}</td>
              <td>{r.p50.toFixed(2)}</td>
              <td>{r.p95.toFixed(2)}</td>
              <td>{r.p99.toFixed(2)}</td>
              <td>{r.max.toFixed(1)}</td>
              <td>{r.over8_33.toFixed(1)}%</td>
              <td>{r.over16_7.toFixed(1)}%</td>
              <td>{r.dropped}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-caption muted bench-foot">
        Frame times in ms · first 1 s of each 6 s pass discarded · display interval {results[0] ? `${results[0].displayIntervalMs} ms` : '—'} ·{' '}
        <span style={{ color: focusedAll ? 'var(--success)' : 'var(--warning)' }}>
          window focused throughout: {results.length ? (focusedAll ? 'yes' : 'NO — results throttled') : '—'}
        </span>
      </p>
    </div>
  );
}
