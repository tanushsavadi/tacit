import AVFoundation
import CoreMotion
import WatchKit

/// Records one labelled trial: microphone PCM (AVAudioEngine tap → 16-bit WAV at the hardware rate), Core Motion
/// device motion at 100 Hz, per-buffer host times (to find gaps when the wrist is lowered), lifecycle events and the
/// audio session's actual configuration. Files: Documents/<utc>-<label>/{audio.wav,motion.csv,buffers.csv,meta.json}.
final class Recorder: NSObject, ObservableObject, WKExtendedRuntimeSessionDelegate {
    @Published var status = "idle"
    @Published var isRecording = false
    @Published var deviceInfo = "\(WKInterfaceDevice.current().model) · watchOS \(WKInterfaceDevice.current().systemVersion)"

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let motion = CMMotionManager()
    private let motionQueue = OperationQueue()
    private var runtime: WKExtendedRuntimeSession?
    private var file: AVAudioFile?
    private var dir: URL?
    private var motionCSV: FileHandle?
    private var buffersCSV: FileHandle?
    private var meta: [String: Any] = [:]
    private var events: [[String: Any]] = []
    private var frames: AVAudioFramePosition = 0
    private var motionCount = 0
    private var stopTimer: Timer?

    private static func hostSeconds(_ t: UInt64) -> Double { AVAudioTime.seconds(forHostTime: t) }

    func event(_ kind: String, _ detail: String) {
        events.append(["t": ProcessInfo.processInfo.systemUptime, "kind": kind, "detail": detail])
    }

    func start(label: String, seconds: Double, duplex: Bool) {
        AVAudioApplication.requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else { self.status = "microphone permission denied"; return }
                do { try self.begin(label: label, seconds: seconds, duplex: duplex) } catch {
                    self.status = "error: \(error.localizedDescription)"; self.event("error", "\(error)"); self.teardown()
                }
            }
        }
    }

    private func begin(label: String, seconds: Double, duplex: Bool) throws {
        events = []; frames = 0; motionCount = 0
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let safe = label.components(separatedBy: CharacterSet.alphanumerics.union(.init(charactersIn: "-")).inverted).joined()
        let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("\(stamp)-\(safe)")
        try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        dir = d

        // Keep running with the wrist lowered (to be verified on device, not assumed).
        let rs = WKExtendedRuntimeSession(); rs.delegate = self; rs.start(); runtime = rs

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(duplex ? .playAndRecord : .record, mode: .measurement)
        // No preferred-sample-rate API on watchOS (API_UNAVAILABLE(watchos)): we record whatever the hardware delivers.
        try session.setActive(true)
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        meta = ["label": label, "duplex": duplex, "requestedSeconds": seconds,
                "session": ["category": session.category.rawValue, "mode": session.mode.rawValue, "sampleRate": session.sampleRate,
"inputLatency": session.inputLatency,
                            "outputLatency": session.outputLatency, "ioBufferDuration": session.ioBufferDuration,
                            "inputs": session.currentRoute.inputs.map { "\($0.portType.rawValue):\($0.portName)" },
                            "outputs": session.currentRoute.outputs.map { "\($0.portType.rawValue):\($0.portName)" }],
                "inputFormat": ["sampleRate": fmt.sampleRate, "channels": fmt.channelCount, "common": fmt.commonFormat.rawValue],
                "device": deviceInfo, "startUptime": ProcessInfo.processInfo.systemUptime]

        file = try AVAudioFile(forWriting: d.appendingPathComponent("audio.wav"),
                               settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: fmt.sampleRate,
                                          AVNumberOfChannelsKey: fmt.channelCount, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false],
                               commonFormat: .pcmFormatFloat32, interleaved: false)
        FileManager.default.createFile(atPath: d.appendingPathComponent("buffers.csv").path, contents: Data("hostSeconds,frames\n".utf8))
        buffersCSV = try FileHandle(forWritingTo: d.appendingPathComponent("buffers.csv")); buffersCSV?.seekToEndOfFile()
        input.installTap(onBus: 0, bufferSize: 4096, format: fmt) { [weak self] buf, when in
            guard let self else { return }
            try? self.file?.write(from: buf)
            self.frames += AVAudioFramePosition(buf.frameLength)
            self.buffersCSV?.write(Data("\(Self.hostSeconds(when.hostTime)),\(buf.frameLength)\n".utf8))
        }
        if duplex {
            engine.attach(player)
            let out = engine.mainMixerNode.outputFormat(forBus: 0)
            engine.connect(player, to: engine.mainMixerNode, format: out)
            let n = AVAudioFrameCount(out.sampleRate)
            let tone = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: n)!
            tone.frameLength = n
            for ch in 0..<Int(out.channelCount) { // 1 kHz, amplitude 0.03 (≈ −30 dBFS), 1 s — audible and quiet
                for i in 0..<Int(n) { tone.floatChannelData![ch][i] = 0.03 * sinf(2 * .pi * 1000 * Float(i) / Float(out.sampleRate)) }
            }
            player.scheduleBuffer(tone, at: nil)
            meta["toneHz"] = 1000; meta["toneAmplitude"] = 0.03; meta["outputSampleRate"] = out.sampleRate
        }
        try engine.start()
        if duplex { player.play() }

        FileManager.default.createFile(atPath: d.appendingPathComponent("motion.csv").path,
                                       contents: Data("t,ax,ay,az,rx,ry,rz,gx,gy,gz,qw,qx,qy,qz\n".utf8))
        motionCSV = try FileHandle(forWritingTo: d.appendingPathComponent("motion.csv")); motionCSV?.seekToEndOfFile()
        meta["deviceMotionAvailable"] = motion.isDeviceMotionAvailable
        motion.deviceMotionUpdateInterval = 1.0 / 100
        motionQueue.maxConcurrentOperationCount = 1
        motion.startDeviceMotionUpdates(to: motionQueue) { [weak self] m, _ in
            guard let self, let m else { return }
            let a = m.userAcceleration, r = m.rotationRate, g = m.gravity, q = m.attitude.quaternion
            self.motionCSV?.write(Data(String(format: "%.4f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.6f,%.6f,%.6f,%.6f\n",
                                              m.timestamp, a.x, a.y, a.z, r.x, r.y, r.z, g.x, g.y, g.z, q.w, q.x, q.y, q.z).utf8))
            self.motionCount += 1
        }
        isRecording = true
        status = "● \(label) @ \(Int(session.sampleRate)) Hz"
        event("start", label)
        stopTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in self?.stop(reason: "timer") }
    }

    func stop(reason: String) {
        guard isRecording else { return }
        event("stop", reason)
        teardown()
        meta["frames"] = frames
        meta["motionSamples"] = motionCount
        meta["stopUptime"] = ProcessInfo.processInfo.systemUptime
        meta["events"] = events
        if let d = dir, let data = try? JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: d.appendingPathComponent("meta.json"))
        }
        status = "saved \(dir?.lastPathComponent ?? "") · \(frames) frames · \(motionCount) motion"
    }

    private func teardown() {
        stopTimer?.invalidate()
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        if engine.attachedNodes.contains(player) { engine.detach(player) }
        motion.stopDeviceMotionUpdates()
        file = nil
        try? motionCSV?.close(); try? buffersCSV?.close()
        try? AVAudioSession.sharedInstance().setActive(false)
        runtime?.invalidate(); runtime = nil
        isRecording = false
    }

    // MARK: WKExtendedRuntimeSessionDelegate
    func extendedRuntimeSessionDidStart(_ s: WKExtendedRuntimeSession) { event("runtime", "didStart") }
    func extendedRuntimeSessionWillExpire(_ s: WKExtendedRuntimeSession) { event("runtime", "willExpire") }
    func extendedRuntimeSession(_ s: WKExtendedRuntimeSession, didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason, error: Error?) {
        event("runtime", "invalidated \(reason.rawValue) \(error?.localizedDescription ?? "")")
    }
}
