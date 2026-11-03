/**
 * Graphics presets — shared by the Settings UI (writes) and the 3D scene (reads store.graphics).
 * Presets fill every field; editing any single field switches settings.quality to 'custom'.
 * 'auto' starts at 'balanced' and the scene's PerformanceMonitor steps between presets.
 */
import type { GraphicsSettings } from '../bridge/protocol';

export type PresetName = 'low' | 'balanced' | 'high' | 'ultra';

export const PRESETS: Record<PresetName, GraphicsSettings> = {
  low: {
    antiAliasing: 'fxaa', renderScale: 0.5, frameRateCap: 60, shadows: 'off', ambientOcclusion: 'off',
    reflections: 'off', bloom: 'off', depthOfField: 'off', volumetrics: 'off', particles: 'low',
    textureFiltering: 2, chromaticAberration: false, filmGrain: false, vignette: true, toneMapping: 'aces', showFps: false,
  },
  balanced: {
    antiAliasing: 'smaa', renderScale: 0.75, frameRateCap: 0, shadows: 'medium', ambientOcclusion: 'off',
    reflections: 'off', bloom: 'high', depthOfField: 'sequence', volumetrics: 'low', particles: 'medium',
    textureFiltering: 8, chromaticAberration: true, filmGrain: false, vignette: true, toneMapping: 'aces', showFps: false,
  },
  high: {
    antiAliasing: 'msaa4', renderScale: 0.85, frameRateCap: 0, shadows: 'high', ambientOcclusion: 'off',
    reflections: 'low', bloom: 'high', depthOfField: 'always', volumetrics: 'high', particles: 'high',
    textureFiltering: 16, chromaticAberration: true, filmGrain: true, vignette: true, toneMapping: 'aces', showFps: false,
  },
  ultra: {
    // AO forces composer MSAA off (N8AO + multisampled depth renders black on WebKit), so SMAA it is.
    antiAliasing: 'smaa', renderScale: 0.9, frameRateCap: 0, shadows: 'high', ambientOcclusion: 'low',
    reflections: 'high', bloom: 'high', depthOfField: 'sequence', volumetrics: 'high', particles: 'ultra',
    textureFiltering: 16, chromaticAberration: true, filmGrain: true, vignette: true, toneMapping: 'aces', showFps: false,
  },
};

export const DEFAULT_GRAPHICS: GraphicsSettings = PRESETS.balanced;

/** Particle counts per level (instanced). */
export const PARTICLE_COUNTS: Record<GraphicsSettings['particles'], number> = { low: 600, medium: 2500, high: 6000, ultra: 12000 };

/** Device pixel ratio actually used by the canvas. */
export function resolveDpr(g: GraphicsSettings): number {
  const device = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  return Math.max(0.5, device * Math.min(1, Math.max(0.5, g.renderScale)));
}

/** Resolve the effective graphics from the saved preset + custom values. */
export function resolveGraphics(quality: string, custom: GraphicsSettings | undefined, autoTier?: PresetName): GraphicsSettings {
  if (quality === 'custom') return { ...DEFAULT_GRAPHICS, ...(custom ?? {}) };
  if (quality === 'auto') return { ...PRESETS[autoTier ?? 'balanced'], showFps: custom?.showFps ?? false };
  const p = PRESETS[(quality as PresetName) in PRESETS ? (quality as PresetName) : 'balanced'];
  return { ...p, showFps: custom?.showFps ?? false };
}
