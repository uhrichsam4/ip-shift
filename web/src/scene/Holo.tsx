import { countRender } from './shared';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../state/store';
import { Asset, Emissive, MODELS, meshesOf, useModel } from './assets';
import { COLORS, DEVICE_SCALE, LAYOUT, rig, damp, fxLayer } from './shared';
import { PARTICLE_COUNTS } from '../state/graphics';
import { MeshReflectorMaterial } from '@react-three/drei';
import { coneMaterial, atmosphereMaterial, earthDotsMaterial, floorMaterial, floorGridMaterial, fresnelMaterial, globeDotsMaterial, globeGridMaterial, particleMaterial, ribbonMaterial, streamMaterial } from './shaders';

const st = () => useAppStore.getState();
type Uni = THREE.ShaderMaterial;
const tick = (mats: Uni[], t: number, gain: number) => {
  for (const m of mats) {
    if (m.uniforms.uTime) m.uniforms.uTime.value = t;
    if (m.uniforms.uGain) m.uniforms.uGain.value = gain;
  }
};

/** Scene time that freezes/slows under reduced motion. */
const clock = { t: 0, slow: 0 };
export function SceneClock() {
  useFrame((_, dt) => {
    const rm = st().reducedMotion;
    clock.t += rm ? 0 : dt;
    clock.slow += dt * (rm ? 0.1 : 1);
  });
  return null;
}

/* ===================================================================== globe */
function GlobeModel() {
  const { scene } = useModel(MODELS.globe);
  const b = useMemo(() => {
    const root = scene.clone(true);
    const dots = earthDotsMaterial();
    const grid = fresnelMaterial(COLORS.blue, { power: 2.6, gain: 0.18 });
    const arcs = streamMaterial(0.4);
    const atmo = atmosphereMaterial();
    for (const m of meshesOf(root.getObjectByName('Globe_Dots'))) m.material = dots;
    for (const m of meshesOf(root.getObjectByName('Globe_Grid'))) m.material = grid;
    for (const m of meshesOf(root.getObjectByName('Globe_Arcs'))) m.material = arcs;
    const atmoNode = root.getObjectByName('Globe_Atmosphere');
    for (const m of meshesOf(atmoNode)) m.material = atmo;
    root.traverse((o) => {
      if ((o as THREE.Points).isPoints) (o as THREE.Points).material = globeDotsMaterial(true);
    });
    // size from the dots/grid only (the atmosphere shell is slightly larger)
    const box = new THREE.Box3();
    for (const n of ['Globe_Dots', 'Globe_Grid']) {
      const o = root.getObjectByName(n);
      if (o) box.expandByObject(o);
    }
    if (box.isEmpty()) box.setFromObject(root);
    const size = box.getSize(new THREE.Vector3()).x;
    const s = size > 0 ? 1.5 / size : 1;
    const c = box.getCenter(new THREE.Vector3());
    root.position.copy(c).multiplyScalar(-s);
    return { root, mats: [dots, grid, arcs, atmo], s, hasAtmo: !!atmoNode };
  }, [scene]);
  return (
    <GlobeShell mats={b.mats} atmo={!b.hasAtmo}>
      <primitive object={b.root} scale={b.s} />
    </GlobeShell>
  );
}

function GlobeFallback() {
  const b = useMemo(() => {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(g * i) * r * 0.75, y * 0.75, Math.sin(g * i) * r * 0.75], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dots = globeDotsMaterial(true);
    const grid = globeGridMaterial();
    const gridGeo = new THREE.SphereGeometry(0.735, 24, 12);
    return { geo, dots, grid, gridGeo };
  }, []);
  return (
    <GlobeShell mats={[b.dots, b.grid]}>
      <points geometry={b.geo} material={b.dots} />
      <mesh geometry={b.gridGeo} material={b.grid} />
    </GlobeShell>
  );
}

const ATMO_GEO = new THREE.SphereGeometry(0.8, 48, 24);
function GlobeShell({ mats, children, atmo = true }: { mats: Uni[]; children: React.ReactNode; atmo?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const atmoMat = useMemo(() => atmosphereMaterial(), []);
  const acc = useRef(0);
  useFrame((_, dt) => {
    // the globe is slow and far: update at ~30 Hz
    acc.current += dt;
    if (acc.current < 1 / 30) return;
    const step = acc.current;
    acc.current = 0;
    if (ref.current) ref.current.rotation.y += (st().reducedMotion ? 0.1 : 1) * step * 0.035;
    const gain = 0.5 * rig.dim * (1 - rig.isolate * 0.7);
    tick(mats, clock.slow, gain);
    atmoMat.uniforms.uGain.value = gain;
  });
  return (
    <group position={LAYOUT.globe}>
      <group ref={(o) => { ref.current = o; fxLayer(o); }} rotation={[0.35, 0, 0.18]}>
        {children}
      </group>
      {atmo ? <mesh geometry={ATMO_GEO} material={atmoMat} layers={1} renderOrder={-1} /> : null}
    </group>
  );
}

export function Globe() {
  return (
    <Asset id="globe" fallback={<GlobeFallback />}>
      <GlobeModel />
    </Asset>
  );
}

/* =================================================================== ribbons */
function RibbonsModel() {
  const { scene } = useModel(MODELS.ribbons);
  const layers = useAppStore((s) => (s.graphics.volumetrics === 'off' ? 1 : 3));
  const b = useMemo(() => {
    const root = scene.clone(true);
    const mats: Uni[] = [];
    for (let i = 1; i <= 5; i++) {
      const node = root.getObjectByName(`Ribbon_${i}`);
      if (!node) continue;
      const m = ribbonMaterial(false);
      m.uniforms.uSeed.value = i * 1.37;
      for (const mesh of meshesOf(node)) mesh.material = m;
      mats.push(m);
      node.userData.ribbonIndex = i;
    }
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    if (c.z > -4) root.position.z = -6.5 - c.z;
    return { root, mats };
  }, [scene]);
  useMemo(() => {
    b.root.traverse((o) => {
      if (o.userData.ribbonIndex) o.visible = o.userData.ribbonIndex <= layers;
    });
  }, [b, layers]);
  useFrame(() => tick(b.mats, clock.slow, 0.8 * rig.dim * (1 - rig.isolate * 0.6)));
  return <primitive object={b.root} ref={fxLayer} />;
}

function RibbonsFallback() {
  const layers = useAppStore((s) => (s.graphics.volumetrics === 'off' ? 1 : 3));
  const b = useMemo(() => {
    const geo = new THREE.PlaneGeometry(12, 0.45, 120, 3);
    const mats = [0, 1, 2, 3].map((i) => {
      const m = ribbonMaterial(true);
      m.uniforms.uSeed.value = i * 1.37;
      return m;
    });
    return { geo, mats };
  }, []);
  useFrame(() => tick(b.mats, clock.slow, 0.8 * rig.dim * (1 - rig.isolate * 0.6)));
  return (
    <group position={[0, 1.2, -6.5]} ref={fxLayer}>
      {b.mats.slice(0, layers).map((m, i) => (
        <mesh key={i} geometry={b.geo} material={m} position={[0, i * 0.35 - 0.4, -i * 0.6]} rotation={[0, 0, (i - 1.5) * 0.06]} />
      ))}
    </group>
  );
}

export function Ribbons() {
  return (
    <Asset id="ribbons" fallback={<RibbonsFallback />}>
      <RibbonsModel />
    </Asset>
  );
}

/* ================================================================= particles */
export function Particles({ center = [0, 0, 0] as [number, number, number], spread = [12, 4.5, 10] as [number, number, number], scale = 1 }) {
  countRender();
  const count = useAppStore((s) => PARTICLE_COUNTS[s.graphics.particles]);
  const b = useMemo(() => {
    const n = Math.round(count * scale);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread[0];
      pos[i * 3 + 1] = Math.random() * 0.3 - 0.3;
      pos[i * 3 + 2] = -Math.random() * spread[2] + 2;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return { geo, mat: particleMaterial() };
  }, [count, scale, spread[0], spread[2]]);
  useFrame(() => tick([b.mat], clock.t, rig.dim * (1 - rig.isolate * 0.5)));
  return <points geometry={b.geo} material={b.mat} position={center} frustumCulled={false} layers={1} />;
}

/* ============================================================ energy stream */
export function makeSCurve(a: THREE.Vector3, b: THREE.Vector3, lift = 0.12, sway = 0.12) {
  const mid = a.clone().lerp(b, 0.5);
  return new THREE.CatmullRomCurve3([
    a.clone(),
    a.clone().lerp(b, 0.25).add(new THREE.Vector3(0, lift * 0.9, sway)),
    mid.clone().add(new THREE.Vector3(0, lift * 1.3, 0)),
    a.clone().lerp(b, 0.75).add(new THREE.Vector3(0, lift * 0.9, -sway)),
    b.clone(),
  ], false, 'catmullrom', 0.5);
}

/** Link visuals: tube + core + sparks, driven by a link-state getter. */
export function LinkStream({ curve, radius = 0.006, sparks = 36, gain = 1, getState, active }: { curve: THREE.Curve<THREE.Vector3>; radius?: number; sparks?: number; gain?: number; getState: () => { link: string; amber?: boolean; gain?: number }; active?: () => boolean }) {
  const b = useMemo(() => {
    const tube = new THREE.TubeGeometry(curve, 160, radius, 10, false);
    const core = new THREE.TubeGeometry(curve, 160, radius * 0.32, 6, false);
    const outer = streamMaterial(1);
    const inner = streamMaterial(0.3);
    inner.uniforms.cA.value = COLORS.cyanHot;
    inner.uniforms.cB.value = COLORS.white;
    inner.uniforms.cC.value = COLORS.cyanHot;
    const sp = new Float32Array(sparks * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const sm = new THREE.PointsMaterial({ color: COLORS.cyanHot.clone().multiplyScalar(2), size: radius * 1.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const seeds = Array.from({ length: sparks }, () => Math.random());
    return { tube, core, outer, inner, sg, sm, seeds };
  }, [curve, radius, sparks]);
  const up = useRef(1);
  const neg = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    if (active && !active()) return;
    const s = getState();
    up.current = damp(up.current, s.link === 'down' ? 0 : 1, 3, dt);
    neg.current = damp(neg.current, s.link === 'negotiating' ? 1 : 0, 6, dt);
    const g = gain * (s.gain ?? 1);
    for (const m of [b.outer, b.inner]) {
      m.uniforms.uTime.value = clock.slow;
      m.uniforms.uUp.value = up.current;
      m.uniforms.uNeg.value = neg.current;
      m.uniforms.uGain.value = g;
      m.uniforms.uAmber.value = s.amber ? 1 : 0;
    }
    const arr = b.sg.attributes.position.array as Float32Array;
    const t = clock.t;
    for (let i = 0; i < b.seeds.length; i++) {
      const sd = b.seeds[i];
      const u = (sd + t * (0.18 + sd * 0.2)) % 1;
      curve.getPointAt(u, tmp);
      const j = Math.sin(t * 9 + sd * 50) * radius * 3;
      arr[i * 3] = tmp.x + j;
      arr[i * 3 + 1] = tmp.y + Math.cos(t * 7 + sd * 40) * radius * 3;
      arr[i * 3 + 2] = tmp.z;
    }
    b.sg.attributes.position.needsUpdate = true;
    b.sm.opacity = up.current * (1 - neg.current * 0.6) * Math.min(1, g);
  });
  return (
    <group ref={fxLayer}>
      <mesh geometry={b.tube} material={b.outer} frustumCulled={false} />
      <mesh geometry={b.core} material={b.inner} frustumCulled={false} />
      <points geometry={b.sg} material={b.sm} frustumCulled={false} />
    </group>
  );
}

const heroLink = { link: 'up', gain: 1 };
const heroState = () => {
  const l = st().sceneSignals.link;
  heroLink.link = l === 'unknown' ? 'up' : l;
  heroLink.gain = rig.dim * (1 - rig.isolate * 0.75);
  return heroLink;
};
export function EnergyStream({ top }: { top: number }) {
  const curve = useMemo(
    () =>
      makeSCurve(
        new THREE.Vector3(LAYOUT.laptop.x + 0.08 * DEVICE_SCALE, top + 0.1 * DEVICE_SCALE, LAYOUT.laptop.z - 0.02),
        new THREE.Vector3(LAYOUT.router.x - 0.1 * DEVICE_SCALE, top + 0.05 * DEVICE_SCALE, LAYOUT.router.z),
        0.16,
        0.1,
      ),
    [top],
  );
  // hidden until the devices it connects are on screen
  const ready = useAppStore((s) => s.assetsReady);
  return ready ? <LinkStream curve={curve} getState={heroState} active={() => !rig.inNetwork} /> : null;
}

/* ================================================================== cones */
export function LightCones({ top }: { top: number }) {
  const vol = useAppStore((s) => s.graphics.volumetrics);
  const ready = useAppStore((s) => s.assetsReady);
  return vol === 'off' || !ready ? null : <Cones top={top} high={vol === 'high'} />;
}

function Cones({ top, high }: { top: number; high: boolean }) {
  const b = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.12, 0.27, 0.7, 40, 1, true);
    const mats = [coneMaterial(COLORS.blue), coneMaterial(COLORS.blue)];
    return { geo, mats };
  }, []);
  const hover = useRef(1);
  useFrame((_, dt) => {
    hover.current = damp(hover.current, st().sceneSignals.buttonHover ? 1.2 : 1, 8, dt);
    b.mats.forEach((m, i) => {
      const iso = i === 1 ? 1 + rig.isolate * 0.5 : 1 - rig.isolate * 0.75;
      m.uniforms.uGain.value = (high ? 1 : 0.75) * rig.dim * iso * hover.current * (1 + rig.ringPulse * 0.6);
    });
  });
  return (
    <>
      <mesh geometry={b.geo} material={b.mats[0]} position={[LAYOUT.laptop.x, top + 0.35, LAYOUT.laptop.z]} layers={1} />
      <mesh geometry={b.geo} material={b.mats[1]} position={[LAYOUT.router.x, top + 0.35, LAYOUT.router.z]} layers={1} />
    </>
  );
}

/* ================================================================== floor */
const FLOOR = new THREE.Color('#04060B');
export function Floor() {
  const grid = useMemo(() => floorGridMaterial(), []);
  const floor = useMemo(() => floorMaterial(), []);
  const reflections = useAppStore((s) => s.graphics.reflections);
  useFrame(() => {
    grid.uniforms.uGain.value = rig.dim;
    floor.uniforms.uGain.value = rig.dim;
    floor.uniforms.uGlow.value = rig.ringGlow;
  });
  return (
    <group>
      {reflections === 'off' ? (
        // Distinct keys: without them React reuses one <mesh> across branches, and dropping the
        // `material` prop resets it to three's default white MeshBasicMaterial (bright white floor).
        <mesh key="floor-unlit" rotation-x={-Math.PI / 2} material={floor}>
          <circleGeometry args={[14, 48]} />
        </mesh>
      ) : (
        <mesh key="floor-reflector" rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[12, 64]} />
          <MeshReflectorMaterial
            key={reflections}
            resolution={reflections === 'low' ? 256 : 512}
            blur={reflections === 'low' ? [200, 80] : [300, 100]}
            mixBlur={1}
            mixStrength={reflections === 'low' ? 1.4 : 2.2}
            mixContrast={1.15}
            roughness={0.6}
            depthScale={0.8}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.1}
            color="#010205"
            metalness={0.85}
            envMapIntensity={0.12}
            mirror={0.1}
          />
        </mesh>
      )}
      {reflections !== 'off' ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.001} material={grid} layers={1}>
          <planeGeometry args={[6, 6]} />
        </mesh>
      ) : null}
    </group>
  );
}

/* ============================================================== Wi-Fi holo */
function WifiSymbolModel({ top }: { top: number }) {
  const { scene } = useModel(MODELS.holo);
  const b = useMemo(() => {
    const src = scene.getObjectByName('Holo_WiFi');
    const root = src ? src.clone(true) : new THREE.Group();
    root.position.set(0, 0, 0);
    const em = new Emissive(COLORS.cyan, { transparent: true });
    em.material.blending = THREE.AdditiveBlending;
    em.material.depthWrite = false;
    em.apply(root);
    const arcs = [1, 2, 3].map((i) => root.getObjectByName(`Holo_WiFi_Arc${i}`));
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = size.x > 0 ? 0.22 / size.x : 1;
    return { root, em, arcs, s };
  }, [scene]);
  const g = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const k = rig.symbol;
    if (!g.current) return;
    g.current.visible = k > 0.01;
    g.current.position.set(LAYOUT.router.x, top + 0.14 + k * 0.32, LAYOUT.router.z);
    // always face the camera (three arcs + dot, never edge-on); only yaw so it stays upright
    g.current.rotation.set(0, Math.atan2(camera.position.x - g.current.position.x, camera.position.z - g.current.position.z) + Math.sin(clock.t * 0.6) * 0.12, 0);
    const t = clock.slow;
    b.em.set(3.5 * k * (0.8 + 0.2 * Math.sin(t * 4)));
    b.arcs.forEach((a, i) => {
      if (a) a.scale.setScalar(0.9 + 0.1 * Math.max(0, Math.sin(t * 3 - i * 0.8)));
    });
  });
  return (
    <group ref={(o) => { g.current = o; fxLayer(o); }} visible={false}>
      <primitive object={b.root} scale={b.s} />
    </group>
  );
}

export function WifiSymbol({ top }: { top: number }) {
  return (
    <Asset id="holo-wifi">
      <WifiSymbolModel top={top} />
    </Asset>
  );
}
