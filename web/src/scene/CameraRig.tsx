import { countRender } from './shared';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import { useAppStore, type SceneMode } from '../state/store';
import { LAYOUT, PEDESTAL_R, rig, damp } from './shared';

const st = () => useAppStore.getState();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NET = LAYOUT.net;
const NET_MID = NET.clone().add(LAYOUT.netMac.clone().lerp(LAYOUT.netRouter, 0.5)).add(V(0, 0.2, 0));

const HERO = { p: V(0, 0.46, 1.75), t: V(0, 0.15, 0), fov: 34 };
const SYMBOL = { p: V(LAYOUT.router.x + 0.07, 0.55, 0.62), t: V(LAYOUT.router.x, 0.58, LAYOUT.router.z), fov: 28 };
const WIDE = { p: V(0, 0.95, 3.1), t: V(0, 0.2, 0), fov: 34 };
const NET_WIDE = { p: NET_MID.clone().add(V(-0.6, 0.35, 3.2)), t: NET_MID.clone(), fov: 38 };
const NET_RISE = { p: NET_MID.clone().add(V(0, 1.6, 3.4)), t: NET_MID.clone(), fov: 40 };

/** Animated shot state; useFrame composes it with orbit/sway/parallax/user-orbit. */
const shot = { px: 0, py: 0.62 * 1.3, pz: 2.05 * 1.3, tx: 0, ty: 0.16, tz: 0, fov: 30, orbit: 0, orbitA: 0.6 };

export function CameraRig() {
  countRender();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const mode = useAppStore((s) => s.sceneMode);
  const page = useAppStore((s) => s.page);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const prevMode = useRef<SceneMode>('idle');

  /* ------------------------------------------------ user orbit (damped, limited, no pan) */
  const user = useRef({ yaw: 0, pitch: 0, zoom: 1, tYaw: 0, tPitch: 0, tZoom: 1, drag: false, x: 0, y: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const el = gl.domElement;
    const u = user.current;
    const enabled = () => st().sceneMode === 'idle' && st().page === 'dashboard';
    const down = (e: PointerEvent) => {
      if (!enabled()) return;
      u.drag = true;
      u.x = e.clientX;
      u.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!u.drag) return;
      u.tYaw = THREE.MathUtils.clamp(u.tYaw - (e.clientX - u.x) * 0.004, -0.6, 0.6);
      // polar 55–85° around the HERO polar (~73°)
      u.tPitch = THREE.MathUtils.clamp(u.tPitch + (e.clientY - u.y) * 0.003, -0.21, 0.3);
      u.x = e.clientX;
      u.y = e.clientY;
    };
    const up = () => (u.drag = false);
    const wheel = (e: WheelEvent) => {
      if (!enabled()) return;
      const d = HERO.p.distanceTo(HERO.t);
      u.tZoom = THREE.MathUtils.clamp(u.tZoom * (1 + e.deltaY * 0.001), 1.4 / d, 3.5 / d);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  /* ----------------------------------------------------------------- director */
  useEffect(() => {
    const rm = st().reducedMotion;
    const from = prevMode.current;
    prevMode.current = mode;
    tl.current?.kill();
    const t = gsap.timeline();
    tl.current = t;
    const D = (d: number) => (rm ? 0.4 : d);
    const E = (e: string) => (rm ? 'power1.inOut' : e);
    const to = (s: { p: THREE.Vector3; t: THREE.Vector3; fov: number }, d: number, ease = 'ip.camera', at?: number | string) =>
      t.to(shot, { px: s.p.x, py: s.p.y, pz: s.p.z, tx: s.t.x, ty: s.t.y, tz: s.t.z, fov: s.fov, duration: D(d), ease: E(ease) }, at);
    const set = (s: { p: THREE.Vector3; t: THREE.Vector3; fov: number }) =>
      t.set(shot, { px: s.p.x, py: s.p.y, pz: s.p.z, tx: s.t.x, ty: s.t.y, tz: s.t.z, fov: s.fov });
    const R = rig as unknown as Record<string, number>;
    const r = (vars: Record<string, number>, d: number, at?: number | string, ease = 'ip.standard') => t.to(R, { ...vars, duration: D(d), ease: E(ease) }, at);
    const flash = (at: number | string, amt = 1) => t.call(() => (rig.flash = Math.max(rig.flash, amt)), undefined, at);
    rig.sequence = mode !== 'idle';

    switch (mode) {
      case 'idle': {
        rig.inNetwork = false;
        t.to(shot, { orbit: 0, duration: D(1.2) }, 0);
        to(HERO, from === 'idle' ? 2.6 : 1.8, 'ip.camera', 0);
        r({ isolate: 0, symbol: 0, activity: 0, surge: 0, antenna: 0, packets: 0, pathLevel: 0 }, 1.2, 0);
        break;
      }
      case 'initialise': {
        rig.inNetwork = false;
        r({ isolate: 1, activity: 0.6, antenna: 1 }, 1.4, 0);
        r({ surge: 1 }, 0.6, 0);
        r({ surge: 0.25 }, 1.6, 0.6);
        shot.orbitA = Math.atan2(shot.px - LAYOUT.router.x, shot.pz - LAYOUT.router.z);
        t.to(shot, { tx: LAYOUT.router.x, ty: 0.22, tz: LAYOUT.router.z, fov: 28, orbit: 1, duration: D(1.8), ease: E('ip.camera') }, 0);
        r({ symbol: 1 }, 1.6, 1.0, 'ip.enter');
        break;
      }
      case 'wifi': {
        rig.isolate = Math.max(rig.isolate, 1);
        rig.symbol = Math.max(rig.symbol, 1);
        t.to(shot, { orbit: 0, duration: D(0.8), ease: E('ip.camera') }, 0);
        to(SYMBOL, 0.8, 'ip.camera', 0);
        if (rm) {
          t.call(() => (rig.inNetwork = true));
          set(NET_WIDE);
        } else {
          // Warp: push through the symbol, FOV kick, flash + CA at the threshold.
          t.to(shot, { px: SYMBOL.t.x, py: SYMBOL.t.y, pz: SYMBOL.t.z - 0.05, fov: 70, duration: 0.9, ease: 'ip.warpIn' }, '>');
          r({ ca: 1 }, 0.5, '<0.4');
          flash('>-0.05', 1);
          t.call(() => (rig.inNetwork = true));
          t.set(shot, { px: NET_WIDE.p.x * 0.3, py: NET_WIDE.p.y, pz: NET_WIDE.p.z + 6, tx: NET_WIDE.t.x, ty: NET_WIDE.t.y, tz: NET_WIDE.t.z, fov: 70 });
          to(NET_WIDE, 1.2, 'expo.out');
          r({ ca: 0 }, 0.8, '<');
        }
        r({ activity: 0.8, packets: 0 }, 0.6);
        break;
      }
      case 'dhcp': {
        if (!rig.inNetwork) {
          rig.inNetwork = true;
          set(NET_WIDE);
        }
        r({ packets: 1, activity: 1 }, 0.6, 0);
        const a = NET_MID.clone().add(V(-1.2, 0.45, 3.4));
        const b = NET_MID.clone().add(V(1.0, 0.45, 3.4));
        t.to(shot, { px: a.x, py: a.y, pz: a.z, tx: NET_MID.x - 0.6, ty: NET_MID.y, tz: NET_MID.z, fov: 38, duration: D(1.2), ease: E('ip.camera') }, 0);
        // asymptotic truck: never "arrives" ahead of the real lease
        t.to(shot, { px: b.x, tx: NET_MID.x + 0.5, duration: rm ? 0.4 : 24, ease: rm ? 'none' : 'expo.out' }, '>');
        break;
      }
      case 'reconnect': {
        if (!rig.inNetwork) {
          rig.inNetwork = true;
          set(NET_WIDE);
        }
        r({ packets: 0.4 }, 0.6, 0);
        to(NET_RISE, 1.8, 'ip.camera', 0);
        break;
      }
      case 'results': {
        if (rig.inNetwork && !rm) {
          t.to(shot, { fov: 72, duration: 0.6, ease: 'ip.warpIn' }, 0);
          r({ ca: 1 }, 0.4, 0.2);
          flash(0.6, 0.9);
          t.call(() => (rig.inNetwork = false), undefined, 0.6);
          t.set(shot, { px: WIDE.p.x, py: WIDE.p.y + 0.4, pz: WIDE.p.z + 2.5, tx: WIDE.t.x, ty: WIDE.t.y, tz: WIDE.t.z, fov: 60, orbit: 0 }, 0.6);
          to(WIDE, 1.2, 'expo.out', 0.6);
          r({ ca: 0 }, 0.6, 0.7);
        } else {
          t.call(() => (rig.inNetwork = false), undefined, 0);
          t.to(shot, { orbit: 0, duration: D(0.6) }, 0);
          to(WIDE, 1.2, 'ip.camera', 0);
        }
        r({ isolate: 0, symbol: 0, packets: 0, antenna: 0, activity: 0.3, surge: 0 }, 1.2, 0.6);
        to(HERO, 1.8, 'ip.camera', '>');
        break;
      }
    }
    return () => {
      t.kill();
    };
  }, [mode]);

  /* ------------------------------------------------ reconnect pathways from real phases */
  useEffect(
    () =>
      useAppStore.subscribe((s) => {
        const phases = new Set(s.operation.events.map((e) => e.phase));
        let lv = 0;
        if (phases.has('reconnect.ipAssigned')) lv = 1;
        if (phases.has('reconnect.pathSatisfied')) lv = 2;
        if (phases.has('reconnect.internetVerified') || phases.has('reconnect.internetUnavailable')) lv = 3;
        rig.pathLevel = s.sceneMode === 'idle' ? 0 : lv;
        rig.pathAmber = phases.has('reconnect.internetUnavailable');
      }),
    [],
  );

  /* ------------------------------------------------------ press flash + ring pulse */
  const lastPress = useRef(st().sceneSignals.pressAt);

  /* --------------------------------------------------------------- per frame */
  const tmp = useMemo(() => ({ pos: V(0, 0, 0), tgt: V(0, 0, 0), off: V(0, 0, 0), sph: new THREE.Spherical(), par: { x: 0, y: 0 }, pull: 1, dim: 1, shift: 0, panel: 0, measuredAt: -1, orbitP: V(0, 0, 0) }), []);
  useEffect(() => camera.layers.enable(1), [camera]);
  useFrame((state, dt) => {
    const s = st();
    const rm = s.reducedMotion;
    const u = user.current;
    const idle = s.sceneMode === 'idle' && s.page === 'dashboard';
    if (!idle) {
      u.tYaw = 0;
      u.tPitch = 0;
      u.tZoom = 1;
    }
    u.yaw = damp(u.yaw, u.tYaw, 4, dt);
    u.pitch = damp(u.pitch, u.tPitch, 4, dt);
    u.zoom = damp(u.zoom, u.tZoom, 4, dt);

    if (s.sceneSignals.pressAt !== lastPress.current) {
      lastPress.current = s.sceneSignals.pressAt;
      rig.flash = 1;
      rig.ringPulse = 1;
    }
    rig.flash = damp(rig.flash, 0, 3.5, dt);
    rig.ringPulse = damp(rig.ringPulse, 0, 2.2, dt);

    // page recede: pull back + dim to 40%
    const off = s.page !== 'dashboard';
    tmp.pull = damp(tmp.pull, off ? 1.28 : 1, rm ? 10 : 2.2, dt);
    rig.dim = damp(rig.dim, off ? 0.4 : 1, rm ? 10 : 2.2, dt);

    tmp.tgt.set(shot.tx, shot.ty, shot.tz);
    tmp.pos.set(shot.px, shot.py, shot.pz);
    // orbit around router for initialise
    if (shot.orbit > 0.001) {
      if (!rm) shot.orbitA += dt * 0.16;
      const R = 0.95;
      tmp.orbitP.set(LAYOUT.router.x + Math.sin(shot.orbitA) * R, 0.35, LAYOUT.router.z + Math.cos(shot.orbitA) * R);
      tmp.pos.lerp(tmp.orbitP, shot.orbit);
    }
    // user orbit + zoom + page pull, about target
    tmp.off.copy(tmp.pos).sub(tmp.tgt);
    tmp.sph.setFromVector3(tmp.off);
    tmp.sph.theta += u.yaw;
    tmp.sph.phi = THREE.MathUtils.clamp(tmp.sph.phi + u.pitch, 0.2, Math.PI / 2 - 0.05);
    tmp.sph.radius *= u.zoom * tmp.pull;
    tmp.off.setFromSpherical(tmp.sph);
    tmp.pos.copy(tmp.tgt).add(tmp.off);
    // sway (14 s, ±0.05) + parallax (±0.04)
    if (!rm) {
      const t = state.clock.elapsedTime;
      tmp.par.x = damp(tmp.par.x, pointer.current.x, 2, dt);
      tmp.par.y = damp(tmp.par.y, pointer.current.y, 2, dt);
      const w = rig.inNetwork ? 1.6 : 1;
      tmp.pos.x += (Math.sin((t / 14) * Math.PI * 2) * 0.05 + tmp.par.x * 0.04) * w;
      tmp.pos.y += (Math.sin((t / 9) * Math.PI * 2) * 0.015 - tmp.par.y * 0.04) * w;
    }
    // Keep both pedestals (x ±LAYOUT, Ø0.56) inside the FREE area (canvas minus the info panel) with a small margin.
    // Widen the FOV up to a natural 40°, then dolly back instead (a wider FOV would distort and still clip).
    // panel may overlap the far edge slightly on wide windows (like the mockup); on narrow ones never
    const overlap = size.width >= 1150 ? 0.84 : 1;
    const freeW = Math.max(200, size.width - (s.page === 'dashboard' ? tmp.panel * overlap : 0));
    const freeAspect = freeW / Math.max(1, size.height);
    const tanNeeded = ((LAYOUT.router.x + PEDESTAL_R) * 1.08) / (tmp.pos.distanceTo(tmp.tgt) * freeAspect); // 1.08 = margin + near-edge perspective
    const MAX_FOV = 44;
    let fov = shot.fov;
    if (!rig.inNetwork) {
      const fitFov = THREE.MathUtils.radToDeg(2 * Math.atan(tanNeeded));
      if (fitFov <= MAX_FOV) fov = Math.max(shot.fov, fitFov);
      else {
        fov = MAX_FOV;
        const k = tanNeeded / Math.tan(THREE.MathUtils.degToRad(MAX_FOV / 2));
        tmp.pos.sub(tmp.tgt).multiplyScalar(k).add(tmp.tgt);
      }
    }
    camera.position.copy(tmp.pos);
    camera.lookAt(tmp.tgt);
    if (Math.abs(camera.fov - fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    rig.focus.copy(tmp.tgt);

    // Centre the HERO composition in the area left of the dashboard info panel.
    if (state.clock.elapsedTime - tmp.measuredAt > 0.5) {
      tmp.measuredAt = state.clock.elapsedTime;
      const el = document.querySelector('.info-panel');
      tmp.panel = el ? el.getBoundingClientRect().width + 24 : 0;
    }
    const want = s.page === 'dashboard' && !rig.inNetwork ? tmp.panel * (size.width >= 1150 ? 0.42 : 0.5) : 0;
    tmp.shift = damp(tmp.shift, want, rm ? 12 : 3, dt);
    if (Math.abs(tmp.shift) > 0.5) camera.setViewOffset(size.width, size.height, tmp.shift, 0, size.width, size.height);
    else if (camera.view?.enabled) camera.clearViewOffset();
  });
  return null;
}
