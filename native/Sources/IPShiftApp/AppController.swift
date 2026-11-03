import AppKit
import WebKit
import IPShiftCore

/// Owns core services and the bridge. All UI work on the main thread.
@MainActor
final class AppController: NSObject {
    let settings = SettingsStore()
    let history = HistoryStore()
    let publicIP = PublicIPService()
    let location = LocationAuthority()
    private(set) var engine: SwitchEngine!
    private var monitor: NetworkChangeMonitor?
    private var lastProbe: ProbeResult?
    private var internetState = "unknown"
    private var metricsTimer: Timer?
    weak var webView: WKWebView?
    var windowVisible = true { didSet { updateMetricsTimer() } }
    let devURL: URL?

    init(devURL: URL?) {
        self.devURL = devURL
        super.init()
        let settingsStore = settings
        engine = SwitchEngine(
            wifi: LiveWifiControl(), dhcp: LiveDHCPRenewer(), reader: LiveNetworkReader(),
            connectivity: LiveConnectivity(publicIPService: publicIP, settings: { settingsStore.get() }),
            history: history,
            onEvent: { [weak self] e in Task { @MainActor in self?.send("operation", e) } },
            onResult: { [weak self] r, all in Task { @MainActor in
                self?.send("operationResult", r)
                self?.send("history", all)
                self?.refreshInBackground(force: true)
            } })
        location.onChange = { [weak self] _ in Task { @MainActor in self?.emitSnapshot() } }
        _ = PathWatcher.shared
        monitor = NetworkChangeMonitor { [weak self] in Task { @MainActor in self?.emitSnapshot() } }
        monitor?.start()
        refreshInBackground(force: false)
        updateMetricsTimer()
    }

    // MARK: snapshot

    func currentSnapshot() async -> NetworkSnapshot {
        let pub = await publicIP.current() ?? (settings.get().publicIPLookup ? .pending : .disabled)
        return SnapshotBuilder.build(
            location: location.status,
            connectivity: ConnectivityInfo(path: PathWatcher.shared.status, internet: internetState, lastProbe: lastProbe?.record),
            publicIP: settings.get().publicIPLookup ? pub : .disabled)
    }

    func refresh(includePublicIP: Bool) async -> NetworkSnapshot {
        internetState = "checking"
        let probe = await CaptiveProbe.run()
        lastProbe = probe
        internetState = probe.outcome == .online ? "online" : (probe.outcome == .captive ? "captive" : "offline")
        let s = settings.get()
        _ = await publicIP.lookup(provider: s.publicIPProvider, enabled: s.publicIPLookup, force: includePublicIP)
        return await currentSnapshot()
    }

    func refreshInBackground(force: Bool) {
        Task { @MainActor in
            let snap = await refresh(includePublicIP: force)
            send("snapshot", snap)
        }
    }

    func emitSnapshot() {
        Task { @MainActor in send("snapshot", await currentSnapshot()) }
    }

    // MARK: metrics

    private func updateMetricsTimer() {
        metricsTimer?.invalidate(); metricsTimer = nil
        guard windowVisible else { return }
        metricsTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let ifname = WifiDetector.detect()?.bsdName else { return }
                self.send("metrics", WifiDetailsReader.metrics(ifname))
            }
        }
    }

    // MARK: events

    func send<T: Encodable>(_ type: String, _ payload: T) {
        guard let webView, let obj = try? JSON.object(payload) else { return }
        let event: [String: Any] = ["type": type, "payload": obj]
        webView.callAsyncJavaScript("window.__IPSHIFT__ && window.__IPSHIFT__.dispatch(e)", arguments: ["e": event], in: nil, in: .page, completionHandler: nil)
    }

    struct MenuPayload: Encodable { let action: String; let target: String? }
    func sendMenu(_ action: String, target: String? = nil) { send("menu", MenuPayload(action: action, target: target)) }

    // MARK: termination safety

    func prepareForTermination(_ done: @escaping () -> Void) {
        Task {
            let running = await engine.isRunning
            let needs = await engine.wifiNeedsRestore
            if running || needs {
                let start = Date()
                _ = await engine.cancel()
                await engine.waitUntilIdle(timeoutMs: 5000)
                let remaining = max(0, 5000 - Int(Date().timeIntervalSince(start) * 1000))
                await engine.restoreWifi(deadlineMs: remaining) // retries every 500 ms within the 5 s budget
            }
            await MainActor.run { done() }
        }
    }
}
