// Gera o ícone do PokeFarm (AppIcon.iconset) — usado pelo build.sh
// Uso: swift make_icon.swift <pasta.iconset>
import AppKit

func drawIcon(_ s: CGFloat) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(s), pixelsHigh: Int(s),
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // Fundo: quadrado arredondado com degradê roxo (Twitch) -> verde (Kick)
    let inset = s * 0.09
    let bg = NSRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let bgPath = NSBezierPath(roundedRect: bg, xRadius: s * 0.2, yRadius: s * 0.2)
    NSGradient(colors: [NSColor(red: 0.47, green: 0.20, blue: 0.95, alpha: 1),
                        NSColor(red: 0.20, green: 0.80, blue: 0.25, alpha: 1)])!
        .draw(in: bgPath, angle: -45)

    // Pokébola
    let r = s * 0.27
    let c = NSPoint(x: s / 2, y: s / 2)
    let ball = NSRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)
    let line = s * 0.035

    NSColor.white.setFill()
    NSBezierPath(ovalIn: ball).fill()

    let top = NSBezierPath()
    top.appendArc(withCenter: c, radius: r, startAngle: 0, endAngle: 180)
    top.close()
    NSColor(red: 0.93, green: 0.16, blue: 0.20, alpha: 1).setFill()
    top.fill()

    NSColor(white: 0.1, alpha: 1).set()
    let outline = NSBezierPath(ovalIn: ball)
    outline.lineWidth = line
    outline.stroke()
    NSRect(x: c.x - r, y: c.y - line / 2, width: r * 2, height: line).fill()

    let btnR = r * 0.32
    NSBezierPath(ovalIn: NSRect(x: c.x - btnR, y: c.y - btnR, width: btnR * 2, height: btnR * 2)).fill()
    NSColor.white.setFill()
    let inR = btnR * 0.6
    NSBezierPath(ovalIn: NSRect(x: c.x - inR, y: c.y - inR, width: inR * 2, height: inR * 2)).fill()

    // Selo "play" (lives) no canto
    let pr = s * 0.11
    let pc = NSPoint(x: bg.maxX - pr * 1.25, y: bg.minY + pr * 1.25)
    NSColor(white: 0.08, alpha: 0.9).setFill()
    NSBezierPath(ovalIn: NSRect(x: pc.x - pr, y: pc.y - pr, width: pr * 2, height: pr * 2)).fill()
    let tri = NSBezierPath()
    tri.move(to: NSPoint(x: pc.x - pr * 0.35, y: pc.y - pr * 0.5))
    tri.line(to: NSPoint(x: pc.x - pr * 0.35, y: pc.y + pr * 0.5))
    tri.line(to: NSPoint(x: pc.x + pr * 0.55, y: pc.y))
    tri.close()
    NSColor(red: 0.33, green: 0.93, blue: 0.1, alpha: 1).setFill()
    tri.fill()

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let px = CGFloat(base * scale)
        let name = scale == 1 ? "icon_\(base)x\(base).png" : "icon_\(base)x\(base)@2x.png"
        let data = drawIcon(px).representation(using: .png, properties: [:])!
        try! data.write(to: URL(fileURLWithPath: "\(out)/\(name)"))
    }
}
