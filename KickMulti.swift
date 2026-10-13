import SwiftUI
import WebKit
import IOKit.pwr_mgt
import UserNotifications

// MARK: - Modelo

enum Platform: String, CaseIterable, Identifiable, Codable {
    case kick, twitch
    var id: String { rawValue }
    var title: String { self == .kick ? "Kick" : "Twitch" }
    var color: Color { self == .kick ? Color(red: 0.33, green: 0.93, blue: 0.1) : Color(red: 0.57, green: 0.27, blue: 1.0) }
    var host: String { self == .kick ? "kick.com" : "twitch.tv" }

    func playerURL(_ channel: String, muted: Bool) -> URL {
        switch self {
        case .kick:
            return URL(string: "https://player.kick.com/\(channel)?autoplay=true&muted=\(muted)")!
        case .twitch:
            // Página completa do canal: o player avulso/embutido não conta pontos de canal.
            // O CSS injetado deixa só o vídeo visível.
            return URL(string: "https://www.twitch.tv/\(channel)")!
        }
    }

    func chatURL(_ channel: String) -> URL {
        switch self {
        case .kick: return URL(string: "https://kick.com/popout/\(channel)/chat")!
        case .twitch: return URL(string: "https://www.twitch.tv/popout/\(channel)/chat?popout=")!
        }
    }

    var loginURL: URL {
        self == .kick ? URL(string: "https://kick.com/")! : URL(string: "https://www.twitch.tv/login")!
    }
}

/// Uma conta do Pokeidle rodando numa aba própria, com login separado.
struct GameAccount: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    /// Conta original: usa o mesmo armazenamento das lives (mantém o login que já existia)
    var usesDefaultStore = false
}

/// Armazenamento (cookies/login) de cada conta.
enum GameStore {
    /// Logins separados e salvos por conta exigem macOS 14+
    static var separateLoginsSupported: Bool {
        if #available(macOS 14.0, *) { return true }
        return false
    }

    static func dataStore(_ a: GameAccount) -> WKWebsiteDataStore {
        if a.usesDefaultStore { return .default() }
        if #available(macOS 14.0, *) { return WKWebsiteDataStore(forIdentifier: a.id) }
        return .nonPersistent()   // macOS 13: separado, mas o login some ao fechar o app
    }

    /// Apaga o login da conta. Espera a aba fechar antes (o WebKit não apaga armazenamento em uso).
    static func remove(_ a: GameAccount) {
        guard !a.usesDefaultStore else { return }
        if #available(macOS 14.0, *) {
            let id = a.id
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                try? await WKWebsiteDataStore.remove(forIdentifier: id)
            }
        }
    }
}

enum AppTab: String, CaseIterable, Identifiable {
    case lives, game, alerts
    var id: String { rawValue }
    var title: String { ["lives": "Lives", "game": "Pokeidle", "alerts": "Alertas"][rawValue]! }
}

/// Qualidade das lives (menor = menos CPU e internet). Vale para todas.
enum VideoQuality: Int, CaseIterable, Identifiable {
    case lowest = 0, low, medium, auto
    var id: Int { rawValue }
    var label: String { ["Mínima (160p)", "Baixa (360p)", "Média (480p)", "Automática"][rawValue] }
    var height: Int { [160, 360, 480, 0][rawValue] }
    var twitchGroup: String { ["160p30", "360p30", "480p30", ""][rawValue] }
}

struct StreamItem: Identifiable, Codable, Equatable {
    var id = UUID()
    var channel: String
    var muted = true
    var reloadToken = 0
}

/// Item da grade (plataforma + canal)
struct Entry: Identifiable {
    let platform: Platform
    let item: StreamItem
    var id: UUID { item.id }
}

@MainActor
final class Store: ObservableObject {
    @Published var kick: [StreamItem] = [] { didSet { save(kick, "streams.v1"); configureLiveMonitoring() } }
    @Published var twitch: [StreamItem] = [] { didSet { save(twitch, "twitch.v1"); configureLiveMonitoring() } }
    @Published var columns: Int = UserDefaults.standard.integer(forKey: "columns") {
        didSet { UserDefaults.standard.set(columns, forKey: "columns") }
    }
    /// Pesos de tamanho: largura de cada bloco (por id) e altura de cada linha ("r0", "r1"...)
    @Published var tileWeights: [String: Double] =
        UserDefaults.standard.dictionary(forKey: "tileWeights") as? [String: Double] ?? [:]
    @Published var rowWeights: [String: Double] =
        UserDefaults.standard.dictionary(forKey: "rowWeights") as? [String: Double] ?? [:]

    func saveSizes() {
        UserDefaults.standard.set(tileWeights, forKey: "tileWeights")
        UserDefaults.standard.set(rowWeights, forKey: "rowWeights")
        UserDefaults.standard.set(freeFrames, forKey: "freeFrames")
    }

    /// Posição/tamanho livre de cada bloco (x, y, largura, altura em fração da área), por id
    @Published var freeFrames: [String: [Double]] =
        UserDefaults.standard.dictionary(forKey: "freeFrames") as? [String: [Double]] ?? [:]
    /// Bloco que fica por cima (o último mexido)
    @Published var frontTile: String?

    func resetSizes() {
        tileWeights = [:]; rowWeights = [:]; freeFrames = [:]; saveSizes()
    }
    @Published var quality: VideoQuality =
        VideoQuality(rawValue: UserDefaults.standard.object(forKey: "quality") as? Int ?? 0) ?? .lowest {
        didSet { UserDefaults.standard.set(quality.rawValue, forKey: "quality") }
    }
    @Published var showChat: Bool = UserDefaults.standard.object(forKey: "showChat") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showChat, forKey: "showChat") }
    }
    @Published var tab: AppTab = AppTab(rawValue: UserDefaults.standard.string(forKey: "tab") ?? "") ?? .lives {
        didSet { UserDefaults.standard.set(tab.rawValue, forKey: "tab") }
    }
    // MARK: Contas do Pokeidle (uma aba e um login separado para cada)

    @Published var accounts: [GameAccount] = Store.loadAccounts() {
        didSet { if let d = try? JSONEncoder().encode(accounts) { UserDefaults.standard.set(d, forKey: "gameAccounts") } }
    }
    /// Conta mostrada quando a aba ativa é a do jogo
    @Published var gameAccountID: UUID = {
        let saved = UserDefaults.standard.string(forKey: "gameAccountID").flatMap(UUID.init(uuidString:))
        let list = Store.loadAccounts()
        return list.first(where: { $0.id == saved })?.id ?? list[0].id
    }() {
        didSet { UserDefaults.standard.set(gameAccountID.uuidString, forKey: "gameAccountID") }
    }
    /// Contador de recarga por conta
    @Published var gameReloads: [UUID: Int] = [:]

    var currentAccount: GameAccount? { accounts.first { $0.id == gameAccountID } }

    private static func loadAccounts() -> [GameAccount] {
        if let d = UserDefaults.standard.data(forKey: "gameAccounts"),
           let list = try? JSONDecoder().decode([GameAccount].self, from: d), !list.isEmpty { return list }
        // Primeira vez: a conta que já existia continua com o login de antes
        return [GameAccount(name: "Conta 1", usesDefaultStore: true)]
    }

    func addAccount() {
        var n = accounts.count + 1
        while accounts.contains(where: { $0.name == "Conta \(n)" }) { n += 1 }
        let a = GameAccount(name: "Conta \(n)")
        accounts.append(a)
        gameAccountID = a.id
        tab = .game
    }

    func renameAccount(_ id: UUID, _ name: String) {
        guard let i = accounts.firstIndex(where: { $0.id == id }) else { return }
        let clean = String(name.replacingOccurrences(of: "\n", with: " ").prefix(30))
        if accounts[i].name != clean { accounts[i].name = clean }
    }

    /// Fecha a aba e apaga o login da conta (a conta original, que divide o login da Twitch/Kick, só fecha).
    func removeAccount(_ id: UUID) {
        guard accounts.count > 1, let a = accounts.first(where: { $0.id == id }) else { return }
        accounts.removeAll { $0.id == id }
        gameReloads[id] = nil
        if gameAccountID == id { gameAccountID = accounts[0].id }
        GameStore.remove(a)
    }

    func reloadGame(_ id: UUID) { gameReloads[id, default: 0] += 1 }

    @Published var twitchEconomy: Bool = UserDefaults.standard.bool(forKey: "twitchEconomy") {
        didSet { UserDefaults.standard.set(twitchEconomy, forKey: "twitchEconomy") }
    }
    @Published var economyReload = 0
    @Published var kickEconomy: Bool = UserDefaults.standard.bool(forKey: "kickEconomy") {
        didSet { UserDefaults.standard.set(kickEconomy, forKey: "kickEconomy") }
    }
    @Published private var liveRefreshing = false
    @Published private var manualDiscoveryPending = false
    @Published private(set) var gameImport: GameChannelImport = {
        guard let data = UserDefaults.standard.data(forKey: "gameChannelImport"),
              let saved = try? JSONDecoder().decode(GameChannelImport.self, from: data) else { return GameChannelImport() }
        return saved
    }()
    @Published var autoLives: Bool = UserDefaults.standard.object(forKey: "autoLives") as? Bool ?? true {
        didSet { UserDefaults.standard.set(autoLives, forKey: "autoLives"); configureLiveMonitoring() }
    }
    @Published var livePoll: Int = {
        let saved = UserDefaults.standard.object(forKey: "livePoll") as? Int ?? 60
        return [30, 60, 120, 300].contains(saved) ? saved : 60
    }() {
        didSet { UserDefaults.standard.set(livePoll, forKey: "livePoll"); configureLiveMonitoring() }
    }
    private let liveMonitor = LiveMonitor(checker: LiveStatusService(userAgent: Web.userAgent))

    init() {
        kick = Store.load("streams.v1")
        twitch = Store.load("twitch.v1")
        liveMonitor.onChange = { [weak self] in self?.objectWillChange.send() }
        importGameChannels()
        configureLiveMonitoring()
    }

    var all: [Entry] {
        kick.map { Entry(platform: .kick, item: $0) } + twitch.map { Entry(platform: .twitch, item: $0) }
    }

    var visibleEntries: [Entry] {
        let open = liveMonitor.openIDs
        return all.filter { open.contains($0.id) }
    }
    var liveChecking: Bool { liveMonitor.isChecking || liveRefreshing }
    var videoEntries: [Entry] { visibleEntries.filter { !twitchEconomy || $0.platform != .twitch } }
    var economyPlan: TwitchEconomyPlan {
        TwitchEconomyPlan(channels: visibleEntries.filter { $0.platform == .twitch }.map { $0.item.channel })
    }
    var unknownLives: Int { liveMonitor.states.values.filter { $0.status == .unknown }.count }
    var liveSummary: String {
        if liveChecking { return "Verificando canais…" }
        if manualDiscoveryPending { return "Abra o Pokeidle para carregar os canais" }
        let uncertain = unknownLives > 0 ? " · \(unknownLives) sem confirmação" : ""
        return "\(autoLives ? "" : "Automático desligado · ")\(visibleEntries.count) abertas\(uncertain)"
    }

    func checkLivesNow() {
        guard !liveChecking else { return }
        liveRefreshing = true
        manualDiscoveryPending = false
        gameImport.restoreIgnored()
        saveGameImport()
        let finish: ([[String: Any]]) -> Void = { [weak self] rows in
            guard let self else { return }
            let channels = rows.prefix(200).compactMap { row -> GameChannel? in
                guard let platform = row["platform"] as? String, let channel = row["channel"] as? String else { return nil }
                return GameChannel(platform: platform, channel: channel)
            }
            self.receiveGameChannels(channels)
            self.liveRefreshing = false
            self.manualDiscoveryPending = self.all.isEmpty
            self.liveMonitor.checkNow(manual: true)
        }
        if let game = MarketWatcher.shared.gameWebView {
            game.evaluateJavaScript("window.__pfReadGameChannels ? window.__pfReadGameChannels() : []") { value, _ in
                DispatchQueue.main.async { finish(value as? [[String: Any]] ?? []) }
            }
        } else { finish([]) }
    }

    func receiveGameChannels(_ channels: [GameChannel]) {
        gameImport.discover(channels)
        saveGameImport()
        importGameChannels()
        if manualDiscoveryPending && !all.isEmpty { checkLivesNow() }
    }

    private func saveGameImport() {
        if let data = try? JSONEncoder().encode(gameImport) { UserDefaults.standard.set(data, forKey: "gameChannelImport") }
    }

    private func importGameChannels() {
        var nextKick = kick, nextTwitch = twitch
        for channel in gameImport.candidates {
            if channel.platform == "kick" {
                if !nextKick.contains(where: { $0.channel == channel.channel }) { nextKick.append(StreamItem(channel: channel.channel)) }
            } else {
                if !nextTwitch.contains(where: { $0.channel == channel.channel }) { nextTwitch.append(StreamItem(channel: channel.channel)) }
            }
        }
        if nextKick != kick { kick = nextKick }
        if nextTwitch != twitch { twitch = nextTwitch }
    }

    private func ignoreGameChannel(_ channel: String, _ platform: Platform) {
        if let channel = GameChannel(platform: platform.rawValue, channel: channel) {
            gameImport.ignore(channel)
            saveGameImport()
        }
    }

    private func configureLiveMonitoring() {
        let channels = all.map { MonitoredChannel(id: $0.id, platform: $0.platform.rawValue, channel: $0.item.channel) }
        liveMonitor.configure(channels: channels, enabled: autoLives, interval: livePoll)
    }

    private func pruneRemovedLayouts() {
        let savedIDs = Set(all.map { $0.id.uuidString })
        freeFrames = freeFrames.filter { savedIDs.contains($0.key) }
        tileWeights = tileWeights.filter { savedIDs.contains($0.key) }
        if let frontTile, !savedIDs.contains(frontTile) { self.frontTile = nil }
        saveSizes()
    }

    private static func load(_ key: String) -> [StreamItem] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([StreamItem].self, from: data) else { return [] }
        return decoded
    }

    private func save(_ items: [StreamItem], _ key: String) {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func list(_ p: Platform) -> [StreamItem] { p == .kick ? kick : twitch }

    private func set(_ p: Platform, _ items: [StreamItem]) {
        if p == .kick { kick = items } else { twitch = items }
    }

    nonisolated static func clean(_ raw: String) -> String? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !s.isEmpty else { return nil }
        if let q = s.firstIndex(where: { $0 == "?" || $0 == "#" }) { s = String(s[..<q]) }
        if let last = s.split(separator: "/").last { s = String(last) }
        guard !s.isEmpty,
              s.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" })
        else { return nil }
        return s
    }

    /// Se o texto for um link, detecta a plataforma pelo domínio; senão usa a padrão.
    func add(_ text: String, default def: Platform) {
        let parts = text.components(separatedBy: CharacterSet(charactersIn: ", \n\t"))
        for raw in parts {
            guard let c = Store.clean(raw) else { continue }
            let low = raw.lowercased()
            let p: Platform = low.contains("twitch.tv") ? .twitch : (low.contains("kick.com") ? .kick : def)
            if let channel = GameChannel(platform: p.rawValue, channel: c) {
                gameImport.allow(channel)
                saveGameImport()
            }
            var items = list(p)
            if !items.contains(where: { $0.channel == c }) {
                items.append(StreamItem(channel: c))
                set(p, items)
            }
            if !autoLives, let item = items.first(where: { $0.channel == c }) { liveMonitor.openManually(item.id) }
        }
    }

    func update(_ id: UUID, _ p: Platform, _ change: (inout StreamItem) -> Void) {
        var items = list(p)
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[i])
        set(p, items)
    }

    func remove(_ id: UUID, _ p: Platform) {
        if let item = list(p).first(where: { $0.id == id }) { ignoreGameChannel(item.channel, p) }
        set(p, list(p).filter { $0.id != id })
        pruneRemovedLayouts()
    }

    func muteAll() {
        kick = kick.map { var s = $0; s.muted = true; return s }
        twitch = twitch.map { var s = $0; s.muted = true; return s }
    }

    func reloadAll() {
        economyReload += 1
        kick = kick.map { var s = $0; s.reloadToken += 1; return s }
        twitch = twitch.map { var s = $0; s.reloadToken += 1; return s }
    }

    func clear(_ p: Platform) {
        for item in list(p) { ignoreGameChannel(item.channel, p) }
        set(p, []); pruneRemovedLayouts()
    }
}

// MARK: - WebViews compartilhados

enum Web {
    static let userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    static let retired = NSHashTable<WKWebView>.weakObjects()

    /// Interrompe mídia, scripts e recuperação antes de liberar um bloco offline/removido.
    static func dispose(_ webView: WKWebView) {
        retired.add(webView)
        WebLoadQueue.shared.cancel(webView)
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.configuration.userContentController.removeAllUserScripts()
        webView.loadHTMLString("", baseURL: nil)
    }

    /// Todos usam o mesmo armazenamento: o login feito em qualquer janela vale para todas.
    static func config(store: WKWebsiteDataStore = .default()) -> WKWebViewConfiguration {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = store
        cfg.mediaTypesRequiringUserActionForPlayback = []
        if #available(macOS 14.0, *) {
            // Não pausar/desacelerar as lives quando a janela estiver em segundo plano
            cfg.preferences.inactiveSchedulingPolicy = .none
        }
        return cfg
    }

    static func make(_ cfg: WKWebViewConfiguration = config()) -> WKWebView {
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.customUserAgent = userAgent
        wv.allowsBackForwardNavigationGestures = false
        wv.uiDelegate = Popups.shared
        wv.navigationDelegate = Recovery.shared
        // Sem fundo branco enquanto a página não pinta (o bloco por trás é preto)
        wv.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { wv.underPageBackgroundColor = .black }
        return wv
    }

    /// Script de "manter vivo" injetado em todas as páginas (lives, chats e jogo):
    /// - finge que a página está sempre visível (tela bloqueada/janela minimizada não pausa nada)
    /// - volta a dar play em vídeos que o navegador pausou sozinho
    static let keepAliveJS = """
    (function () {
      try {
        Object.defineProperty(document, 'hidden', { get: function () { return false; } });
        Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; } });
        Object.defineProperty(document, 'webkitHidden', { get: function () { return false; } });
        Object.defineProperty(document, 'webkitVisibilityState', { get: function () { return 'visible'; } });
        document.hasFocus = function () { return true; };
        ['visibilitychange', 'webkitvisibilitychange'].forEach(function (ev) {
          document.addEventListener(ev, function (e) { e.stopImmediatePropagation(); }, true);
        });
        ['blur', 'pagehide', 'freeze'].forEach(function (ev) {
          window.addEventListener(ev, function (e) { e.stopImmediatePropagation(); }, true);
        });
      } catch (e) {}
      setInterval(function () {
        document.querySelectorAll('video').forEach(function (v) {
          // Qualquer vídeo parado volta a tocar (mudo, então o navegador permite sem clique)
          if (v.paused && !v.ended) {
            if (window.__kmMuted !== false) { v.muted = true; }
            v.play().catch(function () {});
          }
        });
      }, 5000);
    })();
    """

    static func keepAliveScript(mainFrameOnly: Bool = false) -> WKUserScript {
        WKUserScript(source: keepAliveJS, injectionTime: .atDocumentStart, forMainFrameOnly: mainFrameOnly)
    }
}

// MARK: - Skeleton (carregando)

/// Esqueleto animado por cima do WebView enquanto a página carrega. Não bloqueia cliques.
final class SkeletonView: NSView {
    enum Style { case video, chat, game }

    private let style: Style
    private let shimmer = CAGradientLayer()
    private var bones: [CALayer] = []
    private static let base = NSColor(red: 0.06, green: 0.06, blue: 0.07, alpha: 1).cgColor
    private static let bone = NSColor(red: 0.13, green: 0.13, blue: 0.15, alpha: 1).cgColor

    init(style: Style) {
        self.style = style
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = Self.base
        let count: Int
        switch style {
        case .video: count = 4
        case .chat: count = 3
        case .game: count = 15
        }
        for _ in 0..<count {
            let b = CALayer()
            b.backgroundColor = Self.bone
            b.cornerRadius = 6
            layer?.addSublayer(b)
            bones.append(b)
        }
        shimmer.colors = [NSColor.clear.cgColor, NSColor(white: 1, alpha: 0.07).cgColor, NSColor.clear.cgColor]
        shimmer.startPoint = CGPoint(x: 0, y: 0.5)
        shimmer.endPoint = CGPoint(x: 1, y: 0.5)
        layer?.addSublayer(shimmer)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) não usado") }

    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }   // cliques passam para a página

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let w = bounds.width, h = bounds.height
        switch style {
        case .video:
            // área do vídeo, botão de play e duas linhas embaixo
            bones[0].frame = CGRect(x: 8, y: 8, width: w - 16, height: max(h - 46, 10))
            bones[0].backgroundColor = NSColor(red: 0.09, green: 0.09, blue: 0.11, alpha: 1).cgColor
            let d = min(min(w, h) * 0.22, 56)
            bones[1].frame = CGRect(x: (w - d) / 2, y: (h - 46 - d) / 2 + 8, width: d, height: d)
            bones[1].cornerRadius = d / 2
            bones[2].frame = CGRect(x: 8, y: h - 30, width: w * 0.45, height: 8)
            bones[3].frame = CGRect(x: 8, y: h - 16, width: w * 0.28, height: 8)
        case .chat:
            // só o rodapé fica visível na faixa: ícone + barra + botão
            bones[0].frame = CGRect(x: 10, y: h - 34, width: 22, height: 22)
            bones[0].cornerRadius = 11
            bones[1].frame = CGRect(x: 40, y: h - 28, width: max(w * 0.35, 30), height: 10)
            bones[2].frame = CGRect(x: w - 64, y: h - 36, width: 54, height: 26)
        case .game:
            // barra do topo, menu lateral e grade de cards
            bones[0].frame = CGRect(x: 0, y: 0, width: w, height: 48)
            bones[0].cornerRadius = 0
            for i in 0..<6 {
                bones[1 + i].frame = CGRect(x: 16, y: 72 + CGFloat(i) * 40, width: 160, height: 24)
            }
            let gx: CGFloat = 200, gy: CGFloat = 72
            let cw = max((w - gx - 16 - 32) / 4, 40), ch = max(min((h - gy - 32) / 2, 220), 40)
            for i in 0..<8 {
                bones[7 + i].frame = CGRect(x: gx + CGFloat(i % 4) * (cw + 10), y: gy + CGFloat(i / 4) * (ch + 12),
                                            width: cw, height: ch)
            }
        }
        shimmer.frame = CGRect(x: -w, y: 0, width: w, height: h)
        CATransaction.commit()
        restartShimmer()
    }

    private func restartShimmer() {
        shimmer.removeAllAnimations()
        guard !isHidden, bounds.width > 0 else { return }
        let a = CABasicAnimation(keyPath: "position.x")
        a.fromValue = -bounds.width / 2
        a.toValue = bounds.width * 1.5
        a.duration = 1.4
        a.repeatCount = .infinity
        shimmer.add(a, forKey: "shimmer")
    }

    func show() {
        guard isHidden || alphaValue < 1 else { return }
        isHidden = false
        alphaValue = 1
        restartShimmer()
    }

    func hide() {
        guard !isHidden else { return }
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.25
            animator().alphaValue = 0
        }, completionHandler: { [weak self] in
            guard let self, self.alphaValue == 0 else { return }
            self.isHidden = true
            self.shimmer.removeAllAnimations()
        })
    }
}

enum Skeleton {
    private static var key = 0

    /// Mostra o esqueleto sempre que a página começa a carregar e some logo depois que termina.
    static func attach(_ wv: WKWebView, style: SkeletonView.Style) {
        let sk = SkeletonView(style: style)
        sk.frame = wv.bounds
        sk.autoresizingMask = [.width, .height]
        wv.addSubview(sk)
        let obs = wv.observe(\.isLoading, options: [.new]) { [weak sk] wv, _ in
            DispatchQueue.main.async {
                guard let sk else { return }
                if wv.isLoading {
                    sk.show()
                } else {
                    // pequena espera: o vídeo/jogo costuma pintar logo após o "terminou"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                        if !wv.isLoading { sk.hide() }
                    }
                }
            }
        }
        objc_setAssociatedObject(wv, &key, obs, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
}

/// Se o processo de uma página travar/morrer (comum em 24h rodando), recarrega sozinho.
final class Recovery: NSObject, WKNavigationDelegate {
    static let shared = Recovery()

    /// No jogo, link de canal da Kick/Twitch não navega: vira um bloco na aba Lives.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let fromGame = MarketWatcher.shared.isGame(webView)
        let gamePopup = LiveLink.gamePopups.contains(webView)
        if fromGame || gamePopup,
           navigationAction.targetFrame?.isMainFrame ?? true,
           let link = LiveLink.channelURL(navigationAction.request.url) {
            LiveLink.add(link)
            decisionHandler(.cancel)
            if gamePopup { DispatchQueue.main.async { webView.window?.close() } }
            return
        }
        decisionHandler(.allow)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard !Web.retired.contains(webView) else { return }
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if isNetworkError(error) { retry(webView, error) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if isNetworkError(error) { retry(webView, error) }
    }

    /// Só reage a falhas de rede de verdade (ignora navegações canceladas/substituídas).
    private func isNetworkError(_ error: Error) -> Bool {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain else { return false }
        return [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
                NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed]
            .contains(e.code)
    }

    /// Sem internet (ex.: Wi-Fi caiu): tenta de novo em 30 s.
    private func retry(_ webView: WKWebView, _ error: Error) {
        let failed = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak webView] in
            guard let wv = webView, !Web.retired.contains(wv), !wv.isLoading else { return }
            if let url = failed ?? wv.url { wv.load(URLRequest(url: url)) } else { wv.reload() }
        }
    }
}

/// Reconhece links de canal da Kick/Twitch (ex.: botões de stream do Pokeidle).
enum LiveLink {
    /// Caminhos da Twitch/Kick que não são canais
    private static let reserved: Set<String> = [
        "directory", "videos", "settings", "login", "signup", "p", "downloads", "jobs", "subscriptions",
        "inventory", "wallet", "drops", "search", "friends", "messages", "payments", "prime", "turbo",
        "store", "popout", "embed", "moderator", "categories", "browse", "following", "dashboard",
        "terms-of-service", "privacy-policy", "community-guidelines", "about", "help", "privacy", "terms",
    ]

    /// Se a URL for de um canal, devolve o link limpo (ex.: "https://twitch.tv/rodil").
    static func channelURL(_ url: URL?) -> String? {
        guard let url, let host = url.host?.lowercased() else { return nil }
        let twitch = host == "twitch.tv" || host.hasSuffix(".twitch.tv")
        let kick = host == "kick.com" || host.hasSuffix(".kick.com")
        guard twitch || kick, !host.hasPrefix("player."), !host.hasPrefix("dashboard."),
              !host.hasPrefix("id.") else { return nil }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count == 1, let name = Store.clean(parts[0]),
              !reserved.contains(name) else { return nil }
        return "https://\(twitch ? "twitch.tv" : "kick.com")/\(name)"
    }

    /// Pop-ups abertos pelo jogo (referência fraca)
    static let gamePopups = NSHashTable<WKWebView>.weakObjects()

    static func add(_ link: String) {
        DispatchQueue.main.async { NotificationCenter.default.post(name: .pfAddLive, object: link) }
    }
}

/// Abre pop-ups (ex.: login) em janelas próprias em vez de bloquear.
final class Popups: NSObject, WKUIDelegate, NSWindowDelegate {
    static let shared = Popups()
    private var windows: [NSWindow] = []

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Botão/link de live no jogo (abre em nova aba): adiciona na aba Lives em vez de abrir janela
        if MarketWatcher.shared.isGame(webView),
           let link = LiveLink.channelURL(navigationAction.request.url) {
            LiveLink.add(link)
            return nil
        }
        let wv = makeWindow(configuration: configuration, title: "Entrar")
        // Pop-up aberto pelo jogo em branco e depois mandado para a live: o Recovery intercepta
        if MarketWatcher.shared.isGame(webView) { LiveLink.gamePopups.add(wv) }
        return wv
    }

    func webViewDidClose(_ webView: WKWebView) { webView.window?.close() }

    func windowWillClose(_ n: Notification) {
        if let w = n.object as? NSWindow { windows.removeAll { $0 === w } }
    }

    @discardableResult
    func makeWindow(configuration: WKWebViewConfiguration, title: String) -> WKWebView {
        let rect = NSRect(x: 0, y: 0, width: 520, height: 760)
        let wv = Web.make(configuration)
        wv.frame = rect
        let w = NSWindow(contentRect: rect, styleMask: [.titled, .closable, .resizable, .miniaturizable],
                         backing: .buffered, defer: false)
        w.title = title
        w.isReleasedWhenClosed = false
        w.contentView = wv
        w.delegate = self
        w.center()
        w.makeKeyAndOrderFront(nil)
        windows.append(w)
        return wv
    }

    func openLogin(_ p: Platform) {
        let wv = makeWindow(configuration: Web.config(), title: "Entrar na \(p.title)")
        wv.load(URLRequest(url: p.loginURL))
    }

    /// Login do Pokeidle de uma conta, numa janela própria (o Google recusa login dentro de WebView embutida).
    func openGameLogin(_ account: GameAccount) {
        let wv = makeWindow(configuration: Web.config(store: GameStore.dataStore(account)),
                            title: "Entrar — \(account.name)")
        wv.load(URLRequest(url: Game.url))
    }
}

/// Espaça o início das páginas das lives e descarta carregamentos substituídos ou removidos.
final class WebLoadQueue {
    static let shared = WebLoadQueue()
    private var jobs: [() -> Bool] = []
    private var pending: [ObjectIdentifier: UUID] = [:]
    private var scheduled = false
    private var last = Date.distantPast

    func load(_ view: WKWebView, url: URL) {
        let id = ObjectIdentifier(view), ticket = UUID()
        pending[id] = ticket
        jobs.append { [weak self, weak view] in
            guard let self, self.pending[id] == ticket else { return false }
            self.pending[id] = nil
            guard let view, !Web.retired.contains(view) else { return false }
            view.load(URLRequest(url: url))
            return true
        }
        pump()
    }

    func cancel(_ view: WKWebView) { pending[ObjectIdentifier(view)] = nil }
    func isPending(_ view: WKWebView) -> Bool { pending[ObjectIdentifier(view)] != nil }

    private func pump() {
        guard !scheduled, !jobs.isEmpty else { return }
        scheduled = true
        let delay = max(0, 1.5 - Date().timeIntervalSince(last))
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            self.scheduled = false
            if self.jobs.removeFirst()() { self.last = Date() }
            self.pump()
        }
    }
}

// MARK: - Twitch econômica

@MainActor
struct TwitchEconomyPanel: View {
    @EnvironmentObject var store: Store
    @State private var status = "Conectando ao chat…"

    var body: some View {
        let plan = store.economyPlan
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 12) {
                Toggle("Twitch econômica (experimental)", isOn: $store.twitchEconomy).toggleStyle(.checkbox)
                Toggle("Kick econômica", isOn: $store.kickEconomy).toggleStyle(.checkbox)
                    .help("Qualidade mínima e chat leve, mantendo o vídeo e a faixa de pontos")
                if store.twitchEconomy {
                    Text(plan.channels.isEmpty ? "Aguardando canais online" : status)
                        .font(.caption).foregroundStyle(.secondary)
                    if plan.total > 100 { Text("Limite: 100 de \(plan.total) canais").font(.caption) }
                    Spacer()
                    Button("Reconectar Twitch") { store.economyReload += 1 }
                        .disabled(plan.channels.isEmpty)
                }
            }
            if store.twitchEconomy {
                Text("Um chat compartilhado, sem vídeos. Confira os bônus no Pokeidle; este modo não garante Pontos do Canal da Twitch.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if store.kickEconomy {
                Text("Kick: vídeo em qualidade mínima e mensagens ocultas na faixa de pontos. Abra o chat para consultar ou resgatar; novas mensagens voltam a aparecer.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background {
            if store.twitchEconomy, let url = plan.url {
                TwitchEconomyView(url: url, reloadToken: store.economyReload, status: $status)
                    .frame(width: 1, height: 1).clipped().allowsHitTesting(false).accessibilityHidden(true)
            }
        }
    }
}

@MainActor
struct TwitchEconomyView: NSViewRepresentable {
    let url: URL
    let reloadToken: Int
    @Binding var status: String

    final class Coordinator: NSObject, WKScriptMessageHandler {
        var loadedKey = ""
        weak var webView: WKWebView?
        var onStatus: (String) -> Void
        init(onStatus: @escaping (String) -> Void) { self.onStatus = onStatus }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.webView === webView, message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == "www.twitch.tv",
                  let body = message.body as? [String: Any],
                  let connected = body["connected"] as? Bool,
                  let authenticated = body["authenticated"] as? Bool,
                  let joined = body["joined"] as? Int, let requested = body["requested"] as? Int,
                  (0...100).contains(joined), (1...100).contains(requested) else { return }
            onStatus(!connected ? "Aguardando conexão com o chat…"
                : !authenticated ? "Sem login — entre na Twitch e reconecte"
                : "\(joined)/\(requested) chats conectados · sem vídeo")
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator { status = $0 } }

    func makeNSView(context: Context) -> WKWebView {
        let config = Web.config()
        config.userContentController.addUserScript(Web.keepAliveScript())
        config.userContentController.add(context.coordinator, name: "pfTwitchEconomy")
        let view = Web.make(config)
        context.coordinator.webView = view
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onStatus = { status = $0 }
        let key = "\(url.absoluteString)|\(reloadToken)"
        guard coordinator.loadedKey != key else { return }
        coordinator.loadedKey = key
        guard let resource = Bundle.main.url(forResource: "twitch-economy", withExtension: "js"),
              let source = try? String(contentsOf: resource, encoding: .utf8) else {
            DispatchQueue.main.async { status = "Script indisponível. Recompile o app com build.sh." }
            return
        }
        let scripts = view.configuration.userContentController
        scripts.removeAllUserScripts()
        scripts.addUserScript(Web.keepAliveScript())
        scripts.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        DispatchQueue.main.async { status = "Conectando ao chat…" }
        WebLoadQueue.shared.load(view, url: url)
    }

    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.webView = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "pfTwitchEconomy")
        Web.dispose(view)
    }
}

// MARK: - Player

struct LivePlayer: NSViewRepresentable {
    let item: StreamItem
    let platform: Platform
    let quality: VideoQuality

    final class Coordinator {
        var loadedKey = ""
        var lastMuted: Bool?
        weak var webView: WKWebView?
        var loadingObserver: NSKeyValueObservation?
        var timer: Timer?
        var stalledChecks = 0

        func applyMuted() {
            guard let webView, !Web.retired.contains(webView), let muted = lastMuted else { return }
            webView.evaluateJavaScript("window.__kmSetMuted && window.__kmSetMuted(\(muted));", completionHandler: nil)
        }

        /// A cada 1 min confere se o vídeo está tocando; se ficar 5 min parado, recarrega a live.
        func startWatchdog() {
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
                guard let self, let wv = self.webView, !wv.isLoading,
                      !WebLoadQueue.shared.isPending(wv) else { return }
                // Tocando de verdade = não pausado E o tempo do vídeo andou desde a última checagem
                let js = "(function(){var v=document.querySelector('video');if(!v||v.paused||v.readyState<2)return false;var t=v.currentTime,ok=window.__kmLastT!==t;window.__kmLastT=t;return ok;})()"
                wv.evaluateJavaScript(js) { [weak self, weak wv] result, _ in
                    guard let self, let wv, !Web.retired.contains(wv) else { return }
                    if (result as? Bool) == true {
                        self.stalledChecks = 0
                    } else {
                        self.stalledChecks += 1
                        if self.stalledChecks >= 3 {
                            self.stalledChecks = 0
                            wv.reload()
                        }
                    }
                }
            }
            timer?.tolerance = 5
        }

        deinit { timer?.invalidate() }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let wv = Web.make()
        Skeleton.attach(wv, style: .video)
        context.coordinator.webView = wv
        // O estado pode mudar enquanto a navegação aguarda na fila ou carrega.
        context.coordinator.loadingObserver = wv.observe(\.isLoading, options: [.new]) { [weak c = context.coordinator] view, _ in
            if !view.isLoading { c?.applyMuted() }
        }
        context.coordinator.startWatchdog()
        return wv
    }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.loadingObserver?.invalidate()
        coordinator.loadingObserver = nil
        coordinator.timer?.invalidate()
        coordinator.timer = nil
        coordinator.webView = nil
        Web.dispose(webView)
    }

    func updateNSView(_ wv: WKWebView, context: Context) {
        let c = context.coordinator
        // Mudar a qualidade recarrega a live (os sites só leem a preferência ao abrir o player)
        let key = "\(item.channel)|\(item.reloadToken)|\(quality.rawValue)"
        if c.loadedKey != key {
            c.loadedKey = key
            c.lastMuted = item.muted
            c.stalledChecks = 0
            let ucc = wv.configuration.userContentController
            ucc.removeAllUserScripts()
            ucc.addUserScript(Web.keepAliveScript())
            if platform == .kick,
               let resource = Bundle.main.url(forResource: "kick-economy", withExtension: "js"),
               let source = try? String(contentsOf: resource, encoding: .utf8) {
                ucc.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
            ucc.addUserScript(WKUserScript(source: setupJS(muted: item.muted, quality: quality),
                                           injectionTime: .atDocumentStart, forMainFrameOnly: false))
            WebLoadQueue.shared.load(wv, url: platform.playerURL(item.channel, muted: item.muted))
        } else if c.lastMuted != item.muted {
            c.lastMuted = item.muted
            c.applyMuted()
        }
    }

    /// Mantém o vídeo sem som (reforça a cada 1,5 s) e aplica a qualidade escolhida.
    private func setupJS(muted: Bool, quality: VideoQuality) -> String {
        """
        (function () {
          var KM_Q = \(quality.height);   // altura máxima do vídeo (0 = automático)
          try {
            if (location.hostname.indexOf('twitch.tv') >= 0) {
              if (KM_Q > 0) {
                localStorage.setItem('video-quality', JSON.stringify({ default: '\(quality.twitchGroup)' }));
              } else {
                localStorage.removeItem('video-quality');
              }
              localStorage.setItem('mature', 'true');
              if (\(muted)) { localStorage.setItem('video-muted', JSON.stringify({ default: true })); }
            }
          } catch (e) {}
          // Na página do canal da Twitch, esconde tudo e deixa só o vídeo ocupando a tela
          if (location.hostname === 'www.twitch.tv') {
            var css = 'html,body{background:#000!important;overflow:hidden!important}' +
              '.km-player{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;' +
              'width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;' +
              'margin:0!important;transform:none!important;z-index:2147483646!important;background:#000!important}' +
              '.km-player video{width:100%!important;height:100%!important;object-fit:contain!important}' +
              '.km-unclip{transform:none!important;contain:none!important;filter:none!important;will-change:auto!important}' +
              '.consent-banner,[data-a-target="consent-banner"]{display:none!important}';
            var addCSS = function () {
              if (document.getElementById('km-css')) { return; }
              var st = document.createElement('style'); st.id = 'km-css'; st.textContent = css;
              (document.head || document.documentElement).appendChild(st);
            };
            addCSS();
            document.addEventListener('DOMContentLoaded', addCSS);
            // A cada 1,5 s: acha o <video> real, prende o container dele na tela inteira
            // e aceita o aviso "Destinado a públicos específicos"
            setInterval(function () {
              addCSS();
              var gate = document.querySelector(
                'button[data-a-target="content-classification-gate-overlay-start-watching-button"],' +
                'button[data-a-target="player-overlay-mature-accept"]');
              if (!gate) {
                gate = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
                  return /começar a assistir|start watching/i.test(b.textContent || '');
                });
              }
              if (gate) { gate.click(); }
              var v = document.querySelector('video');
              if (!v) { return; }
              var box = v.closest('[data-a-target="video-player"]') || v.closest('.video-player') ||
                        v.closest('.video-player__container') || v.parentElement;
              if (box && !box.classList.contains('km-player')) {
                document.querySelectorAll('.km-player').forEach(function (e) { e.classList.remove('km-player'); });
                box.classList.add('km-player');
              }
              // Ancestral com transform quebra o position:fixed; neutraliza
              for (var a = box && box.parentElement; a && a !== document.body; a = a.parentElement) {
                a.classList.add('km-unclip');
              }
            }, 1500);
          }
          // Player da Kick: ele pausa sozinho (ociosidade, "aba inativa", aviso de HD).
          // Só deixa pausar se foi você que clicou; se pausar mesmo assim, aperta play de novo.
          if (location.hostname === 'player.kick.com' && window.__pfApplyKickQuality) {
            window.__pfApplyKickQuality(KM_Q);
          } else if (location.hostname === 'player.kick.com' && KM_Q > 0) {
            // Kick não guarda preferência: abre o menu de qualidade do player e escolhe a opção
            // mais alta que não passe do limite (ou a menor que existir)
            var kmTries = 0;
            var kmQ = setInterval(function () {
              if (++kmTries > 20) { clearInterval(kmQ); return; }
              var opts = Array.prototype.filter.call(
                document.querySelectorAll('[role="menuitemradio"],[role="menuitem"],[role="option"],li,button'),
                function (e) { var t = (e.textContent || '').trim(); return /^\\d{3,4}p/.test(t) && t.length < 20; });
              if (!opts.length) {
                var s = document.querySelector('button[aria-label*="setting" i],button[aria-label*="configura" i],' +
                  'button[aria-label*="quality" i],button[aria-label*="qualidade" i]');
                if (s) { s.click(); }
                return;
              }
              var best = null, bh = 0, low = null, lh = 1e9;
              opts.forEach(function (e) {
                var h = parseInt((e.textContent || '').trim(), 10);
                if (h <= KM_Q && h > bh) { best = e; bh = h; }
                if (h < lh) { low = e; lh = h; }
              });
              (best || low).click();
              clearInterval(kmQ);
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }, 4000);
          }
          if (location.hostname === 'player.kick.com') {
            var kmUser = 0;
            var kmTouch = function () { kmUser = Date.now(); };
            document.addEventListener('pointerdown', kmTouch, true);
            document.addEventListener('keydown', kmTouch, true);
            var kmPause = HTMLMediaElement.prototype.pause;
            HTMLMediaElement.prototype.pause = function () {
              if (Date.now() - kmUser < 1500) { return kmPause.apply(this, arguments); }
            };
            setInterval(function () {
              var v = document.querySelector('video');
              if (!v || !v.paused || v.ended || Date.now() - kmUser < 10000) { return; }
              var btn = document.querySelector('button[aria-label*="play" i], button[aria-label*="reproduzir" i], [data-testid*="play" i]');
              if (btn) { btn.click(); }
              if (window.__kmMuted !== false) { v.muted = true; }
              v.play().catch(function () { v.muted = true; v.play().catch(function () {}); });
            }, 3000);
          }
          window.__kmMuted = \(muted);
          window.__kmSetMuted = function (m) {
            window.__kmMuted = m;
            document.querySelectorAll('video').forEach(function (v) {
              v.muted = m;
              if (!m) { v.volume = 1; }
            });
          };
          setInterval(function () {
            if (!window.__kmMuted) { return; }
            document.querySelectorAll('video').forEach(function (v) { if (!v.muted) { v.muted = true; } });
          }, 1500);
        })();
        """
    }
}

// MARK: - Chat

/// Mostra só a faixa de baixo do chat (pontos + botão de bônus).
/// O chat é renderizado com altura normal e a caixa recorta tudo menos o rodapé.
struct LiveChat: NSViewRepresentable {
    let channel: String
    let platform: Platform
    let reloadToken: Int
    let economy: Bool

    static let stripHeight: CGFloat = 46
    static let pageHeight: CGFloat = 420

    /// Clicou na faixa (ex.: botão de pontos): o chat abre inteiro numa janela flutuante,
    /// para o modal de resgate aparecer. Ao fechar a janela, ele volta para a faixa sem recarregar.
    final class Coordinator: NSObject, WKScriptMessageHandler, NSWindowDelegate {
        var loadedKey = ""
        var webView: WKWebView!
        weak var box: NSView?
        var channel = ""
        var panel: NSPanel?
        var economy = false
        var loadingObserver: NSKeyValueObservation?

        func applyEconomy() {
            guard let webView, !Web.retired.contains(webView) else { return }
            webView.evaluateJavaScript("window.__pfSetKickEconomy && window.__pfSetKickEconomy(\(economy && panel == nil));", completionHandler: nil)
        }

        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            if panel == nil { expand() }
        }

        func expand() {
            guard let wv = webView else { return }
            let rect = NSRect(x: 0, y: 0, width: 440, height: 680)
            let p = NSPanel(contentRect: rect, styleMask: [.titled, .closable, .resizable, .utilityWindow],
                            backing: .buffered, defer: false)
            p.title = "Chat de \(channel) (feche para voltar à faixa)"
            p.isReleasedWhenClosed = false
            p.isFloatingPanel = true
            p.hidesOnDeactivate = false
            p.delegate = self
            let content = NSView(frame: rect)
            wv.removeFromSuperview()
            wv.frame = content.bounds
            wv.autoresizingMask = [.width, .height]
            content.addSubview(wv)
            p.contentView = content
            if let main = NSApp.mainWindow ?? NSApp.windows.first(where: { $0.isVisible && !($0 is NSPanel) }) {
                let f = main.frame
                p.setFrameOrigin(NSPoint(x: f.midX - rect.width / 2, y: f.midY - rect.height / 2))
            } else {
                p.center()
            }
            p.makeKeyAndOrderFront(nil)
            panel = p
            applyEconomy()
        }

        func collapse() {
            guard let wv = webView, let box else { return }
            wv.removeFromSuperview()
            // Ancorado embaixo (em NSView o y=0 é a base): mostra só o rodapé do chat
            wv.frame = NSRect(x: 0, y: 0, width: max(box.bounds.width, 300), height: LiveChat.pageHeight)
            wv.autoresizingMask = [.width, .maxYMargin]
            box.addSubview(wv)
            panel = nil
            applyEconomy()
        }

        func windowWillClose(_ notification: Notification) { collapse() }

        deinit {
            panel?.delegate = nil   // não chamar collapse() num objeto sendo destruído
            panel?.close()
        }
    }

    /// Evita ciclo de retenção entre o WebView e o Coordinator.
    final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var target: WKScriptMessageHandler?
        init(_ t: WKScriptMessageHandler) { target = t }
        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            target?.userContentController(ucc, didReceive: message)
        }
    }

    static let clickJS = """
    document.addEventListener('pointerdown', function () {
      try { window.webkit.messageHandlers.pfChat.postMessage(1); } catch (e) {}
    }, true);
    """

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView {
        let box = NSView()
        box.wantsLayer = true
        box.layer?.masksToBounds = true
        if #available(macOS 14.0, *) { box.clipsToBounds = true }
        let wv = Web.make()
        Skeleton.attach(wv, style: .chat)
        // Ancorado embaixo (em NSView o y=0 é a base): sempre mostra o rodapé do chat
        wv.frame = NSRect(x: 0, y: 0, width: 300, height: Self.pageHeight)
        wv.autoresizingMask = [.width, .maxYMargin]
        box.addSubview(wv)
        wv.configuration.userContentController.add(WeakHandler(context.coordinator), name: "pfChat")
        context.coordinator.webView = wv
        context.coordinator.box = box
        context.coordinator.loadingObserver = wv.observe(\.isLoading, options: [.new]) { [weak c = context.coordinator] view, _ in
            if !view.isLoading { c?.applyEconomy() }
        }
        return box
    }

    static func dismantleNSView(_ box: NSView, coordinator: Coordinator) {
        coordinator.loadingObserver?.invalidate()
        coordinator.loadingObserver = nil
        // Não devolver o chat para o bloco que está sendo destruído.
        coordinator.panel?.delegate = nil
        coordinator.panel?.close()
        coordinator.panel?.contentView = nil
        coordinator.panel = nil
        if let webView = coordinator.webView {
            webView.configuration.userContentController.removeScriptMessageHandler(forName: "pfChat")
            Web.dispose(webView)
            webView.removeFromSuperview()
        }
        coordinator.webView = nil
        coordinator.box = nil
    }

    func updateNSView(_ box: NSView, context: Context) {
        let wv = context.coordinator.webView!
        context.coordinator.channel = channel
        context.coordinator.economy = platform == .kick && economy
        let key = "\(channel)|\(reloadToken)|\(economy)"
        guard context.coordinator.loadedKey != key else { return }
        context.coordinator.loadedKey = key
        let ucc = wv.configuration.userContentController
        ucc.removeAllUserScripts()
        ucc.addUserScript(Web.keepAliveScript())
        ucc.addUserScript(WKUserScript(source: Self.clickJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if platform == .twitch {
            ucc.addUserScript(WKUserScript(source: Self.twitchAutoClaimJS,
                                           injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        } else if let url = Bundle.main.url(forResource: "kick-economy", withExtension: "js"),
                  let source = try? String(contentsOf: url, encoding: .utf8) {
            ucc.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            let compact = economy && context.coordinator.panel == nil
            ucc.addUserScript(WKUserScript(source: "window.__pfSetKickEconomy && window.__pfSetKickEconomy(\(compact));",
                                          injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        WebLoadQueue.shared.load(wv, url: platform.chatURL(channel))
    }

    /// Clica sozinho no bônus de pontos do canal da Twitch quando ele aparece.
    static let twitchAutoClaimJS = """
    setInterval(function () {
      var icon = document.querySelector('.claimable-bonus__icon');
      var b = icon ? icon.closest('button')
                   : document.querySelector('button[aria-label="Claim Bonus"], button[aria-label="Resgatar bônus"]');
      if (b) { b.click(); }
    }, 5000);
    """
}

// MARK: - Alertas do mercado (Pokeidle)

/// Converte "2M", "4,4M", "120k", "6.039.587", "15" em número.
func parseAmount(_ raw: String) -> Double? {
    var s = raw.trimmingCharacters(in: .whitespaces).uppercased().replacingOccurrences(of: " ", with: "")
    guard !s.isEmpty else { return nil }
    var mult = 1.0
    if let last = s.last, let m = ["K": 1e3, "M": 1e6, "B": 1e9][String(last)] {
        mult = m; s.removeLast()
    }
    if s.range(of: #"^\d{1,3}(\.\d{3})+$"#, options: .regularExpression) != nil {
        s = s.replacingOccurrences(of: ".", with: "")      // 6.039.587
    }
    s = s.replacingOccurrences(of: ",", with: ".")          // 4,4
    guard let v = Double(s) else { return nil }
    return v * mult
}

func formatAmount(_ v: Double) -> String {
    let f: (Double) -> String = { x in
        x == x.rounded() ? String(Int(x)) : String(format: "%.1f", x).replacingOccurrences(of: ".", with: ",")
    }
    if v >= 1e9 { return f(v / 1e9) + "B" }
    if v >= 1e6 { return f(v / 1e6) + "M" }
    if v >= 1e3 { return f(v / 1e3) + "K" }
    return f(v)
}

enum Currency: String, Codable {
    case coins, gems
    var label: String { self == .coins ? "coins" : "gemas" }
}

struct AlertRule: Identifiable, Codable, Equatable {
    var id = UUID()
    var name = ""                 // vazio = qualquer Pokémon/item
    var maxCoins: Double?
    var maxGems: Double?
    var belowAvgPercent: Double?  // ex.: 30 = 30% abaixo da média vista
    var shinyOnly = false
    var enabled = true

    var summary: String {
        var p: [String] = [name.isEmpty ? "Qualquer um" : name]
        if shinyOnly { p.append("só shiny") }
        if let c = maxCoins { p.append("≤ \(formatAmount(c)) coins") }
        if let g = maxGems { p.append("≤ \(formatAmount(g)) gemas") }
        if let b = belowAvgPercent { p.append("\(Int(b))% abaixo da média") }
        return p.joined(separator: " · ")
    }
}

struct MarketItem {
    let name: String
    let price: Double
    let currency: Currency
    let shiny: Bool
    let listingID: String?
    let source: String
}

struct AlertHit: Identifiable, Codable {
    var id = UUID()
    let date: Date
    let name: String
    let price: Double
    let currency: Currency
    let shiny: Bool
    let rule: String
    let average: Double?
}

struct SeenItem: Identifiable {
    let id = UUID()
    let date: Date
    let item: MarketItem
}

extension Notification.Name {
    static let pfOpenGame = Notification.Name("pfOpenGame")
    static let pfAddLive = Notification.Name("pfAddLive")
    static let pfGameChannels = Notification.Name("pfGameChannels")
}

/// Recebe os anúncios lidos na página do jogo, compara com as regras e notifica.
final class MarketWatcher: NSObject, ObservableObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    static let shared = MarketWatcher()

    @Published var rules: [AlertRule] = [] { didSet { save(rules, "alertRules") } }
    @Published var hits: [AlertHit] = [] { didSet { save(hits, "alertHits") } }
    @Published var enabled = UserDefaults.standard.object(forKey: "alertsOn") as? Bool ?? true {
        didSet { UserDefaults.standard.set(enabled, forKey: "alertsOn") }
    }
    @Published var pollSeconds: Int = UserDefaults.standard.object(forKey: "pollSeconds") as? Int ?? 60 {
        didSet { UserDefaults.standard.set(pollSeconds, forKey: "pollSeconds"); pushPoll() }
    }
    @Published var lastCapture: Date?
    @Published var endpoints: [String] = []
    @Published var seen: [SeenItem] = []
    @Published var totalSeen = 0

    /// Aba que lê o mercado (a primeira conta: o mercado é o mesmo para todas)
    weak var gameWebView: WKWebView?
    /// Abas de todas as contas do jogo
    let gameWebViews = NSHashTable<WKWebView>.weakObjects()

    func isGame(_ wv: WKWebView?) -> Bool {
        guard let wv else { return false }
        return wv === gameWebView || gameWebViews.contains(wv)
    }

    private var alerted = Set<String>()
    private var history: [String: [Double]] = [:]   // "nome|moeda" -> últimos preços
    private var samplesWritten: [String: Int] = [:]

    override init() {
        super.init()
        rules = Self.load("alertRules") ?? []
        hits = Self.load("alertHits") ?? []
    }

    // MARK: Persistência
    private static func load<T: Decodable>(_ key: String) -> T? {
        guard let d = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }
    private func save<T: Encodable>(_ v: T, _ key: String) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: key) }
    }

    static var dataDir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PokeFarm", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Guarda algumas respostas brutas do mercado (ajuda a ajustar a leitura depois).
    private func writeSample(url: String, text: String) {
        let n = samplesWritten[url, default: 0]
        guard n < 3 else { return }
        samplesWritten[url] = n + 1
        let file = Self.dataDir.appendingPathComponent("market-samples.jsonl")
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
        guard size < 3_000_000 else { return }
        let entry: [String: Any] = ["date": ISO8601DateFormatter().string(from: Date()), "url": url, "body": text]
        guard var line = try? JSONSerialization.data(withJSONObject: entry) else { return }
        line.append(0x0A)
        if let h = try? FileHandle(forWritingTo: file) {
            h.seekToEndOfFile(); h.write(line); try? h.close()
        } else {
            try? line.write(to: file)
        }
    }

    // MARK: Notificações
    func setupNotifications() {
        let c = UNUserNotificationCenter.current()
        c.delegate = self
        c.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let updateTag = response.notification.request.content.userInfo["updateTag"] as? String
        DispatchQueue.main.async {
            NSApp.activate(ignoringOtherApps: true)
            if let updateTag, let url = ReleaseUpdate.url(forTag: updateTag) {
                NSWorkspace.shared.open(url)
            } else {
                NotificationCenter.default.post(name: .pfOpenGame, object: nil)
            }
        }
        completionHandler()
    }

    func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        NSSound(named: "Glass")?.play()
        NSApp.requestUserAttention(.informationalRequest)
    }

    func testNotification() {
        notify(title: "PokeFarm", body: "Teste de alerta: notificações funcionando.")
    }

    func notifyUpdate(_ update: ReleaseUpdate) {
        let content = UNMutableNotificationContent()
        content.title = "Atualização do PokeFarm"
        content.body = "A versão \(update.version) está disponível. Clique para ver a release."
        content.userInfo = ["updateTag": update.tag]
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "pokefarm-update-\(update.version)", content: content, trigger: nil))
    }

    // MARK: Página -> app
    func pushPoll() {
        gameWebView?.evaluateJavaScript("window.__pfPoll = \(pollSeconds);", completionHandler: nil)
    }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let msg = message.body as? [String: Any] else { return }
        let url = msg["url"] as? String ?? "dom"
        if let text = msg["sample"] as? String, url != "dom" { writeSample(url: url, text: text) }
        if url != "dom", !endpoints.contains(url) { endpoints = Array((endpoints + [url]).suffix(10)) }
        lastCapture = Date()

        let raw = msg["items"] as? [[String: Any]] ?? []
        let items: [MarketItem] = raw.compactMap { d in
            guard let name = d["name"] as? String, !name.isEmpty,
                  let price = (d["price"] as? NSNumber)?.doubleValue, price > 0 else { return nil }
            return MarketItem(name: name, price: price,
                              currency: (d["currency"] as? String) == "gems" ? .gems : .coins,
                              shiny: d["shiny"] as? Bool ?? false,
                              listingID: (d["id"] as? String) ?? (d["id"] as? NSNumber)?.stringValue,
                              source: url == "dom" ? "tela" : "rede")
        }
        guard !items.isEmpty else { return }
        process(items)
    }

    private func normalize(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    private func average(_ item: MarketItem) -> Double? {
        let h = history["\(normalize(item.name))|\(item.currency.rawValue)"] ?? []
        guard h.count >= 5 else { return nil }
        return h.reduce(0, +) / Double(h.count)
    }

    private func matches(_ r: AlertRule, _ item: MarketItem, avg: Double?) -> Bool {
        guard r.enabled else { return false }
        if !r.name.isEmpty, !normalize(item.name).contains(normalize(r.name)) { return false }
        if r.shinyOnly && !item.shiny { return false }
        let hasPriceRule = r.maxCoins != nil || r.maxGems != nil || r.belowAvgPercent != nil
        if !hasPriceRule { return true }
        if item.currency == .coins, let m = r.maxCoins, item.price <= m { return true }
        if item.currency == .gems, let m = r.maxGems, item.price <= m { return true }
        if let p = r.belowAvgPercent, let a = avg, item.price <= a * (1 - p / 100) { return true }
        return false
    }

    private func process(_ items: [MarketItem]) {
        totalSeen += items.count
        let now = Date()
        seen = Array((items.map { SeenItem(date: now, item: $0) } + seen).prefix(60))

        for item in items {
            let avg = average(item)   // média antes de incluir este preço
            let hKey = "\(normalize(item.name))|\(item.currency.rawValue)"
            history[hKey] = Array((history[hKey, default: []] + [item.price]).suffix(50))

            guard enabled, let rule = rules.first(where: { matches($0, item, avg: avg) }) else { continue }
            // Mesmo anúncio/preço só alerta uma vez
            let key = "\(item.listingID ?? "-")|\(hKey)|\(item.price)"
            guard !alerted.contains(key) else { continue }
            if alerted.count > 20_000 { alerted.removeAll() }
            alerted.insert(key)

            hits.insert(AlertHit(date: now, name: item.name, price: item.price, currency: item.currency,
                                 shiny: item.shiny, rule: rule.summary, average: avg), at: 0)
            if hits.count > 300 { hits.removeLast(hits.count - 300) }

            var body = "\(formatAmount(item.price)) \(item.currency.label)"
            if let a = avg { body += " (média \(formatAmount(a)))" }
            body += " · regra: \(rule.summary)"
            notify(title: "\(item.shiny ? "✨ " : "")\(item.name) no mercado", body: body)
        }
    }

    // MARK: Script injetado no jogo
    /// Lê o mercado de 3 jeitos:
    /// 1. respostas fetch/XHR com cara de mercado (e repete essas leituras GET a cada X s, mesmo sem a aba aberta)
    /// 2. mensagens de WebSocket com cara de mercado
    /// 3. os cards da tela do Community Market, quando ele estiver aberto
    /// Só repete requisições GET (leitura). Nunca compra nem envia nada.
    func script() -> WKUserScript {
        let js = #"""
        (function () {
          if (window.__pfMarket) { return; }
          window.__pfMarket = true;
          window.__pfPoll = __POLL__;
          var post = function (o) { try { window.webkit.messageHandlers.pf.postMessage(o); } catch (e) {} };
          var WANT = /market|mercado|rmt|listing|offer|oferta|auction|leil|trade|anunc/i;
          var replay = {};

          var NAME = /^(name|nome|displayName|speciesName|pokemonName|itemName|title|species|pokemon|item)$/i;
          var PRICE = /price|preco|preço|valor|cost|amount|min/i;
          function pickName(o) {
            for (var k in o) {
              if (NAME.test(k)) {
                var v = o[k];
                if (typeof v === 'string' && v.length > 1) { return v; }
                if (v && typeof v === 'object' && typeof v.name === 'string') { return v.name; }
              }
            }
            return null;
          }
          function extract(root) {
            var out = [], n = 0;
            (function walk(x, depth) {
              if (!x || depth > 8 || n > 5000) { return; }
              n++;
              if (Array.isArray(x)) { x.forEach(function (y) { walk(y, depth + 1); }); return; }
              if (typeof x !== 'object') { return; }
              var name = pickName(x);
              if (name) {
                var shiny = x.shiny === true || x.isShiny === true || /shiny/i.test(name);
                var cur = String(x.currency || x.moeda || x.coin || '');
                for (var k in x) {
                  var v = x[k];
                  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) { v = parseFloat(v); }
                  if (typeof v !== 'number' || !PRICE.test(k) || v <= 0) { continue; }
                  var c = /gem|diam/i.test(k) ? 'gems' : (/coin|gold|moeda/i.test(k) ? 'coins' : (/gem|diam/i.test(cur) ? 'gems' : 'coins'));
                  out.push({ name: name, price: v, currency: c, shiny: shiny, id: x.id || x._id || x.listingId || null });
                }
              }
              for (var k2 in x) { if (x[k2] && typeof x[k2] === 'object') { walk(x[k2], depth + 1); } }
            })(root, 0);
            return out.slice(0, 2000);
          }
          function handle(url, method, text, isPoll) {
            if (typeof text !== 'string' || text.length < 2) { return; }
            var t = text.replace(/^\d+/, '');   // socket.io: 42["evento",{...}]
            var json; try { json = JSON.parse(t); } catch (e) { return; }
            var items = extract(json);
            if (!items.length) { return; }
            if (method === 'GET' && !isPoll) { replay[url] = Date.now(); }
            post({ url: url, sample: text.slice(0, 30000), items: items });
          }

          var origFetch = window.fetch;
          window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            var p = origFetch.apply(this, arguments);
            if (WANT.test(url)) {
              p.then(function (r) { r.clone().text().then(function (t) { handle(url, method, t, false); }); }).catch(function () {});
            }
            return p;
          };

          var xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function (m, u) { this.__pf = { m: String(m).toUpperCase(), u: String(u) }; return xo.apply(this, arguments); };
          XMLHttpRequest.prototype.send = function () {
            var x = this;
            if (x.__pf && WANT.test(x.__pf.u)) {
              x.addEventListener('load', function () { try { handle(x.__pf.u, x.__pf.m, x.responseText, false); } catch (e) {} });
            }
            return xs.apply(this, arguments);
          };

          var WS = window.WebSocket;
          if (WS) {
            var PFWS = function (u, p) {
              var ws = p !== undefined ? new WS(u, p) : new WS(u);
              ws.addEventListener('message', function (ev) {
                if (typeof ev.data === 'string' && WANT.test(ev.data.slice(0, 3000))) { handle('ws:' + u, 'WS', ev.data, false); }
              });
              return ws;
            };
            PFWS.prototype = WS.prototype;
            ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { PFWS[k] = WS[k]; });
            window.WebSocket = PFWS;
          }

          // Repete as leituras GET do mercado periodicamente (só as 5 mais recentes)
          (function tick() {
            setTimeout(function () {
              Object.keys(replay).sort(function (a, b) { return replay[b] - replay[a]; }).slice(0, 5).forEach(function (u) {
                origFetch(u, { credentials: 'include' }).then(function (r) { return r.text(); })
                  .then(function (t) { handle(u, 'GET', t, true); }).catch(function () {});
              });
              tick();
            }, Math.max(15, window.__pfPoll || 60) * 1000);
          })();

          // Leitura dos cards do Community Market (quando estiver aberto na tela)
          function num(s) {
            s = String(s).trim().toUpperCase().replace(/\s/g, '');
            var m = 1, last = s.slice(-1);
            if (last === 'K') { m = 1e3; } else if (last === 'M') { m = 1e6; } else if (last === 'B') { m = 1e9; }
            if (m > 1) { s = s.slice(0, -1); }
            if (/^\d{1,3}(\.\d{3})+$/.test(s)) { s = s.replace(/\./g, ''); }
            var v = parseFloat(s.replace(',', '.'));
            return isNaN(v) ? null : v * m;
          }
          setInterval(function () {
            var out = [];
            document.querySelectorAll('button, a').forEach(function (b) {
              if (!/ver ofertas/i.test(b.textContent || '')) { return; }
              var card = b.parentElement, i = 0;
              while (card && i < 6 && !/a partir de/i.test(card.innerText || '')) { card = card.parentElement; i++; }
              if (!card) { return; }
              var lines = (card.innerText || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
              var name = lines.find(function (l) {
                return l.length > 2 && !/^[A-Z]+$/.test(l) && !/^P\d$/.test(l) && !/^\d+$/.test(l) &&
                       !/ofertas|a partir|ver ofertas/i.test(l);
              });
              if (!name) { return; }
              var shiny = /shiny/i.test(card.innerText) || !!card.querySelector('[class*="shiny" i], [title*="shiny" i], [alt*="shiny" i]');
              var prices = [];
              lines.forEach(function (l, idx) {
                if (/a partir de/i.test(l)) {
                  var rest = l.replace(/a partir de:?/i, '').trim() || lines[idx + 1] || '';
                  var v = num(rest);
                  if (v !== null) { prices.push(v); }
                }
              });
              if (prices[0]) { out.push({ name: name, price: prices[0], currency: 'coins', shiny: shiny }); }
              if (prices[1]) { out.push({ name: name, price: prices[1], currency: 'gems', shiny: shiny }); }
            });
            if (out.length) { post({ url: 'dom', items: out }); }
          }, 10000);
        })();
        """#
        return WKUserScript(source: js.replacingOccurrences(of: "__POLL__", with: String(pollSeconds)),
                            injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}

// MARK: - Tela de alertas

struct AlertsView: View {
    @ObservedObject var w = MarketWatcher.shared
    @State private var name = ""
    @State private var maxCoins = ""
    @State private var maxGems = ""
    @State private var below = 0
    @State private var shinyOnly = false

    var body: some View {
        HSplitView {
            VStack(alignment: .leading, spacing: 12) {
                status
                GroupBox("Nova regra") {
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Nome contém (ex.: Charizard, Gyarados). Vazio = qualquer", text: $name)
                        HStack {
                            TextField("Máx. coins (ex.: 5M)", text: $maxCoins)
                            TextField("Máx. gemas (ex.: 3)", text: $maxGems)
                        }
                        HStack {
                            Picker("Abaixo da média", selection: $below) {
                                Text("—").tag(0)
                                ForEach([10, 20, 30, 40, 50, 70], id: \.self) { Text("\($0)%").tag($0) }
                            }
                            .frame(width: 220)
                            Toggle("Só shiny", isOn: $shinyOnly)
                            Spacer()
                            Button("Adicionar regra", action: addRule)
                                .keyboardShortcut(.return, modifiers: [])
                        }
                        Text("Sem preço definido = avisa sempre que aparecer. Com preço = avisa se bater qualquer um dos limites.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .textFieldStyle(.roundedBorder)
                    .padding(4)
                }
                GroupBox("Regras") {
                    if w.rules.isEmpty {
                        Text("Nenhuma regra ainda").foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: 40)
                    } else {
                        List {
                            ForEach($w.rules) { $r in
                                HStack {
                                    Toggle("", isOn: $r.enabled).labelsHidden()
                                    Text(r.summary)
                                    Spacer()
                                    Button { w.rules.removeAll { $0.id == r.id } } label: { Image(systemName: "trash") }
                                        .buttonStyle(.borderless)
                                }
                            }
                        }
                        .frame(minHeight: 120)
                    }
                }
                GroupBox("Últimos anúncios lidos") {
                    List(w.seen) { s in
                        HStack {
                            Text(s.item.shiny ? "✨ \(s.item.name)" : s.item.name)
                            Spacer()
                            Text("\(formatAmount(s.item.price)) \(s.item.currency.label)").monospacedDigit()
                            Text(s.item.source).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(minHeight: 120)
                }
            }
            .padding(12)
            .frame(minWidth: 520)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Alertas disparados").font(.headline)
                    Spacer()
                    Button("Limpar") { w.hits.removeAll() }
                }
                if w.hits.isEmpty {
                    Text("Nada ainda. Quando um anúncio bater numa regra, aparece aqui e como notificação.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(w.hits) { h in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(h.shiny ? "✨ \(h.name)" : h.name).fontWeight(.semibold)
                                Spacer()
                                Text("\(formatAmount(h.price)) \(h.currency.label)").monospacedDigit()
                            }
                            Text("\(h.date.formatted(date: .abbreviated, time: .shortened)) · \(h.rule)"
                                 + (h.average.map { " · média \(formatAmount($0))" } ?? ""))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(12)
            .frame(minWidth: 320)
        }
    }

    private var status: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Toggle("Alertas ligados", isOn: $w.enabled)
                Picker("Verificar a cada", selection: $w.pollSeconds) {
                    Text("30 s").tag(30); Text("1 min").tag(60); Text("2 min").tag(120); Text("5 min").tag(300)
                }
                .frame(width: 200)
                Spacer()
                Button("Testar notificação") { w.testNotification() }
                Button("Abrir amostras") { NSWorkspace.shared.open(MarketWatcher.dataDir) }
            }
            Group {
                if let d = w.lastCapture {
                    Text("Última leitura do mercado: \(d.formatted(date: .omitted, time: .standard)) · \(w.totalSeen) anúncios lidos · \(w.endpoints.count) fonte(s) de rede")
                } else {
                    Text("Ainda não li o mercado. Abra o Market (Community Market) no jogo uma vez para o app aprender de onde vêm os anúncios.")
                }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func addRule() {
        var r = AlertRule()
        r.name = name.trimmingCharacters(in: .whitespaces)
        r.maxCoins = parseAmount(maxCoins)
        r.maxGems = parseAmount(maxGems)
        r.belowAvgPercent = below > 0 ? Double(below) : nil
        r.shinyOnly = shinyOnly
        w.rules.append(r)
        name = ""; maxCoins = ""; maxGems = ""; below = 0; shinyOnly = false
    }
}

// MARK: - Jogo (Pokeidle)

enum Game {
    static let url = URL(string: "https://pokeidle.io/app")!
}

final class GameChannelWatcher: NSObject, WKScriptMessageHandler {
    static let shared = GameChannelWatcher()

    func script() -> WKUserScript? {
        guard let url = Bundle.main.url(forResource: "game-channels", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, MarketWatcher.shared.isGame(message.webView),
              message.frameInfo.securityOrigin.host == "pokeidle.io" || message.frameInfo.securityOrigin.host.hasSuffix(".pokeidle.io"),
              let rows = message.body as? [[String: Any]] else { return }
        let channels = rows.prefix(200).compactMap { row -> GameChannel? in
            guard let platform = row["platform"] as? String, let channel = row["channel"] as? String else { return nil }
            return GameChannel(platform: platform, channel: channel)
        }
        guard !channels.isEmpty else { return }
        DispatchQueue.main.async { NotificationCenter.default.post(name: .pfGameChannels, object: channels) }
    }
}

/// Uma aba do jogo, com o login da conta dela.
struct GameView: NSViewRepresentable {
    let account: GameAccount
    /// Só uma aba lê o mercado (evita consultar o servidor em dobro)
    let readsMarket: Bool
    let reloadToken: Int

    final class Coordinator { var loaded: Int? }
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let wv = Web.make(Web.config(store: GameStore.dataStore(account)))
        Skeleton.attach(wv, style: .game)
        wv.allowsBackForwardNavigationGestures = true
        let ucc = wv.configuration.userContentController
        ucc.addUserScript(Web.keepAliveScript())
        if let script = GameChannelWatcher.shared.script() { ucc.addUserScript(script) }
        ucc.add(GameChannelWatcher.shared, name: "pfGameChannels")
        MarketWatcher.shared.gameWebViews.add(wv)
        if readsMarket {
            ucc.addUserScript(MarketWatcher.shared.script())
            ucc.add(MarketWatcher.shared, name: "pf")
            MarketWatcher.shared.gameWebView = wv
        }
        return wv
    }

    static func dismantleNSView(_ wv: WKWebView, coordinator: Coordinator) {
        wv.stopLoading()
        let ucc = wv.configuration.userContentController
        ucc.removeScriptMessageHandler(forName: "pfGameChannels")
        ucc.removeScriptMessageHandler(forName: "pf")
        MarketWatcher.shared.gameWebViews.remove(wv)
        if MarketWatcher.shared.gameWebView === wv { MarketWatcher.shared.gameWebView = nil }
    }

    func updateNSView(_ wv: WKWebView, context: Context) {
        guard context.coordinator.loaded != reloadToken else { return }
        let first = context.coordinator.loaded == nil
        context.coordinator.loaded = reloadToken
        if first || wv.url == nil { wv.load(URLRequest(url: Game.url)) } else { wv.reload() }
    }
}

// MARK: - Tile

/// Tipo de arraste num bloco: mover pelo título ou redimensionar por borda/canto.
enum TileDrag { case move, right, bottom, corner }

@MainActor
struct Tile: View {
    @EnvironmentObject var store: Store
    let entry: Entry
    /// (tipo, deslocamento, terminou)
    var onDrag: ((TileDrag, CGSize, Bool) -> Void)? = nil
    private var item: StreamItem { entry.item }
    private var platform: Platform { entry.platform }

    static let gripSize: CGFloat = 8

    var body: some View {
        // As alças ficam fora da área do vídeo (o WebView engoliria o mouse)
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                header
                    .contentShape(Rectangle())
                    .gesture(dragGesture(.move))
                    .onHover { $0 ? NSCursor.openHand.push() : NSCursor.pop() }
                    .help("Arraste para mover o bloco")
                LivePlayer(item: item, platform: platform, quality: platform == .kick && store.kickEconomy ? .lowest : store.quality)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if store.showChat {
                    LiveChat(channel: item.channel, platform: platform, reloadToken: item.reloadToken,
                             economy: platform == .kick && store.kickEconomy)
                        .frame(height: LiveChat.stripHeight)
                }
                // Borda de baixo: altura
                grip(.bottom, cursor: .resizeUpDown)
                    .frame(height: Self.gripSize)
            }
            VStack(spacing: 0) {
                // Borda direita: largura
                grip(.right, cursor: .resizeLeftRight)
                // Canto: largura + altura
                ZStack {
                    Color(nsColor: .controlBackgroundColor)
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                .frame(height: 14)
                .contentShape(Rectangle())
                .gesture(dragGesture(.corner))
                .onHover { $0 ? NSCursor.crosshair.push() : NSCursor.pop() }
                .help("Arraste para mudar largura e altura")
            }
            .frame(width: Self.gripSize + 4)
        }
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func grip(_ kind: TileDrag, cursor: NSCursor) -> some View {
        Rectangle()
            .fill(Color(nsColor: .controlBackgroundColor).opacity(0.8))
            .contentShape(Rectangle())
            .gesture(dragGesture(kind))
            .onHover { $0 ? cursor.push() : NSCursor.pop() }
    }

    private func dragGesture(_ kind: TileDrag) -> some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .onChanged { onDrag?(kind, $0.translation, false) }
            .onEnded { onDrag?(kind, $0.translation, true) }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Circle().fill(platform.color).frame(width: 7, height: 7)
            Text(item.channel)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
            Spacer()
            Button {
                store.update(item.id, platform) { $0.muted.toggle() }
            } label: {
                Image(systemName: item.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
            }
            .help(item.muted ? "Ativar som" : "Silenciar")
            Button {
                store.update(item.id, platform) { $0.reloadToken += 1 }
            } label: { Image(systemName: "arrow.clockwise") }
            .help("Recarregar")
            Button {
                Edge.open(URL(string: "https://\(platform.host)/\(item.channel)")!)
            } label: { Image(systemName: "globe") }
            .help("Abrir no Edge")
            Button {
                store.remove(item.id, platform)
            } label: { Image(systemName: "xmark") }
            .help("Remover canal do monitoramento")
        }
        .font(.system(size: 11))
        .buttonStyle(.borderless)
        .padding(.horizontal, 6)
        .frame(height: 22)
        .background(Color(nsColor: .controlBackgroundColor))
    }
}

// MARK: - Edge

enum Edge {
    /// Abre a URL no Microsoft Edge. Sem Edge, usa o navegador padrão.
    static func open(_ url: URL) {
        guard let app = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.microsoft.edgemac") else {
            NSWorkspace.shared.open(url); return
        }
        NSWorkspace.shared.open([url], withApplicationAt: app, configuration: NSWorkspace.OpenConfiguration())
    }
}

// MARK: - Grade

/// Grade única (Kick + Twitch) que preenche a janela, com divisórias arrastáveis:
/// - divisória vertical entre dois blocos da mesma linha: muda a largura deles
/// - divisória horizontal entre linhas: muda a altura das linhas
/// Os tamanhos ficam salvos. Os players não são recriados ao redimensionar.
@MainActor
struct TileGrid: View {
    @EnvironmentObject var store: Store

    private static let gap: CGFloat = 6

    struct Handle: Identifiable {
        enum Kind { case column, row, bottom }
        let id: String
        let kind: Kind
        let a: String, b: String      // chaves dos pesos (bloco ou linha)
        let groupSum: Double          // soma dos pesos da linha (ou de todas as linhas)
        let span: CGFloat             // largura da linha (ou altura total)
        let rect: CGRect
    }

    struct Layout {
        var frames: [UUID: CGRect] = [:]
        var handles: [Handle] = []
    }

    /// Escolhe o nº de colunas que deixa os vídeos maiores (proporção 16:9).
    static func autoColumns(_ n: Int, _ size: CGSize, chrome: CGFloat) -> Int {
        guard n > 1 else { return 1 }
        var best = 1, bestArea: CGFloat = -1
        for c in 1...n {
            let r = Int(ceil(Double(n) / Double(c)))
            let w = size.width / CGFloat(c)
            let h = size.height / CGFloat(r) - chrome
            guard h > 0 else { continue }
            let vw = min(w, h * 16 / 9)
            let area = vw * vw * 9 / 16
            if area > bestArea { bestArea = area; best = c }
        }
        return best
    }

    private func layout(_ items: [Entry], _ size: CGSize) -> Layout {
        var L = Layout()
        let n = items.count
        guard n > 0 else { return L }
        let chrome: CGFloat = 22 + (store.showChat ? LiveChat.stripHeight : 0)
        let cols = store.columns > 0 ? min(store.columns, n) : Self.autoColumns(n, size, chrome: chrome)
        let rows = stride(from: 0, to: n, by: cols).map { Array(items[$0..<min($0 + cols, n)]) }

        let rowKeys = rows.indices.map { "r\($0)" }
        let rowW = rowKeys.map { store.rowWeights[$0] ?? 1 }
        let rowSum = rowW.reduce(0, +)
        let g = Self.gap
        // Altura total usada pela grade (fração da janela). A divisória de baixo controla isso,
        // então dá para mudar a altura mesmo com uma linha só.
        let totalH = size.height * CGFloat(min(max(store.rowWeights[Self.totalKey] ?? 1, 0.15), 1))
        var y: CGFloat = 0

        for (ri, row) in rows.enumerated() {
            let h = totalH * CGFloat(rowW[ri] / rowSum)
            let keys = row.map { $0.id.uuidString }
            let ws = keys.map { store.tileWeights[$0] ?? 1 }
            let sum = ws.reduce(0, +)
            var x: CGFloat = 0
            for (ti, e) in row.enumerated() {
                let w = size.width * CGFloat(ws[ti] / sum)
                L.frames[e.id] = CGRect(x: x + g / 2, y: y + g / 2, width: max(w - g, 10), height: max(h - g, 10))
                if ti < row.count - 1 {
                    L.handles.append(Handle(id: "c\(keys[ti])-\(keys[ti + 1])", kind: .column,
                                            a: keys[ti], b: keys[ti + 1], groupSum: sum, span: size.width,
                                            rect: CGRect(x: x + w - g / 2, y: y + g / 2, width: g, height: max(h - g, 10))))
                }
                x += w
            }
            if ri < rows.count - 1 {
                L.handles.append(Handle(id: "r\(ri)", kind: .row, a: rowKeys[ri], b: rowKeys[ri + 1],
                                        groupSum: rowSum, span: totalH,
                                        rect: CGRect(x: 0, y: y + h - g / 2, width: size.width, height: g)))
            }
            y += h
        }
        // Divisória embaixo da última linha: arrasta para cima/baixo a altura de todos os blocos
        L.handles.append(Handle(id: "bottom", kind: .bottom, a: Self.totalKey, b: "", groupSum: 1,
                                span: size.height,
                                rect: CGRect(x: 0, y: min(totalH - g / 2, size.height - g), width: size.width, height: g)))
        return L
    }

    static let totalKey = "total"

    var body: some View {
        let items = store.videoEntries
        GeometryReader { geo in
            let L = layout(items, geo.size)
            ZStack(alignment: .topLeading) {
                ForEach(items) { entry in
                    let key = entry.id.uuidString
                    let f = rect(key, entry.id, L, geo.size)
                    Tile(entry: entry, onDrag: { kind, t, ended in
                        drag(key, from: f, kind, t, ended: ended, area: geo.size)
                    })
                    .frame(width: f.width, height: f.height)
                    .offset(x: f.minX, y: f.minY)
                    .zIndex(store.frontTile == key ? 1 : 0)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
        .background(Color.black.opacity(0.9))
    }

    @State private var dragOrigin: CGRect?
    private static let minTile = CGSize(width: 180, height: 120)

    /// Retângulo do bloco: o livre salvo (se o usuário já mexeu) ou a posição padrão da grade.
    private func rect(_ key: String, _ id: UUID, _ L: Layout, _ area: CGSize) -> CGRect {
        if let a = store.freeFrames[key], a.count == 4 {
            return CGRect(x: a[0] * area.width, y: a[1] * area.height,
                          width: a[2] * area.width, height: a[3] * area.height)
        }
        return L.frames[id] ?? .zero
    }

    /// Move/redimensiona um bloco sozinho. Salvo em fração da área, então acompanha a janela.
    private func drag(_ key: String, from current: CGRect, _ kind: TileDrag, _ t: CGSize,
                      ended: Bool, area: CGSize) {
        guard area.width > 0, area.height > 0 else { return }
        if dragOrigin == nil { dragOrigin = current; store.frontTile = key }
        guard let o = dragOrigin else { return }
        var r = o
        switch kind {
        case .move: r.origin.x += t.width; r.origin.y += t.height
        case .right: r.size.width += t.width
        case .bottom: r.size.height += t.height
        case .corner: r.size.width += t.width; r.size.height += t.height
        }
        let snap: (CGFloat) -> CGFloat = { ($0 / 8).rounded() * 8 }   // encaixa de 8 em 8 px
        r.size.width = min(max(snap(r.width), Self.minTile.width), area.width)
        r.size.height = min(max(snap(r.height), Self.minTile.height), area.height)
        r.origin.x = min(max(snap(r.minX), 0), area.width - r.width)
        r.origin.y = min(max(snap(r.minY), 0), area.height - r.height)
        store.freeFrames[key] = [Double(r.minX / area.width), Double(r.minY / area.height),
                                 Double(r.width / area.width), Double(r.height / area.height)]
        if ended { dragOrigin = nil; store.saveSizes() }
    }
}

// MARK: - Tela principal

@MainActor
struct LiveControls: View {
    @EnvironmentObject var store: Store

    var body: some View {
        HStack(spacing: 12) {
            Toggle("Gerenciar lives automaticamente", isOn: $store.autoLives)
                .toggleStyle(.checkbox)
                .help("Liga ou desliga as verificações periódicas, preservando as lives abertas")
            Picker("Verificar a cada", selection: $store.livePoll) {
                Text("30 s").tag(30)
                Text("1 min").tag(60)
                Text("2 min").tag(120)
                Text("5 min").tag(300)
            }
            .frame(width: 175)
            Text(store.liveSummary)
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                .help(store.liveSummary)
            Spacer(minLength: 0)
            Button("Verificar agora") { store.checkLivesNow() }
                .disabled(store.liveChecking)
                .help("Busca os canais do jogo e abre os online, mesmo com o automático desligado")
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Color(nsColor: .controlBackgroundColor))
    }
}

@MainActor
struct UpdateDialog: View {
    @EnvironmentObject var updates: ReleaseUpdateChecker
    @State private var openError = false
    @FocusState private var dismissFocused: Bool

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
                .onTapGesture { /* clique fora não fecha o aviso */ }
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 38)).foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                Text(updates.release == nil ? "Atualizações do PokeFarm" : "Nova versão disponível")
                    .font(.title2.bold())
                if let release = updates.release {
                    Text("A versão \(release.version) já está disponível. Você está usando a \(updates.currentVersion).")
                    if updates.status == "error" {
                        Text("A consulta está indisponível no momento, mas você pode abrir a release já encontrada.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    Text(updates.message)
                }
                Text("Suas lives e o jogo continuam rodando. Você escolhe quando atualizar.")
                    .font(.caption).foregroundStyle(.secondary)
                if openError {
                    Text("Não foi possível abrir o navegador. Tente novamente.")
                        .font(.caption).foregroundStyle(.red)
                }
                HStack(spacing: 10) {
                    Spacer()
                    Button(updates.release == nil ? "Fechar" : "Agora não") { updates.dismissDialog() }
                        .keyboardShortcut(.cancelAction)
                        .focused($dismissFocused)
                    if let release = updates.release {
                        Button("Ver release / baixar") {
                            if NSWorkspace.shared.open(release.url) { updates.dismissDialog() }
                            else { openError = true }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding(.top, 8)
            }
            .padding(28).frame(width: 460)
            .background(Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.12)))
            .shadow(color: .black.opacity(0.4), radius: 30, y: 12)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Atualizações do PokeFarm")
            .onAppear { dismissFocused = true }
        }
    }
}

@MainActor
struct ContentView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var updates: ReleaseUpdateChecker
    @State private var input = ""
    @State private var target: Platform = .kick
    @State private var toast: String?
    @State private var toastID = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                tabStrip
                Divider().frame(height: 20)
                switch store.tab {
                case .lives: livesBar
                case .game: gameBar
                case .alerts:
                    Text("Alertas do Community Market do Pokeidle").foregroundStyle(.secondary)
                    Spacer()
                }
            }
            .padding(8)
            Divider()
            // As duas abas ficam sempre carregadas; a ativa só vai para a frente.
            // Assim o jogo e as lives continuam rodando ao trocar de aba.
            ZStack {
                VStack(spacing: 0) {
                    LiveControls()
                    TwitchEconomyPanel()
                    Divider()
                    ZStack {
                        TileGrid()
                        if store.videoEntries.isEmpty {
                            if store.twitchEconomy && !store.economyPlan.channels.isEmpty {
                                VStack(spacing: 8) {
                                    Text("Twitch em modo econômico")
                                    Text("Acompanhe a conexão acima e os bônus na aba Pokeidle.")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            } else { empty }
                        }
                    }
                }
                .background(Color(nsColor: .windowBackgroundColor))
                .zIndex(store.tab == .lives ? 1 : 0)
                .allowsHitTesting(store.tab == .lives)

                // Todas as contas ficam rodando; só a selecionada vem para a frente
                ForEach(store.accounts) { a in
                    let shown = store.tab == .game && store.gameAccountID == a.id
                    let market = a.id == store.accounts.first?.id
                    GameView(account: a, readsMarket: market, reloadToken: store.gameReloads[a.id] ?? 0)
                        .id("\(a.id.uuidString)|\(market)")
                        .zIndex(shown ? 1 : 0)
                        .allowsHitTesting(shown)
                        .accessibilityHidden(!shown)
                }

                if store.tab == .alerts {
                    AlertsView()
                        .background(Color(nsColor: .windowBackgroundColor))
                        .zIndex(2)
                }
            }
            Divider()
            HStack(spacing: 12) {
                Text("PokeFarm \(updates.currentVersion)").foregroundStyle(.secondary)
                Spacer()
                Button("Verificar atualizações") { Task { await updates.checkManually() } }
                    .disabled(updates.status == "checking")
            }
            .font(.caption)
            .padding(.horizontal, 10).padding(.vertical, 8)
        }
        .allowsHitTesting(!updates.dialogPresented)
        .disabled(updates.dialogPresented)
        .accessibilityHidden(updates.dialogPresented)
        .onReceive(NotificationCenter.default.publisher(for: .pfOpenGame)) { _ in store.tab = .game }
        .onReceive(NotificationCenter.default.publisher(for: .pfAddLive)) { n in
            guard let link = n.object as? String else { return }
            addFromGame(link)
        }
        .onReceive(NotificationCenter.default.publisher(for: .pfGameChannels)) { n in
            guard let channels = n.object as? [GameChannel] else { return }
            store.receiveGameChannels(channels)
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.15)))
                    .padding(.bottom, 18)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .overlay {
            if updates.dialogPresented { UpdateDialog().environmentObject(updates) }
        }
    }

    /// Link de live clicado no jogo: vira bloco na aba Lives (o jogo continua aberto).
    private func addFromGame(_ link: String) {
        let name = link.split(separator: "/").last.map(String.init) ?? link
        let platform = link.contains("twitch.tv") ? "Twitch" : "Kick"
        let before = store.all.count
        store.add(link, default: .twitch)
        let msg = store.all.count > before
            ? "✓ \(name) (\(platform)) adicionado às Lives"
            : "\(name) já está nas Lives"
        toastID += 1
        let id = toastID
        toast = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { if toastID == id { toast = nil } }
    }

    // MARK: Abas (Lives, uma por conta do Pokeidle, Alertas)

    private var tabStrip: some View {
        HStack(spacing: 2) {
            tabButton("Lives", selected: store.tab == .lives) { store.tab = .lives }
            ForEach(store.accounts) { a in
                tabButton(a.name.isEmpty ? "Sem nome" : a.name, icon: "gamecontroller.fill",
                          selected: store.tab == .game && store.gameAccountID == a.id) {
                    store.gameAccountID = a.id
                    store.tab = .game
                }
            }
            Button { store.addAccount() } label: { Image(systemName: "plus") }
                .buttonStyle(.borderless)
                .padding(.horizontal, 6)
                .help("Nova conta do Pokeidle (aba com login separado)")
                .accessibilityLabel("Adicionar conta do Pokeidle")
            tabButton("Alertas", selected: store.tab == .alerts) { store.tab = .alerts }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 7).stroke(Color.secondary.opacity(0.35)))
    }

    private func tabButton(_ title: String, icon: String? = nil, selected: Bool,
                           action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon { Image(systemName: icon).font(.system(size: 9)) }
                Text(title).lineLimit(1)
            }
            .font(.system(size: 12, weight: selected ? .semibold : .regular))
            .padding(.horizontal, 10).padding(.vertical, 3)
            .frame(maxWidth: 160)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(RoundedRectangle(cornerRadius: 5).fill(selected ? Color.accentColor : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @State private var confirmRemove = false

    private var gameBar: some View {
        let id = store.gameAccountID
        let account = store.currentAccount
        return HStack(spacing: 8) {
            Image(systemName: "person.crop.circle").foregroundStyle(.secondary)
            TextField("Nome da conta", text: Binding(
                get: { store.currentAccount?.name ?? "" },
                set: { store.renameAccount(id, $0) }))
                .textFieldStyle(.roundedBorder)
                .frame(width: 200)
                .help("Nome desta conta (aparece na aba)")
            if !GameStore.separateLoginsSupported && account?.usesDefaultStore == false {
                Text("No macOS 13 o login desta conta some ao fechar o app")
                    .font(.caption).foregroundStyle(.orange)
            }
            Spacer()
            Button {
                if let a = account { Popups.shared.openGameLogin(a) }
            } label: {
                Label("Entrar", systemImage: "key.fill")
            }
            .help("Entrar nesta conta (abre janela de login; funciona com Google). Depois, Recarregar jogo.")
            Button { store.reloadGame(id) } label: {
                Label("Recarregar jogo", systemImage: "arrow.clockwise")
            }
            Button { Edge.open(Game.url) } label: {
                Label("Abrir no Edge", systemImage: "globe")
            }
            Button(role: .destructive) { confirmRemove = true } label: {
                Label("Remover conta", systemImage: "trash")
            }
            .disabled(store.accounts.count <= 1)
            .help(store.accounts.count <= 1 ? "Precisa ter pelo menos uma conta" : "Fecha esta aba e apaga o login dela")
            .confirmationDialog("Remover \"\(account?.name ?? "")\"?", isPresented: $confirmRemove) {
                Button("Remover conta", role: .destructive) { store.removeAccount(id) }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text(account?.usesDefaultStore == true
                     ? "A aba fecha. O login dela continua salvo, porque é o mesmo das lives da Twitch e Kick."
                     : "A aba fecha e o login desta conta no Pokeidle é apagado do app.")
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: "play.rectangle.on.rectangle")
                .font(.system(size: 42)).foregroundStyle(.secondary)
            Text(store.all.isEmpty ? "Entre no Pokeidle para carregar os canais" : "Nenhuma live aberta no momento")
                .foregroundStyle(.secondary)
            Text(store.all.isEmpty
                 ? "Os canais oficiais são reconhecidos pelo jogo. Use Verificar agora para abrir os online."
                 : store.unknownLives > 0
                    ? "Não foi possível verificar alguns canais. Use Verificar agora para tentar novamente."
                    : store.autoLives ? "As lives abrirão automaticamente quando os canais estiverem online."
                        : "Clique em Verificar agora para trazer os canais online à tela.")
                .font(.caption).foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var livesBar: some View {
        HStack(spacing: 8) {
            Picker("", selection: $target) {
                ForEach(Platform.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 130)
            .help("Plataforma padrão para novos canais (links são detectados sozinhos)")

            TextField("Canal ou link (vários separados por vírgula)", text: $input)
                .textFieldStyle(.roundedBorder)
                .onSubmit(addInput)
            Button("Adicionar", action: addInput)
                .keyboardShortcut(.return, modifiers: [])

            Picker("Colunas", selection: $store.columns) {
                Text("Auto").tag(0)
                ForEach(1...8, id: \.self) { Text("\($0)").tag($0) }
            }
            .pickerStyle(.menu)
            .frame(width: 130)
            .help("Auto escolhe o nº de colunas que deixa os vídeos maiores")

            Button { store.resetSizes() } label: { Image(systemName: "rectangle.split.3x3") }
                .help("Reorganizar: volta todos os blocos para a grade (arraste o título para mover, bordas/canto para redimensionar)")

            Toggle(isOn: $store.showChat) {
                Image(systemName: "bubble.left.and.bubble.right")
            }
            .toggleStyle(.button)
            .help("Mostrar/esconder os chats")

            Menu("Entrar") {
                Button("Entrar na Twitch") { Popups.shared.openLogin(.twitch) }
                Button("Entrar na Kick") { Popups.shared.openLogin(.kick) }
            }
            .frame(width: 80)
            .help("Fazer login (vale para todos os players e chats)")

            Picker(selection: $store.quality) {
                ForEach(VideoQuality.allCases) { Text($0.label).tag($0) }
            } label: { Image(systemName: "dial.low") }
            .pickerStyle(.menu)
            .frame(width: 150)
            .help("Qualidade de todas as lives (menor = menos peso). Trocar recarrega as lives.")

            Button("Silenciar todos") { store.muteAll() }
            Button { store.reloadAll() } label: { Image(systemName: "arrow.clockwise") }
                .help("Recarregar tudo (use depois de fazer login)")
            Menu("Limpar") {
                Button("Kick") { store.clear(.kick) }
                Button("Twitch") { store.clear(.twitch) }
                Button("Tudo") { store.clear(.kick); store.clear(.twitch) }
            }
            .frame(width: 80)
        }
    }

    private func addInput() {
        store.add(input, default: target)
        input = ""
    }
}

// MARK: - App

/// Mantém o Mac acordado e o app em prioridade máxima, inclusive com a tela bloqueada.
enum KeepAwake {
    private static var activity: NSObjectProtocol?
    private static var assertionID: IOPMAssertionID = 0

    static func start() {
        // Sem App Nap, sem suspensão do processo, sem o sistema/tela dormirem por inatividade
        activity = ProcessInfo.processInfo.beginActivity(
            options: [.userInitiated, .idleSystemSleepDisabled, .idleDisplaySleepDisabled,
                      .suddenTerminationDisabled, .automaticTerminationDisabled, .latencyCritical],
            reason: "PokeFarm: lives e jogo rodando 24h"
        )
        // Reforço via IOKit (o mesmo que o `caffeinate -s` faz): impede o sono do sistema na tomada
        IOPMAssertionCreateWithName(kIOPMAssertionTypePreventSystemSleep as CFString,
                                    IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                    "PokeFarm rodando 24h" as CFString, &assertionID)
    }
}

@main
@MainActor
struct KickMultiApp: App {
    @StateObject private var store = Store()
    @StateObject private var updates = ReleaseUpdateChecker()

    init() {
        KeepAwake.start()
        MarketWatcher.shared.setupNotifications()
    }

    var body: some Scene {
        WindowGroup("PokeFarm") {
            ContentView()
                .environmentObject(store)
                .environmentObject(updates)
                .task {
                    updates.onAvailable = { MarketWatcher.shared.notifyUpdate($0) }
                    updates.start()
                }
                .frame(minWidth: 1100, minHeight: 500)
        }
    }
}
