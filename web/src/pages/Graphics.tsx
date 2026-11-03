import type { ReactNode } from 'react';
import { useAppStore } from '../state/store';
import { updateSettings } from '../state/actions';
import { PRESETS, DEFAULT_GRAPHICS, type PresetName } from '../state/graphics';
import { Segmented, Toggle } from '../ui/primitives';
import type { GraphicsSettings, Settings } from '../bridge/protocol';

type Cost = 'Free' | 'Low' | 'Medium' | 'High';

function GField({ label, desc, cost, children }: { label: string; desc: string; cost: Cost; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-text">
        <span className="gfx-label">
          <span className="t-title-s">{label}</span>
          <span className={`cost cost-${cost.toLowerCase()}`} title={`Performance cost: ${cost}`}>
            {cost}
          </span>
        </span>
        <span className="t-body muted">{desc}</span>
      </div>
      <div className="field-ctl">{children}</div>
    </div>
  );
}

export function GraphicsSection() {
  const settings = useAppStore((s) => s.settings);
  const g = useAppStore((s) => s.graphics);
  const tier = useAppStore((s) => s.quality);

  const setPreset = (q: Settings['quality']) => {
    if (q === 'custom') return updateSettings({ quality: 'custom', graphics: { ...g } });
    const base = q === 'auto' ? PRESETS[tier] : PRESETS[q as PresetName];
    updateSettings({ quality: q, graphics: { ...base, showFps: g.showFps } });
  };
  const set = <K extends keyof GraphicsSettings>(k: K, val: GraphicsSettings[K]) => {
    const next = { ...g, [k]: val };
    // the FPS counter is a display preference, not a quality change
    if (k === 'showFps') return updateSettings({ graphics: next });
    updateSettings({ quality: 'custom', graphics: next });
  };
  const seg = <K extends keyof GraphicsSettings>(k: K, label: string, opts: [GraphicsSettings[K], string][]) => (
    <Segmented
      label={label}
      value={String(g[k])}
      onChange={(v) => set(k, opts.find(([o]) => String(o) === v)![0])}
      options={opts.map(([o, l]) => ({ value: String(o), label: l }))}
    />
  );

  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(window.innerWidth * dpr * g.renderScale);
  const h = Math.round(window.innerHeight * dpr * g.renderScale);

  return (
    <section className="settings glass-1 page-anim">
      <div className="gfx-head">
        <h2 className="t-micro muted section-label">Graphics</h2>
        <button className="link-btn t-caption" onClick={() => updateSettings({ quality: 'balanced', graphics: { ...DEFAULT_GRAPHICS, showFps: g.showFps } })}>
          Reset to Balanced
        </button>
      </div>
      <GField label="Preset" cost="Free" desc={settings.quality === 'auto' ? `Auto adjusts to keep motion smooth — currently ${tier}.` : settings.quality === 'custom' ? 'Custom — your own mix of the settings below.' : 'Pick a preset, then fine-tune anything below.'}>
        <Segmented
          label="Graphics preset"
          value={settings.quality}
          onChange={setPreset}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'low', label: 'Low' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'high', label: 'High' },
            { value: 'ultra', label: 'Ultra' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </GField>

      <h3 className="t-micro muted gfx-sub">Image quality</h3>
      <GField label="Anti-aliasing" cost={g.antiAliasing.startsWith('msaa') ? 'High' : g.antiAliasing === 'off' ? 'Free' : 'Low'} desc="Smooths jagged edges. FXAA/SMAA are post filters; MSAA samples geometry.">
        {seg('antiAliasing', 'Anti-aliasing', [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['msaa2', 'MSAA 2×'], ['msaa4', '4×'], ['msaa8', '8×']])}
      </GField>
      <GField label="Render scale" cost={g.renderScale >= 0.95 ? 'High' : g.renderScale >= 0.7 ? 'Medium' : 'Low'} desc={`Resolution of the 3D scene · ${w} × ${h} px`}>
        <span className="slider-wrap">
          <input
            type="range"
            className="slider"
            min={50}
            max={100}
            step={5}
            value={Math.round(g.renderScale * 100)}
            onChange={(e) => set('renderScale', Number(e.target.value) / 100)}
            aria-label="Render scale"
            style={{ ['--p' as string]: `${((g.renderScale - 0.5) / 0.5) * 100}%` }}
          />
          <span className="mono t-body slider-val">{Math.round(g.renderScale * 100)}%</span>
        </span>
      </GField>
      <GField label="Frame-rate cap" cost={g.frameRateCap === 30 ? 'Low' : g.frameRateCap === 60 ? 'Medium' : 'High'} desc="Lower caps save battery and keep the fans quiet.">
        {seg('frameRateCap', 'Frame-rate cap', [[30, '30'], [60, '60'], [120, '120'], [0, 'Display']])}
      </GField>
      <GField label="Texture filtering" cost="Low" desc="Anisotropic filtering keeps the floor and surfaces sharp at angles.">
        {seg('textureFiltering', 'Texture filtering', [[1, '1×'], [2, '2×'], [4, '4×'], [8, '8×'], [16, '16×']])}
      </GField>
      <GField label="Tone mapping" cost="Free" desc="How bright light is compressed for your display.">
        {seg('toneMapping', 'Tone mapping', [['aces', 'ACES'], ['agx', 'AgX'], ['neutral', 'Neutral']])}
      </GField>

      <h3 className="t-micro muted gfx-sub">Lighting</h3>
      <GField label="Shadows" cost={g.shadows === 'off' ? 'Free' : g.shadows === 'high' ? 'High' : 'Medium'} desc="Soft contact shadows under the devices.">
        {seg('shadows', 'Shadows', [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
      </GField>
      <GField label="Ambient occlusion" cost={g.ambientOcclusion === 'off' ? 'Free' : 'High'} desc="Screen-space darkening in creases and contact points.">
        {seg('ambientOcclusion', 'Ambient occlusion', [['off', 'Off'], ['low', 'Low'], ['high', 'High']])}
      </GField>
      <GField label="Reflections" cost={g.reflections === 'off' ? 'Free' : 'High'} desc="Planar mirror floor. WebGL has no hardware ray tracing, so this re-renders the scene.">
        {seg('reflections', 'Reflections', [['off', 'Off'], ['low', 'Low'], ['high', 'High']])}
      </GField>
      <GField label="Volumetric light" cost={g.volumetrics === 'off' ? 'Free' : g.volumetrics === 'high' ? 'Medium' : 'Low'} desc="Light cones above the pedestals.">
        {seg('volumetrics', 'Volumetric light', [['off', 'Off'], ['low', 'Low'], ['high', 'High']])}
      </GField>
      <GField label="Bloom" cost={g.bloom === 'off' ? 'Free' : 'Low'} desc="Glow around bright lights and LEDs.">
        {seg('bloom', 'Bloom', [['off', 'Off'], ['low', 'Low'], ['high', 'High']])}
      </GField>

      <h3 className="t-micro muted gfx-sub">Effects</h3>
      <GField label="Depth of field" cost={g.depthOfField === 'off' ? 'Free' : 'Medium'} desc="Camera focus blur on things out of focus.">
        {seg('depthOfField', 'Depth of field', [['off', 'Off'], ['sequence', 'During switch'], ['always', 'Always']])}
      </GField>
      <GField label="Particles" cost={g.particles === 'low' ? 'Low' : g.particles === 'ultra' ? 'High' : 'Medium'} desc="Floating energy particles in the scene.">
        {seg('particles', 'Particles', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']])}
      </GField>
      <GField label="Chromatic aberration" cost="Free" desc="Subtle colour fringing during warp transitions.">
        <Toggle label="Chromatic aberration" checked={g.chromaticAberration} onChange={(v) => set('chromaticAberration', v)} />
      </GField>
      <GField label="Film grain" cost="Free" desc="Fine noise that prevents colour banding.">
        <Toggle label="Film grain" checked={g.filmGrain} onChange={(v) => set('filmGrain', v)} />
      </GField>
      <GField label="Vignette" cost="Free" desc="Gently darkens the edges of the frame.">
        <Toggle label="Vignette" checked={g.vignette} onChange={(v) => set('vignette', v)} />
      </GField>
      <GField label="Show FPS counter" cost="Free" desc="Frames per second, top right.">
        <Toggle label="Show FPS counter" checked={g.showFps} onChange={(v) => set('showFps', v)} />
      </GField>
    </section>
  );
}
