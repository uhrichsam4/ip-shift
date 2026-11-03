import Foundation
import SystemConfiguration
import CoreWLAN

/// Detected Wi-Fi hardware interface (never assumed en0).
public struct WifiInterfaceID: Sendable, Equatable {
    public var bsdName: String
    public var displayName: String
}

public enum WifiDetector {
    public static func detect() -> WifiInterfaceID? {
        let cwNames = Set(CWWiFiClient.shared().interfaceNames() ?? [])
        var found: [WifiInterfaceID] = []
        if let all = SCNetworkInterfaceCopyAll() as? [SCNetworkInterface] {
            for iface in all {
                guard let type = SCNetworkInterfaceGetInterfaceType(iface), type == kSCNetworkInterfaceTypeIEEE80211,
                      let bsd = SCNetworkInterfaceGetBSDName(iface) as String? else { continue }
                let name = (SCNetworkInterfaceGetLocalizedDisplayName(iface) as String?) ?? "Wi-Fi"
                found.append(WifiInterfaceID(bsdName: bsd, displayName: name))
            }
        }
        if let match = found.first(where: { cwNames.contains($0.bsdName) }) { return match }
        if let first = found.first { return first }
        if let n = cwNames.sorted().first { return WifiInterfaceID(bsdName: n, displayName: "Wi-Fi") }
        return nil
    }
}

/// Read-only access to SCDynamicStore.
public final class DynamicStore: @unchecked Sendable {
    public static let shared = DynamicStore()
    private let store: SCDynamicStore?
    private init() { store = SCDynamicStoreCreate(nil, "IPShift.reader" as CFString, nil, nil) }

    public func dict(_ key: String) -> [String: Any]? {
        guard let store else { return nil }
        return SCDynamicStoreCopyValue(store, key as CFString) as? [String: Any]
    }
    public func keys(_ pattern: String) -> [String] {
        guard let store else { return [] }
        return (SCDynamicStoreCopyKeyList(store, pattern as CFString) as? [String]) ?? []
    }

    public func globalIPv4() -> (router: String?, primaryInterface: String?, primaryService: String?) {
        let d = dict("State:/Network/Global/IPv4")
        return (d?["Router"] as? String, d?["PrimaryInterface"] as? String, d?["PrimaryService"] as? String)
    }

    public func interfaceIPv4(_ ifname: String) -> (address: String?, mask: String?) {
        let d = dict("State:/Network/Interface/\(ifname)/IPv4")
        return ((d?["Addresses"] as? [String])?.first, (d?["SubnetMasks"] as? [String])?.first)
    }

    public func linkActive(_ ifname: String) -> Bool? {
        dict("State:/Network/Interface/\(ifname)/Link")?["Active"] as? Bool
    }

    /// Service ID whose IPv4 state is bound to this interface (not only the primary service).
    public func serviceID(for ifname: String) -> String? {
        for key in keys("State:/Network/Service/[^/]+/IPv4") {
            if let d = dict(key), d["InterfaceName"] as? String == ifname {
                let comps = key.split(separator: "/")
                if comps.count >= 4 { return String(comps[3]) }
            }
        }
        let g = globalIPv4()
        return g.primaryInterface == ifname ? g.primaryService : nil
    }

    public func serviceRouter(_ serviceID: String) -> String? {
        dict("State:/Network/Service/\(serviceID)/IPv4")?["Router"] as? String
    }

    public func dhcp(serviceID: String) -> DHCPOptions.Parsed? {
        guard let d = dict("State:/Network/Service/\(serviceID)/DHCP") else { return nil }
        return DHCPOptions.parse(d)
    }
}

public enum IPv6Reader {
    public static func addresses(_ ifname: String) -> [String] {
        var out: [String] = []
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(head) }
        var p: UnsafeMutablePointer<ifaddrs>? = first
        while let cur = p {
            defer { p = cur.pointee.ifa_next }
            guard String(cString: cur.pointee.ifa_name) == ifname, let sa = cur.pointee.ifa_addr,
                  sa.pointee.sa_family == UInt8(AF_INET6) else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                out.append(String(cString: host))
            }
        }
        return out
    }
}

public enum WifiDetailsReader {
    static func bandString(_ b: CWChannelBand) -> String? {
        switch b {
        case .band2GHz: return "2.4GHz"
        case .band5GHz: return "5GHz"
        case .band6GHz: return "6GHz"
        default: return nil
        }
    }
    static func widthMHz(_ w: CWChannelWidth) -> Int? {
        switch w {
        case .width20MHz: return 20
        case .width40MHz: return 40
        case .width80MHz: return 80
        case .width160MHz: return 160
        default: return nil
        }
    }
    static func securityString(_ s: CWSecurity) -> String? {
        switch s {
        case .none: return "Open"
        case .WEP: return "WEP"
        case .wpaPersonal: return "WPA Personal"
        case .wpaPersonalMixed: return "WPA/WPA2 Personal"
        case .wpa2Personal: return "WPA2 Personal"
        case .personal: return "Personal"
        case .dynamicWEP: return "Dynamic WEP"
        case .wpaEnterprise: return "WPA Enterprise"
        case .wpaEnterpriseMixed: return "WPA/WPA2 Enterprise"
        case .wpa2Enterprise: return "WPA2 Enterprise"
        case .enterprise: return "Enterprise"
        case .wpa3Personal: return "WPA3 Personal"
        case .wpa3Enterprise: return "WPA3 Enterprise"
        case .wpa3Transition: return "WPA2/WPA3 Personal"
        case .OWE: return "OWE"
        case .oweTransition: return "OWE Transition"
        default: return nil
        }
    }
    static func phyString(_ p: CWPHYMode) -> String? {
        switch p {
        case .mode11a: return "802.11a"
        case .mode11b: return "802.11b"
        case .mode11g: return "802.11g"
        case .mode11n: return "802.11n"
        case .mode11ac: return "802.11ac"
        case .mode11ax: return "802.11ax"
        default:
            return p.rawValue == 7 ? "802.11be" : nil
        }
    }

    public static func isAssociated(_ ifname: String) -> Bool {
        guard let iface = CWWiFiClient.shared().interface(withName: ifname), iface.powerOn() else { return false }
        if let link = DynamicStore.shared.linkActive(ifname) { return link && iface.wlanChannel() != nil }
        return iface.serviceActive() || iface.wlanChannel() != nil
    }

    public static func read(_ id: WifiInterfaceID, location: LocationAuthorization) -> WifiInfo {
        let iface = CWWiFiClient.shared().interface(withName: id.bsdName)
        let power = iface?.powerOn() ?? false
        let associated = isAssociated(id.bsdName)
        let ssid = associated ? iface?.ssid() : nil
        let availability: String
        if !associated { availability = "notAssociated" }
        else if ssid != nil { availability = "available" }
        else if location != .authorized { availability = "needsLocationPermission" }
        else { availability = "unknown" }
        let ch = associated ? iface?.wlanChannel() : nil
        let rssi = associated ? iface?.rssiValue() : nil
        let noise = associated ? iface?.noiseMeasurement() : nil
        let tx = associated ? iface?.transmitRate() : nil
        return WifiInfo(
            interfaceName: id.bsdName,
            hardwarePort: id.displayName,
            powerOn: power,
            associated: associated,
            ssid: ssid,
            ssidAvailability: availability,
            bssid: associated ? iface?.bssid() : nil,
            rssi: (rssi.map { $0 == 0 ? nil : $0 }) ?? nil,
            noise: (noise.map { $0 == 0 ? nil : $0 }) ?? nil,
            txRateMbps: (tx.map { $0 > 0 ? $0 : nil }) ?? nil,
            channel: ch.map { $0.channelNumber },
            band: ch.flatMap { bandString($0.channelBand) },
            channelWidthMHz: ch.flatMap { widthMHz($0.channelWidth) },
            security: associated ? iface.flatMap { securityString($0.security()) } : nil,
            phyMode: associated ? iface.flatMap { phyString($0.activePHYMode()) } : nil,
            hardwareAddress: iface?.hardwareAddress()
        )
    }

    public static func metrics(_ ifname: String) -> WifiMetrics {
        let iface = CWWiFiClient.shared().interface(withName: ifname)
        let ok = iface?.powerOn() == true && iface?.wlanChannel() != nil
        let r = ok ? iface?.rssiValue() : nil
        let n = ok ? iface?.noiseMeasurement() : nil
        let t = ok ? iface?.transmitRate() : nil
        return WifiMetrics(at: ISO8601.string(Date()),
                           rssi: (r.map { $0 == 0 ? nil : $0 }) ?? nil,
                           noise: (n.map { $0 == 0 ? nil : $0 }) ?? nil,
                           txRateMbps: (t.map { $0 > 0 ? $0 : nil }) ?? nil)
    }
}

/// Lightweight state used by the switch engine.
public struct NetworkState: Sendable, Equatable {
    public var interfaceName: String?
    public var powerOn: Bool
    public var associated: Bool
    public var ssid: String?
    public var ipv4: String?
    public var router: String?
    public var leaseStart: Date?
    public var dhcpServer: String?
    public init(interfaceName: String?, powerOn: Bool, associated: Bool, ssid: String?, ipv4: String?, router: String?, leaseStart: Date?, dhcpServer: String?) {
        self.interfaceName = interfaceName; self.powerOn = powerOn; self.associated = associated; self.ssid = ssid
        self.ipv4 = ipv4; self.router = router; self.leaseStart = leaseStart; self.dhcpServer = dhcpServer
    }
}

/// Builds full snapshots from live system APIs (read-only).
public enum SnapshotBuilder {
    public static func build(location: LocationAuthorization, connectivity: ConnectivityInfo, publicIP: PublicIPInfo) -> NetworkSnapshot {
        let store = DynamicStore.shared
        let global = store.globalIPv4()
        let wifiID = WifiDetector.detect()
        let wifi = wifiID.map { WifiDetailsReader.read($0, location: location) }

        var ipv4 = IPv4Info(address: nil, subnetMask: nil, router: nil, isSelfAssigned: false)
        var dhcp = DhcpInfo(status: "none", serverIdentifier: nil, leaseStart: nil, leaseExpires: nil, leaseSeconds: nil, dns: [])
        var ipv6: [String] = []
        if let ifname = wifiID?.bsdName {
            let a = store.interfaceIPv4(ifname)
            ipv4.address = a.address
            ipv4.subnetMask = a.mask
            ipv4.isSelfAssigned = IPValidator.isSelfAssigned(a.address)
            let sid = store.serviceID(for: ifname)
            ipv4.router = sid.flatMap { store.serviceRouter($0) } ?? (global.primaryInterface == ifname ? global.router : nil)
            ipv6 = IPv6Reader.addresses(ifname)
            if ipv4.isSelfAssigned {
                dhcp.status = "selfAssigned"
            } else if let sid, let p = store.dhcp(serviceID: sid) {
                dhcp.status = a.address != nil ? "bound" : "unknown"
                dhcp.serverIdentifier = p.serverIdentifier
                dhcp.leaseStart = ISO8601.opt(p.leaseStart)
                dhcp.leaseExpires = ISO8601.opt(p.leaseExpires)
                dhcp.leaseSeconds = p.leaseSeconds
                dhcp.dns = p.dns
                if ipv4.subnetMask == nil { ipv4.subnetMask = p.subnetMask }
                if ipv4.router == nil { ipv4.router = p.router }
            } else if a.address != nil {
                dhcp.status = "unknown"
            }
        }
        return NetworkSnapshot(
            capturedAt: ISO8601.string(Date()),
            wifi: wifi, ipv4: ipv4, ipv6: ipv6, dhcp: dhcp,
            connectivity: connectivity, publicIP: publicIP,
            primaryInterface: global.primaryInterface,
            macOSVersion: macOSVersionString(),
            locationAuthorization: location
        )
    }

    public static func state() -> NetworkState {
        let store = DynamicStore.shared
        guard let id = WifiDetector.detect() else {
            return NetworkState(interfaceName: nil, powerOn: false, associated: false, ssid: nil, ipv4: nil, router: nil, leaseStart: nil, dhcpServer: nil)
        }
        let iface = CWWiFiClient.shared().interface(withName: id.bsdName)
        let assoc = WifiDetailsReader.isAssociated(id.bsdName)
        let addr = store.interfaceIPv4(id.bsdName).address
        let sid = store.serviceID(for: id.bsdName)
        let dh = sid.flatMap { store.dhcp(serviceID: $0) }
        return NetworkState(
            interfaceName: id.bsdName,
            powerOn: iface?.powerOn() ?? false,
            associated: assoc,
            ssid: assoc ? iface?.ssid() : nil,
            ipv4: addr,
            router: sid.flatMap { store.serviceRouter($0) } ?? dh?.router,
            leaseStart: dh?.leaseStart,
            dhcpServer: dh?.serverIdentifier
        )
    }
}
