import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../state/store';

export const MODELS = {
  router: './assets/models/router.glb',
  laptop: './assets/models/laptop.glb',
  pedestal: './assets/models/pedestal.glb',
  holo: './assets/models/holo_kit.glb',
  globe: './assets/models/globe.glb',
  ribbons: './assets/models/ribbons.glb',
} as const;
export const DRACO = './draco/';
export const HDR = './assets/env/studio.hdr';

/* ---------------------------------------------- core asset readiness tracking */
const CORE = ['router', 'laptop', 'pedestal'] as const;
const settled = new Set<string>();
export function markSettled(key: string) {
  settled.add(key);
  if (CORE.every((k) => settled.has(k)) && !useAppStore.getState().assetsReady) {
    useAppStore.getState().set({ assetsReady: true });
  }
}

/** Calls markSettled once mounted (i.e. once the Suspense above it resolved). */
export function Settle({ id }: { id: string }) {
  useEffect(() => markSettled(id), [id]);
  return null;
}

/* ---------------------------------------------------- per-asset error boundary */
interface BoundaryProps {
  id: string;
  fallback?: ReactNode;
  children: ReactNode;
}
export class AssetBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn(`[scene] asset "${this.props.id}" unavailable`, err);
    markSettled(this.props.id);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

/** Suspense + error boundary wrapper; a missing asset never crashes the stage. */
export function Asset({ id, fallback, children }: BoundaryProps) {
  return (
    <AssetBoundary id={id} fallback={fallback}>
      <Suspense fallback={null}>
        {children}
        <Settle id={id} />
      </Suspense>
    </AssetBoundary>
  );
}

export function useModel(url: string) {
  return useGLTF(url, DRACO);
}

/** Collect every mesh under `root` (a node may be a Group of primitives). */
export function meshesOf(root: THREE.Object3D | undefined | null): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root?.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/** Emissive override: a toneMapped=false basic material whose colour we animate (base × intensity). */
export class Emissive {
  material: THREE.MeshBasicMaterial;
  base = new THREE.Color();
  constructor(color: THREE.Color | string, opts: { transparent?: boolean } = {}) {
    this.base.set(color);
    this.material = new THREE.MeshBasicMaterial({
      color: this.base.clone(),
      toneMapped: false,
      transparent: opts.transparent ?? false,
    });
  }
  set(intensity: number, color?: THREE.Color) {
    this.material.color.copy(color ?? this.base).multiplyScalar(intensity);
  }
  apply(root: THREE.Object3D | undefined | null) {
    for (const m of meshesOf(root)) m.material = this.material;
    return this;
  }
}

/** Replace every E_* material found under root by name, cloning per instance. */
export function overrideByMaterialName(root: THREE.Object3D, name: string, em: Emissive) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.some((m) => m?.name === name)) mesh.material = em.material;
  });
}

/** Multiply all standard materials under root by a brightness factor (for isolate/dim). */
export function collectLit(root: THREE.Object3D) {
  const list: { m: THREE.MeshStandardMaterial; color: THREE.Color; env: number }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m, i) => {
      const s = m as THREE.MeshStandardMaterial;
      if (!s?.isMeshStandardMaterial) return;
      let c: THREE.MeshStandardMaterial = s.clone();
      const n = s.name;
      if (/Glass/.test(n)) {
        const p = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(p, s);
        p.clearcoat = 1;
        p.clearcoatRoughness = 0.05;
        c = p;
      }
      if (/Alu/.test(n)) {
        // brushed aluminium: keep GLB physical params, add mild anisotropy if the asset has none
        const p = s instanceof THREE.MeshPhysicalMaterial ? (s.clone() as THREE.MeshPhysicalMaterial) : new THREE.MeshPhysicalMaterial();
        if (!(s instanceof THREE.MeshPhysicalMaterial)) THREE.MeshStandardMaterial.prototype.copy.call(p, s);
        if (!p.anisotropy) p.anisotropy = 0.35;
        c = p;
      }
      const env = /Alu|Metal/.test(n) ? 1.2 : /Glass/.test(n) ? 1.4 : 1;
      if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[i] = c;
      else mesh.material = c;
      mesh.castShadow = true;
      list.push({ m: c, color: c.color.clone(), env });
    });
  });
  return (k: number) => {
    for (const e of list) {
      e.m.color.copy(e.color).multiplyScalar(k);
      e.m.envMapIntensity = e.env * k;
    }
  };
}

