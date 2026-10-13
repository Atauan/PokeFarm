import AppKit
import SwiftUI

/// Mantém as janelas SwiftUI e seus WebViews vivos quando o usuário fecha.
@MainActor
final class TrayController: NSObject {
    static let shared = TrayController()
    private var statusItem: NSStatusItem?
    private var aboutWindow: NSWindow?
    private var pendingClick: DispatchWorkItem?
    private var windows: [NSWindow] = []
    private var windowDelegates: [TrayWindowDelegate] = []
    private(set) var isQuitting = false

    func start() {
        guard statusItem == nil else { return }
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = item.button {
            let image = NSImage(named: NSImage.applicationIconName)?.copy() as? NSImage
            image?.size = NSSize(width: 18, height: 18)
            button.image = image
            if image == nil { button.title = "PF" }
            button.toolTip = "PokeFarm"
            button.target = self
            button.action = #selector(statusItemClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        statusItem = item
    }

    func register(_ window: NSWindow) {
        guard !windows.contains(where: { $0 === window }) else { return }
        start()
        let delegate = TrayWindowDelegate(original: window.delegate)
        windows.append(window)
        windowDelegates.append(delegate) // NSWindow.delegate é weak.
        window.delegate = delegate
    }

    func showWindow() {
        pendingClick?.cancel()
        SessionSummaryController.shared.hide()
        guard !isQuitting, let window = windows.last else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func prepareToQuit() { isQuitting = true; pendingClick?.cancel() }

    @objc func showAbout(_ sender: Any? = nil) {
        guard !isQuitting else { return }
        if aboutWindow == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 640),
                                  styleMask: [.titled, .closable], backing: .buffered, defer: false)
            window.title = "Sobre o PokeFarm"
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: .darkAqua)
            window.contentView = NSHostingView(rootView: AboutView { [weak window] in window?.close() })
            window.center()
            aboutWindow = window
        }
        aboutWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        let event = NSApp.currentEvent
        pendingClick?.cancel()
        if event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true {
            SessionSummaryController.shared.hide()
            let menu = NSMenu()
            let about = NSMenuItem(title: "Sobre", action: #selector(showAbout(_:)), keyEquivalent: "")
            about.target = self
            menu.addItem(about)
            menu.addItem(.separator())
            let quit = NSMenuItem(title: "Sair", action: #selector(quitApplication(_:)), keyEquivalent: "")
            quit.target = self
            menu.addItem(quit)
            // Não atribui statusItem.menu: o clique esquerdo deve abrir a janela.
            menu.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.maxY), in: sender)
        } else if (event?.clickCount ?? 1) >= 2 {
            showWindow()
        } else {
            let work = DispatchWorkItem { [weak self, weak sender] in
                guard let self, !self.isQuitting else { return }
                if let window = self.windows.last, !window.isVisible || window.isMiniaturized {
                    SessionSummaryController.shared.show(relativeTo: sender) { [weak self] in self?.showWindow() }
                } else { self.showWindow() }
            }
            pendingClick = work
            DispatchQueue.main.asyncAfter(deadline: .now() + NSEvent.doubleClickInterval, execute: work)
        }
    }

    @objc private func quitApplication(_ sender: Any?) {
        prepareToQuit()
        NSApp.terminate(sender)
    }
}

/// Encaminha os demais callbacks para o delegate que o SwiftUI já instalou.
/// Assim resize, tela cheia e restauração continuam sob controle do SwiftUI.
private final class TrayWindowDelegate: NSObject {
    private let original: NSWindowDelegate?

    init(original: NSWindowDelegate?) { self.original = original }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || (original?.responds(to: selector) ?? false)
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        if original?.responds(to: selector) == true { return original }
        return super.forwardingTarget(for: selector)
    }
}

extension TrayWindowDelegate: NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if TrayController.shared.isQuitting { return true }
        sender.orderOut(nil)
        return false
    }
}

/// Captura somente janelas de ContentView; login e chats continuam fechando normalmente.
struct TrayWindowRegistration: NSViewRepresentable {
    final class WindowView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            guard let window else { return }
            // Aguarda o SwiftUI terminar de configurar o delegate da janela.
            DispatchQueue.main.async { TrayController.shared.register(window) }
        }
    }

    func makeNSView(context: Context) -> WindowView { WindowView() }
    func updateNSView(_ nsView: WindowView, context: Context) {}
}

final class PokeFarmAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        TrayController.shared.start()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        TrayController.shared.showWindow()
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        TrayController.shared.prepareToQuit()
        return .terminateNow
    }
}
