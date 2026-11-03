/**
 * Win32 bindings via koffi. Loaded LAZILY: koffi.load is only called on win32, on first use.
 * Struct layouts (x64/arm64 natural alignment; koffi.struct applies C alignment rules):
 *
 * iptypes.h
 *   IP_ADDR_STRING { IP_ADDR_STRING* Next; char IpAddress[16]; char IpMask[16]; DWORD Context; }  // 48 bytes
 *   IP_ADAPTER_INFO { IP_ADAPTER_INFO* Next; DWORD ComboIndex; char AdapterName[260]; char Description[132];
 *     UINT AddressLength; BYTE Address[8]; DWORD Index; UINT Type; UINT DhcpEnabled; PIP_ADDR_STRING CurrentIpAddress;
 *     IP_ADDR_STRING IpAddressList, GatewayList, DhcpServer; BOOL HaveWins; IP_ADDR_STRING PrimaryWinsServer,
 *     SecondaryWinsServer; time_t LeaseObtained; time_t LeaseExpires; }                             // 704 bytes
 * ipexport.h
 *   IP_ADAPTER_INDEX_MAP { ULONG Index; WCHAR Name[128]; }                                          // 260 bytes
 *   IP_INTERFACE_INFO { LONG NumAdapters; IP_ADAPTER_INDEX_MAP Adapter[]; }                          // entries at +4
 * wlanapi.h / windot11.h
 *   WLAN_INTERFACE_INFO { GUID InterfaceGuid; WCHAR strInterfaceDescription[256]; WLAN_INTERFACE_STATE isState; } // 532
 *   WLAN_INTERFACE_INFO_LIST { DWORD dwNumberOfItems; DWORD dwIndex; WLAN_INTERFACE_INFO InterfaceInfo[]; }       // entries at +8
 *   DOT11_SSID { ULONG uSSIDLength; UCHAR ucSSID[32]; }
 *   WLAN_ASSOCIATION_ATTRIBUTES { DOT11_SSID; DOT11_BSS_TYPE; BYTE bssid[6]; (2 pad) DOT11_PHY_TYPE; ULONG phyIndex;
 *     ULONG signalQuality; ULONG rxRate; ULONG txRate; }                                                       // 68
 *   WLAN_SECURITY_ATTRIBUTES { BOOL; BOOL; DOT11_AUTH_ALGORITHM; DOT11_CIPHER_ALGORITHM; }                       // 16
 *   WLAN_CONNECTION_ATTRIBUTES { state; mode; WCHAR strProfileName[256]; assoc; security; }                    // 604
 */
import { BackendError } from './contract';

export const NON_WINDOWS = 'IP SHIFT for Windows backend is running on a non-Windows OS (development only).';
export const ERROR_ACCESS_DENIED = 5;
const ERROR_BUFFER_OVERFLOW = 111;
const ERROR_INSUFFICIENT_BUFFER = 122;
export const IF_TYPE_IEEE80211 = 71;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type K = any;
let k: K | null = null;
function koffi(): K {
  if (!k) k = require('koffi');
  return k;
}

let T: Record<string, K> | null = null;
/** Struct types (no library load needed; usable on macOS for tests). */
export function types(): Record<string, K> {
  if (T) return T;
  const kf = koffi();
  const str = (n: number) => kf.array('char', n, 'String');
  const IP_ADDR_STRING = kf.struct('IPS_IP_ADDR_STRING', { Next: 'void *', IpAddress: str(16), IpMask: str(16), Context: 'uint32_t' });
  const IP_ADAPTER_INFO = kf.struct('IPS_IP_ADAPTER_INFO', {
    Next: 'void *', ComboIndex: 'uint32_t', AdapterName: str(260), Description: str(132), AddressLength: 'uint32_t',
    Address: kf.array('uint8_t', 8, 'Array'), Index: 'uint32_t', Type: 'uint32_t', DhcpEnabled: 'uint32_t',
    CurrentIpAddress: 'void *', IpAddressList: IP_ADDR_STRING, GatewayList: IP_ADDR_STRING, DhcpServer: IP_ADDR_STRING,
    HaveWins: 'int32_t', PrimaryWinsServer: IP_ADDR_STRING, SecondaryWinsServer: IP_ADDR_STRING,
    LeaseObtained: 'int64_t', LeaseExpires: 'int64_t',
  });
  const GUID = kf.struct('IPS_GUID', { Data1: 'uint32_t', Data2: 'uint16_t', Data3: 'uint16_t', Data4: kf.array('uint8_t', 8, 'Array') });
  const IP_ADAPTER_INDEX_MAP = kf.struct('IPS_IP_ADAPTER_INDEX_MAP', { Index: 'uint32_t', Name: kf.array('char16_t', 128, 'String') });
  const WLAN_INTERFACE_INFO = kf.struct('IPS_WLAN_INTERFACE_INFO', { InterfaceGuid: GUID, strInterfaceDescription: kf.array('char16_t', 256, 'String'), isState: 'uint32_t' });
  const DOT11_SSID = kf.struct('IPS_DOT11_SSID', { uSSIDLength: 'uint32_t', ucSSID: kf.array('uint8_t', 32, 'Array') });
  const WLAN_ASSOCIATION_ATTRIBUTES = kf.struct('IPS_WLAN_ASSOCIATION_ATTRIBUTES', {
    dot11Ssid: DOT11_SSID, dot11BssType: 'uint32_t', dot11Bssid: kf.array('uint8_t', 6, 'Array'), dot11PhyType: 'uint32_t',
    uDot11PhyIndex: 'uint32_t', wlanSignalQuality: 'uint32_t', ulRxRate: 'uint32_t', ulTxRate: 'uint32_t',
  });
  const WLAN_SECURITY_ATTRIBUTES = kf.struct('IPS_WLAN_SECURITY_ATTRIBUTES', { bSecurityEnabled: 'int32_t', bOneXEnabled: 'int32_t', dot11AuthAlgorithm: 'uint32_t', dot11CipherAlgorithm: 'uint32_t' });
  const WLAN_CONNECTION_ATTRIBUTES = kf.struct('IPS_WLAN_CONNECTION_ATTRIBUTES', {
    isState: 'uint32_t', wlanConnectionMode: 'uint32_t', strProfileName: kf.array('char16_t', 256, 'String'),
    wlanAssociationAttributes: WLAN_ASSOCIATION_ATTRIBUTES, wlanSecurityAttributes: WLAN_SECURITY_ATTRIBUTES,
  });
  T = { IP_ADDR_STRING, IP_ADAPTER_INFO, GUID, IP_ADAPTER_INDEX_MAP, WLAN_INTERFACE_INFO, WLAN_CONNECTION_ATTRIBUTES };
  return T;
}

export function guidString(g: { Data1: number; Data2: number; Data3: number; Data4: number[] }): string {
  const h = (n: number, w: number) => n.toString(16).padStart(w, '0');
  const d4 = g.Data4.map((b) => h(b, 2)).join('');
  return `{${h(g.Data1, 8)}-${h(g.Data2, 4)}-${h(g.Data3, 4)}-${d4.slice(0, 4)}-${d4.slice(4)}}`.toUpperCase();
}

export interface AdapterInfo {
  adapterName: string; description: string; mac: string | null; index: number; type: number; dhcpEnabled: boolean;
  ipv4: string | null; mask: string | null; gateway: string | null; dhcpServer: string | null;
  leaseObtained: number; leaseExpires: number;
}

const ip = (s: string) => (s && s !== '0.0.0.0' ? s : null);
/** Pure decode of one IP_ADAPTER_INFO record. */
export function toAdapter(r: K): AdapterInfo {
  const len = Math.min(r.AddressLength, 8);
  return {
    adapterName: r.AdapterName, description: r.Description,
    mac: len > 0 ? (r.Address as number[]).slice(0, len).map((b) => b.toString(16).padStart(2, '0')).join(':') : null,
    index: r.Index, type: r.Type, dhcpEnabled: r.DhcpEnabled !== 0,
    ipv4: ip(r.IpAddressList.IpAddress), mask: ip(r.IpAddressList.IpMask), gateway: ip(r.GatewayList.IpAddress),
    dhcpServer: ip(r.DhcpServer.IpAddress), leaseObtained: Number(r.LeaseObtained), leaseExpires: Number(r.LeaseExpires),
  };
}

let libs: { ip: K; wlan: K; f: Record<string, K> } | null = null;
function L() {
  if (process.platform !== 'win32') throw new BackendError('internal', NON_WINDOWS);
  if (libs) return libs;
  const kf = koffi();
  const t = types();
  const iph = kf.load('iphlpapi.dll');
  const wl = kf.load('wlanapi.dll');
  const f = {
    GetAdaptersInfo: iph.func('uint32_t __stdcall GetAdaptersInfo(void *buf, _Inout_ uint32_t *size)'),
    GetInterfaceInfo: iph.func('uint32_t __stdcall GetInterfaceInfo(void *buf, _Inout_ uint32_t *size)'),
    IpRenewAddress: iph.func('uint32_t __stdcall IpRenewAddress(void *map)'),
    WlanOpenHandle: wl.func('uint32_t __stdcall WlanOpenHandle(uint32_t ver, void *res, _Out_ uint32_t *neg, _Out_ void **h)'),
    WlanEnumInterfaces: wl.func('uint32_t __stdcall WlanEnumInterfaces(void *h, void *res, _Out_ void **list)'),
    WlanQueryInterface: wl.func(`uint32_t __stdcall WlanQueryInterface(void *h, ${'IPS_GUID'} *g, uint32_t op, void *res, _Out_ uint32_t *size, _Out_ void **data, void *vt)`),
    WlanFreeMemory: wl.func('void __stdcall WlanFreeMemory(void *p)'),
  };
  void t;
  libs = { ip: iph, wlan: wl, f };
  return libs;
}

export function getAdaptersInfo(): AdapterInfo[] {
  const { f } = L();
  const t = types();
  const size = [0];
  let rc = f.GetAdaptersInfo(null, size);
  if (rc !== ERROR_BUFFER_OVERFLOW && rc !== 0) return [];
  const buf = Buffer.alloc(size[0] + 1024);
  size[0] = buf.length;
  rc = f.GetAdaptersInfo(buf, size);
  if (rc !== 0) throw new BackendError('internal', `GetAdaptersInfo failed (${rc}).`);
  const out: AdapterInfo[] = [];
  let rec = koffi().decode(buf, t.IP_ADAPTER_INFO);
  for (let i = 0; rec && i < 64; i++) {
    out.push(toAdapter(rec));
    rec = rec.Next ? koffi().decode(rec.Next, t.IP_ADAPTER_INFO) : null;
  }
  return out;
}

/** IpRenewAddress for the adapter whose IP_ADAPTER_INDEX_MAP.Index matches. Runs on a koffi worker thread. */
export async function ipRenew(index: number): Promise<number> {
  const { f } = L();
  const size = [0];
  let rc = f.GetInterfaceInfo(null, size);
  if (rc !== ERROR_INSUFFICIENT_BUFFER && rc !== 0) throw new BackendError('refreshFailed', `GetInterfaceInfo failed (${rc}).`, 'dhcp');
  const buf = Buffer.alloc(size[0] + 260);
  size[0] = buf.length;
  rc = f.GetInterfaceInfo(buf, size);
  if (rc !== 0) throw new BackendError('refreshFailed', `GetInterfaceInfo failed (${rc}).`, 'dhcp');
  const n = buf.readInt32LE(0);
  for (let i = 0; i < n; i++) {
    const off = 4 + i * 260;
    if (buf.readUInt32LE(off) !== index) continue;
    const entry = buf.subarray(off, off + 260);
    return await new Promise<number>((res, rej) => f.IpRenewAddress.async(entry, (e: unknown, r: number) => (e ? rej(e) : res(r))));
  }
  throw new BackendError('refreshFailed', 'The Wi-Fi adapter was not found in the interface table.', 'dhcp');
}

export interface WlanInfo {
  guid: string; description: string; state: number; locationDenied: boolean;
  profile: string | null; ssid: string | null; bssid: string | null; phy: number | null; txKbps: number | null;
  auth: number | null; channel: number | null; rssi: number | null;
}

let wlanHandle: K = null;
export function wlanInterfaces(): WlanInfo[] {
  const { f } = L();
  const kf = koffi();
  const t = types();
  if (!wlanHandle) {
    const neg = [0];
    const h = [null];
    const rc = f.WlanOpenHandle(2, null, neg, h);
    if (rc !== 0) return [];
    wlanHandle = h[0];
  }
  const lp = [null];
  if (f.WlanEnumInterfaces(wlanHandle, null, lp) !== 0 || !lp[0]) return [];
  const out: WlanInfo[] = [];
  try {
    const n = kf.decode(lp[0], 'uint32_t');
    for (let i = 0; i < n; i++) {
      const ii = kf.decode(lp[0], 8 + i * kf.sizeof(t.WLAN_INTERFACE_INFO), t.WLAN_INTERFACE_INFO);
      const q = (op: number, type: K): { rc: number; v: K } => {
        const sz = [0];
        const d = [null];
        const rc = f.WlanQueryInterface(wlanHandle, ii.InterfaceGuid, op, null, sz, d, null);
        if (rc !== 0 || !d[0]) return { rc, v: null };
        try { return { rc, v: kf.decode(d[0], type) }; } finally { f.WlanFreeMemory(d[0]); }
      };
      const info: WlanInfo = {
        guid: guidString(ii.InterfaceGuid), description: ii.strInterfaceDescription, state: ii.isState, locationDenied: false,
        profile: null, ssid: null, bssid: null, phy: null, txKbps: null, auth: null, channel: null, rssi: null,
      };
      if (ii.isState === 1) {
        const c = q(7, t.WLAN_CONNECTION_ATTRIBUTES);
        if (c.rc === ERROR_ACCESS_DENIED) info.locationDenied = true;
        else if (c.v) {
          const a = c.v.wlanAssociationAttributes;
          info.profile = c.v.strProfileName || null;
          const len = Math.min(a.dot11Ssid.uSSIDLength, 32);
          info.ssid = len > 0 ? Buffer.from(a.dot11Ssid.ucSSID.slice(0, len)).toString('utf8') : null;
          info.bssid = (a.dot11Bssid as number[]).map((b) => b.toString(16).padStart(2, '0')).join(':');
          info.phy = a.dot11PhyType;
          info.txKbps = a.ulTxRate;
          info.auth = c.v.wlanSecurityAttributes.dot11AuthAlgorithm;
        }
        info.channel = q(8, 'uint32_t').v ?? null;
        info.rssi = q(0x10000102, 'int32_t').v ?? null;
      }
      out.push(info);
    }
  } finally {
    f.WlanFreeMemory(lp[0]);
  }
  return out;
}

export const PHY: Record<number, string> = { 4: '802.11a', 5: '802.11b', 6: '802.11g', 7: '802.11n', 8: '802.11ac', 9: '802.11ad', 10: '802.11ax', 11: '802.11be' };
export const AUTH: Record<number, string> = { 1: 'Open', 2: 'Shared Key', 3: 'WPA Enterprise', 4: 'WPA Personal', 6: 'WPA2 Enterprise', 7: 'WPA2 Personal', 8: 'WPA3 Enterprise 192', 9: 'WPA3 Personal', 10: 'OWE', 11: 'WPA3 Enterprise' };
/** Band from channel; ambiguous 6 GHz overlaps give null (never guess). */
export function band(channel: number | null, phy: number | null): '2.4GHz' | '5GHz' | '6GHz' | null {
  if (channel == null) return null;
  const c: string[] = [];
  if (channel >= 1 && channel <= 14) c.push('2.4GHz');
  if (channel >= 32 && channel <= 177) c.push('5GHz');
  if ((phy === 10 || phy === 11) && channel <= 233 && channel % 4 === 1) c.push('6GHz');
  return c.length === 1 ? (c[0] as '2.4GHz') : null;
}
