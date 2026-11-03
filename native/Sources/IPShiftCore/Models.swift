import Foundation

// Mirrors web/src/bridge/protocol.ts exactly. camelCase JSON, ISO-8601 strings, null for unknowns.
// `@Nullable` fields always encode (null when unknown). Plain optionals (`error?`, `failure?`, `data?`, `stage?`) are omitted when nil.

public typealias ISODate = String

@propertyWrapper
public struct Nullable<T: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
    public var wrappedValue: T?
    public init(wrappedValue: T?) { self.wrappedValue = wrappedValue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        wrappedValue = c.decodeNil() ? nil : try c.decode(T.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        if let v = wrappedValue { try c.encode(v) } else { try c.encodeNil() }
    }
}

extension KeyedDecodingContainer {
    public func decode<T>(_ type: Nullable<T>.Type, forKey key: Key) throws -> Nullable<T> {
        try decodeIfPresent(type, forKey: key) ?? Nullable(wrappedValue: nil)
    }
}

public enum ISO8601 {
    nonisolated(unsafe) private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()
    private static let lock = NSLock()
    public static func string(_ d: Date) -> String { lock.lock(); defer { lock.unlock() }; return formatter.string(from: d) }
    public static func opt(_ d: Date?) -> String? { d.map { string($0) } }
    public static func date(_ s: String) -> Date? {
        lock.lock(); defer { lock.unlock() }
        if let d = formatter.date(from: s) { return d }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}

// MARK: - Errors

public enum ErrorCode: String, Codable, Sendable {
    case busy, noWifiInterface, wifiOff, notAssociated, authorizationDenied, authorizationFailed
    case refreshFailed, powerToggleFailed, timeout, cancelled, invalidArgument, unknownCommand, `internal`
}

public enum StageId: String, Codable, Sendable { case initialise, wifi, dhcp, reconnect, results }
public enum StageState: String, Codable, Sendable { case active, done, skipped, failed }
public enum SwitchMode: String, Codable, Sendable { case renew, reconnect }
public enum Outcome: String, Codable, Sendable { case changed, unchanged, failed, cancelled }

public struct BridgeError: Codable, Sendable, Error, Equatable {
    public var code: ErrorCode
    public var message: String
    public var stage: StageId?
    public init(_ code: ErrorCode, _ message: String, stage: StageId? = nil) {
        self.code = code; self.message = message; self.stage = stage
    }
}

// MARK: - Network

public enum LocationAuthorization: String, Codable, Sendable { case notDetermined, denied, restricted, authorized }

public struct WifiInfo: Codable, Sendable, Equatable {
    public var interfaceName: String
    public var hardwarePort: String
    public var powerOn: Bool
    public var associated: Bool
    @Nullable public var ssid: String?
    public var ssidAvailability: String // available | needsLocationPermission | notAssociated | unknown
    @Nullable public var bssid: String?
    @Nullable public var rssi: Int?
    @Nullable public var noise: Int?
    @Nullable public var txRateMbps: Double?
    @Nullable public var channel: Int?
    @Nullable public var band: String?
    @Nullable public var channelWidthMHz: Int?
    @Nullable public var security: String?
    @Nullable public var phyMode: String?
    @Nullable public var hardwareAddress: String?
}

public struct IPv4Info: Codable, Sendable, Equatable {
    @Nullable public var address: String?
    @Nullable public var subnetMask: String?
    @Nullable public var router: String?
    public var isSelfAssigned: Bool
}

public struct DhcpInfo: Codable, Sendable, Equatable {
    public var status: String // bound | selfAssigned | none | unknown
    @Nullable public var serverIdentifier: String?
    @Nullable public var leaseStart: ISODate?
    @Nullable public var leaseExpires: ISODate?
    @Nullable public var leaseSeconds: Int?
    public var dns: [String]
}

public struct PublicIPInfo: Codable, Sendable, Equatable {
    public var status: String // ok | pending | disabled | error
    @Nullable public var address: String?
    @Nullable public var provider: String?
    @Nullable public var fetchedAt: ISODate?
    public var error: String?
    public static let disabled = PublicIPInfo(status: "disabled", address: nil, provider: nil, fetchedAt: nil)
    public static let pending = PublicIPInfo(status: "pending", address: nil, provider: nil, fetchedAt: nil)
}

public struct ProbeRecord: Codable, Sendable, Equatable {
    public var ok: Bool
    @Nullable public var latencyMs: Int?
    public var at: ISODate
    public var target: String
}

public struct ConnectivityInfo: Codable, Sendable, Equatable {
    public var path: String // satisfied | unsatisfied | requiresConnection | unknown
    public var internet: String // online | offline | captive | checking | unknown
    @Nullable public var lastProbe: ProbeRecord?
    public init(path: String, internet: String, lastProbe: ProbeRecord?) {
        self.path = path; self.internet = internet; self.lastProbe = lastProbe
    }
}

public struct NetworkSnapshot: Codable, Sendable, Equatable {
    public var capturedAt: ISODate
    @Nullable public var wifi: WifiInfo?
    public var ipv4: IPv4Info
    public var ipv6: [String]
    public var dhcp: DhcpInfo
    public var connectivity: ConnectivityInfo
    public var publicIP: PublicIPInfo
    @Nullable public var primaryInterface: String?
    public var macOSVersion: String
    public var locationAuthorization: LocationAuthorization
}

public struct WifiMetrics: Codable, Sendable, Equatable {
    public var at: ISODate
    @Nullable public var rssi: Int?
    @Nullable public var noise: Int?
    @Nullable public var txRateMbps: Double?
}

// MARK: - Operation

public enum JSONScalar: Codable, Sendable, Equatable {
    case string(String), number(Double), bool(Bool), null
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let d = try? c.decode(Double.self) { self = .number(d) }
        else { self = .string(try c.decode(String.self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let d): try c.encode(d)
        case .bool(let b): try c.encode(b)
        case .null: try c.encodeNil()
        }
    }
    public static func of(_ s: String?) -> JSONScalar { s.map { .string($0) } ?? .null }
}

public struct OperationEvent: Codable, Sendable, Equatable {
    public var operationId: String
    public var seq: Int
    public var at: ISODate
    public var stage: StageId
    public var state: StageState
    public var phase: String
    public var message: String
    public var data: [String: JSONScalar]?
}

public struct OperationFailure: Codable, Sendable, Equatable {
    public var stage: StageId
    public var code: ErrorCode
    public var message: String
}

public struct OperationResult: Codable, Sendable, Equatable {
    public var id: String
    public var mode: SwitchMode
    @Nullable public var interfaceName: String?
    @Nullable public var ssid: String?
    public var startedAt: ISODate
    public var finishedAt: ISODate
    public var durationMs: Int
    @Nullable public var previousIP: String?
    @Nullable public var currentIP: String?
    public var outcome: Outcome
    public var leaseRenewed: Bool
    @Nullable public var leaseStart: ISODate?
    @Nullable public var dhcpServer: String?
    public var internet: String // restored | unavailable | notChecked
    @Nullable public var internetLatencyMs: Int?
    @Nullable public var publicIPBefore: String?
    @Nullable public var publicIPAfter: String?
    public var failure: OperationFailure?
}

public typealias HistoryEntry = OperationResult

// MARK: - Graphics (Settings → Graphics). Defaults = 'balanced' preset in web/src/state/graphics.ts.

public struct GraphicsSettings: Codable, Sendable, Equatable {
    public var antiAliasing: String = "smaa"
    public var renderScale: Double = 0.75
    public var frameRateCap: Int = 60
    public var shadows: String = "medium"
    public var ambientOcclusion: String = "off"
    public var reflections: String = "off"
    public var bloom: String = "high"
    public var depthOfField: String = "sequence"
    public var volumetrics: String = "low"
    public var particles: String = "medium"
    public var textureFiltering: Int = 8
    public var chromaticAberration: Bool = true
    public var filmGrain: Bool = true
    public var vignette: Bool = true
    public var toneMapping: String = "aces"
    public var showFps: Bool = false

    public init() {}

    public static let enums: [String: Set<String>] = [
        "antiAliasing": ["off", "fxaa", "smaa", "msaa2", "msaa4", "msaa8"],
        "shadows": ["off", "low", "medium", "high"],
        "ambientOcclusion": ["off", "low", "high"],
        "reflections": ["off", "low", "high"],
        "bloom": ["off", "low", "high"],
        "depthOfField": ["off", "sequence", "always"],
        "volumetrics": ["off", "low", "high"],
        "particles": ["low", "medium", "high", "ultra"],
        "toneMapping": ["aces", "agx", "neutral"],
    ]
    public static let frameRateCaps: Set<Int> = [0, 30, 60, 120]
    public static let textureFilterings: Set<Int> = [1, 2, 4, 8, 16]
    static let stringKeys: [String: WritableKeyPath<GraphicsSettings, String>] = [
        "antiAliasing": \.antiAliasing, "shadows": \.shadows, "ambientOcclusion": \.ambientOcclusion,
        "reflections": \.reflections, "bloom": \.bloom, "depthOfField": \.depthOfField,
        "volumetrics": \.volumetrics, "particles": \.particles, "toneMapping": \.toneMapping,
    ]
    static let boolKeys: [String: WritableKeyPath<GraphicsSettings, Bool>] = [
        "chromaticAberration": \.chromaticAberration, "filmGrain": \.filmGrain, "vignette": \.vignette, "showFps": \.showFps,
    ]

    static func clampScale(_ v: Double) -> Double { min(1.0, max(0.5, v)) }

    // Tolerant decode: missing/invalid fields fall back to defaults.
    public init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        for (k, kp) in Self.stringKeys {
            if let key = CodingKeys(stringValue: k), let v = try? c.decode(String.self, forKey: key), Self.enums[k]!.contains(v) { self[keyPath: kp] = v }
        }
        for (k, kp) in Self.boolKeys {
            if let key = CodingKeys(stringValue: k), let v = try? c.decode(Bool.self, forKey: key) { self[keyPath: kp] = v }
        }
        if let v = try? c.decode(Double.self, forKey: .renderScale), v.isFinite { renderScale = Self.clampScale(v) }
        if let v = try? c.decode(Int.self, forKey: .frameRateCap), Self.frameRateCaps.contains(v) { frameRateCap = v }
        if let v = try? c.decode(Int.self, forKey: .textureFiltering), Self.textureFilterings.contains(v) { textureFiltering = v }
    }

    private static func isBool(_ v: Any) -> Bool { CFGetTypeID(v as CFTypeRef) == CFBooleanGetTypeID() }

    /// Partial merge from untrusted JSON. Throws invalidArgument on unknown keys or invalid values.
    public func applying(_ patch: [String: Any]) throws -> GraphicsSettings {
        var g = self
        for (k, v) in patch {
            if let kp = Self.stringKeys[k] {
                guard let s = v as? String, Self.enums[k]!.contains(s) else { throw BridgeError(.invalidArgument, "Invalid value for graphics.\(k).") }
                g[keyPath: kp] = s
            } else if let kp = Self.boolKeys[k] {
                guard Self.isBool(v), let b = v as? Bool else { throw BridgeError(.invalidArgument, "graphics.\(k) must be a boolean.") }
                g[keyPath: kp] = b
            } else if k == "renderScale" {
                guard !Self.isBool(v), let n = v as? NSNumber, n.doubleValue.isFinite else { throw BridgeError(.invalidArgument, "graphics.renderScale must be a number.") }
                g.renderScale = Self.clampScale(n.doubleValue)
            } else if k == "frameRateCap" || k == "textureFiltering" {
                let allowed = k == "frameRateCap" ? Self.frameRateCaps : Self.textureFilterings
                guard !Self.isBool(v), let n = v as? NSNumber, n.doubleValue == n.doubleValue.rounded(),
                      allowed.contains(n.intValue) else { throw BridgeError(.invalidArgument, "Invalid value for graphics.\(k).") }
                if k == "frameRateCap" { g.frameRateCap = n.intValue } else { g.textureFiltering = n.intValue }
            } else {
                throw BridgeError(.invalidArgument, "Unknown graphics setting '\(k)'.")
            }
        }
        return g
    }
}

// MARK: - Settings

public struct Settings: Codable, Sendable, Equatable {
    public var mode: SwitchMode = .renew
    public var confirmBeforeSwitch: Bool = true
    public var publicIPLookup: Bool = true
    public var publicIPProvider: String = "cloudflare" // cloudflare | ipify
    public var quality: String = "auto" // auto | low | balanced | high | ultra | custom
    public var graphics: GraphicsSettings = GraphicsSettings()
    public var reducedMotion: String = "system" // system | on | off
    public var theme: String = "midnight" // midnight | graphite | aurora
    public var sound: Bool = false

    public init() {}

    public static let allowed: [String: Set<String>] = [
        "publicIPProvider": ["cloudflare", "ipify"],
        "quality": ["auto", "low", "balanced", "high", "ultra", "custom"],
        "reducedMotion": ["system", "on", "off"],
        "theme": ["midnight", "graphite", "aurora"],
    ]

    // Tolerant decode: missing/invalid keys fall back to defaults.
    public init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let v = try? c.decode(SwitchMode.self, forKey: .mode) { mode = v }
        if let v = try? c.decode(Bool.self, forKey: .confirmBeforeSwitch) { confirmBeforeSwitch = v }
        if let v = try? c.decode(Bool.self, forKey: .publicIPLookup) { publicIPLookup = v }
        if let v = try? c.decode(String.self, forKey: .publicIPProvider), Self.allowed["publicIPProvider"]!.contains(v) { publicIPProvider = v }
        if let v = try? c.decode(String.self, forKey: .quality), Self.allowed["quality"]!.contains(v) { quality = v }
        if let v = try? c.decode(String.self, forKey: .reducedMotion), Self.allowed["reducedMotion"]!.contains(v) { reducedMotion = v }
        if let v = try? c.decode(String.self, forKey: .theme), Self.allowed["theme"]!.contains(v) { theme = v }
        if let v = try? c.decode(Bool.self, forKey: .sound) { sound = v }
        if let v = try? c.decode(GraphicsSettings.self, forKey: .graphics) { graphics = v } // missing key → defaults
    }

    /// Applies a partial update from untrusted JSON. Throws invalidArgument on bad keys/values.
    public func applying(_ patch: [String: Any]) throws -> Settings {
        var s = self
        for (k, v) in patch {
            switch k {
            case "mode":
                guard let str = v as? String, let m = SwitchMode(rawValue: str) else { throw BridgeError(.invalidArgument, "mode must be 'renew' or 'reconnect'.") }
                s.mode = m
            case "confirmBeforeSwitch", "publicIPLookup", "sound":
                guard let b = v as? Bool, CFGetTypeID(v as CFTypeRef) == CFBooleanGetTypeID() else { throw BridgeError(.invalidArgument, "\(k) must be a boolean.") }
                if k == "confirmBeforeSwitch" { s.confirmBeforeSwitch = b } else if k == "publicIPLookup" { s.publicIPLookup = b } else { s.sound = b }
            case "publicIPProvider", "quality", "reducedMotion", "theme":
                guard let str = v as? String, Self.allowed[k]!.contains(str) else { throw BridgeError(.invalidArgument, "Invalid value for \(k).") }
                switch k {
                case "publicIPProvider": s.publicIPProvider = str
                case "quality": s.quality = str
                case "reducedMotion": s.reducedMotion = str
                default: s.theme = str
                }
            case "graphics":
                guard let obj = v as? [String: Any] else { throw BridgeError(.invalidArgument, "graphics must be an object.") }
                s.graphics = try s.graphics.applying(obj)
            default:
                throw BridgeError(.invalidArgument, "Unknown setting '\(k)'.")
            }
        }
        return s
    }
}

// MARK: - Diagnostics / app

public struct DiagnosticCheck: Codable, Sendable, Equatable {
    public var id: String
    public var label: String
    public var status: String // pass | warn | fail | skipped
    public var detail: String
    public var durationMs: Int
}

public struct DiagnosticReport: Codable, Sendable, Equatable {
    public var ranAt: ISODate
    public var checks: [DiagnosticCheck]
}

public struct AppInfo: Codable, Sendable, Equatable {
    public var version: String
    public var build: String
    public var macOSVersion: String
    public var arch: String
    public var bridge: String
    public init(version: String, build: String, macOSVersion: String, arch: String, bridge: String) {
        self.version = version; self.build = build; self.macOSVersion = macOSVersion; self.arch = arch; self.bridge = bridge
    }
}

public struct SwitchStateResult: Codable, Sendable, Equatable {
    public var running: Bool
    @Nullable public var operationId: String?
    public var events: [OperationEvent]
}

// MARK: - JSON helpers

public enum JSON {
    public static func encoder(pretty: Bool = false) -> JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = pretty ? [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes] : [.withoutEscapingSlashes]
        return e
    }
    /// Encodes to a Foundation object graph suitable for WKWebView replies / callAsyncJavaScript arguments.
    public static func object<T: Encodable>(_ v: T) throws -> Any {
        let data = try encoder().encode(v)
        return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
    public static func string<T: Encodable>(_ v: T, pretty: Bool = true) -> String {
        guard let d = try? encoder(pretty: pretty).encode(v) else { return "null" }
        return String(decoding: d, as: UTF8.self)
    }
}

public func macOSVersionString() -> String {
    let v = ProcessInfo.processInfo.operatingSystemVersion
    return v.patchVersion > 0 ? "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)" : "\(v.majorVersion).\(v.minorVersion)"
}
