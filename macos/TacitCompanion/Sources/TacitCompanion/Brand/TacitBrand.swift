import SwiftUI

/// TACIT identity — the single geometric source for the in-app mark, the wordmark and every exported SVG/PNG.
/// Mark ("Living Signal"): two arcs (the lips) around one dot (the voice) on a 24-unit grid. The gaps sit at the
/// mouth corners. The arcs part when the camera sees lips moving; voice arcs leave through the right-hand gap.
enum TacitBrand {
    struct Swatch: Equatable {
        let hex: UInt32
        var css: String { String(format: "#%06X", hex) }
        var color: Color { Color(red: Double(hex >> 16 & 0xFF) / 255, green: Double(hex >> 8 & 0xFF) / 255, blue: Double(hex & 0xFF) / 255) }
    }
    static let ink = Swatch(hex: 0x0A0D0C)      // notch black, slightly green
    static let graphite = Swatch(hex: 0x16201D) // raised dark surface / icon gradient
    static let paper = Swatch(hex: 0xF4F7F6)
    static let mint = Swatch(hex: 0x62E3C4)     // signal on dark (12.4:1 on ink, 13.3:1 on black)
    static let teal = Swatch(hex: 0x0B7D6B)     // signal on light (4.7:1 on paper, 5.05:1 on white)
    static let amber = Swatch(hex: 0xFFB547)    // real-time / paused / attention (11.1:1 on ink)

    // MARK: mark grid (24 × 24 units)
    static let center = CGPoint(x: 12, y: 12)
    static let ringRadius: CGFloat = 7.25
    static let stroke: CGFloat = 2.2
    static let gapHalfAngle: Double = 24
    static let dotRadius: CGFloat = 2.45

    // MARK: wordmark grid (custom monoline lowercase, 54.64 × 19 units, x-height 12)
    static let wordStroke: CGFloat = 2.8
    static let wordBox = CGRect(x: 0, y: 2.4, width: 54.64, height: 19)
}

/// A small, renderer-neutral path description: becomes a SwiftUI `Path` for drawing and an SVG `d` string for export,
/// so the two can never drift. Angles are degrees in y-down space; a positive sweep runs clockwise on screen.
struct BrandShape: Equatable {
    enum Command: Equatable {
        case move(CGPoint), line(CGPoint), quad(to: CGPoint, control: CGPoint)
        case arc(center: CGPoint, radius: CGFloat, start: Double, sweep: Double)
        case close
    }
    enum Paint: Equatable { case stroke(CGFloat), fill }
    enum Role: Equatable { case arcs, dot }
    var commands: [Command]
    var paint: Paint
    var role: Role

    static func circle(_ c: CGPoint, _ r: CGFloat, role: Role = .dot) -> Self {
        .init(commands: [.arc(center: c, radius: r, start: 0, sweep: 180), .arc(center: c, radius: r, start: 180, sweep: 180), .close], paint: .fill, role: role)
    }
    static func point(_ c: CGPoint, _ r: CGFloat, _ degrees: Double) -> CGPoint {
        CGPoint(x: c.x + r * cos(degrees * .pi / 180), y: c.y + r * sin(degrees * .pi / 180))
    }

    func path(_ t: CGAffineTransform = .identity) -> Path {
        var p = Path()
        var open = false
        for command in commands {
            switch command {
            case .move(let q): p.move(to: q.applying(t)); open = true
            case .line(let q): p.addLine(to: q.applying(t))
            case .quad(let q, let c): p.addQuadCurve(to: q.applying(t), control: c.applying(t))
            case .arc(let c, let r, let start, let sweep):
                // Sample the arc so any affine transform (incl. non-uniform) stays exact enough at export sizes.
                let steps = max(8, Int(abs(sweep) / 3))
                for i in 0...steps {
                    let q = Self.point(c, r, start + sweep * Double(i) / Double(steps)).applying(t)
                    if i == 0 && !open { p.move(to: q); open = true } else { p.addLine(to: q) }
                }
            case .close: p.closeSubpath(); open = false
            }
        }
        return p
    }

    var svg: String {
        func f(_ v: CGFloat) -> String { String(format: "%.3f", Double(v)).replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression) }
        var d: [String] = []
        var open = false
        for command in commands {
            switch command {
            case .move(let q): d.append("M\(f(q.x)) \(f(q.y))"); open = true
            case .line(let q): d.append("L\(f(q.x)) \(f(q.y))")
            case .quad(let q, let c): d.append("Q\(f(c.x)) \(f(c.y)) \(f(q.x)) \(f(q.y))")
            case .arc(let c, let r, let start, let sweep):
                let a = Self.point(c, r, start), b = Self.point(c, r, start + sweep)
                if !open { d.append("M\(f(a.x)) \(f(a.y))"); open = true }
                d.append("A\(f(r)) \(f(r)) 0 \(abs(sweep) > 180 ? 1 : 0) \(sweep > 0 ? 1 : 0) \(f(b.x)) \(f(b.y))")
            case .close: d.append("Z"); open = false
            }
        }
        return d.joined(separator: " ")
    }
}

extension TacitBrand {
    /// Static mark. `separation` parts the lips (units), `rotation` turns both arcs (degrees).
    static func mark(separation: CGFloat = 0, rotation: Double = 0, stroke: CGFloat = stroke, dot: CGFloat = dotRadius) -> [BrandShape] {
        let up = CGPoint(x: center.x, y: center.y - separation / 2), down = CGPoint(x: center.x, y: center.y + separation / 2)
        return [
            .init(commands: [.arc(center: up, radius: ringRadius, start: 180 + gapHalfAngle + rotation, sweep: 180 - 2 * gapHalfAngle)], paint: .stroke(stroke), role: .arcs),
            .init(commands: [.arc(center: down, radius: ringRadius, start: gapHalfAngle + rotation, sweep: 180 - 2 * gapHalfAngle)], paint: .stroke(stroke), role: .arcs),
            .circle(center, dot),
        ]
    }

    /// "tacit" — monoline geometric lowercase. The open `c` repeats the mark's mouth gap; the `i` dot is the voice dot.
    static var wordmark: [BrandShape] {
        let w = BrandShape.Paint.stroke(wordStroke)
        func t(_ x: CGFloat) -> [BrandShape] {
            [.init(commands: [.move(.init(x: x, y: 4.6)), .line(.init(x: x, y: 16.4)), .quad(to: .init(x: x + 3, y: 20), control: .init(x: x, y: 20))], paint: w, role: .arcs),
             .init(commands: [.move(.init(x: x - 2.2, y: 8)), .line(.init(x: x + 3, y: 8))], paint: w, role: .arcs)]
        }
        let a = CGPoint(x: 17.6, y: 14), c = CGPoint(x: 34.6, y: 14), i: CGFloat = 43.44
        return t(3.6) + [
            .init(commands: [.arc(center: a, radius: 6, start: 0, sweep: 180), .arc(center: a, radius: 6, start: 180, sweep: 180)], paint: w, role: .arcs),
            .init(commands: [.move(.init(x: a.x + 6, y: 8)), .line(.init(x: a.x + 6, y: 20))], paint: w, role: .arcs),
            .init(commands: [.arc(center: c, radius: 6, start: 45, sweep: 270)], paint: w, role: .arcs),
            .init(commands: [.move(.init(x: i, y: 8)), .line(.init(x: i, y: 20))], paint: w, role: .arcs),
            .circle(.init(x: i, y: 4.0), 1.6),
        ] + t(50.24)
    }

    /// Horizontal lockup: mark, then the wordmark at 0.9 scale with its x-height centred on the ring.
    static let lockupWordTransform = CGAffineTransform(translationX: 24.35, y: 12).scaledBy(x: 0.9, y: 0.9).translatedBy(x: 0, y: -14)
    static let lockupBox = CGRect(x: 3.65, y: 1.56, width: 69.88, height: 18.79)
}

/// Draws brand shapes scaled to fit, preserving aspect ratio. Used in the app and by the asset exporter.
struct BrandArtwork: View {
    var shapes: [BrandShape]
    var box: CGRect
    var arcs: Color
    var dot: Color
    var strokeScale: CGFloat = 1
    var body: some View {
        Canvas { ctx, size in
            let k = min(size.width / box.width, size.height / box.height)
            let t = CGAffineTransform(translationX: (size.width - box.width * k) / 2, y: (size.height - box.height * k) / 2)
                .scaledBy(x: k, y: k).translatedBy(x: -box.minX, y: -box.minY)
            for s in shapes {
                let color = s.role == .dot ? dot : arcs
                switch s.paint {
                case .fill: ctx.fill(s.path(t), with: .color(color))
                case .stroke(let w): ctx.stroke(s.path(t), with: .color(color), style: StrokeStyle(lineWidth: w * k * strokeScale, lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}

/// The custom wordmark as a view (`TEST` stays a text label in offline fixtures so they cannot pass as the app).
struct TacitWordmark: View {
    var color: Color = .white
    var dot: Color = TacitBrand.mint.color
    var height: CGFloat = 10.5
    var body: some View {
        BrandArtwork(shapes: TacitBrand.wordmark, box: TacitBrand.wordBox, arcs: color, dot: dot)
            .frame(width: height * TacitBrand.wordBox.width / TacitBrand.wordBox.height, height: height)
            .accessibilityHidden(true)
    }
}

private struct BrandedByCrownKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// True inside the notch, whose crown already carries the wordmark (avoids "tacit" twice in the workspace).
    var brandedByCrown: Bool {
        get { self[BrandedByCrownKey.self] }
        set { self[BrandedByCrownKey.self] = newValue }
    }
}
