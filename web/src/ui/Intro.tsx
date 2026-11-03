import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from '../motion/eases';
import { reduced } from '../motion';
import { useAppStore } from '../state/store';
import { useUI } from '../state/ui';
import { LogoMark } from '../design/icons';

/** First-load intro: logo stroke draw + hairline progress until assetsReady (or 6 s), then fade into the app. */
export function Intro() {
  const introDone = useUI((s) => s.introDone);
  const assetsReady = useAppStore((s) => s.assetsReady);
  const [gone, setGone] = useState(introDone);
  const [slow, setSlow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useLayoutEffect(() => {
    if (!ref.current || introDone) return;
    const paths = ref.current.querySelectorAll('path');
    if (reduced()) {
      gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 0 });
    } else {
      gsap.fromTo(paths, { strokeDasharray: 1, strokeDashoffset: 1, fillOpacity: 0 }, { strokeDashoffset: 0, fillOpacity: 1, duration: 0.9, ease: 'ip.standard', stagger: 0.12 });
      gsap.fromTo(ref.current.querySelector('.intro-word'), { opacity: 0, letterSpacing: '0.4em' }, { opacity: 1, letterSpacing: '0.16em', duration: 0.9, delay: 0.3, ease: 'ip.enter' });
    }
    if (bar.current) gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 0.85, duration: 5.5, ease: 'power2.out' });
    const a = setTimeout(() => setMinElapsed(true), 1300);
    const b = setTimeout(() => setSlow(true), 6000);
    const c = setTimeout(() => setTimedOut(true), 6000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
    };
  }, [introDone]);

  useEffect(() => {
    if (introDone) {
      if (ref.current && !gone) gsap.to(ref.current, { opacity: 0, duration: 0.64, ease: 'ip.exit', onComplete: () => setGone(true) });
      return;
    }
    if (minElapsed && (assetsReady || timedOut)) {
      if (bar.current) gsap.to(bar.current, { scaleX: 1, duration: 0.3, ease: 'ip.standard' });
      setTimeout(() => useUI.getState().set({ introDone: true }), 300);
    }
  }, [minElapsed, assetsReady, timedOut, introDone, gone]);

  if (gone) return null;
  return (
    <div className="intro" ref={ref} aria-label="Loading IP SHIFT" role="status">
      <div className="intro-center">
        <LogoMark size={72} id="intro" />
        <span className="intro-word">IP SHIFT</span>
        <span className="intro-track">
          <span className="intro-bar" ref={bar} />
        </span>
        <span className="t-caption intro-slow" style={{ opacity: slow ? 1 : 0 }}>
          Preparing 3D scene…
        </span>
      </div>
    </div>
  );
}
