import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from './eases';
import { dur, stagger as ST } from '../design/tokens';
import { useAppStore } from '../state/store';

export { gsap };

export const reduced = () => useAppStore.getState().reducedMotion;

/** Staggered entrance of the matched children (opacity, y 12→0, ip.enter). */
export function staggerIn(targets: gsap.TweenTarget, opts: { each?: number; delay?: number; y?: number } = {}) {
  if (reduced()) return gsap.fromTo(targets, { opacity: 0 }, { opacity: 1, duration: dur.fast, delay: opts.delay ?? 0 });
  return gsap.fromTo(
    targets,
    { opacity: 0, y: opts.y ?? 12 },
    { opacity: 1, y: 0, duration: dur.moderate, ease: 'ip.enter', stagger: opts.each ?? ST.rows, delay: opts.delay ?? 0, clearProps: 'transform' },
  );
}

export function useStaggerIn(selector: string, deps: unknown[] = [], opts?: { each?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll(selector);
    if (!els.length) return;
    const tw = staggerIn(els, opts);
    return () => { tw.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/**
 * Presence: keeps children mounted until the exit animation completes.
 * Enter: scale .96 → 1 + opacity (ip.spring). Exit: opacity + scale .98 (ip.exit).
 */
export function Presence({
  show,
  children,
  kind = 'panel',
  className,
  style,
}: {
  show: boolean;
  children: ReactNode;
  kind?: 'panel' | 'fade' | 'rise';
  className?: string;
  style?: React.CSSProperties;
}) {
  const [mounted, setMounted] = useState(show);
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<ReactNode>(children);
  if (show) last.current = children;

  useEffect(() => {
    if (show) setMounted(true);
  }, [show]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rm = reduced();
    gsap.killTweensOf(el);
    if (show) {
      const from: gsap.TweenVars = { opacity: 0 };
      if (!rm && kind === 'panel') from.scale = 0.96;
      if (!rm && kind === 'rise') from.y = 12;
      gsap.fromTo(el, from, { opacity: 1, scale: 1, y: 0, duration: rm ? dur.fast : dur.base, ease: kind === 'panel' ? 'ip.spring' : 'ip.enter' });
    } else if (mounted) {
      gsap.to(el, {
        opacity: 0,
        scale: !rm && kind === 'panel' ? 0.98 : 1,
        y: !rm && kind === 'rise' ? 8 : 0,
        duration: dur.fast,
        ease: 'ip.exit',
        onComplete: () => setMounted(false),
      });
    }
  }, [show, mounted, kind]);

  if (!mounted) return null;
  return (
    <div ref={ref} className={className} style={{ opacity: 0, ...style }}>
      {show ? children : last.current}
    </div>
  );
}

/** Letter-stagger reveal for display titles. */
export function LetterReveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const chars = ref.current.querySelectorAll('.ch');
    if (reduced()) {
      gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1, duration: dur.fast });
      return;
    }
    const tw = gsap.fromTo(
      chars,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: dur.moderate, ease: 'ip.enter', stagger: ST.chars },
    );
    return () => { tw.kill(); };
  }, [text]);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {Array.from(text).map((c, i) => (
        <span key={i} className="ch" aria-hidden style={{ display: 'inline-block', whiteSpace: 'pre' }}>
          {c}
        </span>
      ))}
    </span>
  );
}

/**
 * Odometer: per-character roll with 30ms stagger when the value changes.
 * Digits roll through a vertical 0-9 strip; separators crossfade. Reduced motion → crossfade.
 */
export function Odometer({ value, className, placeholder = '—' }: { value: string | null; className?: string; placeholder?: string }) {
  const text = value ?? placeholder;
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string>(text);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const old = prev.current;
    prev.current = text;
    const rm = reduced();
    const cells = el.querySelectorAll<HTMLElement>('.odo-cell');
    if (rm) {
      if (old !== text) gsap.fromTo(el, { opacity: 0.2 }, { opacity: 1, duration: dur.moderate });
      cells.forEach((c) => {
        const strip = c.querySelector<HTMLElement>('.odo-strip');
        if (strip) gsap.set(strip, { y: 0, yPercent: -Number(c.dataset.d) * 10 });
      });
      return;
    }
    cells.forEach((c, i) => {
      const strip = c.querySelector<HTMLElement>('.odo-strip');
      if (!strip) return;
      const d = Number(c.dataset.d);
      const oldCh = old[i];
      const from = oldCh && /\d/.test(oldCh) ? Number(oldCh) : 0;
      if (old === text) {
        gsap.set(strip, { y: 0, yPercent: -d * 10 });
        return;
      }
      gsap.fromTo(strip, { y: 0, yPercent: -from * 10 }, { y: 0, yPercent: -d * 10, duration: dur.slow + 0.1, ease: 'ip.standard', delay: i * 0.03 });
    });
  }, [text]);

  return (
    <span ref={ref} className={`odo ${className ?? ''}`} aria-label={text}>
      {Array.from(text).map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="odo-cell" data-d={ch} aria-hidden>
            <span className="odo-strip">
              {'0123456789'.split('').map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="odo-sep" aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
