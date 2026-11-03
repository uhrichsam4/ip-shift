import * as fs from 'fs';
import * as path from 'path';
import type { GraphicsSettings, HistoryEntry, Settings } from '../shared/protocol';
import { BackendError } from './contract';

/** Duplicate of PRESETS.balanced in web/src/state/graphics.ts — keep in sync. */
export const DEFAULT_GRAPHICS: GraphicsSettings = {
  antiAliasing: 'smaa', renderScale: 0.75, frameRateCap: 0, shadows: 'medium', ambientOcclusion: 'off',
  reflections: 'off', bloom: 'high', depthOfField: 'sequence', volumetrics: 'low', particles: 'medium',
  textureFiltering: 8, chromaticAberration: true, filmGrain: false, vignette: true, toneMapping: 'aces', showFps: false,
};
export const DEFAULT_SETTINGS: Settings = {
  mode: 'renew', confirmBeforeSwitch: true, publicIPLookup: true, publicIPProvider: 'cloudflare', quality: 'auto',
  graphics: DEFAULT_GRAPHICS, reducedMotion: 'system', theme: 'midnight', sound: false,
};

const GENUMS: Record<string, string[]> = {
  antiAliasing: ['off', 'fxaa', 'smaa', 'msaa2', 'msaa4', 'msaa8'], shadows: ['off', 'low', 'medium', 'high'],
  ambientOcclusion: ['off', 'low', 'high'], reflections: ['off', 'low', 'high'], bloom: ['off', 'low', 'high'],
  depthOfField: ['off', 'sequence', 'always'], volumetrics: ['off', 'low', 'high'], particles: ['low', 'medium', 'high', 'ultra'],
  toneMapping: ['aces', 'agx', 'neutral'],
};
const GBOOLS = ['chromaticAberration', 'filmGrain', 'vignette', 'showFps'];
const SENUMS: Record<string, string[]> = {
  mode: ['renew', 'reconnect'], publicIPProvider: ['cloudflare', 'ipify'], quality: ['auto', 'low', 'balanced', 'high', 'ultra', 'custom'],
  reducedMotion: ['system', 'on', 'off'], theme: ['midnight', 'graphite', 'aurora'],
};
const SBOOLS = ['confirmBeforeSwitch', 'publicIPLookup', 'sound'];
const bad = (m: string) => new BackendError('invalidArgument', m);

export function applyGraphics(g: GraphicsSettings, patch: Record<string, unknown>): GraphicsSettings {
  const o: Record<string, unknown> = { ...g };
  for (const [key, v] of Object.entries(patch)) {
    if (GENUMS[key]) { if (typeof v !== 'string' || !GENUMS[key].includes(v)) throw bad(`Invalid value for graphics.${key}.`); o[key] = v; }
    else if (GBOOLS.includes(key)) { if (typeof v !== 'boolean') throw bad(`graphics.${key} must be a boolean.`); o[key] = v; }
    else if (key === 'renderScale') { if (typeof v !== 'number' || !isFinite(v)) throw bad('graphics.renderScale must be a number.'); o[key] = Math.min(1, Math.max(0.5, v)); }
    else if (key === 'frameRateCap' || key === 'textureFiltering') {
      const allowed = key === 'frameRateCap' ? [0, 30, 60, 120] : [1, 2, 4, 8, 16];
      if (typeof v !== 'number' || !allowed.includes(v)) throw bad(`Invalid value for graphics.${key}.`);
      o[key] = v;
    } else throw bad(`Unknown graphics setting '${key}'.`);
  }
  return o as unknown as GraphicsSettings;
}

export function applySettings(s: Settings, patch: Record<string, unknown>): Settings {
  const o: Record<string, unknown> = { ...s };
  if (!patch || typeof patch !== 'object') throw bad('settings patch must be an object.');
  for (const [key, v] of Object.entries(patch)) {
    if (SENUMS[key]) { if (typeof v !== 'string' || !SENUMS[key].includes(v)) throw bad(`Invalid value for ${key}.`); o[key] = v; }
    else if (SBOOLS.includes(key)) { if (typeof v !== 'boolean') throw bad(`${key} must be a boolean.`); o[key] = v; }
    else if (key === 'graphics') { if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('graphics must be an object.'); o.graphics = applyGraphics(s.graphics, v as Record<string, unknown>); }
    else throw bad(`Unknown setting '${key}'.`);
  }
  return o as unknown as Settings;
}

function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function readJSON(file: string): unknown {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
}

export class Store {
  private settings: Settings | null = null;
  constructor(private dir: string) {}
  private get hf() { return path.join(this.dir, 'history.json'); }
  private get sf() { return path.join(this.dir, 'settings.json'); }

  history(): HistoryEntry[] { const v = readJSON(this.hf); return Array.isArray(v) ? (v as HistoryEntry[]) : []; }
  addHistory(e: HistoryEntry): HistoryEntry[] {
    const all = [e, ...this.history().filter((x) => x.id !== e.id)].slice(0, 500);
    writeAtomic(this.hf, all);
    return all;
  }
  clearHistory(): number { const n = this.history().length; writeAtomic(this.hf, []); return n; }

  getSettings(): Settings {
    if (this.settings) return this.settings;
    let s = { ...DEFAULT_SETTINGS, graphics: { ...DEFAULT_GRAPHICS } };
    const raw = readJSON(this.sf) as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object') {
      // tolerant load: apply each key individually, skipping invalid ones
      for (const [key, v] of Object.entries(raw)) {
        if (key === 'graphics' && v && typeof v === 'object') {
          for (const [gk, gv] of Object.entries(v)) { try { s = { ...s, graphics: applyGraphics(s.graphics, { [gk]: gv }) }; } catch { /* default */ } }
        } else { try { s = applySettings(s, { [key]: v }); } catch { /* default */ } }
      }
    }
    this.settings = s;
    return s;
  }
  updateSettings(patch: Record<string, unknown>): Settings {
    const next = applySettings(this.getSettings(), patch);
    writeAtomic(this.sf, next);
    this.settings = next;
    return next;
  }
}
