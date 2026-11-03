import Foundation
import CoreLocation
import IPShiftCore

// Read-only verification tool. Never changes network state.
let args = CommandLine.arguments.dropFirst()
let cmd = args.first ?? "snapshot"
let settings = SettingsStore()
let history = HistoryStore()

func location() -> LocationAuthorization { LocationAuthority.map(CLLocationManager().authorizationStatus) }

func out<T: Encodable>(_ v: T) { print(JSON.string(v)) }

Task {
    switch cmd {
    case "snapshot":
        _ = PathWatcher.shared
        try? await Task.sleep(nanoseconds: 300_000_000)
        let probe = await CaptiveProbe.run()
        let s = settings.get()
        let pub = await PublicIPService().lookup(provider: s.publicIPProvider, enabled: s.publicIPLookup, force: true)
        let internet: String = probe.outcome == .online ? "online" : (probe.outcome == .captive ? "captive" : "offline")
        out(SnapshotBuilder.build(location: location(),
                                  connectivity: ConnectivityInfo(path: PathWatcher.shared.status, internet: internet, lastProbe: probe.record),
                                  publicIP: pub))
    case "diagnostics":
        _ = PathWatcher.shared
        let s = settings.get()
        out(await Diagnostics.run(location: location()) {
            await PublicIPService().lookup(provider: s.publicIPProvider, enabled: s.publicIPLookup, force: true)
        })
    case "history":
        out(history.list())
    case "settings":
        out(settings.get())
    default:
        FileHandle.standardError.write(Data("usage: ipshift-cli snapshot|diagnostics|history|settings\n".utf8))
        exit(2)
    }
    exit(0)
}
dispatchMain()
