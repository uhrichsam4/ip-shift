import Foundation
import Network

public enum ProbeOutcome: String, Sendable { case online, captive, offline }

public struct ProbeResult: Sendable, Equatable {
    public var outcome: ProbeOutcome
    public var latencyMs: Int?
    public var at: Date
    public var target: String
    public init(outcome: ProbeOutcome, latencyMs: Int?, at: Date, target: String) {
        self.outcome = outcome; self.latencyMs = latencyMs; self.at = at; self.target = target
    }
    public var record: ProbeRecord { ProbeRecord(ok: outcome == .online, latencyMs: latencyMs, at: ISO8601.string(at), target: target) }
}

public enum HTTP {
    static func session() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        c.urlCache = nil
        c.timeoutIntervalForRequest = 5
        c.timeoutIntervalForResource = 5
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }
}

public enum CaptiveProbe {
    public static let target = "http://captive.apple.com/hotspot-detect.html"
    public static func run() async -> ProbeResult {
        let start = Date()
        var req = URLRequest(url: URL(string: target)!)
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        req.timeoutInterval = 5
        do {
            let (data, resp) = try await HTTP.session().data(for: req)
            let ms = Int(Date().timeIntervalSince(start) * 1000)
            let body = String(decoding: data, as: UTF8.self)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 200 && body.contains("Success") { return ProbeResult(outcome: .online, latencyMs: ms, at: Date(), target: target) }
            return ProbeResult(outcome: .captive, latencyMs: ms, at: Date(), target: target)
        } catch {
            return ProbeResult(outcome: .offline, latencyMs: nil, at: Date(), target: target)
        }
    }
}

public actor PublicIPService {
    private var cache: PublicIPInfo?
    private var cachedAt: Date?
    public init() {}

    public func current() -> PublicIPInfo? { cache }

    public func lookup(provider: String, enabled: Bool, force: Bool) async -> PublicIPInfo {
        guard enabled else { return .disabled }
        if !force, let cache, let cachedAt, Date().timeIntervalSince(cachedAt) < 60, cache.status == "ok" { return cache }
        let order = provider == "ipify" ? ["ipify", "cloudflare"] : ["cloudflare", "ipify"]
        var lastError = "Lookup failed"
        for (i, p) in order.enumerated() {
            if i > 0 { try? await Task.sleep(nanoseconds: 500_000_000) }
            switch await Self.fetch(p) {
            case .success(let ip):
                let info = PublicIPInfo(status: "ok", address: ip, provider: p == "ipify" ? "ipify" : "Cloudflare", fetchedAt: ISO8601.string(Date()))
                cache = info; cachedAt = Date()
                return info
            case .failure(let e): lastError = e.message
            }
        }
        let info = PublicIPInfo(status: "error", address: nil, provider: nil, fetchedAt: ISO8601.string(Date()), error: lastError)
        cache = info; cachedAt = Date()
        return info
    }

    static func fetch(_ provider: String) async -> Result<String, BridgeError> {
        let url = provider == "ipify" ? URL(string: "https://api.ipify.org")! : URL(string: "https://1.1.1.1/cdn-cgi/trace")!
        do {
            let (data, resp) = try await HTTP.session().data(from: url)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return .failure(BridgeError(.internal, "Unexpected response from \(provider)")) }
            let body = String(decoding: data, as: UTF8.self)
            let ip = provider == "ipify" ? PublicIPParser.plain(body) : PublicIPParser.cloudflareTrace(body)
            if let ip { return .success(ip) }
            return .failure(BridgeError(.internal, "Response from \(provider) did not contain a valid IP address"))
        } catch {
            return .failure(BridgeError(.internal, error.localizedDescription))
        }
    }
}

public enum DNSCheck {
    public static func resolve(_ host: String = "apple.com") async -> (ok: Bool, detail: String) {
        await withCheckedContinuation { cont in
            DispatchQueue.global().async {
                var hints = addrinfo(); hints.ai_socktype = SOCK_STREAM
                var res: UnsafeMutablePointer<addrinfo>?
                let rc = getaddrinfo(host, nil, &hints, &res)
                defer { if res != nil { freeaddrinfo(res) } }
                if rc != 0 { cont.resume(returning: (false, String(cString: gai_strerror(rc)))); return }
                var addrs: [String] = []
                var p = res
                while let cur = p {
                    var buf = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    if getnameinfo(cur.pointee.ai_addr, cur.pointee.ai_addrlen, &buf, socklen_t(buf.count), nil, 0, NI_NUMERICHOST) == 0 {
                        let s = String(cString: buf); if !addrs.contains(s) { addrs.append(s) }
                    }
                    p = cur.pointee.ai_next
                }
                cont.resume(returning: (true, "\(host) → \(addrs.prefix(2).joined(separator: ", "))"))
            }
        }
    }
}

public enum RouterPing {
    /// The only child process the app runs. Router must pass the strict IPv4 validator; arguments are an array.
    public static func ping(_ router: String) async -> (ok: Bool, detail: String) {
        guard IPValidator.isIPv4(router) else { return (false, "Router address is not a valid IPv4 address") }
        return await withCheckedContinuation { cont in
            DispatchQueue.global().async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/sbin/ping")
                p.arguments = ["-c", "1", "-t", "2", router]
                let out = Pipe(); p.standardOutput = out; p.standardError = Pipe()
                do { try p.run() } catch { cont.resume(returning: (false, "Could not run ping")); return }
                p.waitUntilExit()
                let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                if p.terminationStatus == 0 {
                    let time = text.range(of: #"time=([0-9.]+) ms"#, options: .regularExpression).map { String(text[$0]).replacingOccurrences(of: "time=", with: "") }
                    cont.resume(returning: (true, "\(router) replied" + (time.map { " in \($0)" } ?? "")))
                } else {
                    cont.resume(returning: (false, "\(router) did not reply within 2 s"))
                }
            }
        }
    }
}

/// NWPathMonitor wrapper.
public final class PathWatcher: @unchecked Sendable {
    public static let shared = PathWatcher()
    private let monitor = NWPathMonitor()
    private let lock = NSLock()
    private var _status: String = "unknown"
    private var handlers: [@Sendable (String) -> Void] = []
    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let s: String
            switch path.status {
            case .satisfied: s = "satisfied"
            case .unsatisfied: s = "unsatisfied"
            case .requiresConnection: s = "requiresConnection"
            @unknown default: s = "unknown"
            }
            self.lock.lock(); self._status = s; let hs = self.handlers; self.lock.unlock()
            hs.forEach { $0(s) }
        }
        monitor.start(queue: DispatchQueue(label: "ipshift.path"))
    }
    public var status: String { lock.lock(); defer { lock.unlock() }; return _status }
    public func onChange(_ h: @escaping @Sendable (String) -> Void) { lock.lock(); handlers.append(h); lock.unlock() }
}
