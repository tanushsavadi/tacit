import AVFoundation
import Foundation

/// `TacitCompanion --analyze-video [--threshold X] [--send] FILE…` runs the native pipeline (Vision + endpointing) over
/// recorded clips and prints the measured motion and windows. With `--send` each detected window is also submitted to the
/// running local server through the same client code path as the camera (Live display-only; nothing is spoken).
/// Evidence tool only: recorded input is labelled as recorded and never presented as live camera capture.
enum VideoAnalysis {
    struct Result { var file: String; var frames: Int; var sampled: Int; var tracked: Int; var fps: Double; var velocities: [Double]; var windows: [CapturedWindow] }

    static func frames(of url: URL, _ body: (CVPixelBuffer, Double) -> Void) throws -> Int {
        let asset = AVURLAsset(url: url)
        let sem = DispatchSemaphore(value: 0)
        var track: AVAssetTrack?
        Task { track = try? await asset.loadTracks(withMediaType: .video).first; sem.signal() }
        sem.wait()
        guard let track else { throw NSError(domain: "TACIT", code: 1, userInfo: [NSLocalizedDescriptionKey: "no video track"]) }
        let reader = try AVAssetReader(asset: asset)
        let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        reader.add(out); reader.startReading()
        var n = 0
        while let sample = out.copyNextSampleBuffer() {
            guard let px = CMSampleBufferGetImageBuffer(sample) else { continue }
            body(px, CMSampleBufferGetPresentationTimeStamp(sample).seconds * 1000); n += 1
        }
        return n
    }

    static func analyze(_ path: String, config: ArticulationConfig, encode: Bool) -> Result? {
        let pipe = NativeLivePipeline(config: config, encodeJPEG: encode)
        var sampled = 0, tracked = 0, v: [Double] = [], windows: [CapturedWindow] = [], first = Double.nan, last = 0.0
        guard let n = try? frames(of: URL(fileURLWithPath: path), { px, t in
            if first.isNaN { first = t }; last = t
            guard let o = pipe.process(px, t: t) else { return }
            sampled += 1; if o.features.tracked { tracked += 1 }
            v.append(o.update.velocity)
            if let w = o.window { windows.append(w) }
        }) else { return nil }
        // Flush: a clip that ends mid-sentence gets the same quiet tail the camera would see (still face, no motion).
        if let lastF = pipe.segmenter.lastTracked {
            var t = lastF.t
            for _ in 0..<20 { t += 40; let o = pipe.observe(LipFeatures(t: t, tracked: true, faceCount: 1, jaw: lastF.jaw, mouthAspect: lastF.mouthAspect, width: lastF.width, yaw: lastF.yaw, pitch: lastF.pitch)); if let w = o.window { windows.append(w) } }
        }
        let fps = n > 1 && last > first ? Double(n - 1) * 1000 / (last - first) : 0
        return Result(file: path, frames: n, sampled: sampled, tracked: tracked, fps: fps, velocities: v, windows: windows)
    }

    static func pct(_ xs: [Double], _ p: Double) -> Double {
        guard !xs.isEmpty else { return 0 }
        let s = xs.sorted(); return s[min(s.count - 1, Int(Double(s.count - 1) * p))]
    }

    /// Exits the process.
    static func run(_ args: [String]) -> Never {
        var config = ArticulationConfig.standard
        var files: [String] = [], send = false
        var i = 0
        while i < args.count {
            if args[i] == "--threshold", i + 1 < args.count { config.velocityThreshold = Double(args[i + 1]) ?? config.velocityThreshold; i += 2; continue }
            if args[i] == "--send" { send = true; i += 1; continue }
            if args[i] == "--quiet", i + 1 < args.count { config.quietMs = Double(args[i + 1]) ?? config.quietMs; i += 2; continue }
            files.append(args[i]); i += 1
        }
        print("threshold \(config.velocityThreshold) quietMs \(config.quietMs)")
        var all: [(String, CapturedWindow)] = []
        for f in files {
            guard let r = analyze(f, config: config, encode: send) else { print("FAIL \(f): unreadable"); continue }
            let ws = r.windows.map { "\(Int($0.startMs))–\(Int($0.endMs))ms/\($0.frames.count)f" }.joined(separator: " ")
            print(String(format: "%@  frames %d @ %.1f fps · sampled %d · tracked %d · v p50 %.3f p90 %.3f max %.3f · windows %d %@",
                         (f as NSString).lastPathComponent, r.frames, r.fps, r.sampled, r.tracked, pct(r.velocities, 0.5), pct(r.velocities, 0.9), r.velocities.max() ?? 0, r.windows.count, ws))
            all += r.windows.map { (f, $0) }
        }
        guard send else { exit(0) }
        MainActor.assumeIsolated { VideoReplaySender.shared.run(all) }
        RunLoop.main.run()
        exit(0)
    }
}

/// Sends recorded windows through TacitClient exactly as the camera path does, then prints each server result.
@MainActor final class VideoReplaySender {
    static let shared = VideoReplaySender()
    private let client = TacitClient(registerHotKey: false, connectOnInit: false)
    private var queue: [(String, CapturedWindow)] = []
    private var sent: [String: String] = [:]
    private var activated = false

    func run(_ windows: [(String, CapturedWindow)]) {
        queue = windows
        client.onHypothesis = { [weak self] id, decision, text, reason in
            guard let self, let file = self.sent.removeValue(forKey: id) else { return }
            print("RESULT \((file as NSString).lastPathComponent): \(decision) \(text.isEmpty ? "(\(reason ?? "no words"))" : "\"\(text)\"")")
            self.next()
        }
        client.connect()
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self, self.client.conn == .connected else { return }
                if !self.activated { self.activated = true; self.client.activateLive(); return }
                if self.client.live?.state == "active", self.client.ownsLive { timer.invalidate(); self.next() }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 180) { print("TIMEOUT"); exit(2) }
    }

    private func next() {
        guard !queue.isEmpty else { client.live("end"); DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { print("REPLAY DONE (recorded input, not live camera)"); exit(0) }; return }
        let (file, w) = queue.removeFirst()
        if let id = client.sendVisualUtterance(w) { sent[id] = file } else { print("NOT SENT \(file): \(client.notice ?? "?")"); next() }
    }
}
