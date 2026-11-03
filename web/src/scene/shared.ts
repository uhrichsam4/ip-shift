/**
 * Scene-internal shared mutable state ("rig"). Written by the director / camera rig, read every frame
 * by the scene objects. Never stored in React state: it changes every frame.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import type { QualityTier } from '../state/store';

gsap.registerPlugin(CustomEase);
// Same names/curves as DESIGN.md §10 (re-registering is harmless if the UI already did).
CustomEase.create('ip.standard', '0.2,0,0,1');
CustomEase.create('ip.enter', '0.05,0.7,0.1,1');
CustomEase.create('ip.exit', '0.3,0,0.8,0.15');
CustomEase.create('ip.camera', '0.65,0,0.35,1');
CustomEase.create('ip.warpIn', '0.7,0,0.84,0');

export const COLORS = {
  void: new THREE.Color('#03050A'),
  blue: new THREE.Color('#2F6BFF'),
  cyan: new THREE.Color('#35D6FF'),
  cyanHot: new THREE.Color('#C2F5FF'),
  violet: new THREE.Color('#9A73FF'),
  violetDeep: new THREE.Color('#7A4DFF'),
  white: new THREE.Color('#EAF2FF'),
  green: new THREE.Color('#2FD98B'),
  amber: new THREE.Color('#FFB547'),
  red: new THREE.Color('#FF4D6D'),
  key: new THREE.Color('#DCE6FF'),
};

export const LAYOUT = {
  laptop: new THREE.Vector3(-0.49, 0, 0.05),
  router: new THREE.Vector3(0.49, 0, -0.1),
  globe: new THREE.Vector3(0, 0.85, -4.3),
  net: new THREE.Vector3(0, 0, -40),
  /** Network-space node positions, relative to LAYOUT.net. */
  netMac: new THREE.Vector3(-1.2, 0, 0),
  netRouter: new THREE.Vector3(1.0, 0, 0),
};

/** Device models are drawn slightly larger than modelled so they read as the hero (pedestal Ø0.56 still fits). */
export const DEVICE_SCALE = 1.2;
/** Pedestal radius (pedestal.glb). */
export const PEDESTAL_R = 0.28;

export const rig = {
  /** Height of the pedestal top surface (measured from pedestal.glb once loaded). */
  pedestalTop: 0,
  /** Pedestal ring brightness (for the floor bounce term). */
  ringGlow: 1,
  /** 0..1 — global scene brightness multiplier (1 = full, 0.4 off-dashboard). */
  dim: 1,
  /** 0..1 — router isolation (others dim to 25%). */
  isolate: 0,
  /** Wi-Fi hologram rise 0..1. */
  symbol: 0,
  /** Router activity 0..1 (core glow, light bar). */
  activity: 0,
  /** Light bar surge 0..1. */
  surge: 0,
  /** Antenna raise 0..1. */
  antenna: 0,
  /** Flash 0..1 (press / warp threshold). Decays. */
  flash: 0,
  /** Pedestal ring pulse 0..1. Decays. */
  ringPulse: 0,
  /** Chromatic aberration amount 0..1 (warps only). */
  ca: 0,
  /** Camera currently in the network space. */
  inNetwork: false,
  /** Reconnect pathway progress 0..3 and amber flag. */
  pathLevel: 0,
  pathAmber: false,
  /** Camera DOF focus point. */
  focus: new THREE.Vector3(0, 0.16, 0),
  /** Whether DOF should be on in Balanced (sequence running). */
  sequence: false,
  /** Network-space packets visible. */
  packets: 0,
  /** Camera dhcp track progress for packets (unused visuals hook). */
  ackAt: 0,
};

/** Layer for additive FX: seen by the main camera, ignored by ContactShadows. */
export const FX_LAYER = 1;
export function fxLayer(o: THREE.Object3D | null) {
  o?.traverse((c) => c.layers.set(FX_LAYER));
}

/** DEV: React render counter (renders per second shown in the dev stats line). */
export const devRenders = { n: 0 };
export function countRender() {
  if (import.meta.env.DEV) devRenders.n++;
}

export const PARTICLES: Record<QualityTier, number> = { low: 600, balanced: 2500, high: 6000, ultra: 12000 };
export const DPR: Record<QualityTier, [number, number]> = {
  low: [1, 1],
  balanced: [1, 1.5],
  high: [1, 2],
  ultra: [2, 2],
};

export function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}
