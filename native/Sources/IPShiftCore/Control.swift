import Foundation
import SystemConfiguration
import CoreWLAN
import Security

// MARK: - Engine dependency protocols

public protocol WifiControlling: Sendable {
    func setPower(_ on: Bool, interface: String) throws
}

public protocol DHCPRenewing: Sendable {
    /// Obtains (or reuses) admin authorization. Throws BridgeError authorizationDenied / authorizationFailed.
    func authorize() async throws
    /// Requests a DHCP refresh on the interface. Throws BridgeError refreshFailed.
    func refresh(interface: String) async throws
}

public protocol NetworkReading: Sendable {
    func readState() -> NetworkState
    func pathSatisfied() -> Bool
}

public protocol ConnectivityProbing: Sendable {
    func probe() async -> ProbeResult
    func publicIP(force: Bool) async -> PublicIPInfo
}

public protocol Clock: Sendable {
    func now() -> Date
    func sleep(ms: Int) async throws
}

// MARK: - Live implementations (these change network state — only ever called by SwitchEngine after switch.start)

public struct SystemClock: Clock {
    public init() {}
    public func now() -> Date { Date() }
    public func sleep(ms: Int) async throws { try await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000) }
}

public struct LiveWifiControl: WifiControlling {
    public init() {}
    public func setPower(_ on: Bool, interface: String) throws {
        guard let iface = CWWiFiClient.shared().interface(withName: interface) else {
            throw BridgeError(.noWifiInterface, "Wi-Fi interface \(interface) is no longer available.", stage: .wifi)
        }
        do { try iface.setPower(on) } catch {
            throw BridgeError(.powerToggleFailed,
                "macOS refused to turn Wi-Fi \(on ? "on" : "off") (\(error.localizedDescription)). If \"Require administrator authorization to turn Wi-Fi on or off\" is enabled in Wi-Fi settings, use Renew mode instead.",
                stage: .wifi)
        }
    }
}

public final class LiveDHCPRenewer: DHCPRenewing, @unchecked Sendable {
    public static let rightName = "system.services.systemconfiguration.network"
    private let lock = NSLock()
    private var authRef: AuthorizationRef? // kept for the app session to avoid re-prompting

    public init() {}

    public func authorize() async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            DispatchQueue.global(qos: .userInitiated).async {
                do { try self.authorizeSync(); cont.resume() } catch { cont.resume(throwing: error) }
            }
        }
    }

    private func authorizeSync() throws {
        lock.lock(); defer { lock.unlock() }
        if authRef == nil {
            var ref: AuthorizationRef?
            let st = AuthorizationCreate(nil, nil, [], &ref)
            guard st == errAuthorizationSuccess, let ref else {
                throw BridgeError(.authorizationFailed, "Could not create an authorization session (\(st)). No changes were made.", stage: .dhcp)
            }
            authRef = ref
        }
        let flags: AuthorizationFlags = [.interactionAllowed, .extendRights, .preAuthorize]
        let status: OSStatus = Self.rightName.withCString { cname in
            var item = AuthorizationItem(name: cname, valueLength: 0, value: nil, flags: 0)
            return withUnsafeMutablePointer(to: &item) { ip in
                var rights = AuthorizationRights(count: 1, items: ip)
                return AuthorizationCopyRights(authRef!, &rights, nil, flags, nil)
            }
        }
        switch status {
        case errAuthorizationSuccess: return
        case errAuthorizationCanceled, errAuthorizationDenied, errAuthorizationInteractionNotAllowed:
            throw BridgeError(.authorizationDenied, "Authorization cancelled — no changes were made.", stage: .dhcp)
        default:
            throw BridgeError(.authorizationFailed, "macOS could not authorize the request (\(status)). No changes were made.", stage: .dhcp)
        }
    }

    public func refresh(interface: String) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            DispatchQueue.global(qos: .userInitiated).async {
                do { try self.refreshSync(interface); cont.resume() } catch { cont.resume(throwing: error) }
            }
        }
    }

    private func refreshSync(_ interface: String) throws {
        lock.lock(); let ref = authRef; lock.unlock()
        guard let ref else { throw BridgeError(.authorizationFailed, "Not authorized.", stage: .dhcp) }
        guard let prefs = SCPreferencesCreateWithAuthorization(nil, "IPShift" as CFString, nil, ref) else {
            throw BridgeError(.refreshFailed, "Could not open network preferences: \(Self.scError())", stage: .dhcp)
        }
        guard let services = SCNetworkServiceCopyAll(prefs) as? [SCNetworkService] else {
            throw BridgeError(.refreshFailed, "Could not list network services: \(Self.scError())", stage: .dhcp)
        }
        guard let target = services.compactMap({ SCNetworkServiceGetInterface($0) })
            .first(where: { (SCNetworkInterfaceGetBSDName($0) as String?) == interface }) else {
            throw BridgeError(.refreshFailed, "No network service is configured for \(interface).", stage: .dhcp)
        }
        if !SCNetworkInterfaceForceConfigurationRefresh(target) {
            throw BridgeError(.refreshFailed, "macOS could not refresh the DHCP lease: \(Self.scError())", stage: .dhcp)
        }
    }

    static func scError() -> String { String(cString: SCErrorString(SCError())) }
}

public struct LiveNetworkReader: NetworkReading {
    public init() {}
    public func readState() -> NetworkState { SnapshotBuilder.state() }
    public func pathSatisfied() -> Bool { PathWatcher.shared.status == "satisfied" }
}

public struct LiveConnectivity: ConnectivityProbing {
    let publicIPService: PublicIPService
    let settings: @Sendable () -> Settings
    public init(publicIPService: PublicIPService, settings: @escaping @Sendable () -> Settings) {
        self.publicIPService = publicIPService; self.settings = settings
    }
    public func probe() async -> ProbeResult { await CaptiveProbe.run() }
    public func publicIP(force: Bool) async -> PublicIPInfo {
        let s = settings()
        return await publicIPService.lookup(provider: s.publicIPProvider, enabled: s.publicIPLookup, force: force)
    }
}
