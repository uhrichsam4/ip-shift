import Foundation
import CoreLocation
import CoreWLAN
import SystemConfiguration

// MARK: - Location permission (only used so macOS reveals the SSID)

public final class LocationAuthority: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    private let manager = CLLocationManager()
    private var waiters: [(LocationAuthorization) -> Void] = []
    public var onChange: ((LocationAuthorization) -> Void)?

    public override init() {
        super.init()
        manager.delegate = self
    }

    public static func map(_ s: CLAuthorizationStatus) -> LocationAuthorization {
        switch s {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        case .restricted: return .restricted
        case .authorizedAlways, .authorized: return .authorized
        @unknown default: return .notDetermined
        }
    }

    public var status: LocationAuthorization { Self.map(manager.authorizationStatus) }

    /// Must be called on the main thread.
    public func request(_ done: @escaping (LocationAuthorization) -> Void) {
        let current = status
        guard current == .notDetermined else { done(current); return }
        waiters.append(done)
        if manager.responds(to: #selector(CLLocationManager.requestWhenInUseAuthorization)) {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestAlwaysAuthorization()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in self?.flush() }
    }

    private func flush() {
        let s = status
        let w = waiters; waiters = []
        w.forEach { $0(s) }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let s = status
        onChange?(s)
        if s != .notDetermined { flush() }
    }
}

// MARK: - Diagnostics

public enum Diagnostics {
    public static func run(location: LocationAuthorization, publicIP: @escaping () async -> PublicIPInfo) async -> DiagnosticReport {
        var checks: [DiagnosticCheck] = []
        func timed(_ id: String, _ label: String, _ body: () async -> (String, String)) async {
            let t = Date()
            let (status, detail) = await body()
            checks.append(DiagnosticCheck(id: id, label: label, status: status, detail: detail, durationMs: Int(Date().timeIntervalSince(t) * 1000)))
        }
        let wifiID = WifiDetector.detect()
        let snap = SnapshotBuilder.build(location: location, connectivity: ConnectivityInfo(path: PathWatcher.shared.status, internet: "unknown", lastProbe: nil), publicIP: .pending)
        let wifi = snap.wifi

        await timed("interface", "Wi-Fi interface") {
            wifiID.map { ("pass", "\($0.displayName) (\($0.bsdName))") } ?? ("fail", "No Wi-Fi interface detected")
        }
        await timed("power", "Wi-Fi power") {
            guard let wifi else { return ("skipped", "No Wi-Fi interface") }
            return wifi.powerOn ? ("pass", "Wi-Fi is on") : ("fail", "Wi-Fi is off")
        }
        await timed("association", "Network association") {
            guard let wifi else { return ("skipped", "No Wi-Fi interface") }
            guard wifi.associated else { return ("fail", "Not connected to a Wi-Fi network") }
            let rssi = wifi.rssi.map { ", signal \($0) dBm" } ?? ""
            return ("pass", (wifi.ssid ?? "Connected (name hidden by macOS)") + rssi)
        }
        await timed("ipv4", "IPv4 address") {
            guard let a = snap.ipv4.address else { return ("fail", "No IPv4 address assigned") }
            return snap.ipv4.isSelfAssigned ? ("fail", "\(a) is self-assigned — the router did not answer DHCP") : ("pass", a)
        }
        await timed("dhcpLease", "DHCP lease") {
            switch snap.dhcp.status {
            case "bound":
                var d = "Bound"
                if let s = snap.dhcp.serverIdentifier { d += " from \(s)" }
                if let e = snap.dhcp.leaseExpires { d += ", expires \(e)" }
                return ("pass", d)
            case "selfAssigned": return ("fail", "No lease (self-assigned address)")
            case "unknown": return ("warn", "Address present but lease details unavailable")
            default: return ("fail", "No DHCP lease")
            }
        }
        await timed("router", "Router reachable") {
            guard let r = snap.ipv4.router else { return ("fail", "No router address") }
            let res = await RouterPing.ping(r)
            return (res.ok ? "pass" : "warn", res.detail)
        }
        await timed("dns", "DNS resolution") {
            let r = await DNSCheck.resolve("apple.com")
            return (r.ok ? "pass" : "fail", r.detail)
        }
        await timed("internet", "Internet") {
            let p = await CaptiveProbe.run()
            switch p.outcome {
            case .online: return ("pass", "Online" + (p.latencyMs.map { " · \($0) ms" } ?? ""))
            case .captive: return ("warn", "A captive portal (sign-in page) is intercepting traffic")
            case .offline: return ("fail", "captive.apple.com could not be reached")
            }
        }
        await timed("publicIP", "Public IP") {
            let p = await publicIP()
            switch p.status {
            case "ok": return ("pass", "\(p.address ?? "") via \(p.provider ?? "")")
            case "disabled": return ("skipped", "Public IP lookup is turned off in Settings")
            default: return ("warn", p.error ?? "Lookup failed")
            }
        }
        await timed("location", "Location permission") {
            switch location {
            case .authorized: return ("pass", "Granted — the network name can be shown")
            case .notDetermined: return ("warn", "Not requested — the network name is hidden by macOS")
            case .denied: return ("warn", "Denied — the network name is hidden by macOS")
            case .restricted: return ("warn", "Restricted by a system policy")
            }
        }
        return DiagnosticReport(ranAt: ISO8601.string(Date()), checks: checks)
    }
}

// MARK: - Live change monitor (SCDynamicStore + CoreWLAN + NWPathMonitor), debounced 250 ms

public final class NetworkChangeMonitor: NSObject, CWEventDelegate, @unchecked Sendable {
    private var store: SCDynamicStore?
    private var source: CFRunLoopSource?
    private var pending: DispatchWorkItem?
    private let handler: () -> Void

    public init(handler: @escaping () -> Void) {
        self.handler = handler
        super.init()
    }

    /// Call on the main thread.
    public func start() {
        let ifname = WifiDetector.detect()?.bsdName
        var ctx = SCDynamicStoreContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let cb: SCDynamicStoreCallBack = { _, _, info in
            guard let info else { return }
            Unmanaged<NetworkChangeMonitor>.fromOpaque(info).takeUnretainedValue().trigger()
        }
        store = SCDynamicStoreCreate(nil, "IPShift.monitor" as CFString, cb, &ctx)
        if let store {
            var keys = ["State:/Network/Global/IPv4"]
            var patterns = ["State:/Network/Service/.*/DHCP", "State:/Network/Service/.*/IPv4"]
            if let ifname {
                keys += ["State:/Network/Interface/\(ifname)/IPv4", "State:/Network/Interface/\(ifname)/Link", "State:/Network/Interface/\(ifname)/AirPort"]
            } else {
                patterns.append("State:/Network/Interface/.*/(IPv4|Link|AirPort)")
            }
            SCDynamicStoreSetNotificationKeys(store, keys as CFArray, patterns as CFArray)
            source = SCDynamicStoreCreateRunLoopSource(nil, store, 0)
            if let source { CFRunLoopAddSource(CFRunLoopGetMain(), source, .defaultMode) }
        }
        let client = CWWiFiClient.shared()
        client.delegate = self
        for ev in [CWEventType.powerDidChange, .ssidDidChange, .bssidDidChange, .linkDidChange, .modeDidChange] {
            try? client.startMonitoringEvent(with: ev)
        }
        PathWatcher.shared.onChange { [weak self] _ in DispatchQueue.main.async { self?.trigger() } }
    }

    public func trigger() {
        DispatchQueue.main.async {
            self.pending?.cancel()
            let w = DispatchWorkItem { [weak self] in self?.handler() }
            self.pending = w
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: w)
        }
    }

    public func powerStateDidChangeForWiFiInterface(withName interfaceName: String) { trigger() }
    public func ssidDidChangeForWiFiInterface(withName interfaceName: String) { trigger() }
    public func bssidDidChangeForWiFiInterface(withName interfaceName: String) { trigger() }
    public func linkDidChangeForWiFiInterface(withName interfaceName: String) { trigger() }
}
