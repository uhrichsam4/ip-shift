import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from '../motion/eases';
import { Presence, reduced } from '../motion';
import { dur } from '../design/tokens';
import { useAppStore } from '../state/store';
import { useUI } from '../state/ui';
import { requestSwitch, startSwitch, switchBlockedReason, STAGE_TITLES } from '../state/actions';
import { IconBolt, IconChevron, IconLock, IconWifi } from '../design/icons';
import type { StageId } from '../bridge/protocol';
import { Btn } from './primitives';
import { OS } from '../state/os';

const ORDER: StageId[] = ['initialise', 'wifi', 'dhcp', 'reconnect', 'results'];

export function SwitchButton() {
  const op = useAppStore((s) => s.operation);
  const resultsOpen = useAppStore((s) => s.resultsOpen);
  useAppStore((s) => [s.snapshot?.wifi?.powerOn, s.snapshot?.wifi?.associated, !!s.snapshot?.wifi, !!s.snapshot].join()); // narrow: only what the blocked reason needs
  const signal = useAppStore((s) => s.signal);
  const confirmOpen = useUI((s) => s.confirmOpen);
  const btn = useRef<HTMLButtonElement>(null);
    const sweep = useRef<HTMLSpanElement>(null);
  const ripple = useRef<HTMLSpanElement>(null);

  const running = op.running;
  const blocked = switchBlockedReason();
  const disabled = !!blocked && !running;

  const activeIdx = (() => {
    let idx = -1;
    ORDER.forEach((s, i) => {
      if (op.stages[s] !== 'pending') idx = i;
    });
    return idx;
  })();
  const activeStage = activeIdx >= 0 ? ORDER[activeIdx] : null;
  const lastMsg = op.events[op.events.length - 1]?.message;
  const total = 4; // initialise, wifi, dhcp, reconnect — results is the outcome
  const stepNum = Math.min(total, Math.max(1, activeIdx + 1));
  const tint = resultsOpen && op.result ? op.result.outcome : null;

  // Ring rotation and breathing glow are CSS (compositor) animations. On hover we smoothly tween the ring
  // animation's playbackRate (12 s → 4 s per turn) so its angle never snaps.
  const orbit = useRef<HTMLDivElement>(null);
  const rate = useRef({ v: 1 });
  const setRingSpeed = (to: number) => {
    const anim = orbit.current?.getAnimations?.()[0];
    if (!anim) return;
    gsap.to(rate.current, {
      v: to,
      duration: dur.slow,
      ease: 'ip.standard',
      overwrite: true,
      onUpdate: () => anim.updatePlaybackRate(rate.current.v),
    });
  };

  const onEnter = () => {
    if (disabled || running) return;
    signal({ buttonHover: true });
    setRingSpeed(3);
    if (!reduced() && sweep.current) gsap.fromTo(sweep.current, { xPercent: -120 }, { xPercent: 220, duration: 0.7, ease: 'ip.standard' });
  };
  const onLeave = () => {
    signal({ buttonHover: false });
    setRingSpeed(1);
  };
  const onDown = () => {
    if (disabled || running || !btn.current) return;
    gsap.to(btn.current, { y: 2, scale: 0.975, duration: 0.09, ease: 'ip.press' });
  };
  const onUp = () => {
    if (!btn.current) return;
    gsap.to(btn.current, { y: 0, scale: 1, duration: dur.fast, ease: 'ip.spring' });
  };
  const onClick = () => {
    if (disabled || running) return;
    signal({ pressAt: performance.now() });
    if (ripple.current && !reduced()) {
      const rings = ripple.current.querySelectorAll('span');
      gsap.fromTo(rings, { scale: 0.6, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: dur.deliberate, ease: 'ip.enter', stagger: 0.12 });
    }
    requestSwitch();
  };

  // Running morph is transform-only: the background layer scales on X (CSS transition) and the content crossfades.
  const wrap = useRef<HTMLDivElement>(null);

  const ringR = 66;
  const circ = 2 * Math.PI * ringR;
  const progress = running ? stepNum / total : 0;

  return (
    <div className="switch-zone" ref={wrap}>
      <ConfirmSheet open={confirmOpen} />
      <div className={`switch-wrap ${running ? 'running' : ''} ${disabled ? 'disabled' : ''} ${tint ? `tint-${tint}` : ''}`}>
        <span className="switch-ripple" ref={ripple} aria-hidden>
          <span />
          <span />
        </span>
        <svg className="switch-ring" viewBox="-240 -80 480 160" aria-hidden preserveAspectRatio="none">
          <defs>
            <linearGradient id="ringg" x1="-240" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#35D6FF" stopOpacity="0" />
              <stop offset=".3" stopColor="#35D6FF" />
              <stop offset=".7" stopColor="#2F6BFF" />
              <stop offset="1" stopColor="#9A73FF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="-236" y="-60" width="472" height="120" rx="60" fill="none" stroke="var(--line-2)" strokeWidth="1" />
          <rect
            x="-236"
            y="-60"
            width="472"
            height="120"
            rx="60"
            fill="none"
            stroke="url(#ringg)"
            strokeWidth="1.5"
            strokeDasharray="2 7"
            className="ring-dash"
          />
          {running && (
            <rect
              x="-236"
              y="-60"
              width="472"
              height="120"
              rx="60"
              fill="none"
              stroke="var(--live)"
              strokeWidth="2"
              pathLength={1}
              strokeDasharray={`${progress} 1`}
              className="ring-meter"
            />
          )}
        </svg>
        <div className="switch-orbit" aria-hidden ref={orbit}>
          <svg viewBox="-80 -80 160 160" width="100%" height="100%">
            <circle r={ringR} fill="none" stroke="url(#ringg)" strokeWidth="1.2" strokeDasharray={`${circ * 0.18} ${circ * 0.07}`} />
          </svg>
        </div>
        <span className="switch-glow" aria-hidden />
        <button
          ref={btn}
          className="switch-btn"
          onPointerEnter={onEnter}
          onPointerLeave={() => {
            onLeave();
            onUp();
          }}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onClick={onClick}
          aria-disabled={disabled || running}
          aria-busy={running}
          title={disabled ? blocked ?? undefined : running ? 'A switch is running' : (useAppStore.getState().platform === 'windows' ? 'Switch IP (Ctrl+Enter)' : 'Switch IP (⌘⏎)')}
          aria-label={running ? `Switching: step ${stepNum} of ${total}, ${activeStage ? STAGE_TITLES[activeStage] : 'starting'}` : disabled ? `Switch IP unavailable: ${blocked}` : 'Switch IP'}
        >
          <span className="switch-bg" aria-hidden>
            <span className="switch-body" />
            <span className="switch-sweep" ref={sweep} />
            <span className="switch-bar" />
          </span>
          <span className="switch-progress" aria-hidden={!running}>
              <span className="switch-step mono">
                {stepNum}/{total}
              </span>
              <span className="switch-stage">
                <span className="t-title-s">{activeStage ? STAGE_TITLES[activeStage] : 'Starting'}</span>
                <span className="t-caption switch-msg">{lastMsg ?? 'Preparing…'}</span>
              </span>
              {running && <span className="switch-spinner" aria-hidden />}
          </span>
          <span className="switch-label" aria-hidden={running}>
            <IconBolt size={30} className="switch-bolt" strokeWidth={1.8} />
            <span className="t-button-xl">SWITCH IP</span>
          </span>
        </button>
      </div>
      <p className="switch-caption t-body">
        {disabled ? (
          <span style={{ color: 'var(--warning)' }}>{blocked}</span>
        ) : running ? (
          <span>Working with your router — this takes a few seconds</span>
        ) : (
          <>
            Request a fresh local IP from your router <IconChevron size={14} />
          </>
        )}
      </p>
    </div>
  );
}

function ConfirmSheet({ open }: { open: boolean }) {
  const mode = useAppStore((s) => s.settings.mode);
  const snap = useAppStore((s) => s.snapshot);
  const ssid = snap?.wifi?.ssid;
  const iface = snap?.wifi?.interfaceName ?? 'Wi-Fi';
  const close = () => useUI.getState().set({ confirmOpen: false });
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open]);
  return (
    <Presence show={open} kind="panel" className="confirm-anchor">
      <div className="confirm glass-1" role="dialog" aria-modal="false" aria-labelledby="confirm-title">
        <h2 id="confirm-title" className="t-title">
          {mode === 'renew' ? 'Renew your DHCP lease?' : 'Reconnect Wi-Fi and renew?'}
        </h2>
        <ol className="confirm-steps t-body">
          <li>
            <IconLock size={16} />
            <span>{OS === 'Windows' ? 'Windows may ask for administrator permission (UAC) to renew the lease.' : 'macOS will ask for your administrator password to change network settings.'}</span>
          </li>
          {mode === 'reconnect' && (
            <li>
              <IconWifi size={16} />
              <span>
                Wi-Fi on <span className="mono">{iface}</span> turns off and back on — you'll be offline for a few seconds.
              </span>
            </li>
          )}
          <li>
            <IconBolt size={16} />
            <span>
              IP SHIFT asks your router{ssid ? ` on “${ssid}”` : ''} for a fresh lease. It may hand back the same address — many routers reserve one per device.
            </span>
          </li>
          <li>
            <IconChevron size={16} />
            <span>Your public IP is assigned by your internet provider and won't change.</span>
          </li>
        </ol>
        <div className="confirm-actions">
          <Btn variant="ghost" onClick={close}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={() => startSwitch()} autoFocus>
            <IconBolt size={16} /> Switch IP
          </Btn>
        </div>
      </div>
    </Presence>
  );
}
