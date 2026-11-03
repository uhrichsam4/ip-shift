import { countRender, devRenders } from './shared';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { useAppStore, type QualityTier } from '../state/store';
import { AssetBoundary, HDR } from './assets';
import { CameraRig } from './CameraRig';
import { Devices, Pedestals } from './Devices';
import { Effects, TONE, needsComposer } from './Effects';
import { useShallow } from 'zustand/react/shallow';
import { resolveDpr } from '../state/graphics';
import { EnergyStream, Floor, Globe, LightCones, Particles, Ribbons, SceneClock, WifiSymbol } from './Holo';
import { NetworkSpace } from './NetworkSpace';
import { COLORS, DPR, LAYOUT, rig, damp } from './shared';
import { useDevSceneDriver } from './devDriver';

RectAreaLightUniformsLib.init();

const TIERS: QualityTier[] = ['low', 'balanced', 'high', 'ultra'];

function FallbackEnv() {
  return (
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={2.2} color="#DCE6FF" position={[0, 4, 1]} rotation-x={Math.PI / 2} scale={[4, 2, 1]} />
      <Lightformer form="rect" intensity={3} color="#35D6FF" position={[-4, 1, -1]} rotation-y={Math.PI / 2} scale={[0.4, 4, 1]} />
      <Lightformer form="rect" intensity={3} color="#2F6BFF" position={[4, 1, -2]} rotation-y={-Math.PI / 2} scale={[0.4, 4, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#7A4DFF" position={[0, 1, -5]} scale={[6, 1, 1]} />
    </Environment>
  );
}

function Lights() {
  const key = useRef<THREE.RectAreaLight>(null);
  const rim = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    const d = rig.dim * (1 + rig.flash * 0.6);
    if (key.current) key.current.intensity = 5.5 * d * (1 - rig.isolate * 0.35);
    // rim kept moderate: at grazing angles it glared across the router's glossy top
    if (rim.current) rim.current.intensity = 7 * d * (1 + rig.isolate * 0.6);
    if (fill.current) fill.current.intensity = 0.6 * d;
    scene.environmentIntensity = 0.9 * d;
  });
  useEffect(() => {
    if (rim.current) {
      rim.current.target.position.set(LAYOUT.router.x, 0.15, LAYOUT.router.z);
      rim.current.target.updateMatrixWorld();
    }
  }, []);
  return (
    <>
      <rectAreaLight ref={key} color={COLORS.key} width={1.6} height={1.0} position={[-1.3, 1.9, 1.6]} onUpdate={(l) => l.lookAt(0, 0.15, 0)} />
      <spotLight ref={rim} color={COLORS.blue} position={[0.9, 0.9, -1.4]} angle={0.7} penumbra={1} distance={5} decay={2} />
      <spotLight color={COLORS.blue} intensity={8} position={[-1.0, 0.8, -1.2]} angle={0.7} penumbra={1} distance={4} decay={2} onUpdate={(l) => { l.target.position.set(LAYOUT.laptop.x, 0.15, LAYOUT.laptop.z); l.target.updateMatrixWorld(); }} />
      <pointLight ref={fill} color={COLORS.violetDeep} position={[-2.2, 0.6, 0.6]} distance={5} decay={2} />
    </>
  );
}

function SceneFog() {
  const density = useAppStore((s) => (s.graphics.volumetrics === 'high' ? 0.075 : 0.06));
  return (
    <>
      <color attach="background" args={['#03050A']} />
      <fogExp2 attach="fog" args={['#03050A', density]} />
    </>
  );
}

/** Hero group: hidden while the camera is in the network space (draw-call budget). */
function Hero() {
  countRender();
  const g = useRef<THREE.Group>(null);
  const [top, setTop] = useState(rig.pedestalTop);
  const onTop = useCallback((y: number) => setTop(y), []);
  const shadows = useAppStore((s) => s.graphics.shadows);
  const assets = useAppStore((s) => s.assetsReady);
  useFrame(() => {
    if (g.current) g.current.visible = !rig.inNetwork;
  });
  const res = shadows === 'low' ? 256 : shadows === 'medium' ? 512 : 1024;
  return (
    <group ref={g}>
      <Floor />
      <Pedestals onTop={onTop} />
      <Devices top={top} />
      <EnergyStream top={top} />
      <LightCones top={top} />
      <WifiSymbol top={top} />
      <Globe />
      <Ribbons />
      <Particles />
      {shadows !== 'off' && assets ? (
        // rendered once after the devices load (re-keyed when the pedestal height or resolution changes)
        <ContactShadows key={`${top}-${res}`} position={[0, 0.002, 0]} scale={[8, 8]} far={0.8} blur={shadows === 'low' ? 3 : 2.4} opacity={0.7} resolution={res} frames={1} color="#000000" />
      ) : null}
    </group>
  );
}

function Quality() {
  const auto = useAppStore((s) => s.settings.quality === 'auto');
  const cap = useAppStore((s) => s.graphics.frameRateCap);
  // Only trust timings measured while the window is visible and focused: macOS throttles
  // requestAnimationFrame for occluded/background windows, which is not a GPU problem.
  const measurable = () => document.visibilityState === 'visible' && document.hasFocus();
  const step = (dir: 1 | -1) => {
    if (useAppStore.getState().settings.quality !== 'auto' || !measurable()) return;
    const q = useAppStore.getState().quality;
    const next = TIERS[Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(q) + dir))];
    if (next !== q) useAppStore.getState().set({ quality: next });
  };
  if (!auto) return null;
  // Bounds are relative to the active frame cap (a 30 fps cap must not read as "slow").
  const bounds = (refresh: number): [number, number] => {
    const target = cap > 0 ? Math.min(cap, refresh) : refresh;
    return [target * 0.8, target * 0.97];
  };
  return <PerformanceMonitor key={cap} bounds={bounds} onIncline={() => step(1)} onDecline={() => step(-1)} flipflops={3} onFallback={() => measurable() && useAppStore.getState().set({ quality: 'balanced' })} />;
}

/** frameRateCap: rAF-driven invalidate throttled to the cap (frameloop 'demand'). Also measures fps. */
function FrameCap({ cap }: { cap: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    // capped: frameloop 'demand'; request frames at the cap rate. (Driving R3F via advance() here
    // rendered with a broken viewport under the composer, so we only invalidate.)
    if (!cap) return;
    let raf = 0;
    let last = 0;
    const interval = 1000 / cap;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= interval - 1.5) {
        last = t - ((t - last) % interval);
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cap, invalidate]);
  const acc = useRef({ frames: 0, since: performance.now() });
  useFrame(() => {
    const a = acc.current;
    a.frames++;
    const now = performance.now();
    if (now - a.since >= 500) {
      const fps = Math.round((a.frames * 1000) / (now - a.since));
      a.frames = 0;
      a.since = now;
      if (Math.abs(fps - useAppStore.getState().fps) >= 1) useAppStore.getState().set({ fps });
    }
  });
  return null;
}

/** Renderer tone mapping when the composer is off; anisotropy on every GLB texture. */
function RendererSettings() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const tone = useAppStore((s) => s.graphics.toneMapping);
  const aniso = useAppStore((s) => s.graphics.textureFiltering);
  const assets = useAppStore((s) => s.assetsReady);
  useEffect(() => {
    gl.toneMapping = TONE[tone].gl;
  }, [gl, tone]);
  useEffect(() => {
    const max = Math.min(aniso, gl.capabilities.getMaxAnisotropy());
    const t = window.setTimeout(() => {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!m || !(o as THREE.Mesh).isMesh) return;
        for (const tex of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap]) {
          if (tex && tex.anisotropy !== max && !tex.userData.keepAnisotropy) {
            tex.anisotropy = max;
            tex.needsUpdate = true;
          }
        }
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [gl, scene, aniso, assets]);
  return null;
}

function DevStats() {
  const gl = useThree((s) => s.gl);
  const devScene = useThree((s) => s.scene);
  // Dev-only handle for automated rendering checks (stripped from production builds).
  if (import.meta.env.DEV) (window as unknown as { __ipshiftScene: THREE.Scene }).__ipshiftScene = devScene;
  // dev: count every pass of a frame (composer resets info per pass otherwise)
  useFrame(() => {
    if (import.meta.env.DEV) gl.info.reset();
  }, -1000);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    gl.info.autoReset = false;
    const id = window.setInterval(() => {
      const i = gl.info.render;
      const msg = `[scene] calls ${i.calls} · tris ${i.triangles} · fps ${useAppStore.getState().fps} · renders/s ${devRenders.n} · q ${useAppStore.getState().quality}`;
      devRenders.n = 0;
      console.debug(msg);
      const el = document.getElementById('scene-dev-stats');
      if (el) el.textContent = msg;
    }, 1000);
    return () => window.clearInterval(id);
  }, [gl]);
  return null;
}

export function Stage() {
  countRender();
  useDevSceneDriver();
  const g = useAppStore(
    useShallow((s) => ({
      renderScale: s.graphics.renderScale,
      cap: s.graphics.frameRateCap,
      tone: s.graphics.toneMapping,
      volumetrics: s.graphics.volumetrics,
      // renderer MSAA only when the composer is fully off (needs a canvas remount)
      glAA: false, // MSAA always goes through the composer, so the canvas/WebGL context is never recreated
    })),
  );
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const fade = useRef<HTMLDivElement>(null);
  const ready = useAppStore((s) => s.assetsReady);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    // Reveal only once the core GLBs are on screen; this long timeout is only for genuine failures.
    const id = window.setTimeout(() => setTimedOut(true), 20000);
    return () => window.clearTimeout(id);
  }, []);
  const assetsReady = ready || timedOut;
  const frameloop = hidden ? 'never' : g.cap ? 'demand' : 'always';
  const dpr = resolveDpr({ ...useAppStore.getState().graphics, renderScale: g.renderScale });
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#03050A' }}>
      <Canvas
        frameloop={frameloop}
        dpr={dpr}
        camera={{ fov: 30, near: 0.05, far: 80, position: [0, 0.8, 2.7] }}
        gl={{ antialias: g.glAA, toneMapping: TONE[g.tone].gl, toneMappingExposure: 1, powerPreference: 'high-performance', alpha: false }}
        shadows={false}
        style={{ position: 'absolute', inset: 0 }}
      >
        <SceneFog />
        <SceneClock />
        <Quality />
        <FrameCap cap={hidden ? 0 : g.cap} />
        <RendererSettings />
        <DevStats />
        <AssetBoundary id="env">
          <Suspense fallback={null}>
            <Environment files={HDR} background={false} environmentIntensity={0.9} />
          </Suspense>
        </AssetBoundary>
        <Lights />
        <CameraRig />
        <Hero />
        <NetworkSpace />
        <Effects />
      </Canvas>
      <div
        ref={fade}
        style={{ position: 'absolute', inset: 0, background: '#03050A', pointerEvents: 'none', opacity: assetsReady ? 0 : 1, transition: 'opacity 1200ms cubic-bezier(.05,.7,.1,1)' }}
      />
    </div>
  );
}

export { damp };
