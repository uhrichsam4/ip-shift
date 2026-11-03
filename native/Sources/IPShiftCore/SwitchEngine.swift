import Foundation

/// Timeouts (ms). Exposed so tests can reason about them; the fake clock makes them instant.
public struct EngineTimeouts: Sendable {
    public var linkDown = 8_000
    public var association = 30_000
    public var autoLeaseOnRejoin = 12_000
    public var lease = 25_000
    public var ipAssigned = 20_000
    public var path = 10_000
    public var probeGap = 3_000
    public var probeTries = 3
    public var poll = 250
    public init() {}
}

/// Single-flight switch engine. The ONLY component that changes network state, and only after `start`.
/// Safety invariant: if the engine turned Wi-Fi off, it always turns it back on on every exit path.
public actor SwitchEngine {
    private let wifi: WifiControlling
    private let dhcp: DHCPRenewing
    private let reader: NetworkReading
    private let connectivity: ConnectivityProbing
    private let clock: Clock
    private let history: HistoryStore?
    private let timeouts: EngineTimeouts

    public nonisolated let onEvent: @Sendable (OperationEvent) -> Void
    public nonisolated let onResult: @Sendable (OperationResult, [HistoryEntry]) -> Void

    private var task: Task<Void, Never>?
    private var operationId: String?
    private var events: [OperationEvent] = []
    private var seq = 0
    /// Interface the engine powered off and has not yet confirmed powered back on.
    private var wifiTurnedOff: String?
    public private(set) var lastResult: OperationResult?

    public init(wifi: WifiControlling, dhcp: DHCPRenewing, reader: NetworkReading, connectivity: ConnectivityProbing,
                clock: Clock = SystemClock(), history: HistoryStore?, timeouts: EngineTimeouts = EngineTimeouts(),
                onEvent: @escaping @Sendable (OperationEvent) -> Void = { _ in },
                onResult: @escaping @Sendable (OperationResult, [HistoryEntry]) -> Void = { _, _ in }) {
        self.wifi = wifi; self.dhcp = dhcp; self.reader = reader; self.connectivity = connectivity
        self.clock = clock; self.history = history; self.timeouts = timeouts
        self.onEvent = onEvent; self.onResult = onResult
    }

    // MARK: public API

    public func start(mode: SwitchMode) throws -> String {
        if task != nil { throw BridgeError(.busy, "A switch is already running.") }
        let id = UUID().uuidString.lowercased()
        operationId = id
        events = []
        seq = 0
        task = Task { await self.run(id: id, mode: mode) }
        return id
    }

    public func cancel() -> Bool {
        guard let task else { return false }
        task.cancel()
        return true
    }

    public var isRunning: Bool { task != nil }

    public func state() -> SwitchStateResult {
        SwitchStateResult(running: task != nil, operationId: operationId, events: events)
    }

    /// Waits for the current operation (if any) to finish, up to `timeoutMs` (real time).
    public func waitUntilIdle(timeoutMs: Int) async {
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
        while task != nil && Date() < deadline { try? await Task.sleep(nanoseconds: 50_000_000) }
    }

    /// Retries power-on every 500 ms until it succeeds or `deadlineMs` elapses. Ignores task cancellation.
    @discardableResult
    public func restoreWifi(deadlineMs: Int) async -> Bool {
        let deadline = clock.now().addingTimeInterval(Double(deadlineMs) / 1000)
        while wifiTurnedOff != nil {
            restoreWifiIfNeeded()
            if wifiTurnedOff == nil || clock.now() >= deadline { break }
            let c = clock
            await Task { try? await c.sleep(ms: 500) }.value // unstructured: not cancelled with the run
        }
        return wifiTurnedOff == nil
    }

    /// Single power-on attempt if this engine turned Wi-Fi off. Safe to call any time.
    public func restoreWifiIfNeeded() {
        guard let ifname = wifiTurnedOff else { return }
        do {
            try wifi.setPower(true, interface: ifname)
            wifiTurnedOff = nil
        } catch {
            // keep flag so a later call retries
        }
    }

    public var wifiNeedsRestore: Bool { wifiTurnedOff != nil }

    // MARK: run

    private func emit(_ stage: StageId, _ state: StageState, _ phase: String, _ message: String, _ data: [String: JSONScalar]? = nil) {
        guard let id = operationId else { return }
        seq += 1
        let e = OperationEvent(operationId: id, seq: seq, at: ISO8601.string(clock.now()), stage: stage, state: state, phase: phase, message: message, data: data)
        events.append(e)
        onEvent(e)
    }

    private func waitFor(_ ms: Int, _ cond: () -> Bool) async throws -> Bool {
        let deadline = clock.now().addingTimeInterval(Double(ms) / 1000)
        while true {
            try Task.checkCancellation()
            if cond() { return true }
            if clock.now() >= deadline { return false }
            try await clock.sleep(ms: timeouts.poll)
        }
    }

    private func run(id: String, mode: SwitchMode) async {
        let started = clock.now()
        var stage: StageId = .initialise
        var baseline = reader.readState()
        var publicBefore: String?
        var leaseRenewed = false
        var internet = "notChecked"
        var latency: Int?
        var failure: OperationFailure?
        var cancelled = false

        defer { restoreWifiIfNeeded() }

        func leaseMoved(_ s: NetworkState) -> Bool {
            guard let l = s.leaseStart else { return false }
            guard let b = baseline.leaseStart else { return true }
            return l > b
        }

        do {
            // 1 initialise
            guard let ifname = baseline.interfaceName else {
                throw BridgeError(.noWifiInterface, "No Wi-Fi interface detected. No changes were made.", stage: .initialise)
            }
            let pub = await connectivity.publicIP(force: false)
            publicBefore = pub.status == "ok" ? pub.address : nil
            baseline = reader.readState()
            emit(.initialise, .done, "baseline.captured", "Captured the current network state.", [
                "interfaceName": .string(ifname), "ip": .of(baseline.ipv4), "router": .of(baseline.router),
                "ssid": .of(baseline.ssid), "leaseStart": .of(ISO8601.opt(baseline.leaseStart)), "publicIP": .of(publicBefore),
            ])
            try Task.checkCancellation()

            // 2 wifi
            stage = .wifi
            switch mode {
            case .renew:
                if !baseline.powerOn { throw BridgeError(.wifiOff, "Wi-Fi is off. Turn it on and try again. No changes were made.", stage: .wifi) }
                if !baseline.associated { throw BridgeError(.notAssociated, "Wi-Fi is not connected to a network. No changes were made.", stage: .wifi) }
                emit(.wifi, .done, "wifi.verified", "Wi-Fi is on and connected.")
            case .reconnect:
                if !baseline.powerOn { throw BridgeError(.wifiOff, "Wi-Fi is off. Turn it on and try again. No changes were made.", stage: .wifi) }
                wifiTurnedOff = ifname // set first: any failure path still restores power
                try wifi.setPower(false, interface: ifname)
                emit(.wifi, .active, "wifi.powerOff.requested", "Asked macOS to turn Wi-Fi off.")
                let down = try await waitFor(timeouts.linkDown) { let s = reader.readState(); return !s.associated }
                if down { emit(.wifi, .active, "wifi.linkDown", "Wi-Fi link is down.") }
                try wifi.setPower(true, interface: ifname)
                wifiTurnedOff = nil
                emit(.wifi, .active, "wifi.powerOn.requested", "Asked macOS to turn Wi-Fi back on.")
                let assoc = try await waitFor(timeouts.association) { let s = reader.readState(); return s.powerOn && s.associated }
                if !assoc { throw BridgeError(.timeout, "Wi-Fi is on but did not rejoin a network within 30 seconds.", stage: .wifi) }
                emit(.wifi, .done, "wifi.associated", "Wi-Fi rejoined the network.", ["ssid": .of(reader.readState().ssid)])
            }
            try Task.checkCancellation()

            // 3 dhcp
            stage = .dhcp
            var needRefresh = true
            if mode == .reconnect {
                emit(.dhcp, .active, "dhcp.waitingForLease", "Waiting for the router to grant a lease after rejoining.")
                if try await waitFor(timeouts.autoLeaseOnRejoin, { leaseMoved(reader.readState()) }) {
                    leaseRenewed = true
                    needRefresh = false
                    let s = reader.readState()
                    emit(.dhcp, .done, "dhcp.leaseAcknowledged", "The router acknowledged a new lease.", ["ip": .of(s.ipv4), "leaseStart": .of(ISO8601.opt(s.leaseStart))])
                }
            }
            if needRefresh {
                emit(.dhcp, .active, "dhcp.authorizing", "Waiting for administrator authorization.")
                try await dhcp.authorize()
                try Task.checkCancellation()
                emit(.dhcp, .active, "dhcp.authorized", "Authorization granted.")
                try await dhcp.refresh(interface: ifname)
                emit(.dhcp, .active, "dhcp.refreshRequested", "Asked macOS to renew the DHCP lease.")
                emit(.dhcp, .active, "dhcp.waitingForLease", "Waiting for the router to acknowledge the lease.")
                if try await waitFor(timeouts.lease, { leaseMoved(reader.readState()) }) {
                    leaseRenewed = true
                    let s = reader.readState()
                    emit(.dhcp, .done, "dhcp.leaseAcknowledged", "The router acknowledged the lease.", ["ip": .of(s.ipv4), "leaseStart": .of(ISO8601.opt(s.leaseStart))])
                } else if let ip = reader.readState().ipv4, !IPValidator.isSelfAssigned(ip) {
                    emit(.dhcp, .done, "dhcp.leaseUnchangedTimestamp", "macOS did not report a new lease time; the address is still assigned.", ["ip": .string(ip)])
                } else {
                    throw BridgeError(.timeout, "No DHCP lease was received within 25 seconds.", stage: .dhcp)
                }
            }
            try Task.checkCancellation()

            // 4 reconnect
            stage = .reconnect
            let gotIP = try await waitFor(timeouts.ipAssigned) {
                let ip = reader.readState().ipv4
                return ip.map { IPValidator.isIPv4($0) && !IPValidator.isSelfAssigned($0) } ?? false
            }
            if !gotIP { throw BridgeError(.timeout, "No IPv4 address was assigned within 20 seconds.", stage: .reconnect) }
            emit(.reconnect, .active, "reconnect.ipAssigned", "An IPv4 address is assigned.", ["ip": .of(reader.readState().ipv4)])
            if try await waitFor(timeouts.path, { reader.pathSatisfied() }) {
                emit(.reconnect, .active, "reconnect.pathSatisfied", "macOS reports a usable network path.")
            }
            var online = false
            for attempt in 1...max(1, timeouts.probeTries) {
                try Task.checkCancellation()
                let r = await connectivity.probe()
                if r.outcome == .online { online = true; latency = r.latencyMs; break }
                if attempt < timeouts.probeTries { try await clock.sleep(ms: timeouts.probeGap) }
            }
            if online {
                internet = "restored"
                emit(.reconnect, .done, "reconnect.internetVerified", "Internet restored.", ["latencyMs": latency.map { .number(Double($0)) } ?? .null])
            } else {
                internet = "unavailable"
                emit(.reconnect, .done, "reconnect.internetUnavailable", "The local network is up but the internet check did not succeed.")
            }
        } catch let e as BridgeError {
            if e.code == .cancelled { cancelled = true } else {
                failure = OperationFailure(stage: e.stage ?? stage, code: e.code, message: e.message)
                emit(e.stage ?? stage, .failed, "\((e.stage ?? stage).rawValue).failed", e.message)
            }
        } catch is CancellationError {
            cancelled = true
        } catch {
            failure = OperationFailure(stage: stage, code: .internal, message: error.localizedDescription)
            emit(stage, .failed, "\(stage.rawValue).failed", error.localizedDescription)
        }

        // Always restore Wi-Fi before measuring results (retry every 500 ms, up to ~3 s).
        await restoreWifi(deadlineMs: 3_000)
        if wifiTurnedOff != nil {
            cancelled = false // an unrestored Wi-Fi is always a failure, even after cancel
            if failure?.code != .powerToggleFailed {
                failure = OperationFailure(stage: .wifi, code: .powerToggleFailed, message: "Wi-Fi could not be turned back on. Turn it on from the menu bar.")
                emit(.wifi, .failed, "wifi.failed", "Wi-Fi could not be turned back on.")
            }
        }

        // 5 results — measured values only
        let finalState = reader.readState()
        var publicAfter: String?
        if failure == nil && !cancelled {
            let pub = await connectivity.publicIP(force: true)
            publicAfter = pub.status == "ok" ? pub.address : nil
        }
        let finished = clock.now()
        let outcome: Outcome
        if cancelled { outcome = .cancelled }
        else if failure != nil { outcome = .failed }
        else { outcome = OutcomeCalculator.outcome(previous: baseline.ipv4, current: finalState.ipv4) }
        if outcome == .failed && failure == nil {
            failure = OperationFailure(stage: .reconnect, code: .internal, message: "No valid IPv4 address could be read back from macOS.")
        }
        let result = OperationResult(
            id: id, mode: mode, interfaceName: baseline.interfaceName, ssid: finalState.ssid ?? baseline.ssid,
            startedAt: ISO8601.string(started), finishedAt: ISO8601.string(finished),
            durationMs: max(0, Int(finished.timeIntervalSince(started) * 1000)),
            previousIP: baseline.ipv4, currentIP: finalState.ipv4, outcome: outcome, leaseRenewed: leaseRenewed,
            leaseStart: ISO8601.opt(finalState.leaseStart), dhcpServer: finalState.dhcpServer ?? baseline.dhcpServer,
            internet: internet, internetLatencyMs: latency, publicIPBefore: publicBefore, publicIPAfter: publicAfter,
            failure: failure)
        emit(.results, .done, "results.ready", resultMessage(result), ["outcome": .string(outcome.rawValue)])
        var all: [HistoryEntry] = []
        if let history { all = (try? history.add(result)) ?? history.list() }
        lastResult = result
        task = nil
        onResult(result, all)
    }

    private func resultMessage(_ r: OperationResult) -> String {
        switch r.outcome {
        case .changed: return "Address changed."
        case .unchanged: return "Lease renewed — same address."
        case .cancelled: return "Cancelled."
        case .failed: return r.failure?.message ?? "The switch did not complete."
        }
    }
}
