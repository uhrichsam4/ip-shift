import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAppStore, type AppState } from '../state/store';
import { gsap, Flip } from '../motion/eases';
import { Presence, reduced } from '../motion';
import { dur } from '../design/tokens';
import { useUI } from '../state/ui';
import { IconCheck, IconError, IconInfo } from '../design/icons';

/* ---------------------------------------------------------------- Sparkline */
export const Sparkline = memo(function Sparkline({
  values,
  width = 160,
  height = 40,
  min,
  max,
  label,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  const nums = values.filter((x): x is number => x !== null);
  if (nums.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label={`${label}: no data`} className="spark">
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--line-2)" strokeDasharray="2 4" />
      </svg>
    );
  }
  const lo = min ?? Math.min(...nums) - 2;
  const hi = max ?? Math.max(...nums) + 2;
  const n = values.length;
  const pts: [number, number][] = [];
  values.forEach((val, i) => {
    if (val === null) return;
    const x = (i / Math.max(1, n - 1)) * width;
    const y = height - 3 - ((val - lo) / Math.max(1e-6, hi - lo)) * (height - 6);
    pts.push([x, y]);
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1];
  const id = `sp-${label.replace(/\W/g, '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: latest ${nums[nums.length - 1]}`} className="spark">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--live)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--live)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--primary)" stopOpacity=".3" />
          <stop offset="1" stopColor="var(--live)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-a)`} />
      <path d={d} fill="none" stroke={`url(#${id}-l)`} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--cyan-200)" />
      <circle cx={last[0]} cy={last[1]} r="5" fill="var(--live)" opacity=".25" />
    </svg>
  );
}, (a, b) => a.width === b.width && a.height === b.height && a.label === b.label && a.values.length === b.values.length && a.values.every((x, i) => x === b.values[i]));

/** Metric RSSI series sampled at most every `ms` (default 500 ms = 2×/s) without re-rendering on every store change. */
export function useThrottledRssi(ms = 500) {
  const [vals, setVals] = useState<(number | null)[]>(() => useAppStore.getState().metrics.map((m) => m.rssi));
  useEffect(() => {
    let last = 0;
    let timer: number | undefined;
    const push = (s: AppState) => setVals(s.metrics.map((m) => m.rssi));
    const unsub = useAppStore.subscribe((s, prev) => {
      if (s.metrics === prev.metrics) return;
      const now = performance.now();
      if (now - last >= ms) {
        last = now;
        push(s);
      } else if (!timer) {
        timer = window.setTimeout(() => {
          timer = undefined;
          last = performance.now();
          push(useAppStore.getState());
        }, ms - (now - last));
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [ms]);
  return vals;
}

/* ---------------------------------------------------------------- Status dot */
export function Dot({ tone }: { tone: 'success' | 'warning' | 'danger' | 'neutral' | 'live' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(tone);
  useEffect(() => {
    if (prev.current !== tone && ref.current && !reduced()) {
      gsap.fromTo(ref.current, { scale: 1.8 }, { scale: 1, duration: dur.moderate, ease: 'ip.spring' });
    }
    prev.current = tone;
  }, [tone]);
  return <span ref={ref} className={`dot dot-${tone}`} aria-hidden />;
}

/* ---------------------------------------------------------------- Segmented */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef<Flip.FlipState | null>(null);
  const pick = (v: T) => {
    if (ref.current) state.current = Flip.getState(ref.current.querySelector('.seg-pill'));
    onChange(v);
  };
  useLayoutEffect(() => {
    if (state.current && ref.current && !reduced()) {
      Flip.from(state.current, { duration: dur.base, ease: 'ip.spring', targets: ref.current.querySelector('.seg-pill') });
    }
    state.current = null;
  }, [value]);
  const onKey = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const n = options[(i + 1) % options.length];
      pick(n.value);
      (ref.current?.querySelectorAll('button')[(i + 1) % options.length] as HTMLButtonElement)?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const j = (i - 1 + options.length) % options.length;
      pick(options[j].value);
      (ref.current?.querySelectorAll('button')[j] as HTMLButtonElement)?.focus();
    }
  };
  return (
    <div ref={ref} className="seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={`seg-opt ${o.value === value ? 'on' : ''}`}
          onClick={() => pick(o.value)}
        >
          {o.value === value && <span className="seg-pill" data-flip-id={`seg-${label}`} />}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Toggle */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  );
}

/* ---------------------------------------------------------------- Button */
export function Btn({
  children,
  variant = 'secondary',
  onClick,
  disabled,
  title,
  className,
  autoFocus,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <button className={`btn btn-${variant} ${className ?? ''}`} onClick={onClick} disabled={disabled} title={title} autoFocus={autoFocus}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Modal */
export function Modal({ open, onClose, children, label, width = 440 }: { open: boolean; onClose: () => void; children: ReactNode; label: string; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open, onClose]);
  return (
    <Presence show={open} kind="fade" className="modal-layer">
      <div className="modal-backdrop" onClick={onClose} />
      <Presence show={open} kind="panel" className="modal-wrap">
        <div className="modal glass-1" role="dialog" aria-modal="true" aria-label={label} style={{ width }}>
          {children}
        </div>
      </Presence>
    </Presence>
  );
}

/* ---------------------------------------------------------------- Toasts */
export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} text={t.text} tone={t.tone} />
      ))}
    </div>
  );
}
function ToastItem({ text, tone }: { text: string; tone: 'info' | 'success' | 'danger' }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) gsap.fromTo(ref.current, { opacity: 0, y: reduced() ? 0 : 10, scale: reduced() ? 1 : 0.96 }, { opacity: 1, y: 0, scale: 1, duration: dur.base, ease: 'ip.spring' });
  }, []);
  const Icon = tone === 'success' ? IconCheck : tone === 'danger' ? IconError : IconInfo;
  return (
    <div ref={ref} className={`toast glass-1 toast-${tone}`}>
      <Icon size={16} />
      <span className="t-body">{text}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- Live clock */
export function useNow(intervalMs = 1000, enabled = true) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setN(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return n;
}

export function Skel({ w = '9ch' }: { w?: string }) {
  return <span className="skeleton" style={{ width: w }} aria-label="Loading" />;
}
