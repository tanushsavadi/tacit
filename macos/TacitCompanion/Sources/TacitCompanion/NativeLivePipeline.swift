import CoreGraphics
import CoreImage
import Foundation
import Vision

// Native silent-speech capture: the same job as the browser workspace (web/src/silent/*), done in the TACIT app.
// Camera frames → Apple Vision lip landmarks → experimental motion endpointing → bounded JPEG window → the existing
// `visual_utterance` protocol (tacit-live-v1). It detects windows worth decoding, never words or speech intent; the
// recognizer and every speech rule stay on the server. Nothing here can speak.

/// Per-frame lip geometry from Vision landmarks (ratios, so camera distance mostly cancels out).
struct LipFeatures: Equatable {
    var t: Double
    var tracked: Bool
    var faceCount: Int
    /// Outer-lip height / inter-ocular distance (jaw opening proxy).
    var jaw: Double = 0
    /// Inner-lip height / mouth width (same definition as the browser's landmark 13–14 / 61–291 ratio).
    var mouthAspect: Double = 0
    /// Mouth width / inter-ocular distance (rounding / spreading).
    var width: Double = 0
    var yaw: Double = 0
    var pitch: Double = 0
    static func untracked(_ t: Double, faces: Int = 0) -> Self { .init(t: t, tracked: false, faceCount: faces) }
}

enum LipGeometry {
    /// Faces smaller than this fraction of the image height are ignored (posters, people far behind the user).
    static let minFaceHeight: CGFloat = 0.12

    static func features(_ faces: [VNFaceObservation], imageSize: CGSize, t: Double) -> LipFeatures {
        let near = faces.filter { $0.boundingBox.height >= minFaceHeight }
        guard near.count == 1, let lm = near[0].landmarks, let outer = lm.outerLips, let inner = lm.innerLips,
              let le = lm.leftEye, let re = lm.rightEye, let nose = lm.nose else { return .untracked(t, faces: near.count) }
        return features(outer: outer.pointsInImage(imageSize: imageSize), inner: inner.pointsInImage(imageSize: imageSize),
                        leftEye: le.pointsInImage(imageSize: imageSize), rightEye: re.pointsInImage(imageSize: imageSize),
                        nose: nose.pointsInImage(imageSize: imageSize), t: t)
    }

    static func features(outer: [CGPoint], inner: [CGPoint], leftEye: [CGPoint], rightEye: [CGPoint], nose: [CGPoint], t: Double) -> LipFeatures {
        guard outer.count >= 4, inner.count >= 3, !leftEye.isEmpty, !rightEye.isEmpty, !nose.isEmpty else { return .untracked(t, faces: 1) }
        func centre(_ p: [CGPoint]) -> CGPoint { CGPoint(x: p.map(\.x).reduce(0, +) / CGFloat(p.count), y: p.map(\.y).reduce(0, +) / CGFloat(p.count)) }
        let l = centre(leftEye), r = centre(rightEye), n = centre(nose)
        let iod = Double(hypot(r.x - l.x, r.y - l.y))
        guard iod > 4 else { return .untracked(t, faces: 1) }
        let width = Double((outer.map(\.x).max() ?? 0) - (outer.map(\.x).min() ?? 0))
        let outerHeight = Double((outer.map(\.y).max() ?? 0) - (outer.map(\.y).min() ?? 0))
        let innerHeight = Double((inner.map(\.y).max() ?? 0) - (inner.map(\.y).min() ?? 0))
        let eye = CGPoint(x: (l.x + r.x) / 2, y: (l.y + r.y) / 2)
        return LipFeatures(t: t, tracked: true, faceCount: 1, jaw: outerHeight / iod, mouthAspect: innerHeight / max(width, 1),
                           width: width / iod, yaw: Double(n.x - eye.x) / iod, pitch: Double(n.y - eye.y) / iod)
    }
}

/// Timing constants are the browser's (web/src/silent/articulation.ts) except quietMs: 640 instead of 480 split 2 of 92
/// recorded silent sentences instead of 6 (a split revokes the first half's review). The velocity scale is
/// Vision-specific, measured on recorded clips with `TacitCompanion --analyze-video` (docs/HANDOFF.md).
struct ArticulationConfig: Equatable {
    var onsetMs = 160.0, quietMs = 640.0, minMs = 320.0, maxMs = 8000.0, maxGapMs = 220.0, preRollMs = 160.0
    var velocityThreshold = 0.40
    var headMotionLimit = 0.12
    static let standard = Self()
}

struct ArticulationWindow: Equatable { var startMs: Double; var endMs: Double; var detectedAtMs: Double; var endpointMs: Double; var trackedFrames: Int }
struct ArticulationUpdate: Equatable {
    enum Phase: String { case idle, moving, capturing, trackingLost }
    enum Drop: String { case trackingLost, multipleFaces, frameGap, tooLong }
    var phase: Phase = .idle
    var velocity = 0.0
    var window: ArticulationWindow?
    var dropped: Drop?
}

/// Swift port of the browser's ArticulationSegmenter (same state machine, same timings).
struct ArticulationSegmenter {
    var config: ArticulationConfig
    private var previous: LipFeatures?
    private var onset: Double?
    private var start: Double?
    private var lastActive = 0.0
    private var frames = 0
    private var smoothed = 0.0
    init(config: ArticulationConfig = .standard) { self.config = config }
    /// Last tracked frame seen (analysis flush only).
    var lastTracked: LipFeatures? { previous }

    mutating func reset() { previous = nil; onset = nil; start = nil; lastActive = 0; frames = 0; smoothed = 0 }

    mutating func update(_ f: LipFeatures) -> ArticulationUpdate {
        var out = ArticulationUpdate()
        guard f.tracked, f.faceCount == 1 else {
            out.dropped = f.faceCount > 1 ? .multipleFaces : .trackingLost; out.phase = .trackingLost; reset(); return out
        }
        let prev = previous
        if let p = prev, f.t <= p.t || f.t - p.t > config.maxGapMs {
            reset(); previous = f; out.dropped = .frameGap; out.phase = .trackingLost; return out
        }
        previous = f
        guard let p = prev else { return out }
        let dt = (f.t - p.t) / 1000
        if abs(f.yaw - p.yaw) + abs(f.pitch - p.pitch) > config.headMotionLimit {
            reset(); previous = f; out.phase = .trackingLost; out.dropped = .trackingLost; return out
        }
        let v = (abs(f.jaw - p.jaw) * 0.45 + abs(f.mouthAspect - p.mouthAspect) * 0.4 + abs(f.width - p.width) * 0.15) / dt
        smoothed = smoothed * 0.4 + v * 0.6
        out.velocity = smoothed
        let active = smoothed >= config.velocityThreshold
        if active {
            if onset == nil { onset = p.t }
            lastActive = f.t
            if start == nil, let o = onset, f.t - o >= config.onsetMs { start = max(0, o - config.preRollMs); frames = 0 }
        } else if start == nil { onset = nil }
        if let s = start {
            frames += 1
            out.phase = .capturing
            if f.t - s >= config.maxMs { reset(); previous = f; out.phase = .idle; out.dropped = .tooLong; return out }
            if f.t - lastActive >= config.quietMs {
                if lastActive - s >= config.minMs && frames >= 5 {
                    out.window = ArticulationWindow(startMs: s, endMs: lastActive, detectedAtMs: f.t, endpointMs: f.t - lastActive, trackedFrames: frames)
                }
                reset(); previous = f; out.phase = .idle
            }
        } else { out.phase = active ? .moving : .idle }
        return out
    }
}

/// Deadline accumulation (browser SampleClock): a 30 fps camera yields ~25 fps samples, not 15.
struct SampleClock {
    let intervalMs: Double
    private var next = -Double.infinity
    init(intervalMs: Double = 40) { self.intervalMs = intervalMs }
    mutating func due(_ t: Double) -> Bool {
        if t + 0.001 < next { return false }
        next = next == -.infinity ? t + intervalMs : next + (floor(max(0, t - next) / intervalMs) + 1) * intervalMs
        return true
    }
}

struct CapturedFrame: Equatable { var t: Double; var jpeg: Data }

/// Bounded RAM only (the server's limits: 300 frames, 12 MiB, 10 s). Cleared on any tracking loss.
struct FrameRing {
    let maxMs = 10_000.0, maxBytes = 12 * 1024 * 1024, maxFrames = 300
    private(set) var frames: [CapturedFrame] = []
    private(set) var bytes = 0
    @discardableResult mutating func push(_ f: CapturedFrame) -> Bool {
        guard f.t.isFinite, !f.jpeg.isEmpty, f.jpeg.count <= maxBytes, f.t > (frames.last?.t ?? -.infinity) else { return false }
        frames.append(f); bytes += f.jpeg.count
        while let first = frames.first, frames.count > maxFrames || bytes > maxBytes || f.t - first.t > maxMs {
            bytes -= first.jpeg.count; frames.removeFirst()
        }
        return true
    }
    func window(_ start: Double, _ end: Double) -> [CapturedFrame] { frames.filter { $0.t >= start && $0.t <= end } }
    mutating func clear() { frames = []; bytes = 0 }
}

/// One endpointed window ready for `visual_utterance` (frame times strictly increasing, ≤ 300 frames, ≤ 10 s).
struct CapturedWindow: Equatable {
    var startMs: Double; var endMs: Double; var endpointMs: Double
    var frames: [CapturedFrame]
    var valid: Bool {
        guard let first = frames.first, let last = frames.last, frames.count <= 300, last.t - first.t <= 10_000 else { return false }
        return zip(frames, frames.dropFirst()).allSatisfy { $0.t < $1.t }
    }
}

/// Everything that happens to one sampled frame. Not thread-safe: owned by the capture queue (or a test/analysis loop).
final class NativeLivePipeline {
    enum Face: Equatable { case none, one, many }
    struct Output { var features: LipFeatures; var update: ArticulationUpdate; var window: CapturedWindow? }

    private(set) var segmenter: ArticulationSegmenter
    private var clock = SampleClock()
    private(set) var ring = FrameRing()
    private let ci = CIContext(options: [.cacheIntermediates: false])
    private let encodeJPEG: Bool
    /// The JPEGs sent upstream are at most this wide (as the browser: ≤ 640 px).
    static let maxJPEGWidth: CGFloat = 640

    init(config: ArticulationConfig = .standard, encodeJPEG: Bool = true) {
        segmenter = ArticulationSegmenter(config: config); self.encodeJPEG = encodeJPEG
    }

    func reset() { segmenter.reset(); ring.clear(); clock = SampleClock() }

    /// `t` is the frame's presentation time in ms on a monotonic clock. Returns nil when this frame is not sampled.
    func process(_ pixels: CVPixelBuffer, t: Double) -> Output? {
        guard clock.due(t) else { return nil }
        let request = VNDetectFaceLandmarksRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
        let size = CGSize(width: CVPixelBufferGetWidth(pixels), height: CVPixelBufferGetHeight(pixels))
        let features: LipFeatures
        do { try handler.perform([request]); features = LipGeometry.features(request.results ?? [], imageSize: size, t: t) }
        catch { features = .untracked(t) }
        if features.tracked, features.faceCount == 1, encodeJPEG, let jpeg = jpeg(pixels, size: size) {
            ring.push(CapturedFrame(t: t, jpeg: jpeg))
        } else if !encodeJPEG, features.tracked {
            ring.push(CapturedFrame(t: t, jpeg: Data([0]))) // analysis mode: timing only
        }
        return observe(features)
    }

    /// Endpointing step, separated from Vision/JPEG so it can be tested with synthetic features.
    func observe(_ features: LipFeatures) -> Output {
        let update = segmenter.update(features)
        if update.dropped != nil { ring.clear() }
        var window: CapturedWindow?
        if let w = update.window {
            let cw = CapturedWindow(startMs: w.startMs, endMs: w.endMs, endpointMs: w.detectedAtMs, frames: ring.window(w.startMs, w.detectedAtMs))
            window = cw.valid ? cw : nil
        }
        return Output(features: features, update: update, window: window)
    }

    func push(_ frame: CapturedFrame) { ring.push(frame) }

    private func jpeg(_ pixels: CVPixelBuffer, size: CGSize) -> Data? {
        var image = CIImage(cvPixelBuffer: pixels)
        let scale = min(1, Self.maxJPEGWidth / max(size.width, 1))
        if scale < 1 { image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) }
        let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        return ci.jpegRepresentation(of: image, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [quality: 0.8])
    }
}
