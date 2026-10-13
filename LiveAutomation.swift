import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

enum LiveStatus: String, Sendable { case online, offline, unknown }

struct TwitchEconomyPlan: Sendable {
    let channels: [String]
    let total: Int

    init(channels: [String]) {
        let names = Set(channels.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { $0.range(of: "^[a-z0-9_]{1,25}$", options: .regularExpression) != nil }).sorted()
        total = names.count
        self.channels = Array(names.prefix(100))
    }

    var url: URL? {
        guard let first = channels.first else { return nil }
        var url = URLComponents()
        url.scheme = "https"; url.host = "www.twitch.tv"; url.path = "/popout/\(first)/chat"
        url.queryItems = [URLQueryItem(name: "pf-economy", value: "1"),
                          URLQueryItem(name: "pf-channels", value: channels.joined(separator: ","))]
        return url.url
    }
}

struct LiveState: Equatable, Sendable {
    var status: LiveStatus = .unknown
    var offlineCount = 0
    var isOpen = false

    mutating func receive(_ result: LiveStatus) {
        status = result
        offlineCount = result == .offline ? min(offlineCount + 1, 2) : 0
        isOpen = result == .online || (isOpen && (result == .unknown || offlineCount < 2))
    }
}

struct MonitoredChannel: Equatable, Sendable {
    let id: UUID
    let platform: String
    let channel: String
}

struct GameChannel: Codable, Equatable, Sendable {
    let platform: String
    let channel: String
    var key: String { "\(platform):\(channel)" }

    init?(platform: String, channel: String) {
        let cleaned = channel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard ["kick", "twitch"].contains(platform),
              cleaned.range(of: #"\A[a-z0-9_-]{2,40}\z"#, options: .regularExpression) != nil else { return nil }
        self.platform = platform
        self.channel = cleaned
    }

    enum CodingKeys: String, CodingKey { case platform, channel }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let platform = try values.decode(String.self, forKey: .platform)
        let channel = try values.decode(String.self, forKey: .channel)
        guard let valid = GameChannel(platform: platform, channel: channel) else {
            throw DecodingError.dataCorruptedError(forKey: .channel, in: values, debugDescription: "Invalid game channel")
        }
        self = valid
    }
}

struct GameChannelImport: Codable, Sendable {
    private(set) var channels: [GameChannel] = []
    private(set) var ignored: Set<String> = []
    var candidates: [GameChannel] { channels.filter { !ignored.contains($0.key) } }

    mutating func discover(_ incoming: [GameChannel]) {
        var known = Set(channels.map(\.key))
        for channel in incoming.prefix(200) where channels.count < 200 {
            if known.insert(channel.key).inserted { channels.append(channel) }
        }
    }
    mutating func ignore(_ channel: GameChannel) { ignored.insert(channel.key) }
    mutating func allow(_ channel: GameChannel) { ignored.remove(channel.key) }
    mutating func restoreIgnored() { ignored = [] }
}

protocol LiveStatusChecking: Sendable {
    func check(platform: String, channels: [String]) async -> [String: LiveStatus]
}

/// Lê os endpoints dos sites sem carregar players. Erros nunca significam "offline".
actor LiveStatusService: LiveStatusChecking {
    typealias Loader = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    private let loader: Loader
    private let userAgent: String
    private var twitchClient: String?
    private var clientExpires = Date.distantPast
    private var clientRequest: Task<String, Error>?

    init(userAgent: String, loader: @escaping Loader = { try await URLSession.shared.data(for: $0) }) {
        self.userAgent = userAgent
        self.loader = loader
    }

    func check(platform: String, channels: [String]) async -> [String: LiveStatus] {
        guard ["kick", "twitch"].contains(platform) else { return [:] }
        let names = Set(channels.prefix(200).filter {
            $0.range(of: #"\A[a-z0-9_-]{2,40}\z"#, options: .regularExpression) != nil
        }).sorted()
        var results = Dictionary(uniqueKeysWithValues: names.map { ($0, LiveStatus.unknown) })
        let size = platform == "twitch" ? 30 : 1
        for offset in stride(from: 0, to: names.count, by: size) {
            let batch = Array(names[offset..<min(offset + size, names.count)])
            do {
                if platform == "kick", let channel = batch.first {
                    let data = try await request(URLRequest(url: URL(string: "https://kick.com/api/v2/channels/\(channel)")!))
                    let response = try JSONDecoder().decode(KickChannel.self, from: data)
                    guard response.slug.lowercased() == channel else { continue }
                    results[channel] = response.livestream?.is_live == true ? .online : .offline
                } else {
                    results.merge(try await checkTwitch(batch)) { _, updated in updated }
                }
            } catch {
                // Respostas inesperadas preservam o estado anterior dos canais deste lote.
            }
        }
        return results
    }

    private func checkTwitch(_ channels: [String]) async throws -> [String: LiveStatus] {
        var results = Dictionary(uniqueKeysWithValues: channels.map { ($0, LiveStatus.unknown) })
        let client = try await getTwitchClient()
        let variables = Dictionary(uniqueKeysWithValues: channels.enumerated().map { ("login\($0.offset)", $0.element) })
        let declarations = channels.indices.map { "$login\($0): String!" }.joined(separator: ", ")
        let fields = channels.indices.map { "u\($0): user(login: $login\($0)) { login stream { id type } }" }.joined(separator: " ")
        var query = URLRequest(url: URL(string: "https://gql.twitch.tv/gql")!)
        query.httpMethod = "POST"
        query.setValue(client, forHTTPHeaderField: "Client-ID")
        query.setValue("application/json", forHTTPHeaderField: "Content-Type")
        query.httpBody = try JSONSerialization.data(withJSONObject: [
            "query": "query(\(declarations)) { \(fields) }", "variables": variables,
        ])
        let data = try await request(query)
        let response = try JSONDecoder().decode(TwitchResponse.self, from: data)
        if response.errors?.isEmpty == false { clientExpires = .distantPast; return results }
        for (index, channel) in channels.enumerated() {
            guard let user = response.data?["u\(index)"] ?? nil, user.login.lowercased() == channel else { continue }
            if let stream = user.stream {
                results[channel] = !stream.id.isEmpty && stream.type == "live" ? .online : .unknown
            } else { results[channel] = .offline }
        }
        return results
    }

    private func request(_ original: URLRequest) async throws -> Data {
        var request = original
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        let (data, response) = try await loader(request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            clientExpires = .distantPast
            throw URLError(.badServerResponse)
        }
        return data
    }

    private func getTwitchClient() async throws -> String {
        if let client = twitchClient, Date() < clientExpires { return client }
        if let request = clientRequest { return try await request.value }
        let task = Task { () throws -> String in
            let data = try await self.request(URLRequest(url: URL(string: "https://www.twitch.tv/")!))
            guard let html = String(data: data, encoding: .utf8) else { throw URLError(.cannotDecodeContentData) }
            // Identificador público servido pela Twitch, sem guardar credenciais do usuário.
            let regex = try NSRegularExpression(pattern: #"\bclientId\s*=\s*["']([a-z0-9]+)["']"#,
                                                options: .caseInsensitive)
            guard let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
                  let range = Range(match.range(at: 1), in: html) else { throw URLError(.cannotParseResponse) }
            return String(html[range])
        }
        clientRequest = task
        defer { clientRequest = nil }
        let client = try await task.value
        twitchClient = client
        clientExpires = Date().addingTimeInterval(6 * 60 * 60)
        return client
    }

    private struct KickChannel: Decodable {
        let slug: String
        let livestream: KickStream?
        enum CodingKeys: String, CodingKey { case slug, livestream }
        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            slug = try values.decode(String.self, forKey: .slug)
            // null confirma offline; campo ausente ou inválido é uma falha de leitura.
            if try values.decodeNil(forKey: .livestream) { livestream = nil }
            else { livestream = try values.decode(KickStream.self, forKey: .livestream) }
        }
    }
    private struct KickStream: Decodable { let is_live: Bool }
    private struct TwitchResponse: Decodable {
        let data: [String: TwitchUser?]?
        let errors: [TwitchError]?
    }
    private struct TwitchError: Decodable { let message: String }
    private struct TwitchUser: Decodable {
        let login: String
        let stream: TwitchStream?
        enum CodingKeys: String, CodingKey { case login, stream }
        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            login = try values.decode(String.self, forKey: .login)
            if try values.decodeNil(forKey: .stream) { stream = nil }
            else { stream = try values.decode(TwitchStream.self, forKey: .stream) }
        }
    }
    private struct TwitchStream: Decodable { let id: String; let type: String }
}

/// Mantém cadastro e visibilidade separados. Só um ciclo consulta as plataformas por vez.
@MainActor
final class LiveMonitor {
    private let checker: any LiveStatusChecking
    private var checkTask: Task<Void, Never>?
    private var timerTask: Task<Void, Never>?
    private var generation = 0
    private(set) var enabled = true
    private(set) var interval = 60
    private(set) var channels: [MonitoredChannel] = []
    private(set) var states: [UUID: LiveState] = [:]
    private(set) var isChecking = false
    var onChange: (() -> Void)?

    init(checker: any LiveStatusChecking) { self.checker = checker }

    var openIDs: Set<UUID> {
        return Set(states.filter { $0.value.isOpen }.map(\.key))
    }

    func openManually(_ id: UUID) {
        guard channels.contains(where: { $0.id == id }) else { return }
        states[id] = LiveState(isOpen: true)
        onChange?()
    }

    func configure(channels: [MonitoredChannel], enabled: Bool, interval: Int) {
        let interval = [30, 60, 120, 300].contains(interval) ? interval : 60
        guard channels != self.channels || enabled != self.enabled || interval != self.interval else { return }
        let toggled = enabled != self.enabled
        self.channels = channels
        self.enabled = enabled
        self.interval = interval
        let savedIDs = Set(channels.map(\.id))
        states = states.filter { savedIDs.contains($0.key) }
        if toggled && enabled { states = states.mapValues { LiveState(isOpen: $0.isOpen) } }
        generation &+= 1
        timerTask?.cancel()
        onChange?()
        if enabled && !isChecking { checkNow() }
    }

    func checkNow(manual: Bool = false) {
        timerTask?.cancel()
        guard (enabled || manual), !channels.isEmpty, !isChecking else { return }
        isChecking = true
        onChange?()
        let generation = self.generation
        let snapshot = channels
        let checker = self.checker
        var batches: [(platform: String, channels: [MonitoredChannel])] = []
        for platform in ["kick", "twitch"] {
            let platformChannels = snapshot.filter { $0.platform == platform }
            let size = platform == "twitch" ? 30 : 1
            for offset in stride(from: 0, to: platformChannels.count, by: size) {
                batches.append((platform, Array(platformChannels[offset..<min(offset + size, platformChannels.count)])))
            }
        }
        let jobs = batches
        checkTask = Task { [weak self] in
            for start in stride(from: 0, to: jobs.count, by: 4) {
                guard !Task.isCancelled, self?.generation == generation, manual || self?.enabled == true else { break }
                let batch = Array(jobs[start..<min(start + 4, jobs.count)])
                let results = await withTaskGroup(of: [(UUID, LiveStatus)].self) { group in
                    for job in batch {
                        group.addTask {
                            let statuses = await checker.check(platform: job.platform, channels: job.channels.map(\.channel))
                            return job.channels.map { ($0.id, statuses[$0.channel] ?? .unknown) }
                        }
                    }
                    var results: [(UUID, LiveStatus)] = []
                    for await result in group { results.append(contentsOf: result) }
                    return results
                }
                guard let self, self.generation == generation, manual || self.enabled else { break }
                for (id, status) in results {
                    var state = self.states[id] ?? LiveState()
                    state.receive(status)
                    self.states[id] = state
                }
                self.onChange?()
            }
            self?.finishCheck(generation: generation)
        }
    }

    private func finishCheck(generation: Int) {
        isChecking = false
        checkTask = nil
        onChange?()
        guard enabled, !channels.isEmpty else { return }
        if self.generation != generation { checkNow(); return }
        let delay = UInt64(interval) * 1_000_000_000
        timerTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: delay) } catch { return }
            guard !Task.isCancelled else { return }
            self?.checkNow()
        }
    }

    deinit { checkTask?.cancel(); timerTask?.cancel() }
}
