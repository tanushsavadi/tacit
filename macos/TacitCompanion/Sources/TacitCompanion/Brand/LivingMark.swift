import SwiftUI

/// The animated TACIT mark. Presentation only: every mode comes from a state the app already knows (connection,
/// native camera phase, recognition in flight, a current review, server-reported speech delivery). Nothing here
/// authorizes, delays or synthesizes activity. There is no amplitude data in the companion, so speaking motion is a
/// state loop, never a level meter; lips "part" only while the native endpointer reports lip motion (`.capturing`).
enum LivingMark {
    enum Mode: String, CaseIterable { case connecting, idle, live, articulating, processing, review, preparing, speaking, paused, attention }
    enum Core: Equatable { case dot, hollow, pause, alert }
    struct RGBA: Equatable {
        var r, g, b, a: Double
        init(_ s: TacitBrand.Swatch, _ a: Double = 1) { r = Double(s.hex >> 16 & 0xFF) / 255; g = Double(s.hex >> 8 & 0xFF) / 255; b = Double(s.hex & 0xFF) / 255; self.a = a }
        init(white: Double, _ a: Double) { r = white; g = white; b = white; self.a = a }
        var color: Color { Color(red: r, green: g, blue: b, opacity: a) }
        static func mix(_ x: Self, _ y: Self, _ p: Double) -> Self {
            var o = x; o.r += (y.r - x.r) * p; o.g += (y.g - x.g) * p; o.b += (y.b - x.b) * p; o.a += (y.a - x.a) * p; return o
        }
    }
    struct Ring: Equatable { var radius: CGFloat; var opacity: Double }
    struct Layer: Equatable { var core: Core; var opacity: Double }
    /// One rendered frame in the 24-unit mark grid.
    struct Frame: Equatable {
        var separation: CGFloat = 0
        var rotation: Double = 0
        var dotScale: CGFloat = 1
        var cores: [Layer] = [.init(core: .dot, opacity: 1)]
        var arcs = RGBA(white: 1, 0.8)
        var dot = RGBA(TacitBrand.mint)
        var stroke: CGFloat = TacitBrand.stroke
        var voice: [Ring] = []
        var halo: Ring?

        static func mix(_ a: Self, _ b: Self, _ p: Double) -> Self {
            func lerp(_ x: CGFloat, _ y: CGFloat) -> CGFloat { x + (y - x) * CGFloat(p) }
            // Arcs are symmetric under a half turn: blend rotation along the shortest path.
            var from = a.rotation.truncatingRemainder(dividingBy: 180); if from > 90 { from -= 180 }; if from < -90 { from += 180 }
            var o = b
            o.separation = lerp(a.separation, b.separation); o.rotation = from + (b.rotation - from) * p
            o.dotScale = lerp(a.dotScale, b.dotScale); o.stroke = lerp(a.stroke, b.stroke)
            o.arcs = .mix(a.arcs, b.arcs, p); o.dot = .mix(a.dot, b.dot, p)
            o.cores = a.cores == b.cores ? b.cores : a.cores.map { .init(core: $0.core, opacity: $0.opacity * (1 - p)) } + b.cores.map { .init(core: $0.core, opacity: $0.opacity * p) }
            o.voice = a.voice.map { .init(radius: $0.radius, opacity: $0.opacity * (1 - p)) } + b.voice.map { .init(radius: $0.radius, opacity: $0.opacity * p) }
            if let h = b.halo { o.halo = .init(radius: h.radius, opacity: h.opacity * p) } else if let h = a.halo { o.halo = .init(radius: h.radius, opacity: h.opacity * (1 - p)) }
            return o
        }
    }

    static func mode(_ kind: LivingNotchPresentation.Kind, connecting: Bool = false, capturing: Bool = false) -> Mode {
        if connecting { return .connecting }
        switch kind {
        case .ready: return .idle
        case .live: return capturing ? .articulating : .live
        case .processing: return .processing
        case .review: return .review
        case .preparing: return .preparing
        case .speaking: return .speaking
        case .paused: return .paused
        case .attention: return .attention
        }
    }

    /// Only these modes loop, and only while Reduce Motion is off. Everything else renders one still frame (after a 0.32 s blend).
    static func tick(_ mode: Mode) -> Double? {
        // Measured: each tick costs a few ms of main-thread hosting work whatever the rate, so loops are reserved for
        // short, event-bounded states. Camera-on and lips-moving are still poses that change only when the state does.
        switch mode {
        case .processing, .speaking: return 1.0 / 30
        default: return nil
        }
    }
    static let blend = 0.32
    static func settle(_ mode: Mode) -> Double { mode == .review ? 0.9 : blend + 0.05 }
    static let voiceHalfAngle: Double = 26
    static let voiceStroke: CGFloat = 1.6

    static func frame(_ mode: Mode, realtime: Bool = false, t: Double, sinceChange: Double = .infinity,
                      reduceMotion: Bool = false, highContrast: Bool = false) -> Frame {
        let motion = !reduceMotion
        let signal = realtime ? RGBA(TacitBrand.amber) : RGBA(TacitBrand.mint)
        var f = Frame()
        f.arcs = RGBA(white: 1, highContrast ? 1 : 0.8)
        f.stroke = TacitBrand.stroke * (highContrast ? 1.15 : 1)
        func lit() { f.arcs = signal; f.dot = signal }
        let R = TacitBrand.ringRadius
        switch mode {
        case .connecting:
            f.cores = [.init(core: .hollow, opacity: 1)]; f.arcs = RGBA(white: 1, highContrast ? 0.8 : 0.42); f.dot = RGBA(white: 1, highContrast ? 1 : 0.7)
        case .idle:
            break // the logo at rest: white lips, mint voice dot
        case .live:
            lit(); f.separation = 0.9
        case .articulating: // lips part while the endpointer reports lip motion; they close again when it stops
            lit(); f.separation = 2.2; f.dotScale = 1.08
        case .processing:
            lit(); f.dotScale = 0.85
            f.rotation = motion ? (t * 200).truncatingRemainder(dividingBy: 180) : 90
        case .review:
            lit(); f.dotScale = 1.3
            f.halo = .init(radius: 10.3, opacity: highContrast ? 0.7 : 0.38)
            if motion, sinceChange < 0.8 { // one contained pulse when words arrive, then still
                let p = sinceChange / 0.8
                f.halo = .init(radius: 8.6 + CGFloat(p) * 1.7, opacity: (highContrast ? 0.7 : 0.38) + 0.5 * (1 - p))
            }
        case .preparing:
            lit(); f.voice = [.init(radius: R + 2.3, opacity: 0.45)]
        case .speaking:
            lit(); f.separation = 0.6
            if motion {
                f.voice = (0..<2).map { i in
                    let p = (t / 1.3 + Double(i) / 2).truncatingRemainder(dividingBy: 1)
                    return Ring(radius: R + 2.1 + CGFloat(p) * 1.8, opacity: sin(.pi * p) * 0.95)
                }
            } else { f.voice = [.init(radius: R + 2.1, opacity: 1), .init(radius: R + 3.7, opacity: 0.5)] }
        case .paused:
            f.cores = [.init(core: .pause, opacity: 1)]; f.arcs = RGBA(white: 1, highContrast ? 0.8 : 0.45); f.dot = RGBA(TacitBrand.amber)
        case .attention:
            f.cores = [.init(core: .alert, opacity: 1)]; f.arcs = RGBA(TacitBrand.amber); f.dot = RGBA(TacitBrand.amber)
        }
        return f
    }

    /// Spoken once per change for VoiceOver users. Frequent camera/processing flips are deliberately silent.
    static func announcement(from old: Mode?, to new: Mode, title: String) -> String? {
        guard old != new else { return nil }
        switch new {
        case .review: return "Words ready to review. Only Speak sends them."
        case .speaking: return "Speaking your words. Stop is available."
        case .paused: return "Paused. Nothing will be spoken."
        case .attention: return "TACIT needs attention: \(title)."
        default: return nil
        }
    }

    static func draw(_ f: Frame, in ctx: GraphicsContext, size: CGSize) {
        let k = min(size.width, size.height) / 24
        let t = CGAffineTransform(translationX: (size.width - 24 * k) / 2, y: (size.height - 24 * k) / 2).scaledBy(x: k, y: k)
        let c = TacitBrand.center
        let round = { (w: CGFloat) in StrokeStyle(lineWidth: w * k, lineCap: .round, lineJoin: .round) }
        for s in TacitBrand.mark(separation: f.separation, rotation: f.rotation, stroke: f.stroke) where s.role == .arcs {
            ctx.stroke(s.path(t), with: .color(f.arcs.color), style: round(f.stroke))
        }
        if let h = f.halo, h.opacity > 0.01 {
            ctx.stroke(Path(ellipseIn: CGRect(x: c.x - h.radius, y: c.y - h.radius, width: 2 * h.radius, height: 2 * h.radius)).applying(t),
                       with: .color(f.dot.color.opacity(h.opacity)), style: round(1))
        }
        for v in f.voice where v.opacity > 0.01 {
            let arc = BrandShape(commands: [.arc(center: c, radius: v.radius, start: -voiceHalfAngle, sweep: 2 * voiceHalfAngle)], paint: .stroke(voiceStroke), role: .dot)
            ctx.stroke(arc.path(t), with: .color(f.dot.color.opacity(v.opacity)), style: round(voiceStroke))
        }
        for layer in f.cores where layer.opacity > 0.01 {
            let color = f.dot.color.opacity(layer.opacity)
            switch layer.core {
            case .dot:
                let r = TacitBrand.dotRadius * f.dotScale
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)).applying(t), with: .color(color))
            case .hollow:
                ctx.stroke(Path(ellipseIn: CGRect(x: c.x - 2.1, y: c.y - 2.1, width: 4.2, height: 4.2)).applying(t), with: .color(color), style: round(1.2))
            case .pause:
                for x in [c.x - 2.05, c.x + 0.65] {
                    ctx.fill(Path(roundedRect: CGRect(x: x, y: c.y - 2.6, width: 1.4, height: 5.2), cornerRadius: 0.7).applying(t), with: .color(color))
                }
            case .alert:
                ctx.fill(Path(roundedRect: CGRect(x: c.x - 0.85, y: c.y - 3.8, width: 1.7, height: 4.6), cornerRadius: 0.85).applying(t), with: .color(color))
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - 1.05, y: c.y + 2.1, width: 2.1, height: 2.1)).applying(t), with: .color(color))
            }
        }
    }
}

struct LivingMarkView: View {
    var mode: LivingMark.Mode
    var realtime = false
    var size: CGFloat = 16
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.colorSchemeContrast) private var contrast
    @State private var from: LivingMark.Frame?
    @State private var changedAt = Date.distantPast
    @State private var settling = false
    private var reduceMotion: Bool { systemReduceMotion || CompanionAccessibility.reducedMotionPreview }
    private var key: String { mode.rawValue + (realtime ? "-rt" : "") }

    /// A paused TimelineView can hand back a stale date, so elapsed time only counts while a transition settles.
    private func canvas(at date: Date) -> some View {
        Canvas { ctx, canvas in
            var f = frame(mode, realtime, at: date)
            let since = max(0, date.timeIntervalSince(changedAt))
            if let from, settling, !reduceMotion, since < LivingMark.blend {
                let p = since / LivingMark.blend
                f = .mix(from, f, 1 - pow(1 - p, 3)) // ease-out cubic
            }
            LivingMark.draw(f, in: ctx, size: canvas)
        }
    }

    private func frame(_ mode: LivingMark.Mode, _ realtime: Bool, at date: Date) -> LivingMark.Frame {
        LivingMark.frame(mode, realtime: realtime, t: date.timeIntervalSinceReferenceDate,
                         sinceChange: settling ? max(0, date.timeIntervalSince(changedAt)) : .infinity,
                         reduceMotion: reduceMotion, highContrast: contrast == .increased || CompanionAccessibility.highContrastPreview)
    }

    var body: some View {
        let loops = !reduceMotion && LivingMark.tick(mode) != nil
        Group {
            // A periodic schedule wakes only at the requested rate (`.animation(minimumInterval:)` measured ~5 % CPU at
            // any rate). Still states render one Canvas with no timeline at all.
            if loops || settling {
                TimelineView(.periodic(from: .now, by: settling && !loops ? 1.0 / 30 : LivingMark.tick(mode) ?? 1.0 / 30)) { timeline in
                    canvas(at: timeline.date)
                }
            } else {
                canvas(at: Date())
            }
        }
        .frame(width: size, height: size)
        .onChange(of: key) { old, _ in
            let now = Date()
            let oldMode = LivingMark.Mode(rawValue: old.replacingOccurrences(of: "-rt", with: "")) ?? mode
            from = frame(oldMode, old.hasSuffix("-rt"), at: now)
            changedAt = now
            settling = !reduceMotion
        }
        .task(id: changedAt) {
            guard settling else { return }
            try? await Task.sleep(nanoseconds: UInt64(LivingMark.settle(mode) * 1_000_000_000))
            settling = false
        }
        .accessibilityHidden(true) // the status control next to it carries the spoken state
    }
}
