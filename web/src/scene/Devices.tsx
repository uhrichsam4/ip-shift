import { countRender } from './shared';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { useAppStore } from '../state/store';
import type { NetworkSnapshot } from '../bridge/protocol';
import { Asset, Emissive, MODELS, collectLit, meshesOf, overrideByMaterialName, useModel } from './assets';
import { COLORS, DEVICE_SCALE, LAYOUT, rig, damp } from './shared';
import { OS } from '../state/os';

const st = () => useAppStore.getState();

/* ================================================================ pedestal */
function PedestalModel({ position, phase, onTop }: { position: THREE.Vector3; phase: number; onTop?: (y: number) => void }) {
  const { scene } = useModel(MODELS.pedestal);
  const built = useMemo(() => {
    const root = scene.clone(true);
    const blue = new Emissive(COLORS.blue);
    const cyan = new Emissive(COLORS.cyan);
    overrideByMaterialName(root, 'E_RingBlue', blue);
    overrideByMaterialName(root, 'E_RingCyan', cyan);
    const lit = collectLit(root);
    root.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
    const box = new THREE.Box3().setFromObject(root);
    return {
      root,
      blue,
      cyan,
      lit,
      top: box.max.y,
      inner: root.getObjectByName('Pedestal_RingInner'),
      outer: root.getObjectByName('Pedestal_RingOuter'),
      segments: root.getObjectByName('Pedestal_Segments'),
    };
  }, [scene]);
  useEffect(() => {
    rig.pedestalTop = built.top;
    onTop?.(built.top);
  }, [built, onTop]);

  const hover = useRef(1);
  useFrame((state, dt) => {
    const s = st();
    const t = state.clock.elapsedTime;
    const rm = s.reducedMotion;
    hover.current = damp(hover.current, s.sceneSignals.buttonHover ? 1.2 : 1, 8, dt);
    const spin = rm ? 0 : dt;
    if (built.inner) built.inner.rotation.y += spin * 0.12;
    if (built.outer) built.outer.rotation.y -= spin * 0.07;
    if (built.segments) built.segments.rotation.y += spin * 0.04;
    const isoK = phase === 1 ? 1 : 1 - rig.isolate * 0.75;
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.1 + phase * 1.7);
    const k = pulse * hover.current * (1 + rig.ringPulse * 1.6) * rig.dim * isoK;
    if (phase === 0) rig.ringGlow = k;
    // restrained: the products, not the rings, are the brightest things in frame
    built.blue.set(1.4 * k);
    built.cyan.set(1.1 * k);
    built.lit(rig.dim * isoK);
  });
  return <primitive object={built.root} position={position} />;
}

export function Pedestals({ onTop }: { onTop?: (y: number) => void }) {
  return (
    <Asset id="pedestal">
      <PedestalModel position={LAYOUT.laptop} phase={0} onTop={onTop} />
      <PedestalModel position={LAYOUT.router} phase={1} />
    </Asset>
  );
}

/* ================================================================== router */
function internetColor(s: NetworkSnapshot | null): [THREE.Color, number] {
  switch (s?.connectivity.internet) {
    case 'online':
      return [COLORS.green, 1.2];
    case 'offline':
      return [COLORS.red, 1.2];
    case 'captive':
      return [COLORS.amber, 1.2];
    case 'checking':
      return [COLORS.cyan, 1];
    default:
      return [COLORS.white, 0.35];
  }
}

function RouterModel() {
  countRender();
  const { scene } = useModel(MODELS.router);
  const b = useMemo(() => {
    const root = scene.clone(true);
    const leds = {
      power: new Emissive(COLORS.white).apply(root.getObjectByName('LED_Power')),
      internet: new Emissive(COLORS.green).apply(root.getObjectByName('LED_Internet')),
      wifi: new Emissive(COLORS.cyan).apply(root.getObjectByName('LED_WiFi')),
      lan: new Emissive(COLORS.blue).apply(root.getObjectByName('LED_LAN')),
      bar: new Emissive(COLORS.blue).apply(root.getObjectByName('Router_LightBar')),
      core: new Emissive(COLORS.blue, { transparent: true }).apply(root.getObjectByName('Router_CoreGlow')),
    };
    leds.core.material.blending = THREE.AdditiveBlending;
    leds.core.material.depthWrite = false;
    const lit = collectLit(root);
    const antennas = [1, 2, 3, 4]
      .map((i) => root.getObjectByName(`Antenna_${i}`))
      .filter((a): a is THREE.Object3D => !!a)
      .map((a) => ({ a, rest: a.rotation.clone() }));
    return { root, leds, lit, antennas };
  }, [scene]);

  const ramp = useRef(0);
  useFrame((state, dt) => {
    const s = st();
    const t = state.clock.elapsedTime;
    const dim = rig.dim;
    // LEDs ramp up from dim during the initialise stage (rig.activity drives it), else steady.
    ramp.current = damp(ramp.current, 1, 2, dt);
    const r = ramp.current * dim;
    b.leds.power.set(0.9 * r);
    const [ic, ii] = internetColor(s.snapshot);
    b.leds.internet.set(ii * r * (s.snapshot?.connectivity.internet === 'checking' ? 0.6 + 0.4 * Math.sin(t * 8) : 1), ic);
    const assoc = s.snapshot?.wifi?.associated ?? false;
    const link = s.sceneSignals.link;
    const wifiK = link === 'negotiating' ? (Math.sin(t * 14) > 0 ? 1 : 0.15) : assoc ? 1 : 0.12;
    b.leds.wifi.set(1.2 * wifiK * r);
    // LAN flickers while packets flow (stream up / dhcp packets).
    const flowing = link === 'up' || rig.packets > 0;
    const flick = flowing ? (Math.sin(t * 31) * Math.sin(t * 17.3) > 0.1 ? 1 : 0.25) : 0.3;
    b.leds.lan.set(1.2 * flick * r);
    const breathe = 0.65 + 0.35 * Math.sin(t * (Math.PI * 2) / 5);
    // idle ≤ 1.2 (no white blow-out on the top); initialise surges may go higher briefly
    b.leds.bar.set((0.75 + 0.35 * breathe + rig.surge * 2.4 + rig.activity * 0.6) * dim);
    b.leds.core.set((0.12 + rig.activity * 0.9 + rig.flash * 0.5) * dim);
    b.lit(dim);
    for (const [i, { a, rest }] of b.antennas.entries()) {
      const k = rig.antenna;
      a.rotation.x = rest.x - k * 0.32 * (i % 2 === 0 ? 1 : -1);
      a.rotation.y = rest.y + k * (i < 2 ? 0.25 : -0.25);
    }
  });
  return <primitive object={b.root} />;
}

/* ================================================================== laptop */
function drawScreen(ctx: CanvasRenderingContext2D, s: NetworkSnapshot | null, mode: string) {
  const W = 1024;
  const H = 640;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#070D22');
  g.addColorStop(1, '#03050A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // soft glow
  const rg = ctx.createRadialGradient(W * 0.5, H * 0.62, 10, W * 0.5, H * 0.62, W * 0.5);
  rg.addColorStop(0, 'rgba(47,107,255,0.28)');
  rg.addColorStop(1, 'rgba(47,107,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  // mark (hexagon) + wordmark
  ctx.save();
  ctx.translate(70, 70);
  ctx.strokeStyle = '#7BE6FF';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * 26, Math.sin(a) * 26);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#F3F6FC';
  ctx.font = '700 34px "Unbounded Variable", system-ui, sans-serif';
  ctx.fillText('IP SHIFT', 112, 82);
  ctx.fillStyle = '#76829C';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText('LOCAL IP', 60, 190);
  ctx.fillStyle = '#F3F6FC';
  ctx.font = '400 84px ui-monospace, Menlo, monospace';
  ctx.fillText(s?.ipv4.address ?? '—', 56, 290);
  ctx.fillStyle = '#76829C';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText('WI-FI NETWORK', 60, 380);
  ctx.fillStyle = '#A6B1C8';
  ctx.font = '500 36px system-ui, sans-serif';
  const ssid = s?.wifi?.ssid ?? (s?.wifi?.associated ? `Hidden by ${OS}` : 'Not connected');
  ctx.fillText(ssid, 60, 428);
  const internet = s?.connectivity.internet ?? 'unknown';
  const dot = internet === 'online' ? '#2FD98B' : internet === 'offline' ? '#FF4D6D' : internet === 'captive' ? '#FFB547' : '#4A546B';
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(72, 518, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F3F6FC';
  ctx.font = '500 32px system-ui, sans-serif';
  const label = mode !== 'idle' && mode !== 'results' ? 'Switching…' : internet === 'online' ? 'Online' : internet === 'offline' ? 'Offline' : internet === 'captive' ? 'Captive portal' : 'Checking';
  ctx.fillText(label, 96, 530);
  // pill
  ctx.strokeStyle = 'rgba(90,150,255,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(W - 340, H - 130, 280, 72, 36);
  ctx.stroke();
  ctx.fillStyle = '#C2F5FF';
  ctx.font = '700 28px "Unbounded Variable", system-ui, sans-serif';
  ctx.fillText('SWITCH IP', W - 290, H - 82);
}

function LaptopModel() {
  countRender();
  const { scene } = useModel(MODELS.laptop);
  const gl = useThree((s) => s.gl);
  const snapshot = useAppStore((s) => s.snapshot);
  const mode = useAppStore((s) => s.sceneMode);
  // redraw only when the displayed strings change
  const screenKey = [snapshot?.ipv4.address, snapshot?.wifi?.ssid, snapshot?.wifi?.associated, snapshot?.connectivity.internet, mode === 'idle' || mode === 'results'].join('|');
  const b = useMemo(() => {
    const root = scene.clone(true);
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; // glTF UV convention
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.userData.keepAnisotropy = true; // RendererSettings must not lower it
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    for (const m of meshesOf(root.getObjectByName('Laptop_Screen'))) m.material = mat;
    const lit = collectLit(root);
    return { root, canvas, tex, mat, lit };
  }, [scene, gl]);
  useEffect(() => {
    const ctx = b.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawScreen(ctx, snapshot, mode);
    b.tex.needsUpdate = true;
  }, [b, screenKey]);
  useFrame(() => {
    const k = rig.dim * (1 - rig.isolate * 0.75);
    b.mat.color.setScalar(1.25 * k);
    b.lit(k);
  });
  return <primitive object={b.root} />;
}

/* ================================================================== labels */
const glass3: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  background: 'rgba(10,22,58,.78)',
  border: '1px solid rgba(90,150,255,.45)',
  boxShadow: '0 0 24px rgba(47,107,255,.25)',
  backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)',
  borderRadius: 12,
  padding: '8px 12px',
  color: '#F3F6FC',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none',
  transition: 'opacity 450ms cubic-bezier(.2,0,0,1)',
  willChange: 'transform',
  opacity: 0,
  zIndex: 1,
};

/** Label projected by hand: transform written only when it moves ≥0.5 px; no backdrop-filter. */
function Label({ title, children, position }: { title: string; children: React.ReactNode; position: [number, number, number] }) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useThree((s) => s.gl.domElement.parentElement);
  const v = useMemo(() => new THREE.Vector3(), []);
  const last = useRef({ x: -1e4, y: -1e4, vis: '' });
  useFrame(({ camera, size }) => {
    const el = ref.current;
    if (!el) return;
    const s = st();
    const vis = s.assetsReady && s.sceneMode === 'idle' && !rig.inNetwork && s.page === 'dashboard' && rig.isolate < 0.5 ? '1' : '0';
    if (vis !== last.current.vis) {
      el.style.opacity = vis;
      last.current.vis = vis;
    }
    if (vis === '0') return;
    v.set(position[0], position[1], position[2]).project(camera);
    const x = (v.x * 0.5 + 0.5) * size.width;
    const y = (-v.y * 0.5 + 0.5) * size.height;
    if (Math.abs(x - last.current.x) >= 0.5 || Math.abs(y - last.current.y) >= 0.5) {
      last.current.x = x;
      last.current.y = y;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });
  // never null the ref from a deferred unmount of an old root (StrictMode double effects)
  const setEl = useMemo(() => (e: HTMLDivElement | null) => { if (e) ref.current = e; }, []);
  // R3F's reconciler cannot host DOM portals: mount a tiny react-dom root next to the canvas.
  const root = useRef<{ el: HTMLDivElement; r: Root } | null>(null);
  useEffect(() => {
    if (!host) return;
    const el = document.createElement('div');
    host.appendChild(el);
    const r = createRoot(el);
    root.current = { el, r };
    return () => {
      root.current = null;
      setTimeout(() => r.unmount());
      el.remove();
    };
  }, [host]);
  useEffect(() => {
    root.current?.r.render(
      <div ref={setEl} style={glass3} aria-hidden>
        <div style={{ font: '500 11px/14px system-ui', letterSpacing: '0.04em', color: '#A6B1C8' }}>{title}</div>
        <div style={{ font: '500 15px/20px ui-monospace, Menlo, monospace', fontVariantNumeric: 'tabular-nums slashed-zero', display: 'flex', alignItems: 'center', gap: 6 }}>
          {children}
        </div>
      </div>,
    );
    last.current.x = -1e4;
    last.current.vis = '';
  });
  return null;
}

function Labels() {
  countRender();
  const ip = useAppStore((s) => s.snapshot?.ipv4.address ?? null);
  const assoc = useAppStore((s) => s.snapshot?.wifi?.associated ?? null);
  const top = rig.pedestalTop;
  return (
    <>
      <Label title="Your Mac" position={[LAYOUT.laptop.x - 0.05, top + 0.36 * DEVICE_SCALE, LAYOUT.laptop.z]}>
        {ip ?? '—'}
      </Label>
      <Label title="Wi-Fi Router" position={[LAYOUT.router.x + 0.05, top + 0.3 * DEVICE_SCALE, LAYOUT.router.z]}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 99,
            background: assoc ? '#2FD98B' : assoc === false ? '#FF4D6D' : '#4A546B',
            boxShadow: assoc ? '0 0 8px #2FD98B' : 'none',
          }}
        />
        <span style={{ fontFamily: 'system-ui' }}>{assoc ? 'Connected' : assoc === false ? 'Disconnected' : '—'}</span>
      </Label>
    </>
  );
}

/* ============================================================ device group */
function Bob({ children, position, rotationY, period, phase }: { children: React.ReactNode; position: THREE.Vector3; rotationY: number; period: number; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const rm = st().reducedMotion;
    const t = state.clock.elapsedTime;
    ref.current.position.set(position.x, rig.pedestalTop + (rm ? 0 : Math.sin((t / period) * Math.PI * 2 + phase) * 0.006), position.z);
  });
  return (
    <group ref={ref} rotation-y={rotationY} scale={DEVICE_SCALE}>
      {children}
    </group>
  );
}

export function Devices({ top }: { top: number }) {
  countRender();
  return (
    <>
      <Bob position={LAYOUT.laptop} rotationY={0.42} period={6.2} phase={0}>
        <Asset id="laptop">
          <LaptopModel />
        </Asset>
      </Bob>
      <Bob position={LAYOUT.router} rotationY={-0.32} period={5.4} phase={1.3}>
        <Asset id="router">
          <RouterModel />
        </Asset>
      </Bob>
      <group key={top}>
        <Labels />
      </group>
    </>
  );
}
