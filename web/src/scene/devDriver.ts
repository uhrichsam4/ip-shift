/**
 * DEV ONLY: drive the store from `?scene=idle|initialise|wifi|dhcp|reconnect|results|cycle` so the
 * stage can be checked before the UI's preview bridge exists. Compiled out of production builds.
 */
import { useEffect } from 'react';
import { useAppStore, type SceneMode } from '../state/store';
import { PRESETS } from '../state/graphics';
import type { NetworkSnapshot } from '../bridge/protocol';

const FAKE: NetworkSnapshot = {
  capturedAt: new Date().toISOString(),
  wifi: { interfaceName: 'en0', hardwarePort: 'Wi-Fi', powerOn: true, associated: true, ssid: null, ssidAvailability: 'needsLocationPermission', bssid: null, rssi: -52, noise: -92, txRateMbps: 866, channel: 36, band: '5GHz', channelWidthMHz: 80, security: 'WPA3 Personal', phyMode: '802.11ax', hardwareAddress: null },
  ipv4: { address: '192.168.1.42', subnetMask: '255.255.255.0', router: '192.168.1.1', isSelfAssigned: false },
  ipv6: [],
  dhcp: { status: 'bound', serverIdentifier: '192.168.1.1', leaseStart: null, leaseExpires: null, leaseSeconds: 86400, dns: [] },
  connectivity: { path: 'satisfied', internet: 'online', lastProbe: null },
  publicIP: { status: 'disabled', address: null, provider: null, fetchedAt: null },
  primaryInterface: 'en0',
  macOSVersion: '27.2',
  locationAuthorization: 'notDetermined',
};

export function useDevSceneDriver() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const p = new URLSearchParams(location.search);
    const gfx = p.get('gfx') as keyof typeof PRESETS | null;
    if (gfx && PRESETS[gfx]) {
      const st = useAppStore.getState();
      st.set({ quality: gfx, graphics: PRESETS[gfx], settings: { ...st.settings, quality: gfx } });
    }
    const scene = p.get('scene');
    if (!scene) return;
    const s = useAppStore.getState();
    const q = p.get('q');
    if (q) s.set({ quality: q as never, settings: { ...s.settings, quality: q as never } });
    if (p.get('rm')) s.set({ reducedMotion: true });
    if (!s.snapshot) s.set({ snapshot: FAKE });
    s.signal({ link: 'up' });
    const go = (m: SceneMode) => useAppStore.getState().set({ sceneMode: m });
    if (scene !== 'cycle') {
      // walk through the preceding modes quickly so the camera arrives where it would in a real run
      const order: SceneMode[] = ['idle', 'initialise', 'wifi', 'dhcp', 'reconnect', 'results'];
      const idx = order.indexOf(scene as SceneMode);
      const timers: number[] = [];
      order.slice(1, idx + 1).forEach((m, i) => timers.push(window.setTimeout(() => go(m), 300 + i * 2600)));
      if (scene === 'dhcp') timers.push(window.setTimeout(() => useAppStore.getState().signal({ leaseAckAt: performance.now() }), 300 + idx * 2600 + 1500));
      if (scene === 'wifi') timers.push(window.setTimeout(() => useAppStore.getState().signal({ link: 'negotiating' }), 300 + idx * 2600));
      return () => timers.forEach(clearTimeout);
    }
    const steps: [number, () => void][] = [
      [1500, () => (s.signal({ pressAt: performance.now() }), go('initialise'))],
      [5000, () => go('wifi')],
      [6500, () => s.signal({ link: 'down' })],
      [8500, () => s.signal({ link: 'negotiating' })],
      [10000, () => s.signal({ link: 'up' })],
      [11000, () => go('dhcp')],
      [15000, () => s.signal({ leaseAckAt: performance.now() })],
      [16500, () => go('reconnect')],
      [21500, () => go('results')],
      [27000, () => go('idle')],
    ];
    const ids = steps.map(([t, f]) => window.setTimeout(f, t));
    return () => ids.forEach(clearTimeout);
  }, []);
}
