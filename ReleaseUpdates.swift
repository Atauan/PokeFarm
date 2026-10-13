import Foundation
import Combine

struct ReleaseUpdate {
    let version: String
    let tag: String
    let url: URL

    static func components(_ value: String) -> [Int]? {
        let pattern = #"\Av?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\z"#
        guard value.range(of: pattern, options: .regularExpression) != nil else { return nil }
        let core = value.split(separator: "+")[0]
        let plain = core.hasPrefix("v") ? core.dropFirst() : core
        var parts = plain.split(separator: ".").compactMap { Int($0) }
        guard parts.count == plain.split(separator: ".").count,
              parts.allSatisfy({ $0 <= 9_007_199_254_740_991 }) else { return nil }
        if parts.count == 2 { parts.append(0) }
        return parts
    }

    static func url(forTag tag: String) -> URL? {
        guard components(tag) != nil,
              let encoded = tag.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._"))) else { return nil }
        return URL(string: "https://github.com/RaullPereira/PokeFarm/releases/tag/\(encoded)")
    }
}

/// Consulta somente releases públicas, sem compartilhar cookies com as páginas do app.
@MainActor
final class ReleaseUpdateChecker: ObservableObject {
    typealias Loader = (URLRequest) async throws -> (Data, URLResponse)
    private struct Release: Decodable {
        let tag_name: String
        let draft: Bool
        let prerelease: Bool
    }
    private enum CheckError: Error { case invalidResponse }

    let currentVersion: String
    @Published private(set) var status = "idle"
    @Published private(set) var release: ReleaseUpdate?
    @Published private(set) var dialogPresented = false
    var onAvailable: (ReleaseUpdate) -> Void = { _ in }
    private let defaults: UserDefaults
    private let loader: Loader
    private let now: () -> Date
    private var notified: Set<String>
    private var shownDialogs: Set<String>
    private var nextCheck = Date.distantPast
    private var pending: Task<Void, Never>?
    private var timer: Timer?

    init(currentVersion: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
         defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init, loader: Loader? = nil) {
        self.currentVersion = currentVersion
        self.defaults = defaults
        self.now = now
        self.notified = Set(defaults.stringArray(forKey: "notifiedUpdateVersions") ?? [])
        self.shownDialogs = Set(defaults.stringArray(forKey: "shownUpdateDialogs") ?? [])
        if let loader { self.loader = loader }
        else {
            let session = URLSession(configuration: .ephemeral)
            self.loader = { try await session.data(for: $0) }
        }
    }

    var message: String {
        if let release {
            return "Nova versão disponível: \(release.version)" + (status == "error" ? " — consulta indisponível no momento." : "")
        }
        switch status {
        case "checking": return "Verificando atualizações…"
        case "current": return "Você está na versão mais recente."
        case "unpublished": return "Nenhuma release estável disponível."
        case "error": return "Não foi possível verificar. Tente novamente mais tarde."
        default: return "Atualizações automáticas ligadas"
        }
    }

    func start() {
        guard timer == nil else { return }
        Task { await check() }
        timer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.check() }
        }
    }

    func check() async {
        if let pending { await pending.value; return }
        guard now() >= nextCheck else { return }
        nextCheck = now().addingTimeInterval(60)
        let task = Task { await performCheck() }
        pending = task
        await task.value
        pending = nil
    }

    func checkManually() async {
        dialogPresented = true
        await check()
    }

    func dismissDialog() { dialogPresented = false }

    private func performCheck() async {
        status = "checking"
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/RaullPereira/PokeFarm/releases/latest")!,
                                 cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("PokeFarm-update-check", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await loader(request)
            guard let http = response as? HTTPURLResponse else { throw CheckError.invalidResponse }
            if http.statusCode == 404 { release = nil; status = "unpublished"; return }
            guard http.statusCode == 200 else {
                if http.statusCode == 403 || http.statusCode == 429 {
                    if let retry = http.value(forHTTPHeaderField: "Retry-After") {
                        if let seconds = Double(retry), seconds.isFinite {
                            nextCheck = max(nextCheck, now().addingTimeInterval(seconds))
                        } else {
                            let formatter = DateFormatter()
                            formatter.locale = Locale(identifier: "en_US_POSIX")
                            formatter.timeZone = TimeZone(secondsFromGMT: 0)
                            formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
                            if let date = formatter.date(from: retry) { nextCheck = max(nextCheck, date) }
                        }
                    }
                    if let reset = http.value(forHTTPHeaderField: "X-RateLimit-Reset"), let seconds = Double(reset), seconds.isFinite {
                        nextCheck = max(nextCheck, Date(timeIntervalSince1970: seconds))
                    }
                }
                throw CheckError.invalidResponse
            }
            let info = try JSONDecoder().decode(Release.self, from: data)
            if info.draft || info.prerelease { release = nil; status = "unpublished"; return }
            guard let current = ReleaseUpdate.components(currentVersion), let latest = ReleaseUpdate.components(info.tag_name),
                  let url = ReleaseUpdate.url(forTag: info.tag_name) else { throw CheckError.invalidResponse }
            guard current.lexicographicallyPrecedes(latest) else { release = nil; status = "current"; return }
            let update = ReleaseUpdate(version: latest.map(String.init).joined(separator: "."), tag: info.tag_name, url: url)
            release = update
            status = "available"
            if shownDialogs.insert(update.version).inserted {
                defaults.set(Array(shownDialogs).sorted(), forKey: "shownUpdateDialogs")
                dialogPresented = true
            }
            if notified.insert(update.version).inserted {
                defaults.set(Array(notified).sorted(), forKey: "notifiedUpdateVersions")
                onAvailable(update)
            }
        } catch {
            // A release já encontrada continua acessível mesmo sem internet.
            status = "error"
        }
    }
}
