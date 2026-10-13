import AppKit
import SwiftUI

private struct DonationDeveloper: Decodable, Identifiable {
    let id: String
    let name: String
    let emoji: String
    let title: String
    let message: String
    let pix: String
    let qr: String
    let github: URL
    let linkedin: URL

    var qrImage: NSImage? {
        guard let root = Bundle.main.resourceURL else { return nil }
        return NSImage(contentsOf: root.appendingPathComponent("Donations").appendingPathComponent(qr))
    }
}

private struct DonationConfiguration: Decodable {
    let repository: URL
    let developers: [DonationDeveloper]

    static func load() -> DonationConfiguration? {
        guard let url = Bundle.main.url(forResource: "developers", withExtension: "json", subdirectory: "Donations"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }
}

struct AboutView: View {
    let close: () -> Void
    private let configuration = DonationConfiguration.load()
    @State private var selected: DonationDeveloper?
    @State private var copyStatus = ""
    private let accent = Color(red: 0.78, green: 0.69, blue: 0.95)

    init(close: @escaping () -> Void) { self.close = close }

    private var version: String {
        Bundle.main.object(forInfoDictionaryKey: "PokeFarmDisplayVersion") as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
    }

    var body: some View {
        VStack(spacing: 14) {
            Group {
                if let developer = selected { donationScreen(developer) }
                else { aboutScreen }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if selected == nil { closeButton.keyboardShortcut(.cancelAction) }
            else { closeButton }
        }
        .padding(22)
        .frame(width: 440, height: 640)
        .multilineTextAlignment(.center)
        .background(Color(red: 0.078, green: 0.078, blue: 0.086))
        .preferredColorScheme(.dark)
        .tint(accent)
    }

    private var closeButton: some View {
        Button(action: close) { Text("Fechar").frame(maxWidth: .infinity).padding(.vertical, 7) }
    }

    private var aboutScreen: some View {
        VStack(spacing: 0) {
            Image(nsImage: NSImage(named: NSImage.applicationIconName) ?? NSImage())
                .resizable().frame(width: 88, height: 88).accessibilityHidden(true).padding(.bottom, 8)
            Text("PokeFarm").font(.system(size: 30, weight: .bold))
            Text("Versão \(version)").font(.system(size: 12)).foregroundStyle(accent)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(Color(red: 0.14, green: 0.13, blue: 0.17), in: Capsule()).padding(.top, 10)
            Text("Lives, Pokeidle e sua comunidade.\nTudo no mesmo lugar.")
                .font(.system(size: 14)).foregroundStyle(.secondary).lineSpacing(4).padding(.vertical, 18)
            if let configuration {
                VStack(spacing: 12) {
                    Text("DESENVOLVIDO POR").font(.system(size: 10, weight: .semibold)).tracking(1.6).foregroundStyle(.secondary)
                    ForEach(configuration.developers) { developer in
                        Button(developer.name) { copyStatus = ""; selected = developer }
                            .buttonStyle(.plain).foregroundStyle(accent).font(.system(size: 14, weight: .semibold))
                            .help("Apoiar \(developer.name)")
                    }
                    Text("Clique em um nome para apoiar o desenvolvedor.").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity).padding(17)
                .background(Color(red: 0.12, green: 0.12, blue: 0.14), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.12)))
                Link("Repositório no GitHub ↗", destination: configuration.repository).font(.system(size: 12)).padding(.top, 18)
            } else {
                Text("Não foi possível carregar os dados dos desenvolvedores.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            HStack(spacing: 5) {
                Text("♥").foregroundStyle(Color(red: 0.60, green: 0.78, blue: 0.55))
                Text("Feito com carinho, de jogador para jogador.").foregroundStyle(.secondary)
            }.font(.system(size: 11)).padding(.top, 18)
        }
    }

    private func donationScreen(_ developer: DonationDeveloper) -> some View {
        VStack(spacing: 0) {
            Button("← Voltar ao Sobre") { selected = nil; copyStatus = "" }
                .buttonStyle(.plain).foregroundStyle(accent).font(.system(size: 12))
                .keyboardShortcut(.cancelAction).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 8)
            Text(developer.emoji).font(.system(size: 32)).accessibilityHidden(true).padding(.bottom, 4)
            Text(developer.title).font(.system(size: 21, weight: .bold)).fixedSize(horizontal: false, vertical: true)
            Text(developer.name).font(.system(size: 11)).foregroundStyle(accent).padding(.top, 6)
            Text(developer.message).font(.system(size: 12)).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 10).padding(.bottom, 12)
            if let image = developer.qrImage {
                Image(nsImage: image).interpolation(.none).resizable().frame(width: 212, height: 212)
                    .background(Color.white).clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("QR Code Pix para apoiar \(developer.name)")
            } else {
                Text("QR Code indisponível. Use o botão para copiar o Pix.")
                    .font(.system(size: 12)).frame(width: 212, height: 212)
            }
            Text("Escaneie com o app do seu banco e escolha o valor.")
                .font(.system(size: 10)).foregroundStyle(.secondary).padding(.top, 10).padding(.bottom, 12)
            Button {
                NSPasteboard.general.clearContents()
                copyStatus = NSPasteboard.general.setString(developer.pix, forType: .string)
                    ? "Código Pix copiado!" : "Não foi possível copiar. Tente novamente."
            } label: { Text("Copiar código Pix").frame(maxWidth: .infinity).padding(.vertical, 7) }
            .buttonStyle(.borderedProminent)
            Text(copyStatus.isEmpty ? " " : copyStatus).font(.system(size: 11)).foregroundStyle(Color.green)
                .frame(minHeight: 16).padding(.vertical, 6)
            HStack(spacing: 24) {
                Link("GitHub ↗", destination: developer.github)
                Link("LinkedIn ↗", destination: developer.linkedin)
            }.font(.system(size: 12)).padding(.vertical, 4)
            Spacer(minLength: 0)
        }
    }
}
