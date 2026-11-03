import { countRender } from './shared';
import { useMemo, useRef, type JSX } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, FXAA, N8AO, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type BloomEffect, type ChromaticAberrationEffect, type DepthOfFieldEffect } from 'postprocessing';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../state/store';
import type { GraphicsSettings } from '../bridge/protocol';
import { rig } from './shared';

export const TONE: Record<GraphicsSettings['toneMapping'], { pp: ToneMappingMode; gl: THREE.ToneMapping }> = {
  aces: { pp: ToneMappingMode.ACES_FILMIC, gl: THREE.ACESFilmicToneMapping },
  agx: { pp: ToneMappingMode.AGX, gl: THREE.AgXToneMapping },
  neutral: { pp: ToneMappingMode.NEUTRAL, gl: THREE.NeutralToneMapping },
};

/** True when any composer pass is needed (otherwise the renderer draws directly). */
export function needsComposer(g: GraphicsSettings, sequence: boolean) {
  return (
    g.bloom !== 'off' ||
    g.ambientOcclusion !== 'off' ||
    g.depthOfField === 'always' ||
    (g.depthOfField === 'sequence' && sequence) ||
    (g.chromaticAberration && sequence) ||
    g.filmGrain ||
    g.vignette ||
    g.antiAliasing !== 'off' // FXAA/SMAA are passes; MSAA is composer multisampling (never a canvas remount)
  );
}

export function Effects() {
  countRender();
  const maxSamples = useThree((st) => st.gl.capabilities.maxSamples || 4);
  const g = useAppStore(
    useShallow((s) => ({
      aa: s.graphics.antiAliasing,
      ao: s.graphics.ambientOcclusion,
      bloom: s.graphics.bloom,
      dof: s.graphics.depthOfField,
      ca: s.graphics.chromaticAberration,
      grain: s.graphics.filmGrain,
      vig: s.graphics.vignette,
      tone: s.graphics.toneMapping,
      on: needsComposer(s.graphics, s.sceneMode !== 'idle'),
      sequence: s.sceneMode !== 'idle',
      initialise: s.sceneMode === 'initialise',
    })),
  );
  const bloom = useRef<BloomEffect>(null);
  const ca = useRef<ChromaticAberrationEffect>(null);
  const dof = useRef<DepthOfFieldEffect>(null);
  const caOffset = useMemo(() => new THREE.Vector2(0, 0), []);
  const bloomBase = g.bloom === 'low' ? 0.4 : 0.55;

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = bloomBase * (1 + rig.flash * 2.2);
    if (ca.current) {
      const k = useAppStore.getState().reducedMotion ? 0 : rig.ca * 0.006;
      ca.current.offset.set(k, k * 0.6);
    }
    if (dof.current) dof.current.target = rig.focus;
  });

  if (!g.on) return null;
  // 'sequence' DOF only for the router close-up (it turns network-space particles into bokeh blobs)
  const wantDof = (g.dof === 'always' && !g.sequence) || (g.dof !== 'off' && g.initialise);
  const requested = g.aa === 'msaa2' ? 2 : g.aa === 'msaa4' ? 4 : g.aa === 'msaa8' ? 8 : 0;
  // WebKit/Metal: clamp to the GPU's sample limit (4 on Apple GPUs), and never combine composer MSAA
  // with N8AO (multisampled depth is unsupported there and renders black) — SMAA stands in instead.
  const msaa = g.ao !== 'off' ? 0 : Math.min(requested, maxSamples);
  const smaaFallback = requested > 0 && msaa === 0;
  const list: (JSX.Element | null)[] = [
    g.ao !== 'off' ? (
      <N8AO key={`ao-${g.ao}`} aoRadius={0.35} intensity={1.6} distanceFalloff={0.6} halfRes={false} /* N8AO halfRes never allocates its downsample target here → renders black */ quality={g.ao === 'low' ? 'performance' : 'medium'} />
    ) : null,
    wantDof ? <DepthOfField key="dof" ref={dof} target={rig.focus} worldFocusDistance={2} worldFocusRange={0.8} bokehScale={1.6} resolutionScale={0.5} /> : null,
    g.bloom !== 'off' ? (
      <Bloom key={`bloom-${g.bloom}`} ref={bloom} mipmapBlur levels={4} luminanceThreshold={1.15} luminanceSmoothing={0.08} intensity={bloomBase} radius={0.5} />
    ) : null,
    g.ca && g.sequence ? <ChromaticAberration key="ca" ref={ca} offset={caOffset} radialModulation={false} modulationOffset={0} /> : null,
    g.vig ? <Vignette key="vig" offset={0.3} darkness={0.56} /> : null,
    g.grain ? <Noise key="noise" premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.03} /> : null,
    <ToneMapping key={`tm-${g.tone}`} mode={TONE[g.tone].pp} />,
    g.aa === 'smaa' || smaaFallback ? <SMAA key="smaa" /> : g.aa === 'fxaa' ? <FXAA key="fxaa" /> : null,
  ];
  return (
    // Rebuild the composer whenever the pass setup changes (DOF excluded: it toggles at switch start and a rebuild would hitch): passes such as N8AO only create their
    // render targets on setSize, so mutating them in place (e.g. halfRes toggles) renders into disposed targets.
    <EffectComposer key={`ms-${msaa}-ao-${g.ao}-bl-${g.bloom}-aa-${g.aa}`} multisampling={msaa} enableNormalPass={false}>
      {list.filter((x): x is JSX.Element => x !== null)}
    </EffectComposer>
  );
}
