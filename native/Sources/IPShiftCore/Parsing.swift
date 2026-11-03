import Foundation

public enum IPValidator {
    /// Strict dotted-quad IPv4: exactly four decimal octets 0-255, no leading zeros, no whitespace.
    public static func isIPv4(_ s: String) -> Bool {
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return false }
        for p in parts {
            guard !p.isEmpty, p.count <= 3, p.allSatisfy({ $0 >= "0" && $0 <= "9" }) else { return false }
            if p.count > 1 && p.first == "0" { return false }
            guard let n = Int(p), n <= 255 else { return false }
        }
        return true
    }

    public static func isIPv6(_ s: String) -> Bool {
        guard s.contains(":"), s.count <= 45, s.allSatisfy({ $0.isHexDigit || $0 == ":" || $0 == "." }) else { return false }
        var addr = in6_addr()
        return s.withCString { inet_pton(AF_INET6, $0, &addr) } == 1
    }

    public static func isIPLiteral(_ s: String) -> Bool { isIPv4(s) || isIPv6(s) }

    public static func isSelfAssigned(_ s: String?) -> Bool {
        guard let s, isIPv4(s) else { return false }
        return s.hasPrefix("169.254.")
    }
}

/// Parses DHCP option payloads as exposed in State:/Network/Service/<id>/DHCP (Option_N → CFData).
public enum DHCPOptions {
    public static func ipv4(_ data: Data?) -> String? {
        guard let data, data.count >= 4 else { return nil }
        let b = [UInt8](data.prefix(4))
        return "\(b[0]).\(b[1]).\(b[2]).\(b[3])"
    }

    public static func ipv4List(_ data: Data?) -> [String] {
        guard let data, data.count >= 4 else { return [] }
        let bytes = [UInt8](data)
        return stride(from: 0, to: bytes.count - bytes.count % 4, by: 4).map { i in
            "\(bytes[i]).\(bytes[i + 1]).\(bytes[i + 2]).\(bytes[i + 3])"
        }
    }

    /// Big-endian UInt32 (option 51 lease time).
    public static func uint32(_ data: Data?) -> UInt32? {
        guard let data, data.count >= 4 else { return nil }
        let b = [UInt8](data.prefix(4))
        return (UInt32(b[0]) << 24) | (UInt32(b[1]) << 16) | (UInt32(b[2]) << 8) | UInt32(b[3])
    }

    public struct Parsed: Equatable, Sendable {
        public var serverIdentifier: String?
        public var leaseSeconds: Int?
        public var dns: [String]
        public var router: String?
        public var subnetMask: String?
        public var leaseStart: Date?
        public var leaseExpires: Date?
    }

    public static func parse(_ dict: [String: Any]) -> Parsed {
        func d(_ k: String) -> Data? { dict[k] as? Data }
        return Parsed(
            serverIdentifier: ipv4(d("Option_54")),
            leaseSeconds: uint32(d("Option_51")).map { Int($0) },
            dns: ipv4List(d("Option_6")),
            router: ipv4List(d("Option_3")).first,
            subnetMask: ipv4(d("Option_1")),
            leaseStart: dict["LeaseStartTime"] as? Date,
            leaseExpires: dict["LeaseExpirationTime"] as? Date
        )
    }
}

public enum PublicIPParser {
    public static func cloudflareTrace(_ body: String) -> String? {
        for line in body.split(whereSeparator: \.isNewline) where line.hasPrefix("ip=") {
            let v = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            return IPValidator.isIPLiteral(v) ? v : nil
        }
        return nil
    }
    public static func plain(_ body: String) -> String? {
        let v = body.trimmingCharacters(in: .whitespacesAndNewlines)
        return IPValidator.isIPLiteral(v) ? v : nil
    }
}

public enum OutcomeCalculator {
    /// Outcome from IPs read back from macOS. Never inferred.
    public static func outcome(previous: String?, current: String?) -> Outcome {
        guard let current, IPValidator.isIPv4(current), !IPValidator.isSelfAssigned(current) else { return .failed }
        guard let previous else { return .changed }
        return previous == current ? .unchanged : .changed
    }
}
