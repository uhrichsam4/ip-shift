import type { ReactNode } from 'react';
import { useAppStore } from '../state/store';
import { requestLocation, updateSettings } from '../state/actions';
import { Btn, Segmented, Toggle } from '../ui/primitives';
import { LogoMark } from '../design/icons';
import { GraphicsSection } from './Graphics';
import { OS } from '../state/os';

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-text">
        <span className="t-title-s">{label}</span>
        {hint && <span className="t-body muted">{hint}</span>}
      </div>
      <div className="field-ctl">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const s = useAppStore((st) => st.settings);
  const snap = useAppStore((st) => st.snapshot);
  const info = useAppStore((st) => st.appInfo);
  const bridgeKind = useAppStore((st) => st.bridgeKind);
  const loc = snap?.locationAuthorization;
  const locText = { authorized: 'Allowed', denied: 'Denied', restricted: 'Restricted', notDetermined: 'Not asked yet' } as const;

  return (
    <div className="page">
      <header className="page-head page-anim">
        <h1 className="t-headline">Settings</h1>
        <p className="t-body muted">Changes save immediately.</p>
      </header>

      <section className="settings glass-1 page-anim">
        <h2 className="t-micro muted section-label">Switching</h2>
        <Field
          label="Switch mode"
          hint={
            s.mode === 'renew'
              ? 'Asks your router to renew the DHCP lease. Wi-Fi stays connected. Fastest, but many routers return the same address.'
              : 'Turns Wi-Fi off and on, then renews the lease. You’re offline for a few seconds; some routers are more likely to assign a different address.'
          }
        >
          <Segmented
            label="Switch mode"
            value={s.mode}
            onChange={(mode) => updateSettings({ mode })}
            options={[
              { value: 'renew', label: 'Renew lease' },
              { value: 'reconnect', label: 'Reconnect Wi-Fi + renew' },
            ]}
          />
        </Field>
        <Field label="Confirm before switching" hint={`Show what will happen, including the ${OS === 'Windows' ? 'Windows administrator (UAC)' : 'macOS password'} prompt, before each switch.`}>
          <Toggle label="Confirm before switching" checked={s.confirmBeforeSwitch} onChange={(confirmBeforeSwitch) => updateSettings({ confirmBeforeSwitch })} />
        </Field>
      </section>

      <section className="settings glass-1 page-anim">
        <h2 className="t-micro muted section-label">Public IP</h2>
        <Field label="Look up public IP" hint="Sends one request to the provider below. Your public IP is assigned by your internet provider.">
          <Toggle label="Look up public IP" checked={s.publicIPLookup} onChange={(publicIPLookup) => updateSettings({ publicIPLookup })} />
        </Field>
        <Field label="Provider">
          <Segmented
            label="Public IP provider"
            value={s.publicIPProvider}
            onChange={(publicIPProvider) => updateSettings({ publicIPProvider })}
            options={[
              { value: 'cloudflare', label: 'Cloudflare' },
              { value: 'ipify', label: 'ipify' },
            ]}
          />
        </Field>
      </section>

      <section className="settings glass-1 page-anim">
        <h2 className="t-micro muted section-label">Appearance</h2>
        <Field label="Reduce motion" hint={`System follows ${OS} accessibility settings. Camera flights become crossfades.`}>
          <Segmented
            label="Reduce motion"
            value={s.reducedMotion}
            onChange={(reducedMotion) => updateSettings({ reducedMotion })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Field>
        <Field label="Theme">
          <Segmented
            label="Theme"
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'midnight', label: 'Midnight' },
              { value: 'graphite', label: 'Graphite' },
              { value: 'aurora', label: 'Aurora' },
            ]}
          />
        </Field>
        <Field label="Sound">
          <Toggle label="Sound" checked={s.sound} onChange={(sound) => updateSettings({ sound })} />
        </Field>
      </section>

      <GraphicsSection />

      <section className="settings glass-1 page-anim">
        <h2 className="t-micro muted section-label">Privacy</h2>
        <Field label="Location access" hint={`${OS} only reveals Wi-Fi network names to apps with Location access. Status: ${loc ? locText[loc] : '—'}.`}>
          <Btn variant="secondary" onClick={requestLocation} disabled={loc === 'authorized'}>
            {loc === 'authorized' ? 'Allowed' : loc === 'denied' || loc === 'restricted' ? 'Open System Settings' : 'Allow Location'}
          </Btn>
        </Field>
      </section>

      <section className="settings glass-1 page-anim about">
        <LogoMark size={40} id="about" />
        <div>
          <div className="wordmark">IP SHIFT</div>
          <div className="t-body muted mono">
            Version {info?.version ?? '—'} ({info?.build ?? '—'}) · {info?.arch ?? '—'} · {OS} {info?.macOSVersion ?? '—'} · bridge: {bridgeKind}
          </div>
        </div>
      </section>
    </div>
  );
}
