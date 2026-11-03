import type { ReactNode } from 'react';
import { useAppStore } from '../state/store';
import { copyText, requestLocation } from '../state/actions';
import { countdown, DASH, dateTime, v } from '../state/format';
import { Btn, Dot, Skel, Sparkline, useNow, useThrottledRssi } from '../ui/primitives';

/** Only this text node re-renders each second, not the whole page. */
function Countdown({ to }: { to: string }) {
  const now = useNow(1000);
  return <>{countdown(to, now)}</>;
}
import { IconGlobe, IconLocation, IconRouter, IconWifi, IconLaptop, IconNetwork } from '../design/icons';
import { OS } from '../state/os';

function Row({ k, children, mono, copy }: { k: string; children: ReactNode; mono?: boolean; copy?: string | null }) {
  const snap = useAppStore((s) => s.snapshot);
  return (
    <div className="kv">
      <span className="kv-k t-body muted">{k}</span>
      <span className={`kv-v t-body ${mono ? 'mono' : ''}`}>
        {!snap ? (
          <Skel />
        ) : copy ? (
          <button className="copy-inline selectable" onClick={() => copyText(copy, `${k} copied`)} title={`Copy ${k}`}>
            {children}
          </button>
        ) : (
          children
        )}
      </span>
    </div>
  );
}

function Card({ title, icon, children, wide }: { title: string; icon: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card glass-1 page-anim ${wide ? 'wide' : ''}`}>
      <header className="card-head">
        <span className="card-icon">{icon}</span>
        <h2 className="t-title-s">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function NetworkPage() {
  const snap = useAppStore((s) => s.snapshot);
  const rssi = useThrottledRssi(500);
  const w = snap?.wifi;
  const d = snap?.dhcp;
  const c = snap?.connectivity;
  const p = snap?.publicIP;

  let ssid: ReactNode = v(w?.ssid);
  if (w && !w.ssid && w.ssidAvailability === 'needsLocationPermission')
    ssid = (
      <span className="hidden-ssid">
        <span className="muted">Hidden by {OS}</span>
        <button className="link-btn t-caption" onClick={requestLocation}>
          <IconLocation size={13} /> Allow Location
        </button>
      </span>
    );

  return (
    <div className="page">
      <header className="page-head page-anim">
        <h1 className="t-headline">Network</h1>
        <p className="t-body muted">Everything {OS} reports about your current connection. Unknown values show as —.</p>
      </header>
      <div className="grid">
        <Card title="Interface" icon={<IconLaptop size={18} />}>
          <Row k="Primary interface" mono>{v(snap?.primaryInterface)}</Row>
          <Row k="Wi-Fi interface" mono>{w ? `${w.interfaceName} (${w.hardwarePort})` : 'No Wi-Fi interface detected'}</Row>
          <Row k="Power">{w ? (w.powerOn ? 'On' : 'Off') : DASH}</Row>
          <Row k="Wi-Fi address" mono copy={w?.hardwareAddress}>{v(w?.hardwareAddress)}</Row>
        </Card>

        <Card title="IPv4 & IPv6" icon={<IconNetwork size={18} />}>
          <Row k="IPv4 address" mono copy={snap?.ipv4.address}>{v(snap?.ipv4.address)}{snap?.ipv4.isSelfAssigned ? ' (self-assigned)' : ''}</Row>
          <Row k="Subnet mask" mono>{v(snap?.ipv4.subnetMask)}</Row>
          <Row k="Router" mono copy={snap?.ipv4.router}>{v(snap?.ipv4.router)}</Row>
          <Row k="IPv6" mono>{snap?.ipv6.length ? snap.ipv6.join(', ') : DASH}</Row>
        </Card>

        <Card title="Wi-Fi" icon={<IconWifi size={18} />} wide>
          <div className="wifi-split">
            <div>
              <Row k="Network (SSID)">{ssid}</Row>
              <Row k="BSSID" mono>{v(w?.bssid)}</Row>
              <Row k="Channel" mono>{w?.channel != null ? `${w.channel}${w.band ? ` · ${w.band}` : ''}${w.channelWidthMHz ? ` · ${w.channelWidthMHz} MHz` : ''}` : DASH}</Row>
              <Row k="PHY mode" mono>{v(w?.phyMode)}</Row>
              <Row k="Security">{v(w?.security)}</Row>
            </div>
            <div>
              <Row k="Signal (RSSI)" mono>{v(w?.rssi, ' dBm')}</Row>
              <Row k="Noise" mono>{v(w?.noise, ' dBm')}</Row>
              <Row k="Tx rate" mono>{v(w?.txRateMbps, ' Mbps')}</Row>
              <div className="wifi-spark">
                <span className="t-micro muted">Signal · last 60 s</span>
                <Sparkline values={rssi} width={320} height={56} label="Wi-Fi signal strength" />
              </div>
            </div>
          </div>
        </Card>

        <Card title="DHCP lease" icon={<IconRouter size={18} />}>
          <Row k="Status">{d ? ({ bound: 'Bound', selfAssigned: 'Self-assigned', none: 'Off', unknown: 'Unknown' } as const)[d.status] : DASH}</Row>
          <Row k="Server" mono>{v(d?.serverIdentifier)}</Row>
          <Row k="Lease start" mono>{dateTime(d?.leaseStart)}</Row>
          <Row k="Expires" mono>{d?.leaseExpires ? <>{dateTime(d.leaseExpires)} · in <Countdown to={d.leaseExpires} /></> : DASH}</Row>
          <Row k="DNS servers" mono>{d?.dns.length ? d.dns.join(', ') : DASH}</Row>
        </Card>

        <Card title="Internet" icon={<IconGlobe size={18} />}>
          <Row k="Path">{c ? ({ satisfied: 'Satisfied', unsatisfied: 'Unsatisfied', requiresConnection: 'Requires connection', unknown: 'Unknown' } as const)[c.path] : DASH}</Row>
          <Row k="Internet">
            {c ? (
              <span className="status-val">
                <Dot tone={c.internet === 'online' ? 'success' : c.internet === 'offline' ? 'danger' : 'warning'} />
                {({ online: 'Online', offline: 'Offline', captive: 'Captive portal', checking: 'Checking…', unknown: 'Unknown' } as const)[c.internet]}
              </span>
            ) : (
              DASH
            )}
          </Row>
          <Row k="Last probe" mono>{c?.lastProbe ? `${c.lastProbe.ok ? 'OK' : 'Failed'}${c.lastProbe.latencyMs != null ? ` · ${c.lastProbe.latencyMs} ms` : ''} · ${c.lastProbe.target}` : DASH}</Row>
          <Row k="Public IP" mono copy={p?.address}>{p?.status === 'ok' ? v(p.address) : p?.status === 'disabled' ? 'Lookup off' : p?.status === 'pending' ? 'Looking up…' : p?.error ?? DASH}</Row>
          <Row k="Provider">{v(p?.provider)}</Row>
          <p className="t-caption muted card-note">Assigned by your internet provider — switching your local IP doesn't change it.</p>
        </Card>
      </div>
      {snap && snap.locationAuthorization !== 'authorized' && (
        <div className="banner glass-1 page-anim">
          <IconLocation size={18} />
          <span className="t-body">{OS} hides Wi-Fi network names until IP SHIFT has Location access.</span>
          <Btn variant="secondary" onClick={requestLocation}>Allow Location</Btn>
        </div>
      )}
    </div>
  );
}
