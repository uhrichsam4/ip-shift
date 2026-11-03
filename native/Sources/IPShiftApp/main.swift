import AppKit
import WebKit
import IPShiftCore

let backgroundColor = NSColor(srgbRed: 3 / 255, green: 5 / 255, blue: 10 / 255, alpha: 1) // #03050A

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var controller: AppController!
    var terminating = false

    var devURL: URL? {
        #if DEBUG
        if let s = ProcessInfo.processInfo.environment["IPSHIFT_DEV_URL"], let u = URL(string: s),
           u.scheme == "http" || u.scheme == "https" { return u }
        #endif
        return nil
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        controller = AppController(devURL: devURL)
        buildMenu()

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: AppSchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(Bridge(app: controller), contentWorld: .page, name: Bridge.name)
        Self.allowFullRefreshRate(config.preferences)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = backgroundColor
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        webView.isInspectable = true
        #else
        webView.isInspectable = ProcessInfo.processInfo.environment["IPSHIFT_INSPECT"] == "1"
        #endif
        controller.webView = webView

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "IP SHIFT"
        window.backgroundColor = backgroundColor
        window.minSize = NSSize(width: 1100, height: 700)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("IPShiftMainWindow")
        window.isReleasedWhenClosed = false
        NotificationCenter.default.addObserver(forName: NSWindow.didChangeOcclusionStateNotification, object: window, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                let visible = self.window.occlusionState.contains(.visible)
                self.controller.windowVisible = visible
                struct W: Encodable { let visible: Bool }
                self.controller.send("window", W(visible: visible))
            }
        }

        if let dev = devURL { webView.load(URLRequest(url: dev)) }
        else {
            // IPSHIFT_BENCH=1 runs the in-app frame-time benchmark (web/src/bench) instead of normal startup.
            let bench = ProcessInfo.processInfo.environment["IPSHIFT_BENCH"] == "1"
            webView.load(URLRequest(url: URL(string: bench ? "ipshift://app/index.html?bench=1" : "ipshift://app/index.html")!))
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating { return .terminateNow }
        terminating = true
        // Safety: wait (≤5 s) for an in-flight switch to unwind and Wi-Fi power to be restored.
        controller.prepareForTermination { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }

    // MARK: navigation policy — only ipshift:// (and the dev URL)

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == AppSchemeHandler.scheme && url.host == AppSchemeHandler.host { decisionHandler(.allow); return }
        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            decisionHandler(navigationAction.targetFrame?.isMainFrame == false ? .allow : .cancel); return
        }
        if let dev = devURL, url.scheme == dev.scheme, url.host == dev.host, url.port == dev.port { decisionHandler(.allow); return }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // MARK: menus

    private func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, tag: Int = 0) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        i.keyEquivalentModifierMask = mods
        i.tag = tag
        return i
    }

    /// WebKit caps requestAnimationFrame near 60 Hz on ProMotion displays unless the
    /// "PreferPageRenderingUpdatesNear60FPSEnabled" feature is off. Turn it off so the 3D
    /// stage can render at the display's full refresh rate (e.g. 120 Hz). Uses WebKit's
    /// feature-flag SPI defensively: if the selectors are missing, nothing changes.
    private static func allowFullRefreshRate(_ prefs: WKPreferences) {
        let featuresSel = NSSelectorFromString("_features")
        let setSel = NSSelectorFromString("_setEnabled:forFeature:")
        guard WKPreferences.responds(to: featuresSel), prefs.responds(to: setSel),
              let list = (WKPreferences.self as AnyObject).perform(featuresSel)?.takeUnretainedValue() as? [NSObject],
              let method = class_getInstanceMethod(WKPreferences.self, setSel) else { return }
        typealias SetEnabled = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        let setEnabled = unsafeBitCast(method_getImplementation(method), to: SetEnabled.self)
        for feature in list where (feature.value(forKey: "key") as? String) == "PreferPageRenderingUpdatesNear60FPSEnabled" {
            setEnabled(prefs, setSel, false, feature)
        }
    }

    private func buildMenu() {
        let main = NSMenu()

        let appMenu = NSMenu(title: "IP SHIFT")
        appMenu.addItem(item("About IP SHIFT", #selector(NSApplication.orderFrontStandardAboutPanel(_:))))
        appMenu.addItem(.separator())
        let settingsItem = item("Settings…", #selector(menuNavigate(_:)), ",", tag: 5)
        settingsItem.target = self
        appMenu.addItem(settingsItem)
        appMenu.addItem(.separator())
        appMenu.addItem(item("Hide IP SHIFT", #selector(NSApplication.hide(_:)), "h"))
        appMenu.addItem(item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]))
        appMenu.addItem(item("Show All", #selector(NSApplication.unhideAllApplications(_:))))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Quit IP SHIFT", #selector(NSApplication.terminate(_:)), "q"))
        addSubmenu(main, appMenu)

        let edit = NSMenu(title: "Edit")
        edit.addItem(item("Undo", Selector(("undo:")), "z"))
        edit.addItem(item("Redo", Selector(("redo:")), "z", [.command, .shift]))
        edit.addItem(.separator())
        edit.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        edit.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        edit.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        edit.addItem(item("Select All", #selector(NSText.selectAll(_:)), "a"))
        addSubmenu(main, edit)

        let network = NSMenu(title: "Network")
        for (t, sel, k, mods) in [("Refresh", #selector(menuRefresh), "r", NSEvent.ModifierFlags.command),
                                  ("Switch IP", #selector(menuSwitch), "\r", .command),
                                  ("Run Diagnostics", #selector(menuDiagnostics), "", .command)] {
            let i = item(t, sel, k, mods); i.target = self; network.addItem(i)
        }
        addSubmenu(main, network)

        let view = NSMenu(title: "View")
        for (n, t) in ["Dashboard", "Network", "History", "Diagnostics", "Settings"].enumerated() {
            let i = item(t, #selector(menuNavigate(_:)), "\(n + 1)", tag: n + 1); i.target = self; view.addItem(i)
        }
        view.addItem(.separator())
        view.addItem(item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))
        addSubmenu(main, view)

        let win = NSMenu(title: "Window")
        win.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        win.addItem(item("Zoom", #selector(NSWindow.performZoom(_:))))
        win.addItem(item("Close", #selector(NSWindow.performClose(_:)), "w"))
        addSubmenu(main, win)
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }

    private func addSubmenu(_ main: NSMenu, _ sub: NSMenu) {
        let holder = NSMenuItem(title: sub.title, action: nil, keyEquivalent: "")
        holder.submenu = sub
        main.addItem(holder)
    }

    static let navTargets = [1: "dashboard", 2: "network", 3: "history", 4: "diagnostics", 5: "settings"]

    @objc func menuNavigate(_ sender: NSMenuItem) { controller.sendMenu("navigate", target: Self.navTargets[sender.tag]) }
    @objc func menuRefresh() { controller.sendMenu("refresh"); controller.refreshInBackground(force: true) }
    @objc func menuSwitch() { controller.sendMenu("switch") } // UI confirms, then calls switch.start
    @objc func menuDiagnostics() { controller.sendMenu("diagnostics") }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { AppDelegate() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
