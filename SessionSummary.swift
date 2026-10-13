import AppKit
import WebKit

/// Painel local compartilhando a interface e o leitor de dados com o Electron.
@MainActor
final class SessionSummaryController: NSObject, WKScriptMessageHandler, NSWindowDelegate {
    static let shared = SessionSummaryController()
    private final class AccountPage {
        let id: String
        var name: String
        weak var view: WKWebView?
        init(id: String, name: String, view: WKWebView) { self.id = id; self.name = name; self.view = view }
    }
    private var pages: [AccountPage] = []
    private var selected = ""
    private var panel: NSPanel?
    private var summaryView: WKWebView?
    private var openApp: (() -> Void)?

    func readerScript() -> WKUserScript? {
        guard let url = Bundle.main.url(forResource: "game-session", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    func register(id: String, name: String, view: WKWebView, isSelected: Bool) {
        if let page = pages.first(where: { $0.id == id }) { page.name = name; page.view = view }
        else { pages.append(AccountPage(id: id, name: name, view: view)) }
        if isSelected { selected = id }
    }

    func remove(_ view: WKWebView) { pages.removeAll { $0.view === view || $0.view == nil } }
    func hide() { panel?.orderOut(nil) }
    func windowDidResignKey(_ notification: Notification) { hide() }

    func show(relativeTo button: NSStatusBarButton?, open: @escaping () -> Void) {
        openApp = open
        guard let directory = Bundle.main.resourceURL?.appendingPathComponent("SessionSummary"),
              let screen = button?.window?.screen ?? NSScreen.main else { return }
        let area = screen.visibleFrame
        let width = min(CGFloat(420), area.width - 16)
        let height = min(CGFloat(680), area.height - 50)
        if panel == nil {
            let window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                                 styleMask: [.titled, .closable, .utilityWindow], backing: .buffered, defer: false)
            window.title = "Resumo da sessão"
            window.isReleasedWhenClosed = false
            window.hidesOnDeactivate = true
            window.level = .floating
            window.delegate = self
            window.appearance = NSAppearance(named: .darkAqua)
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .nonPersistent()
            config.userContentController.add(self, name: "pfSummary")
            let view = WKWebView(frame: .zero, configuration: config)
            view.underPageBackgroundColor = NSColor(calibratedWhite: 0.078, alpha: 1)
            window.contentView = view
            summaryView = view
            panel = window
            view.loadFileURL(directory.appendingPathComponent("session.html"), allowingReadAccessTo: directory)
        }
        let anchor = button?.window?.frame ?? NSRect(x: area.maxX, y: area.maxY, width: 0, height: 0)
        panel?.setContentSize(NSSize(width: width, height: height))
        let frame = panel?.frame.size ?? NSSize(width: width, height: height)
        let x = max(area.minX + 8, min(anchor.maxX - frame.width, area.maxX - frame.width - 8))
        let y = max(area.minY + 8, min(anchor.minY - frame.height - 8, area.maxY - frame.height - 8))
        panel?.setFrameOrigin(NSPoint(x: x, y: y))
        panel?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.webView === summaryView,
              message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "close": hide()
        case "open": hide(); openApp?()
        case "get":
            guard let id = body["id"] as? Int else { return }
            Task {
                var accounts: [[String: Any]] = []
                for page in pages {
                    guard let view = page.view else { continue }
                    var data: [String: Any] = ["status": "waiting"]
                    if let host = view.url?.host, host == "pokeidle.io" || host.hasSuffix(".pokeidle.io") {
                        if let result = try? await view.evaluateJavaScript("window.__pfReadSessionSummary ? window.__pfReadSessionSummary() : ({status: 'waiting'})"),
                           let snapshot = result as? [String: Any] { data = snapshot }
                    }
                    accounts.append(["id": page.id, "name": page.name, "data": data])
                }
                let response: [String: Any] = ["id": id, "data": ["accounts": accounts, "selected": selected]]
                summaryView?.callAsyncJavaScript("window.pfReceiveSession(response)", arguments: ["response": response],
                                                 in: nil, in: .page, completionHandler: nil)
            }
        default: break
        }
    }
}
