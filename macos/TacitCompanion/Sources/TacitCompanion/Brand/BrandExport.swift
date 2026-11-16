import AppKit
import SwiftUI

/// `TacitCompanion --export-brand DIR`: writes the identity kit from the same geometry the app draws.
/// Offline: no server, camera, audio, network or window. Motion frames are brand animation, not app footage.
@MainActor enum BrandExport {
    static func run(_ dir: String) -> Never {
        do {
            let fm = FileManager.default
            for sub in ["svg", "png", "png/states", "png/AppIcon.iconset", "frames/reveal", "frames/speaking-loop"] {
                try fm.createDirectory(atPath: dir + "/" + sub, withIntermediateDirectories: true)
            }
            try writeSVGs(dir + "/svg")
            try writePNGs(dir + "/png")
            try writeFrames(dir + "/frames")
            print("BRAND EXPORT: wrote \(dir) (vector + raster identity kit, brand motion frames).")
            exit(0)
        } catch { print("BRAND EXPORT failed: \(error)"); exit(1) }
    }

    // MARK: SVG
    private struct Layer { var shapes: [BrandShape]; var arcs: String; var dot: String; var transform: CGAffineTransform = .identity }
    private static func svg(_ box: CGRect, _ layers: [Layer], background: String? = nil, title: String) -> String {
        func n(_ v: CGFloat) -> String { String(format: "%.3f", Double(v)) }
        var body = ""
        if let background { body += "  <rect x=\"\(n(box.minX))\" y=\"\(n(box.minY))\" width=\"\(n(box.width))\" height=\"\(n(box.height))\" fill=\"\(background)\"/>\n" }
        for l in layers {
            let t = l.transform
            let open = t.isIdentity ? "" : "  <g transform=\"matrix(\(n(t.a)) \(n(t.b)) \(n(t.c)) \(n(t.d)) \(n(t.tx)) \(n(t.ty)))\">\n"
            body += open
            for s in l.shapes {
                let color = s.role == .dot ? l.dot : l.arcs
                switch s.paint {
                case .fill: body += "  <path d=\"\(s.svg)\" fill=\"\(color)\"/>\n"
                case .stroke(let w): body += "  <path d=\"\(s.svg)\" fill=\"none\" stroke=\"\(color)\" stroke-width=\"\(n(w))\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n"
                }
            }
            if !open.isEmpty { body += "  </g>\n" }
        }
        return """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="\(n(box.minX)) \(n(box.minY)) \(n(box.width)) \(n(box.height))" role="img" aria-label="\(title)">
          <title>\(title)</title>
        \(body)</svg>

        """
    }

    private static func writeSVGs(_ dir: String) throws {
        let B = TacitBrand.self
        let markBox = CGRect(x: 0, y: 0, width: 24, height: 24)
        let white = "#FFFFFF", ink = B.ink.css, mint = B.mint.css, teal = B.teal.css
        let files: [(String, String)] = [
            ("tacit-mark", svg(markBox, [Layer(shapes: B.mark(), arcs: white, dot: mint)], title: "TACIT")),
            ("tacit-mark-on-light", svg(markBox, [Layer(shapes: B.mark(), arcs: ink, dot: teal)], title: "TACIT")),
            ("tacit-mark-mono-white", svg(markBox, [Layer(shapes: B.mark(), arcs: white, dot: white)], title: "TACIT")),
            ("tacit-mark-mono-black", svg(markBox, [Layer(shapes: B.mark(), arcs: "#000000", dot: "#000000")], title: "TACIT")),
            ("tacit-mark-high-contrast", svg(markBox, [Layer(shapes: B.mark(stroke: 2.8, dot: 2.9), arcs: white, dot: white)], background: "#000000", title: "TACIT")),
            ("tacit-wordmark", svg(B.wordBox, [Layer(shapes: B.wordmark, arcs: white, dot: mint)], title: "tacit")),
            ("tacit-wordmark-on-light", svg(B.wordBox, [Layer(shapes: B.wordmark, arcs: ink, dot: teal)], title: "tacit")),
            ("tacit-wordmark-mono-white", svg(B.wordBox, [Layer(shapes: B.wordmark, arcs: white, dot: white)], title: "tacit")),
            ("tacit-wordmark-mono-black", svg(B.wordBox, [Layer(shapes: B.wordmark, arcs: "#000000", dot: "#000000")], title: "tacit")),
            ("tacit-lockup", svg(B.lockupBox, [Layer(shapes: B.mark(), arcs: white, dot: mint), Layer(shapes: B.wordmark, arcs: white, dot: mint, transform: B.lockupWordTransform)], title: "TACIT")),
            ("tacit-lockup-on-light", svg(B.lockupBox, [Layer(shapes: B.mark(), arcs: ink, dot: teal), Layer(shapes: B.wordmark, arcs: ink, dot: teal, transform: B.lockupWordTransform)], title: "TACIT")),
            ("tacit-favicon", svg(markBox, [Layer(shapes: B.mark(stroke: 2.5, dot: 2.7), arcs: white, dot: mint)], background: ink, title: "TACIT")),
        ]
        for (name, text) in files { try text.write(toFile: "\(dir)/\(name).svg", atomically: true, encoding: .utf8) }
    }

    // MARK: PNG
    private static func png<V: View>(_ view: V, _ size: CGSize, _ path: String) throws {
        let r = ImageRenderer(content: view.frame(width: size.width, height: size.height))
        r.scale = 1
        r.isOpaque = false
        guard let image = r.cgImage else { throw CocoaError(.fileWriteUnknown) }
        let rep = NSBitmapImageRep(cgImage: image)
        let jpeg = path.hasSuffix(".jpg") // opaque gradients compress ~20× better as high-quality JPEG
        guard let data = rep.representation(using: jpeg ? .jpeg : .png, properties: jpeg ? [.compressionFactor: 0.95] : [:]) else { throw CocoaError(.fileWriteUnknown) }
        try data.write(to: URL(fileURLWithPath: path))
    }

    private static func mark(_ arcs: Color, _ dot: Color, stroke: CGFloat = TacitBrand.stroke, dotR: CGFloat = TacitBrand.dotRadius) -> some View {
        BrandArtwork(shapes: TacitBrand.mark(stroke: stroke, dot: dotR), box: CGRect(x: 0, y: 0, width: 24, height: 24), arcs: arcs, dot: dot)
    }

    private static func writePNGs(_ dir: String) throws {
        let B = TacitBrand.self
        for s in [1024, 512, 256, 128, 64, 32, 16] {
            try png(mark(.white, B.mint.color), .init(width: s, height: s), "\(dir)/tacit-mark-\(s).png")
        }
        try png(mark(B.ink.color, B.teal.color), .init(width: 1024, height: 1024), "\(dir)/tacit-mark-on-light-1024.png")
        try png(mark(.white, .white, stroke: 2.8, dotR: 2.9).background(.black), .init(width: 1024, height: 1024), "\(dir)/tacit-mark-high-contrast-1024.png")
        let wordSize = CGSize(width: 2400, height: 2400 * B.wordBox.height / B.wordBox.width)
        try png(BrandArtwork(shapes: B.wordmark, box: B.wordBox, arcs: .white, dot: B.mint.color), wordSize, "\(dir)/tacit-wordmark-2400.png")
        try png(BrandArtwork(shapes: B.wordmark, box: B.wordBox, arcs: B.ink.color, dot: B.teal.color), wordSize, "\(dir)/tacit-wordmark-on-light-2400.png")
        let lockSize = CGSize(width: 3200, height: 3200 * B.lockupBox.height / B.lockupBox.width)
        try png(Lockup(arcs: .white, dot: B.mint.color), lockSize, "\(dir)/tacit-lockup-3200.png")
        try png(Lockup(arcs: B.ink.color, dot: B.teal.color), lockSize, "\(dir)/tacit-lockup-on-light-3200.png")
        try png(TitleCard(), .init(width: 3840, height: 2160), "\(dir)/tacit-title-card-3840x2160.jpg")
        try png(TitleCard(), .init(width: 1920, height: 1080), "\(dir)/tacit-title-card-1920x1080.jpg")
        try png(AppIcon(), .init(width: 1024, height: 1024), "\(dir)/tacit-app-icon-1024.png")
        for (s, names) in [(16, ["16x16"]), (32, ["16x16@2x", "32x32"]), (64, ["32x32@2x"]), (128, ["128x128"]), (256, ["128x128@2x", "256x256"]), (512, ["256x256@2x", "512x512"]), (1024, ["512x512@2x"])] {
            for n in names { try png(AppIcon(), .init(width: s, height: s), "\(dir)/AppIcon.iconset/icon_\(n).png") }
        }
        for s in [32, 16] {
            try png(mark(.white, B.mint.color, stroke: 2.5, dotR: 2.7).background(B.ink.color, in: RoundedRectangle(cornerRadius: CGFloat(s) * 0.22)), .init(width: s, height: s), "\(dir)/tacit-favicon-\(s).png")
        }
        // Living states as still frames (Reduce Motion poses are the canonical stills).
        for mode in LivingMark.Mode.allCases {
            let f = LivingMark.frame(mode, t: 0, reduceMotion: true)
            try png(MarkStill(frame: f).padding(160).background(B.ink.color), .init(width: 1024, height: 1024), "\(dir)/states/\(mode.rawValue).png")
        }
        let rt = LivingMark.frame(.speaking, realtime: true, t: 0, reduceMotion: true)
        try png(MarkStill(frame: rt).padding(160).background(B.ink.color), .init(width: 1024, height: 1024), "\(dir)/states/speaking-realtime.png")
    }

    // MARK: motion frames (30 fps)
    private static func writeFrames(_ dir: String) throws {
        let fps = 30.0
        for i in 0..<Int(4.5 * fps) {
            try png(Reveal(t: Double(i) / fps), .init(width: 1920, height: 1080), String(format: "%@/reveal/%04d.png", dir, i))
        }
        for i in 0..<Int(2.6 * fps) { // two full wave cycles; loops seamlessly
            let f = LivingMark.frame(.speaking, t: Double(i) / fps)
            try png(MarkStill(frame: f).padding(96).background(TacitBrand.ink.color), .init(width: 720, height: 720), String(format: "%@/speaking-loop/%04d.png", dir, i))
        }
    }
}

private struct MarkStill: View {
    var frame: LivingMark.Frame
    var trim: CGFloat = 1
    var body: some View { Canvas { ctx, size in LivingMark.draw(frame, in: ctx, size: size) } }
}

private struct Lockup: View {
    var arcs: Color, dot: Color
    var wordOpacity: Double = 1
    var body: some View {
        Canvas { ctx, size in
            let B = TacitBrand.self, box = B.lockupBox
            let k = min(size.width / box.width, size.height / box.height)
            let t = CGAffineTransform(translationX: (size.width - box.width * k) / 2, y: (size.height - box.height * k) / 2).scaledBy(x: k, y: k).translatedBy(x: -box.minX, y: -box.minY)
            func draw(_ shapes: [BrandShape], _ m: CGAffineTransform, scale: CGFloat, opacity: Double) {
                for s in shapes {
                    let color = (s.role == .dot ? dot : arcs).opacity(opacity)
                    switch s.paint {
                    case .fill: ctx.fill(s.path(m), with: .color(color))
                    case .stroke(let w): ctx.stroke(s.path(m), with: .color(color), style: StrokeStyle(lineWidth: w * k * scale, lineCap: .round, lineJoin: .round))
                    }
                }
            }
            draw(B.mark(), t, scale: 1, opacity: 1)
            draw(B.wordmark, B.lockupWordTransform.concatenating(t), scale: 0.9, opacity: wordOpacity)
        }
    }
}

private struct TitleCard: View {
    var body: some View {
        GeometryReader { g in
            ZStack {
                RadialGradient(colors: [TacitBrand.graphite.color, TacitBrand.ink.color], center: .init(x: 0.5, y: 0.42), startRadius: 0, endRadius: g.size.width * 0.6)
                VStack(spacing: g.size.height * 0.05) {
                    Lockup(arcs: .white, dot: TacitBrand.mint.color).frame(width: g.size.width * 0.34, height: g.size.width * 0.34 * TacitBrand.lockupBox.height / TacitBrand.lockupBox.width)
                    Text("Your voice. Beyond speech.").font(.system(size: g.size.height * 0.034, weight: .medium)).tracking(g.size.height * 0.001)
                        .foregroundStyle(.white.opacity(0.72))
                }
            }
        }
    }
}

private struct AppIcon: View {
    var body: some View {
        GeometryReader { g in
            let s = g.size.width, body = s * 0.805
            ZStack {
                RoundedRectangle(cornerRadius: body * 0.225, style: .continuous)
                    .fill(LinearGradient(colors: [Color(red: 0.13, green: 0.18, blue: 0.165), TacitBrand.ink.color], startPoint: .top, endPoint: .bottom))
                    .overlay(RoundedRectangle(cornerRadius: body * 0.225, style: .continuous).strokeBorder(.white.opacity(0.09), lineWidth: max(1, s * 0.002)))
                    .frame(width: body, height: body)
                    .shadow(color: .black.opacity(0.35), radius: s * 0.02, y: s * 0.012)
                RadialGradient(colors: [TacitBrand.mint.color.opacity(0.22), .clear], center: .center, startRadius: 0, endRadius: body * 0.32)
                    .frame(width: body, height: body)
                BrandArtwork(shapes: TacitBrand.mark(stroke: s < 64 ? 2.6 : 2.2, dot: s < 64 ? 2.8 : 2.45), box: CGRect(x: 0, y: 0, width: 24, height: 24), arcs: .white, dot: TacitBrand.mint.color)
                    .frame(width: body * 0.74, height: body * 0.74)
            }.frame(width: s, height: s)
        }
    }
}

/// Logo reveal (4.5 s): the lips draw outward from the centre, part as if forming a word, the voice dot appears,
/// two voice arcs leave through the right gap, then the wordmark arrives. Brand motion only — not app footage.
private struct Reveal: View {
    var t: Double
    var body: some View {
        GeometryReader { g in
            let ease = { (x: Double) in x <= 0 ? 0 : x >= 1 ? 1 : 1 - pow(1 - x, 3) }
            let draw = ease(t / 0.7), part = sin(.pi * min(max((t - 0.75) / 0.9, 0), 1)) // open then close
            let dotIn = ease((t - 1.0) / 0.35), slide = ease((t - 2.55) / 0.7), word = ease((t - 2.85) / 0.6)
            let B = TacitBrand.self
            let unit = g.size.height * 0.36 / 24 // mark size while alone
            let lockW = g.size.width * 0.42, lockK = lockW / B.lockupBox.width
            // Mark centre travels from screen centre to its lockup position.
            let lockOrigin = CGPoint(x: (g.size.width - lockW) / 2 - B.lockupBox.minX * lockK, y: g.size.height / 2 - (B.lockupBox.minY + B.lockupBox.height / 2) * lockK)
            let k = unit + (lockK - unit) * slide
            let centre = CGPoint(x: g.size.width / 2 + ((lockOrigin.x + 12 * lockK) - g.size.width / 2) * slide,
                                 y: g.size.height / 2 + ((lockOrigin.y + 12 * lockK) - g.size.height / 2) * slide)
            Canvas { ctx, _ in
                let m = CGAffineTransform(translationX: centre.x - 12 * k, y: centre.y - 12 * k).scaledBy(x: k, y: k)
                let style = StrokeStyle(lineWidth: B.stroke * k, lineCap: .round)
                for s in B.mark(separation: 2.6 * part) where s.role == .arcs {
                    ctx.stroke(s.path(m).trimmedPath(from: 0.5 - 0.5 * draw, to: 0.5 + 0.5 * draw), with: .color(.white), style: style)
                }
                let r = B.dotRadius * (0.4 + 0.6 * dotIn) * (1 + 0.12 * part)
                ctx.fill(Path(ellipseIn: CGRect(x: 12 - r, y: 12 - r, width: 2 * r, height: 2 * r)).applying(m), with: .color(B.mint.color.opacity(dotIn)))
                for i in 0..<2 { // two voice arcs, 1.55 s → 2.55 s
                    let p = (t - 1.55 - Double(i) * 0.3) / 0.75
                    guard p > 0, p < 1 else { continue }
                    let arc = BrandShape(commands: [.arc(center: B.center, radius: B.ringRadius + 2.1 + CGFloat(p) * 2.6, start: -26, sweep: 52)], paint: .stroke(1.6), role: .dot)
                    ctx.stroke(arc.path(m), with: .color(B.mint.color.opacity(sin(.pi * p))), style: StrokeStyle(lineWidth: 1.6 * k, lineCap: .round))
                }
                if word > 0 {
                    let wm = B.lockupWordTransform.concatenating(CGAffineTransform(translationX: lockOrigin.x, y: lockOrigin.y).scaledBy(x: lockK, y: lockK))
                        .concatenating(CGAffineTransform(translationX: (1 - word) * -g.size.width * 0.02, y: 0))
                    for s in B.wordmark {
                        let color = (s.role == .dot ? B.mint.color : .white).opacity(word)
                        switch s.paint {
                        case .fill: ctx.fill(s.path(wm), with: .color(color))
                        case .stroke(let w): ctx.stroke(s.path(wm), with: .color(color), style: StrokeStyle(lineWidth: w * 0.9 * lockK, lineCap: .round, lineJoin: .round))
                        }
                    }
                }
            }
            .background(RadialGradient(colors: [B.graphite.color, B.ink.color], center: .init(x: 0.5, y: 0.45), startRadius: 0, endRadius: g.size.width * 0.6))
        }
    }
}
