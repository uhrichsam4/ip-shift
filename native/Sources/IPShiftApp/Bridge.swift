import AppKit
import WebKit
import IPShiftCore

/// WKScriptMessageHandlerWithReply named "ipshift". Validates origin, command and args.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "ipshift"
    static let commands: Set<String> = [
        "app.info", "network.snapshot", "network.refresh", "switch.start", "switch.cancel", "switch.state",
        "history.list", "history.clear", "history.export", "settings.get", "settings.update", "diagnostics.run",
        "permissions.requestLocation", "system.openSettings", "clipboard.write",
    ]

    unowned let app: AppController
    init(app: AppController) { self.app = app }

    private func originAllowed(_ origin: WKSecurityOrigin) -> Bool {
        if origin.protocol == AppSchemeHandler.scheme && origin.host == AppSchemeHandler.host { return true }
        if let dev = app.devURL, origin.protocol == dev.scheme, origin.host == dev.host {
            let port = dev.port ?? (dev.scheme == "https" ? 443 : 80)
            return origin.port == port || (origin.port == 0 && dev.port == nil)
        }
        return false
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard originAllowed(message.frameInfo.securityOrigin) else {
            replyHandler(Self.fail(BridgeError(.invalidArgument, "Message origin not allowed.")), nil); return
        }
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else {
            replyHandler(Self.fail(BridgeError(.invalidArgument, "Expected { cmd, args }.")), nil); return
        }
        guard Self.commands.contains(cmd) else {
            replyHandler(Self.fail(BridgeError(.unknownCommand, "Unknown command '\(cmd)'.")), nil); return
        }
        let rawArgs = body["args"]
        let args: [String: Any]
        if rawArgs == nil || rawArgs is NSNull { args = [:] }
        else if let a = rawArgs as? [String: Any] { args = a }
        else { replyHandler(Self.fail(BridgeError(.invalidArgument, "args must be an object.")), nil); return }

        Task { @MainActor in
            do {
                let data = try await self.handle(cmd, args)
                replyHandler(["ok": true, "data": data], nil)
            } catch let e as BridgeError {
                replyHandler(Self.fail(e), nil)
            } catch {
                replyHandler(Self.fail(BridgeError(.internal, error.localizedDescription)), nil)
            }
        }
    }

    static func fail(_ e: BridgeError) -> [String: Any] {
        var err: [String: Any] = ["code": e.code.rawValue, "message": e.message]
        if let s = e.stage { err["stage"] = s.rawValue }
        return ["ok": false, "error": err]
    }

    private func onlyKeys(_ args: [String: Any], _ allowed: Set<String>) throws {
        if let bad = args.keys.first(where: { !allowed.contains($0) }) {
            throw BridgeError(.invalidArgument, "Unexpected argument '\(bad)'.")
        }
    }

    private func isBool(_ v: Any) -> Bool { CFGetTypeID(v as CFTypeRef) == CFBooleanGetTypeID() }

    private func handle(_ cmd: String, _ args: [String: Any]) async throws -> Any {
        switch cmd {
        case "app.info":
            try onlyKeys(args, [])
            let info = Bundle.main.infoDictionary
            #if arch(arm64)
            let arch = "arm64"
            #else
            let arch = "x86_64"
            #endif
            return try JSON.object(AppInfo(version: info?["CFBundleShortVersionString"] as? String ?? "1.0.0",
                                           build: info?["CFBundleVersion"] as? String ?? "1",
                                           macOSVersion: macOSVersionString(), arch: arch, bridge: "native"))
        case "network.snapshot":
            try onlyKeys(args, [])
            return try JSON.object(await app.currentSnapshot())
        case "network.refresh":
            try onlyKeys(args, ["includePublicIP"])
            var include = false
            if let v = args["includePublicIP"] {
                guard isBool(v), let b = v as? Bool else { throw BridgeError(.invalidArgument, "includePublicIP must be a boolean.") }
                include = b
            }
            return try JSON.object(await app.refresh(includePublicIP: include))
        case "switch.start":
            try onlyKeys(args, ["mode"])
            guard let m = args["mode"] as? String, let mode = SwitchMode(rawValue: m) else {
                throw BridgeError(.invalidArgument, "mode must be 'renew' or 'reconnect'.")
            }
            let id = try await app.engine.start(mode: mode)
            return ["operationId": id]
        case "switch.cancel":
            try onlyKeys(args, [])
            return ["cancelled": await app.engine.cancel()]
        case "switch.state":
            try onlyKeys(args, [])
            return try JSON.object(await app.engine.state())
        case "history.list":
            try onlyKeys(args, [])
            return try JSON.object(app.history.list())
        case "history.clear":
            try onlyKeys(args, [])
            let n = try app.history.clear()
            app.send("history", [HistoryEntry]())
            return ["cleared": n]
        case "history.export":
            try onlyKeys(args, [])
            let panel = NSSavePanel()
            panel.nameFieldStringValue = "IP SHIFT History.json"
            panel.allowedContentTypes = [.json]
            panel.canCreateDirectories = true
            let response = await withCheckedContinuation { (c: CheckedContinuation<NSApplication.ModalResponse, Never>) in
                if let w = app.webView?.window { panel.beginSheetModal(for: w) { c.resume(returning: $0) } }
                else { c.resume(returning: panel.runModal()) }
            }
            guard response == .OK, let url = panel.url else { return ["path": NSNull()] }
            try app.history.exportData().write(to: url, options: .atomic)
            return ["path": url.path]
        case "settings.get":
            try onlyKeys(args, [])
            return try JSON.object(app.settings.get())
        case "settings.update":
            let before = app.settings.get()
            let s = try app.settings.update(args)
            if before.publicIPLookup != s.publicIPLookup || before.publicIPProvider != s.publicIPProvider {
                app.refreshInBackground(force: true)
            }
            return try JSON.object(s)
        case "diagnostics.run":
            try onlyKeys(args, [])
            let s = app.settings.get()
            let svc = app.publicIP
            return try JSON.object(await Diagnostics.run(location: app.location.status) {
                await svc.lookup(provider: s.publicIPProvider, enabled: s.publicIPLookup, force: true)
            })
        case "permissions.requestLocation":
            try onlyKeys(args, [])
            let status = await withCheckedContinuation { (c: CheckedContinuation<LocationAuthorization, Never>) in
                app.location.request { c.resume(returning: $0) }
            }
            app.emitSnapshot()
            return ["status": status.rawValue]
        case "system.openSettings":
            try onlyKeys(args, ["pane"])
            let urls = [
                "location": "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
                "network": "x-apple.systempreferences:com.apple.Network-Settings.extension",
                "wifi": "x-apple.systempreferences:com.apple.wifi-settings-extension",
            ]
            guard let pane = args["pane"] as? String, let s = urls[pane], let url = URL(string: s) else {
                throw BridgeError(.invalidArgument, "pane must be 'location', 'network' or 'wifi'.")
            }
            return ["opened": NSWorkspace.shared.open(url)]
        case "clipboard.write":
            try onlyKeys(args, ["text"])
            guard let text = args["text"] as? String, text.count <= 100_000 else {
                throw BridgeError(.invalidArgument, "text must be a string.")
            }
            NSPasteboard.general.clearContents()
            return ["written": NSPasteboard.general.setString(text, forType: .string)]
        default:
            throw BridgeError(.unknownCommand, "Unknown command '\(cmd)'.")
        }
    }
}
