import XCTest
@testable import IPShiftCore

// MARK: - Fakes

final class World: @unchecked Sendable {
    let lock = NSLock()
    var interfaceName: String? = "en9"
    var powerOn = true
    var associated = true
    var ssid: String? = "Home"
    var ipv4: String? = "192.168.1.42"
    var router: String? = "192.168.1.1"
    var leaseStart: Date? = Date(timeIntervalSince1970: 1_000_000)
    var dhcpServer: String? = "192.168.1.1"
    var pathOK = true
    var online = true
    var rejoinOnPowerOn = true
    var autoLeaseOnRejoin: (() -> Void)?
    var onRefresh: (() -> Void)?
    var failPowerOff = false
    var failPowerOnCount = 0
    var authDenied = false
    var refreshFails = false
    var authDelayNs: UInt64 = 0
    var powerCalls: [Bool] = []
    var refreshCalls = 0

    func with<T>(_ f: (World) throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try f(self) }
}

struct FakeWifi: WifiControlling {
    let w: World
    func setPower(_ on: Bool, interface: String) throws {
        try w.with { w in
            w.powerCalls.append(on)
            if !on {
                if w.failPowerOff { throw BridgeError(.powerToggleFailed, "off failed", stage: .wifi) }
                w.powerOn = false; w.associated = false
            } else {
                if w.failPowerOnCount > 0 { w.failPowerOnCount -= 1; throw BridgeError(.powerToggleFailed, "on failed", stage: .wifi) }
                w.powerOn = true
                if w.rejoinOnPowerOn { w.associated = true; w.autoLeaseOnRejoin?() }
            }
        }
    }
}

struct FakeDHCP: DHCPRenewing {
    let w: World
    func authorize() async throws {
        let d = w.with { $0.authDelayNs }
        if d > 0 { try await Task.sleep(nanoseconds: d) }
        if w.with({ $0.authDenied }) { throw BridgeError(.authorizationDenied, "Authorization cancelled — no changes were made.", stage: .dhcp) }
    }
    func refresh(interface: String) async throws {
        try w.with { w in
            w.refreshCalls += 1
            if w.refreshFails { throw BridgeError(.refreshFailed, "refresh failed", stage: .dhcp) }
            w.onRefresh?()
        }
    }
}

struct FakeReader: NetworkReading {
    let w: World
    func readState() -> NetworkState {
        w.with { NetworkState(interfaceName: $0.interfaceName, powerOn: $0.powerOn, associated: $0.associated, ssid: $0.ssid,
                              ipv4: $0.associated ? $0.ipv4 : nil, router: $0.router, leaseStart: $0.leaseStart, dhcpServer: $0.dhcpServer) }
    }
    func pathSatisfied() -> Bool { w.with { $0.pathOK } }
}

struct FakeProbe: ConnectivityProbing {
    let w: World
    func probe() async -> ProbeResult {
        ProbeResult(outcome: w.with { $0.online } ? .online : .offline, latencyMs: w.with { $0.online } ? 20 : nil, at: Date(), target: "fake")
    }
    func publicIP(force: Bool) async -> PublicIPInfo {
        PublicIPInfo(status: "ok", address: "203.0.113.5", provider: "Cloudflare", fetchedAt: ISO8601.string(Date()))
    }
}

final class FakeClock: IPShiftCore.Clock, @unchecked Sendable {
    private let lock = NSLock()
    private var t = Date(timeIntervalSince1970: 2_000_000)
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return t }
    func sleep(ms: Int) async throws {
        try Task.checkCancellation()
        lock.lock(); t = t.addingTimeInterval(Double(ms) / 1000); lock.unlock()
        await Task.yield()
        try Task.checkCancellation()
    }
}

final class Collector: @unchecked Sendable {
    let lock = NSLock()
    var events: [OperationEvent] = []
    var result: OperationResult?
    var continuation: CheckedContinuation<OperationResult, Never>?
    func event(_ e: OperationEvent) { lock.lock(); events.append(e); lock.unlock() }
    func finish(_ r: OperationResult) {
        lock.lock(); result = r; let c = continuation; continuation = nil; lock.unlock()
        c?.resume(returning: r)
    }
    func wait() async -> OperationResult {
        await withCheckedContinuation { c in
            lock.lock()
            if let r = result { lock.unlock(); c.resume(returning: r) } else { continuation = c; lock.unlock() }
        }
    }
    var phases: [String] { lock.lock(); defer { lock.unlock() }; return events.map(\.phase) }
}

func tempDir() -> URL {
    let u = FileManager.default.temporaryDirectory.appendingPathComponent("ipshift-tests-\(UUID().uuidString)")
    try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
    return u
}

func makeEngine(_ w: World, _ c: Collector, history: HistoryStore? = nil) -> SwitchEngine {
    SwitchEngine(wifi: FakeWifi(w: w), dhcp: FakeDHCP(w: w), reader: FakeReader(w: w), connectivity: FakeProbe(w: w),
                 clock: FakeClock(), history: history ?? HistoryStore(directory: tempDir()),
                 onEvent: { c.event($0) }, onResult: { r, _ in c.finish(r) })
}

func runSwitch(_ w: World, mode: SwitchMode = .renew, history: HistoryStore? = nil) async throws -> (OperationResult, Collector, SwitchEngine) {
    let c = Collector()
    let e = makeEngine(w, c, history: history)
    _ = try await e.start(mode: mode)
    let r = await c.wait()
    return (r, c, e)
}

// MARK: - Pure logic

final class ParsingTests: XCTestCase {
    func testIPv4Validator() {
        for ok in ["192.168.1.1", "0.0.0.0", "255.255.255.255", "10.0.0.254"] { XCTAssertTrue(IPValidator.isIPv4(ok), ok) }
        for bad in ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1.2.3.-4", " 1.2.3.4", "1.2.3.4 ", "a.b.c.d",
                    "1.2.3.4; rm -rf /", "1..3.4", "1.2.3.4\n", "１.2.3.4"] {
            XCTAssertFalse(IPValidator.isIPv4(bad), bad)
        }
        XCTAssertTrue(IPValidator.isSelfAssigned("169.254.10.2"))
        XCTAssertFalse(IPValidator.isSelfAssigned("192.168.1.2"))
        XCTAssertTrue(IPValidator.isIPv6("2001:db8::1"))
        XCTAssertFalse(IPValidator.isIPv6("hello"))
    }

    func testDHCPOptionParsing() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let dict: [String: Any] = [
            "Option_54": Data([192, 168, 1, 1]),
            "Option_51": Data([0x00, 0x01, 0x51, 0x80]), // 86400
            "Option_6": Data([192, 168, 1, 1, 1, 1, 1, 1]),
            "Option_3": Data([192, 168, 1, 1]),
            "Option_1": Data([255, 255, 255, 0]),
            "LeaseStartTime": start,
            "LeaseExpirationTime": start.addingTimeInterval(86400),
        ]
        let p = DHCPOptions.parse(dict)
        XCTAssertEqual(p.serverIdentifier, "192.168.1.1")
        XCTAssertEqual(p.leaseSeconds, 86400)
        XCTAssertEqual(p.dns, ["192.168.1.1", "1.1.1.1"])
        XCTAssertEqual(p.router, "192.168.1.1")
        XCTAssertEqual(p.subnetMask, "255.255.255.0")
        XCTAssertEqual(p.leaseStart, start)
        XCTAssertNil(DHCPOptions.ipv4(Data([1, 2])))
        XCTAssertNil(DHCPOptions.uint32(nil))
    }

    func testPublicIPParsing() {
        XCTAssertEqual(PublicIPParser.cloudflareTrace("fl=1\nip=203.0.113.7\nts=1"), "203.0.113.7")
        XCTAssertNil(PublicIPParser.cloudflareTrace("ip=<script>"))
        XCTAssertEqual(PublicIPParser.plain(" 2001:db8::5\n"), "2001:db8::5")
    }

    func testOutcome() {
        XCTAssertEqual(OutcomeCalculator.outcome(previous: "192.168.1.42", current: "192.168.1.80"), .changed)
        XCTAssertEqual(OutcomeCalculator.outcome(previous: "192.168.1.42", current: "192.168.1.42"), .unchanged)
        XCTAssertEqual(OutcomeCalculator.outcome(previous: "192.168.1.42", current: nil), .failed)
        XCTAssertEqual(OutcomeCalculator.outcome(previous: "192.168.1.42", current: "169.254.3.3"), .failed)
    }

    func testSnapshotEncodesNulls() throws {
        let info = IPv4Info(address: nil, subnetMask: nil, router: "192.168.1.1", isSelfAssigned: false)
        let json = String(decoding: try JSONEncoder().encode(info), as: UTF8.self)
        XCTAssertTrue(json.contains("\"address\":null"), json)
        let pub = PublicIPInfo.disabled
        let pj = String(decoding: try JSONEncoder().encode(pub), as: UTF8.self)
        XCTAssertFalse(pj.contains("\"error\""), pj) // optional field omitted
    }

    func testSettingsDefaultsAndValidation() throws {
        let s = Settings()
        XCTAssertEqual(s.mode, .renew); XCTAssertTrue(s.confirmBeforeSwitch); XCTAssertTrue(s.publicIPLookup)
        XCTAssertEqual(s.publicIPProvider, "cloudflare"); XCTAssertEqual(s.quality, "auto")
        XCTAssertEqual(s.reducedMotion, "system"); XCTAssertEqual(s.theme, "midnight"); XCTAssertFalse(s.sound)
        XCTAssertThrowsError(try s.applying(["theme": "neon"]))
        XCTAssertThrowsError(try s.applying(["bogus": 1]))
        XCTAssertEqual(try s.applying(["mode": "reconnect"]).mode, .reconnect)
        let store = SettingsStore(directory: tempDir())
        _ = try store.update(["sound": true])
        XCTAssertTrue(store.get().sound)
    }

    func testGraphicsSettings() throws {
        // Defaults = balanced preset
        let g = GraphicsSettings()
        XCTAssertEqual(g.antiAliasing, "smaa"); XCTAssertEqual(g.renderScale, 0.75); XCTAssertEqual(g.frameRateCap, 60)
        XCTAssertEqual(g.shadows, "medium"); XCTAssertEqual(g.bloom, "high"); XCTAssertEqual(g.depthOfField, "sequence")
        XCTAssertEqual(g.volumetrics, "low"); XCTAssertEqual(g.particles, "medium"); XCTAssertEqual(g.textureFiltering, 8)
        XCTAssertTrue(g.chromaticAberration && g.filmGrain && g.vignette); XCTAssertEqual(g.toneMapping, "aces"); XCTAssertFalse(g.showFps)

        // Missing key → defaults (old settings.json still loads)
        let old = try JSONDecoder().decode(Settings.self, from: Data(#"{"mode":"reconnect","quality":"high","sound":true}"#.utf8))
        XCTAssertEqual(old.mode, .reconnect); XCTAssertEqual(old.graphics, GraphicsSettings())

        // Partial merge + validation
        var s = Settings()
        s = try s.applying(["quality": "custom", "graphics": ["shadows": "high", "renderScale": 3.0, "frameRateCap": 120, "showFps": true]])
        XCTAssertEqual(s.quality, "custom"); XCTAssertEqual(s.graphics.shadows, "high"); XCTAssertEqual(s.graphics.renderScale, 1.0)
        XCTAssertEqual(s.graphics.frameRateCap, 120); XCTAssertTrue(s.graphics.showFps); XCTAssertEqual(s.graphics.bloom, "high")
        XCTAssertEqual(try s.applying(["graphics": ["renderScale": 0.1]]).graphics.renderScale, 0.5)
        for bad: [String: Any] in [["frameRateCap": 45], ["textureFiltering": 3], ["shadows": "epic"], ["toneMapping": 1],
                                   ["showFps": "yes"], ["renderScale": "1"], ["bogus": true], ["renderScale": true]] {
            XCTAssertThrowsError(try s.applying(["graphics": bad]), "\(bad)")
        }
        XCTAssertThrowsError(try s.applying(["graphics": "high"]))

        // Round-trip through the store
        let dir = tempDir()
        _ = try SettingsStore(directory: dir).update(["quality": "custom", "graphics": ["antiAliasing": "msaa4", "textureFiltering": 16]])
        let reread = SettingsStore(directory: dir).get()
        XCTAssertEqual(reread.quality, "custom"); XCTAssertEqual(reread.graphics.antiAliasing, "msaa4"); XCTAssertEqual(reread.graphics.textureFiltering, 16)
        let raw = String(decoding: try Data(contentsOf: dir.appendingPathComponent("settings.json")), as: UTF8.self)
        XCTAssertTrue(raw.contains("\"graphics\""))
    }

    func testHistoryRoundTrip() throws {
        let dir = tempDir()
        let store = HistoryStore(directory: dir)
        XCTAssertEqual(store.list().count, 0)
        func entry(_ id: String) -> OperationResult {
            OperationResult(id: id, mode: .renew, interfaceName: "en0", ssid: nil, startedAt: "2026-01-01T00:00:00.000Z",
                            finishedAt: "2026-01-01T00:00:05.000Z", durationMs: 5000, previousIP: "192.168.1.2", currentIP: "192.168.1.3",
                            outcome: .changed, leaseRenewed: true, leaseStart: nil, dhcpServer: nil, internet: "restored",
                            internetLatencyMs: 30, publicIPBefore: nil, publicIPAfter: nil, failure: nil)
        }
        try store.add(entry("a"))
        try store.add(entry("b"))
        let reread = HistoryStore(directory: dir).list()
        XCTAssertEqual(reread.map(\.id), ["b", "a"]) // newest first
        XCTAssertEqual(reread[1], entry("a"))
        let raw = String(decoding: try Data(contentsOf: dir.appendingPathComponent("history.json")), as: UTF8.self)
        XCTAssertTrue(raw.contains("\"ssid\" : null"))
        for i in 0..<510 { try store.add(entry("x\(i)")) }
        XCTAssertEqual(store.list().count, HistoryStore.cap)
        XCTAssertEqual(try store.clear(), HistoryStore.cap)
        XCTAssertEqual(store.list().count, 0)
    }
}

// MARK: - Engine

final class EngineTests: XCTestCase {
    func newLease(_ w: World, ip: String) -> () -> Void {
        { w.ipv4 = ip; w.leaseStart = (w.leaseStart ?? Date()).addingTimeInterval(3600) }
    }

    func testChangedIP() async throws {
        let w = World(); w.onRefresh = newLease(w, ip: "192.168.1.80")
        let hist = HistoryStore(directory: tempDir())
        let (r, c, _) = try await runSwitch(w, history: hist)
        XCTAssertEqual(r.outcome, .changed)
        XCTAssertEqual(r.previousIP, "192.168.1.42"); XCTAssertEqual(r.currentIP, "192.168.1.80")
        XCTAssertTrue(r.leaseRenewed); XCTAssertEqual(r.internet, "restored"); XCTAssertNil(r.failure)
        XCTAssertEqual(c.phases, ["baseline.captured", "wifi.verified", "dhcp.authorizing", "dhcp.authorized", "dhcp.refreshRequested",
                                  "dhcp.waitingForLease", "dhcp.leaseAcknowledged", "reconnect.ipAssigned", "reconnect.pathSatisfied",
                                  "reconnect.internetVerified", "results.ready"])
        XCTAssertEqual(c.events.map(\.seq), Array(1...c.events.count))
        XCTAssertEqual(hist.list().first?.id, r.id)
        XCTAssertEqual(w.powerCalls, []) // renew never touches power
    }

    func testUnchangedIP() async throws {
        let w = World(); w.onRefresh = newLease(w, ip: "192.168.1.42")
        let (r, _, _) = try await runSwitch(w)
        XCTAssertEqual(r.outcome, .unchanged); XCTAssertTrue(r.leaseRenewed)
    }

    func testLeaseTimestampUnchangedContinues() async throws {
        let w = World()
        let (r, c, _) = try await runSwitch(w)
        XCTAssertTrue(c.phases.contains("dhcp.leaseUnchangedTimestamp"))
        XCTAssertFalse(r.leaseRenewed); XCTAssertEqual(r.outcome, .unchanged)
    }

    func testAuthorizationDenied() async throws {
        let w = World(); w.authDenied = true
        let (r, c, _) = try await runSwitch(w)
        XCTAssertEqual(r.outcome, .failed)
        XCTAssertEqual(r.failure?.code, .authorizationDenied); XCTAssertEqual(r.failure?.stage, .dhcp)
        XCTAssertEqual(w.refreshCalls, 0)
        XCTAssertFalse(c.phases.contains("dhcp.authorized"))
        XCTAssertEqual(c.events.last(where: { $0.state == .failed })?.stage, .dhcp)
    }

    func testRefreshFailed() async throws {
        let w = World(); w.refreshFails = true
        let (r, _, _) = try await runSwitch(w)
        XCTAssertEqual(r.failure?.code, .refreshFailed); XCTAssertEqual(r.outcome, .failed)
    }

    func testWifiPowerOffFailure() async throws {
        let w = World(); w.failPowerOff = true
        let (r, _, e) = try await runSwitch(w, mode: .reconnect)
        XCTAssertEqual(r.failure?.code, .powerToggleFailed); XCTAssertEqual(r.failure?.stage, .wifi)
        XCTAssertTrue(w.powerOn)
        let needs = await e.wifiNeedsRestore
        XCTAssertFalse(needs)
    }

    func testReconnectionTimeout() async throws {
        let w = World(); w.rejoinOnPowerOn = false
        let (r, _, _) = try await runSwitch(w, mode: .reconnect)
        XCTAssertEqual(r.failure?.code, .timeout); XCTAssertEqual(r.failure?.stage, .wifi)
        XCTAssertTrue(w.powerOn) // power restored even though association never came back
    }

    func testReconnectAutoLease() async throws {
        let w = World(); w.autoLeaseOnRejoin = newLease(w, ip: "192.168.1.90")
        let (r, c, _) = try await runSwitch(w, mode: .reconnect)
        XCTAssertEqual(r.outcome, .changed); XCTAssertEqual(w.refreshCalls, 0)
        XCTAssertEqual(Array(c.phases.prefix(5)), ["baseline.captured", "wifi.powerOff.requested", "wifi.linkDown", "wifi.powerOn.requested", "wifi.associated"])
        XCTAssertFalse(c.phases.contains("dhcp.authorizing"))
    }

    func testNoInternetAfterRenewal() async throws {
        let w = World(); w.online = false; w.onRefresh = newLease(w, ip: "192.168.1.81")
        let (r, c, _) = try await runSwitch(w)
        XCTAssertEqual(r.outcome, .changed); XCTAssertEqual(r.internet, "unavailable"); XCTAssertNil(r.internetLatencyMs)
        XCTAssertTrue(c.phases.contains("reconnect.internetUnavailable"))
    }

    func testMissingInterface() async throws {
        let w = World(); w.interfaceName = nil
        let (r, _, _) = try await runSwitch(w)
        XCTAssertEqual(r.failure?.code, .noWifiInterface); XCTAssertEqual(r.failure?.stage, .initialise)
        XCTAssertEqual(w.refreshCalls, 0); XCTAssertEqual(w.powerCalls, [])
    }

    func testWifiOffRenew() async throws {
        let w = World(); w.powerOn = false; w.associated = false
        let (r, _, _) = try await runSwitch(w)
        XCTAssertEqual(r.failure?.code, .wifiOff)
    }

    func testBusyOnConcurrentStart() async throws {
        let w = World(); w.authDelayNs = 300_000_000
        let c = Collector()
        let e = makeEngine(w, c)
        _ = try await e.start(mode: .renew)
        do {
            _ = try await e.start(mode: .renew)
            XCTFail("expected busy")
        } catch let err as BridgeError {
            XCTAssertEqual(err.code, .busy)
        }
        _ = await c.wait()
        let running = await e.isRunning
        XCTAssertFalse(running)
    }

    func testWifiRestoredWhenLaterStageFailsInReconnectMode() async throws {
        // Rejoin succeeds, no automatic lease, then authorization is denied in the DHCP stage.
        let w = World(); w.authDenied = true
        let (r, _, e) = try await runSwitch(w, mode: .reconnect)
        XCTAssertEqual(r.failure?.code, .authorizationDenied)
        XCTAssertTrue(w.powerOn)
        XCTAssertEqual(w.powerCalls.last, true)
        let needs = await e.wifiNeedsRestore
        XCTAssertFalse(needs)
    }

    func testWifiRestoredWhenPowerOnFailsOnce() async throws {
        let w = World(); w.failPowerOnCount = 1
        let (r, _, _) = try await runSwitch(w, mode: .reconnect)
        XCTAssertEqual(r.outcome, .failed)
        XCTAssertEqual(r.failure?.code, .powerToggleFailed)
        XCTAssertTrue(w.powerOn, "engine must retry power-on in its exit path")
        XCTAssertEqual(w.powerCalls, [false, true, true])
    }

    func testWifiRestoreRetriesUntilSuccess() async throws {
        // In-flow power-on fails, first exit-path retry fails, second retry (500 ms later) succeeds.
        let w = World(); w.failPowerOnCount = 2
        let (r, c, e) = try await runSwitch(w, mode: .reconnect)
        XCTAssertTrue(w.powerOn)
        XCTAssertEqual(w.powerCalls, [false, true, true, true])
        XCTAssertEqual(r.outcome, .failed); XCTAssertEqual(r.failure?.code, .powerToggleFailed)
        let needs = await e.wifiNeedsRestore
        XCTAssertFalse(needs)
        for ev in c.events where ev.state == .failed { XCTAssertEqual(ev.phase, "\(ev.stage.rawValue).failed") }
    }

    func testUnrestoredWifiIsFailedEvenWhenCancelled() async throws {
        let w = World(); w.failPowerOff = false; w.failPowerOnCount = 1000; w.authDelayNs = 0
        let c = Collector()
        let e = makeEngine(w, c)
        _ = try await e.start(mode: .reconnect)
        // Cancel only once Wi-Fi has really been turned off.
        while !w.with({ $0.powerCalls.contains(false) }) { try await Task.sleep(nanoseconds: 1_000_000) }
        _ = await e.cancel()
        let r = await c.wait()
        XCTAssertEqual(r.outcome, .failed); XCTAssertEqual(r.failure?.code, .powerToggleFailed)
    }

    func testFailedEventsUseFailedPhase() async throws {
        let w = World(); w.authDenied = true
        let (_, c, _) = try await runSwitch(w)
        let failed = c.events.filter { $0.state == .failed }
        XCTAssertEqual(failed.map(\.phase), ["dhcp.failed"])
    }

    func testCancelRestoresWifi() async throws {
        let w = World(); w.rejoinOnPowerOn = false
        let c = Collector()
        let e = makeEngine(w, c)
        w.with { $0.failPowerOnCount = 0 }
        _ = try await e.start(mode: .reconnect)
        _ = await e.cancel()
        let r = await c.wait()
        XCTAssertTrue([.cancelled, .failed].contains(r.outcome))
        XCTAssertTrue(w.powerOn || !w.powerCalls.contains(false))
    }
}
