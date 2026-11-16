import AppKit
import SwiftUI

enum CompanionAccessibility {
    static var reducedMotionPreview: Bool {
        (CommandLine.arguments.contains("--experience-lab") || Bundle.main.bundleIdentifier == "edu.hackumass.tacit-experience-lab")
            && CommandLine.arguments.contains("--lab-reduce-motion")
    }
    /// Offline lab only: render as if macOS "Increase contrast" were on (SwiftUI's contrast environment is read-only).
    static var highContrastPreview: Bool {
        (CommandLine.arguments.contains("--experience-lab") || Bundle.main.bundleIdentifier == "edu.hackumass.tacit-experience-lab")
            && CommandLine.arguments.contains("--lab-high-contrast")
    }
    /// Offline lab only: draw the real wordmark instead of the TEST label (brand evidence; captures stay labelled offline).
    static var wordmarkPreview: Bool {
        (CommandLine.arguments.contains("--experience-lab") || Bundle.main.bundleIdentifier == "edu.hackumass.tacit-experience-lab")
            && CommandLine.arguments.contains("--lab-wordmark")
    }
}

/// Explicit offline UI fixtures. No server, credential, camera, audio, capture adapter or hotkeys.
@MainActor final class ExperienceLab: ObservableObject {
    static var isEnabled: Bool {
        CommandLine.arguments.contains("--experience-lab") || Bundle.main.bundleIdentifier == "edu.hackumass.tacit-experience-lab"
    }
    static let shared = ExperienceLab()
    weak var client: TacitClient?
    weak var island: IslandController?
    @Published var requests: [[String: Any]] = []
    private var window: NSWindow?
    private var utterance = 0
    var cameraFixture: NativeCamera.State?
    /// Offline fixture: a recognition request "in flight" (no frames are sent anywhere).
    @Published var processingFixture = false
    let scenarios = ["compact-live", "peek-review", "peek-speaking", "peek-complete", "peek-realtime", "camera-denied", "discreet", "collapsed", "ready", "review", "editing", "phrases", "assistance", "voice", "error", "paused", "disconnected", "realtime-confirm", "realtime", "compact-capturing", "compact-processing", "compact-paused", "hover-peek", "peek-preparing", "pill-compact-live"]
    /// Offline My Voice fixture (sample registry shaped like the server's voice_status). Never plays audio.
    private var voiceRevision = 1
    private var voiceSelected = "apple:com.apple.voice.compact.en-US.Samantha"
    /// `--lab-voice-status FILE`: render a voice_status snapshot captured from a real server (still offline, no audio).
    private lazy var capturedVoiceStatus: [String: Any]? = {
        guard let i = CommandLine.arguments.firstIndex(of: "--lab-voice-status"), CommandLine.arguments.count > i + 1,
              let data = FileManager.default.contents(atPath: CommandLine.arguments[i + 1]),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return o
    }()
    private func voiceStatus(lastChange: [String: Any]? = nil) -> [String: Any] {
        if var real = capturedVoiceStatus {
            if voiceRevision > 1 { real["selected"] = ["voiceId": voiceSelected, "source": "user"]; real["effective"] = ["voiceId": voiceSelected, "label": voiceSelected]
                real["revision"] = voiceRevision }
            real["lastChange"] = lastChange ?? NSNull()
            return real
        }
        let rate: [String: Any] = ["min":0.3, "max":0.7, "default":0.5, "step":0.05]
        let pitch: [String: Any] = ["min":0.8, "max":1.25, "default":1.0, "step":0.05]
        func apple(_ id: String, _ name: String, _ locale: String, novelty: Bool = false) -> [String: Any] {
            ["id":"apple:" + id, "name":name, "locale":locale, "language":String(locale.prefix(2)), "provider":"apple-speech",
             "quality":"default", "kind":"system", "novelty":novelty, "available":true, "local":true, "controls":["rate":rate, "pitch":pitch]]
        }
        let voices: [[String: Any]] = [
            apple("com.apple.voice.compact.en-US.Samantha", "Samantha", "en-US"), apple("com.apple.eloquence.en-GB.Eddy", "Eddy", "en-GB"),
            apple("com.apple.eloquence.en-US.Flo", "Flo", "en-US"), apple("com.apple.voice.super-compact.en-IE.Moira", "Moira", "en-IE"),
            apple("com.apple.eloquence.en-US.Reed", "Reed", "en-US"), apple("com.apple.speech.synthesis.voice.Bells", "Bells", "en-US", novelty: true),
            ["id":"system:default", "name":"macOS default voice", "locale":"und", "language":"und", "provider":"macos-say", "quality":NSNull(),
             "kind":"system", "novelty":false, "available":true, "local":true, "controls":[:]]]
        let name = (voices.first { $0["id"] as? String == voiceSelected }?["name"] as? String) ?? "?"
        return ["revision":voiceRevision, "selected":["voiceId":voiceSelected, "source":voiceRevision > 1 ? "user" : "saved"],
                "effective":["voiceId":voiceSelected, "label":"\(name) (offline fixture)"], "fallback":NSNull(), "persisted":true,
                "voices":voices, "samples":["Hi, it's me. Thanks for waiting while I get my words out.", "Could you say that again, a little more slowly?"],
                "engine":["state":"ready"], "applePersonalVoice":["authorization":"denied", "usableInCalls":false, "reason":"Apple restriction (fixture)"],
                "custom":["provider":"elevenlabs", "configured":false, "available":false], "lastChange":lastChange ?? NSNull()]
    }

    func record(_ request: [String: Any]) {
        requests.append(request)
        if requests.count > 30 { requests.removeFirst() }
        // Fixture transport acknowledges only local controls. It never produces audio.
        if request["type"] as? String == "output_control", let action = request["action"] as? String {
            output(action == "pause" ? "paused" : action == "stop" ? "off" : "ready", generation: (client?.output?.generation ?? 0) + 1)
        }
        if request["type"] as? String == "voice_select", let id = request["voiceId"] as? String {
            voiceSelected = id; voiceRevision += 1
            emit("voice_status", "status", voiceStatus(lastChange: ["requestId":request["requestId"] ?? NSNull(), "ok":true, "at":0]))
        }
        if request["type"] as? String == "voice_preview" {
            emit("voice_preview", "preview", ["previewId":request["previewId"] ?? "", "voiceId":request["voiceId"] ?? "", "state":"playing",
                "output":"OFFLINE · no audio", "text":"", "timings":["requestedAt":0]])
        }
        if request["type"] as? String == "live_control", let action = request["action"] as? String {
            live(action == "pause" ? "paused" : action == "end" ? "off" : "active", generation: (client?.live?.generation ?? 0) + 1)
        }
    }
    func start(client: TacitClient, island: IslandController) {
        self.client = client; self.island = island
        let panel = NSWindow(contentRect: CGRect(x: 80, y: 100, width: 430, height: 280),
            styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        panel.title = "TACIT · OFFLINE INTERACTION LAB"
        panel.isReleasedWhenClosed = false
        panel.contentView = NSHostingView(rootView: LabControls(lab: self))
        if !CommandLine.arguments.contains("--lab-island-only") { panel.orderFrontRegardless(); window = panel }
        show("ready")
        if let i = CommandLine.arguments.firstIndex(of: "--lab-scenario"), CommandLine.arguments.count > i + 1 { show(CommandLine.arguments[i + 1]) }
        if CommandLine.arguments.contains("--play-lab") {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await playMotion()
            }
        }
        if let flag = CommandLine.arguments.firstIndex(of: "--record-lab"), CommandLine.arguments.count > flag + 1 {
            let directory = CommandLine.arguments[flag + 1]
            Task { @MainActor in await recordTransitions(directory: directory) }
        }
        if let flag = CommandLine.arguments.firstIndex(of: "--capture-lab"), CommandLine.arguments.count > flag + 1 {
            let directory = CommandLine.arguments[flag + 1]
            Task { @MainActor in
                await captureAll(directory: directory)
                await measureMotion(directory: directory)
            }
        }
    }
    private func emit(_ type: String, _ key: String, _ value: [String: Any]) {
        client?.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": type, key: value]), encoding: .utf8)!)
    }
    private func live(_ state: String, generation: Int = 1) {
        emit("live_status", "status", ["state":state, "authorizationId":"offline-live", "generation":generation])
    }
    private func output(_ state: String, generation: Int = 1) {
        emit("output_status", "status", ["state":state, "authorizationId":"offline-voice", "generation":generation,
            "voice":"Offline fixture · no audio", "route":["state":"ready", "deviceName":"OFFLINE · no device", "readers":[]]])
    }
    func show(_ scenario: String) {
        guard let client, let island else { return }
        client.connect() // isolated transport clears fixture state; never connects to a socket
        client.notice = nil; client.reviewDraft = ReviewDraft(); cameraFixture = nil; processingFixture = false; island.setDiscreet(false)
        live("off"); output("ready")
        emit("voice_status", "status", voiceStatus())
        island.communication.surface = .conversation
        if island.live.confirmingRealtime { island.live.requestMode(realtime: false) }
        island.expand()
        if !island.pinned { island.togglePin() }
        switch scenario {
        case "collapsed": island.collapse()
        case "discreet": island.setDiscreet(true); island.collapse()
        case "compact-live", "pill-compact-live": cameraFixture = .tracking; live("active"); island.collapse()
        case "compact-capturing": cameraFixture = .capturing; live("active"); island.collapse()
        case "compact-processing": cameraFixture = .tracking; processingFixture = true; live("active"); island.collapse()
        case "compact-paused": live("paused", generation: 2); island.collapse()
        case "hover-peek": cameraFixture = .tracking; live("active"); island.collapse(); island.hover(true)
        case "camera-denied": cameraFixture = .denied; island.collapse(); island.hover(true)
        case "review", "editing", "peek-review":
            live("active")
            utterance += 1
            let words = ["I HAVE SOMETHING TO ADD", "I HAD SOMETHING TO ADD", "WE HAVE SOMETHING TO ADD"]
            emit("recognition_hypothesis", "hypothesis", ["utteranceId":"offline-\(utterance)", "authorizationId":"offline-live",
                "generation":1, "decision":"shown", "rawText":words[0], "recognitionMs":720,
                "reviewExpiresAt":Date().timeIntervalSince1970 * 1000 + 120000,
                "reviewCandidates":words.enumerated().map { index, text in
                    ["kind":index == 0 ? "raw" : "alternative", "index":index, "text":text, "textHash":TacitClient.textHash(text)] as [String: Any]
                }])
            if scenario == "peek-review" { island.collapse() }
            if scenario == "editing", let h = client.lastHypothesis, let candidate = h.candidates.first {
                client.chooseReview(candidate, of: h.id, editing: true)
                island.focusEditor()
            }
        case "phrases": island.showCommunication(.phrases)
        case "assistance": island.showCommunication(.assistance)
        case "voice":
            island.showCommunication(.voice)
            emit("voice_preview", "preview", ["previewId":"offline-preview", "voiceId":"apple:com.apple.eloquence.en-GB.Eddy", "state":"playing",
                "output":"OFFLINE · no audio", "text":"", "timings":["requestedAt":0]])
        case "paused": live("paused", generation: 2); output("paused", generation: 2)
        case "realtime-confirm": island.live.requestMode(realtime: true)
        case "peek-speaking", "peek-complete", "peek-preparing":
            var timings: [String: Any] = ["requestedAt":0]
            if scenario != "peek-preparing" { timings["firstAudioAt"] = 1 }
            emit("speech_delivery", "delivery", ["requestId":"offline-speech", "source":"typed",
                "state":scenario == "peek-speaking" ? "routing" : scenario == "peek-preparing" ? "synthesizing" : "rendered", "text":"I have something to add.",
                "outputAuthorizationId":"offline-voice", "generation":1, "timings":timings])
            island.collapse()
        case "realtime", "peek-realtime":
            // Offline fixture: the server-reported real-time state and two recorded-style deliveries. No audio.
            client.activateLive(realtime: true)
            emit("live_status", "status", ["state":"active", "authorizationId":"offline-live", "generation":3, "mode":"automatic", "unreviewed":true])
            for (i, (text, state)) in [("PLEASE TURN ON THE LIGHTS", "rendered"), ("HOW ARE YOU DOING", "routing")].enumerated() {
                emit("speech_delivery", "delivery", ["requestId":"rec:offline-live:u\(i)", "source":"recognized", "state":state, "text":text,
                    "outputAuthorizationId":"offline-voice", "generation":1, "timings":["requestedAt":0, "firstAudioAt":1]])
            }
            if scenario == "peek-realtime" { island.collapse() }
        case "disconnected": client.disconnectIsolatedTransport()
        case "error":
            emit("output_status", "status", ["state":"off", "generation":2,
                "route":["state":"unavailable", "reason":"Offline test: no output device"]])
            client.notice = "Offline test: voice output unavailable."
        default: break
        }
        if island.expanded { island.focusForOfflineInspection() }
    }
    /// Scripted fixture interactions for an external native-window recording, never recognition/audio evidence.
    func playMotion() async {
        guard let island else { return }
        let scenes: [(String, Double)] = [("collapsed", 0.8), ("compact-live", 0.9), ("hover", 0.9),
            ("collapsed", 0.6), ("peek-review", 1.3), ("editing", 1.2), ("peek-speaking", 1.3),
            ("peek-complete", 1.0), ("collapsed", 0.8), ("camera-denied", 1.0), ("peek-realtime", 1.1)]
        for (scene, duration) in scenes {
            if scene == "hover" { show("collapsed"); island.hover(true) } else { show(scene) }
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
        }
        show("collapsed")
        print("OFFLINE interaction sequence complete; fixtures only, no camera/audio.")
    }

    /// Offline fixture recording of this app's own island view through the state sequence, one bitmap per tick on a
    /// fixed 460×360 pt canvas (top-centred, like the notch). Real capture timestamps are written to frames.json.
    func recordTransitions(directory: String) async {
        guard let island else { return }
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        let scenes: [(String, Double)] = [("collapsed", 1.2), ("compact-live", 1.6), ("compact-capturing", 1.6), ("compact-processing", 1.6),
            ("peek-review", 1.8), ("peek-preparing", 1.0), ("peek-speaking", 2.2), ("peek-complete", 1.2), ("compact-paused", 1.4), ("collapsed", 1.0)]
        var frames: [[String: Any]] = []
        var captured: [(NSBitmapImageRep, String, Double)] = []
        let start = ProcessInfo.processInfo.systemUptime
        for (scene, duration) in scenes {
            show(scene)
            let until = ProcessInfo.processInfo.systemUptime + duration
            while ProcessInfo.processInfo.systemUptime < until {
                let t = ProcessInfo.processInfo.systemUptime
                if let bitmap = island.renderedIslandBitmap() { captured.append((bitmap, scene, t - start)) }
                try? await Task.sleep(nanoseconds: 30_000_000)
            }
        }
        // Encode after capture so PNG work does not slow the sequence being recorded.
        for (index, (bitmap, scene, t)) in captured.enumerated() {
            let scale = bitmap.size.width > 0 ? CGFloat(bitmap.pixelsWide) / bitmap.size.width : 2
            let canvas = NSImage(size: CGSize(width: 460 * scale, height: 360 * scale))
            canvas.lockFocus()
            NSColor(white: 0.33, alpha: 1).setFill(); CGRect(origin: .zero, size: canvas.size).fill()
            let w = CGFloat(bitmap.pixelsWide), h = CGFloat(bitmap.pixelsHigh)
            bitmap.draw(in: CGRect(x: (canvas.size.width - w) / 2, y: canvas.size.height - h, width: w, height: h))
            canvas.unlockFocus()
            if let tiff = canvas.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                try? png.write(to: URL(fileURLWithPath: String(format: "%@/%04d.png", directory, index)))
                frames.append(["index":index, "scene":scene, "t":t])
            }
        }
        let index = captured.count
        if let data = try? JSONSerialization.data(withJSONObject: ["source":"offline fixtures · this app's island view only · no camera/audio", "frames":frames], options: [.prettyPrinted]) {
            try? data.write(to: URL(fileURLWithPath: directory + "/frames.json"))
        }
        print("OFFLINE RECORDING: \(index) frames.")
    }

    func measureMotion(directory: String) async {
        guard let island else { return }
        let samples = MotionSamples()
        let resize = NotificationCenter.default.addObserver(forName: NSWindow.didResizeNotification, object: nil, queue: .main) { notification in
            guard (notification.object as? NSWindow)?.title == "TACIT conversation island" else { return }
            MainActor.assumeIsolated { samples.resize.append(ProcessInfo.processInfo.systemUptime) }
        }
        let update = NotificationCenter.default.addObserver(forName: NSWindow.didUpdateNotification, object: nil, queue: .main) { notification in
            guard (notification.object as? NSWindow)?.title == "TACIT conversation island" else { return }
            MainActor.assumeIsolated { samples.update.append(ProcessInfo.processInfo.systemUptime) }
        }
        defer { NotificationCenter.default.removeObserver(resize); NotificationCenter.default.removeObserver(update) }
        // Rapidly reverse actual native frame transitions; these are UI actions in an offline developer harness.
        for _ in 0..<8 {
            island.collapse(); try? await Task.sleep(nanoseconds: 110_000_000)
            island.expand(); try? await Task.sleep(nanoseconds: 110_000_000)
        }
        try? await Task.sleep(nanoseconds: 650_000_000)
        for _ in 0..<20 { island.hover(true); island.hover(false) }
        try? await Task.sleep(nanoseconds: 750_000_000)
        let hoverCanceled = !island.expanded
        show("ready")
        let report: [String: Any] = ["source":"offline actual NSWindow notifications", "measuredAt":ISO8601DateFormatter().string(from: Date()),
            "resize":samples.summary(samples.resize), "windowUpdate":samples.summary(samples.update),
            "hoverDwellCancellation":hoverCanceled,
            "displayAdvertisedHz":island.displayMaximumFPS,
            "screenWidth":island.geometry.screenFrame.width, "screenHeight":island.geometry.screenFrame.height,
            "cutoutWidth":island.geometry.cutoutWidth, "cutoutHeight":island.geometry.cutoutHeight,
            "menuBarClearance":island.geometry.topInset,
            "limitation":"Main-thread resize/update notification cadence, not display presentation, GPU frame time or FPS. Includes rapid reversals and a settle interval."]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: URL(fileURLWithPath: directory + "/motion-pacing.json"))
        }
        print("OFFLINE MOTION: \(samples.resize.count) resize samples; hover cancellation \(hoverCanceled). Not a rendered FPS measurement.")
    }
    @MainActor private final class MotionSamples {
        var resize: [Double] = []
        var update: [Double] = []
        func summary(_ samples: [Double]) -> [String: Any] {
            let intervals = zip(samples.dropFirst(), samples).map { ($0 - $1) * 1000 }.sorted()
            guard !intervals.isEmpty else { return ["count":samples.count] }
            return ["count":samples.count, "intervalMsP50":intervals[intervals.count / 2],
                    "intervalMsP95":intervals[min(intervals.count - 1, Int(Double(intervals.count) * 0.95))],
                    "intervalMsMax":intervals.last!]
        }
    }
    func captureAll(directory: String) async {
        do {
            try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
            var dimensions: [[String: Any]] = []
            for scenario in scenarios {
                show(scenario)
                try await Task.sleep(nanoseconds: 850_000_000)
                try island?.saveRenderedIsland(to: directory + "/" + scenario + ".png")
                if let island, let actual = island.renderedSize {
                    let expected = island.targetSize
                    dimensions.append(["scenario":scenario, "width":actual.width, "height":actual.height,
                        "expectedWidth":expected.width, "expectedHeight":expected.height,
                        "matches":abs(actual.width - expected.width) < 1 && abs(actual.height - expected.height) < 1])
                }
            }
            let data = try JSONSerialization.data(withJSONObject: dimensions, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: URL(fileURLWithPath: directory + "/dimensions.json"))
            print("OFFLINE LAB: rendered fixture screenshots saved. No recognition/audio integration claim.")
        } catch { print("OFFLINE LAB capture failed: \(error)") }
    }
}

private struct LabControls: View {
    @ObservedObject var lab: ExperienceLab
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("OFFLINE · UI fixtures only").font(.headline)
            Text("No camera, server, voice, meeting capture or global shortcuts. Recognition shown here is sample text.").font(.caption)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]) {
                ForEach(lab.scenarios, id: \.self) { scenario in Button(scenario.capitalized) { lab.show(scenario) } }
            }
            Text("Recorded requests: \(lab.requests.count) · never delivered").font(.caption)
            if let request = lab.requests.last { Text("Last: \(request["type"] as? String ?? "")").font(.caption.monospaced()) }
        }.padding(20).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
