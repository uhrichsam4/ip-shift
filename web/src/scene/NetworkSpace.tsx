import { countRender } from './shared';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '../state/store';
import { Asset, MODELS, meshesOf, useModel } from './assets';
import { COLORS, LAYOUT, rig, damp } from './shared';
import { LinkStream, Particles, makeSCurve } from './Holo';
import { fresnelMaterial, glassNodeMaterial, streamMaterial } from './shaders';

const st = () => useAppStore.getState();
const MAC = LAYOUT.netMac;
const ROUTER = LAYOUT.netRouter;
const netLink = { link: 'up' };
const netState = () => {
  const l = st().sceneSignals.link;
  netLink.link = l === 'unknown' ? 'up' : l;
  return netLink;
};
export const NET_LINK = makeSCurve(MAC, ROUTER, 0.35, 0.25);

/** Satellite nodes + pathways (three tiers lit progressively during reconnect). */
const SATS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 2.4 + (i % 3) * 1.1;
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(i * 1.7) * 0.9 + (i % 2) * 0.4, Math.sin(a) * r * 0.7 - 1.2));
  }
  return out;
})();

function nodeGeometry(scene: THREE.Object3D | null) {
  const node = scene?.getObjectByName('Holo_Node');
  const mesh = meshesOf(node)[0];
  if (mesh) {
    const g = mesh.geometry.clone();
    g.computeBoundingSphere();
    const s = 0.12 / (g.boundingSphere?.radius || 0.12);
    g.scale(s, s, s);
    return g;
  }
  return new THREE.IcosahedronGeometry(0.12, 2);
}

function Nodes({ scene }: { scene: THREE.Object3D | null }) {
  const b = useMemo(() => {
    const geo = nodeGeometry(scene);
    // fresnel-rim glass (instance colour = core); no fog/desaturation: distant nodes dim via alpha only
    const mat = glassNodeMaterial(COLORS.blue, COLORS.cyan);
    const inst = new THREE.InstancedMesh(geo, mat, SATS.length);
    const m = new THREE.Matrix4();
    SATS.forEach((p, i) => {
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3().setScalar(0.18 + (i % 3) * 0.08));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, (i % 4 === 0 ? COLORS.violet : COLORS.blue).clone());
    });
    const big = glassNodeMaterial(COLORS.cyan, COLORS.cyanHot);
    const halo = fresnelMaterial(COLORS.cyan, { power: 3.2, gain: 0.45 });
    const haloGeo = new THREE.SphereGeometry(0.13, 32, 16);
    return { geo, inst, mat, big, halo, haloGeo };
  }, [scene]);
  useFrame(() => {
    if (!rig.inNetwork) return;
    // reconnect tiers light the satellites up; unlit ones stay coloured, just fainter
    b.mat.uniforms.uGain.value = 0.55 + 0.15 * Math.min(3, rig.pathLevel);
  });
  return (
    <>
      <primitive object={b.inst} />
      {[MAC, ROUTER].map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={b.geo} material={b.big} scale={i === 0 ? 0.42 : 0.5} />
          <mesh geometry={b.haloGeo} material={b.halo} />
        </group>
      ))}
    </>
  );
}

function Pathways() {
  const b = useMemo(() => {
    const tiers: { geo: THREE.TubeGeometry; mat: THREE.ShaderMaterial; tier: number }[] = [];
    SATS.forEach((p, i) => {
      const from = i % 2 === 0 ? ROUTER : MAC;
      const mid = from.clone().lerp(p, 0.5).add(new THREE.Vector3(0, 0.6, 0));
      const c = new THREE.QuadraticBezierCurve3(from.clone(), mid, p.clone());
      const mat = streamMaterial(0.6);
      tiers.push({ geo: new THREE.TubeGeometry(c, 48, 0.01, 5, false), mat, tier: i % 3 });
    });
    return tiers;
  }, []);
  const lv = useRef([0.15, 0.15, 0.15]);
  useFrame((state, dt) => {
    if (!rig.inNetwork) return;
    const t = state.clock.elapsedTime;
    b.forEach((p) => {
      const lit = rig.pathLevel > p.tier ? 1 : 0.12;
      lv.current[p.tier] = damp(lv.current[p.tier], lit, 2.5, dt);
      p.mat.uniforms.uTime.value = t * 0.8 + p.tier;
      p.mat.uniforms.uGain.value = lv.current[p.tier] * 0.9;
      p.mat.uniforms.uAmber.value = rig.pathAmber ? 1 : 0;
    });
  });
  return (
    <>
      {b.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} frustumCulled={false} />
      ))}
    </>
  );
}

/** Request (cyan, Mac→router) / reply (violet-white, router→Mac) packets + ACK with ripple. */
function Packets() {
  const N = 14;
  const b = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.016, 10, 6);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const inst = new THREE.InstancedMesh(geo, mat, N);
    inst.frustumCulled = false;
    for (let i = 0; i < N; i++) inst.setColorAt(i, (i % 2 === 0 ? COLORS.cyan.clone() : new THREE.Color('#C9B8FF')).multiplyScalar(3));
    const ack = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#35D6FF').multiplyScalar(3.5), toneMapped: false }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.23, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.cyan.clone().multiplyScalar(3), toneMapped: false, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    return { inst, ack, ring };
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const lastAck = useRef(0);
  const ackT = useRef(-1);
  const vis = useRef(0);
  useFrame((state, dt) => {
    if (!rig.inNetwork) return;
    const t = state.clock.elapsedTime;
    const s = st();
    vis.current = damp(vis.current, rig.packets, 4, dt);
    const sc = vis.current;
    for (let i = 0; i < N; i++) {
      const req = i % 2 === 0;
      const u = ((t * 0.32 + i / N) % 1);
      NET_LINK.getPointAt(req ? u : 1 - u, p);
      p.y += Math.sin(u * Math.PI) * (req ? 0.06 : -0.06);
      m.makeScale(sc, sc, sc).setPosition(p);
      b.inst.setMatrixAt(i, m);
    }
    b.inst.instanceMatrix.needsUpdate = true;
    // ACK: one bright packet router → Mac when leaseAckAt changes; ripple on landing.
    const ackAt = s.sceneSignals.leaseAckAt;
    if (ackAt && ackAt !== lastAck.current) {
      lastAck.current = ackAt;
      ackT.current = 0;
    }
    if (ackT.current >= 0) {
      ackT.current += dt;
      const k = Math.min(1, ackT.current / 0.9);
      const e = 1 - Math.pow(1 - k, 3);
      NET_LINK.getPointAt(1 - e, p);
      b.ack.position.copy(p);
      b.ack.visible = k < 1;
      const r = Math.max(0, ackT.current - 0.9);
      b.ring.visible = r > 0 && r < 1.2;
      b.ring.position.copy(MAC);
      b.ring.scale.setScalar(1 + r * 4);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r / 1.2);
      if (r > 0 && r < 0.05) rig.flash = Math.max(rig.flash, 0.5);
      if (r >= 1.2) ackT.current = -1;
    } else {
      b.ack.visible = false;
      b.ring.visible = false;
    }
  });
  return (
    <>
      <primitive object={b.inst} />
      <primitive object={b.ack} />
      <primitive object={b.ring} />
    </>
  );
}

function SpaceContent({ scene }: { scene: THREE.Object3D | null }) {
  return (
    <>
      <Nodes scene={scene} />
      <Pathways />
      <LinkStream curve={NET_LINK} radius={0.014} sparks={60} gain={0.75} getState={netState} active={() => rig.inNetwork} />
      <Packets />
      <Particles center={[0, -1.5, 3]} spread={[14, 6, 14]} scale={0.8} />
    </>
  );
}

function SpaceWithKit() {
  const { scene } = useModel(MODELS.holo);
  return <SpaceContent scene={scene} />;
}

export function NetworkSpace() {
  countRender();
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.visible = rig.inNetwork;
  });
  return (
    <group ref={g} position={LAYOUT.net} visible={false}>
      <Asset id="holo-net" fallback={<SpaceContent scene={null} />}>
        <SpaceWithKit />
      </Asset>
    </group>
  );
}
