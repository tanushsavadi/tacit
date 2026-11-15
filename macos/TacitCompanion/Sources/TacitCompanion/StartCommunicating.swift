import AppKit
import AVFoundation
import Combine
import SwiftUI

/// One explicit action — "Start communicating" — prepares everything that does not need a human decision:
/// connects (or starts the local server), turns voice output on for this session, asks macOS for camera access,
/// starts the camera and activates display-only Live. Each sentence is still reviewed and spoken only on Speak.
@MainActor final class LiveCoordinator: ObservableObject {
    let client: TacitClient
    let camera = NativeCamera()
    @Published private(set) var starting = false
    /// Live is active under an authorization this app did not mint (e.g. the browser workspace took over).
    @Published private(set) var liveElsewhere = false
    private var resumeAfterConnect = false
    private var bag = Set<AnyCancellable>()

    init(client: TacitClient) {
        self.client = client
        camera.onWindow = { [weak self] w in self?.upload(w) }
        camera.objectWillChange.sink { [weak self] in self?.objectWillChange.send() }.store(in: &bag)
        // @Published emits before the new value is stored: evaluate on the next main-loop turn.
        client.$live.receive(on: RunLoop.main).sink { [weak self] _ in self?.liveChanged() }.store(in: &bag)
        client.$conn.receive(on: RunLoop.main).sink { [weak self] conn in self?.connectionChanged(conn) }.store(in: &bag)
    }

    var serverDown: Bool { if case .disconnected(let why) = client.conn { return why.contains("not running") }; return client.conn == .noToken }

    func startCommunicating() {
        guard !client.isIsolated else { client.notice = "Offline lab · camera disabled."; return }
        liveElsewhere = false
        guard client.conn == .connected else {
            resumeAfterConnect = true
            if serverDown { client.startServer() } else { client.connect() }
            return
        }
        starting = true
        if client.output?.state == "paused" { client.output("resume") }
        else if client.output?.state != "ready", client.route?.state == "ready" { client.output("enable") }
        Task {
            await camera.start()
            if camera.state.running, client.conn == .connected { client.activateLive() }
            starting = false
        }
    }

    /// Camera off and Live paused; voice output paused too (same as the notch Pause button).
    func pause() { camera.stop(); client.pauseEverything() }

    func restartCamera() { camera.stop(); startCommunicating() }

    static func openCameraSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera") { NSWorkspace.shared.open(url) }
    }

    private func upload(_ w: CapturedWindow) {
        guard client.ownsLive else { return }
        if Self.holdCapture(candidateSelected: client.reviewDraft.candidate != nil, editing: client.reviewDraft.editing,
                            delivery: client.lastDelivery?.state) {
            // Dropped, not queued: a new header would revoke the review being chosen or cut speech still playing.
            client.notice = "New sentence ignored while you review or while your words are spoken. Mouth it again afterwards."
            return
        }
        client.sendVisualUtterance(w)
    }

    /// While the user has picked/edited a candidate or TACIT is speaking, camera windows are discarded.
    nonisolated static func holdCapture(candidateSelected: Bool, editing: Bool, delivery: String?) -> Bool {
        candidateSelected || editing || ["queued", "synthesizing", "routing"].contains(delivery ?? "")
    }

    private func liveChanged() {
        if client.ownsLive { liveElsewhere = false; return }
        if client.liveActivationPending || starting { return }
        // Paused, ended, disconnected or taken over: release the camera; never restart it automatically.
        switch camera.state { case .off, .denied, .noCamera: break; default: camera.stop() }
        liveElsewhere = client.live?.state == "active" && client.live?.authorizationId != nil
    }

    private func connectionChanged(_ conn: TacitClient.Conn) {
        if conn == .connected, resumeAfterConnect { resumeAfterConnect = false; startCommunicating() }
        if conn != .connected, conn != .connecting { camera.stop() }
    }
}

/// What the notch says and offers. Pure, so every state has a test. Never claims a calling app received audio.
struct CommunicationGuide: Equatable {
    enum Action: String, Equatable { case startServer, reconnect, start, resume, restartCamera, openCameraSettings, type }
    var title: String
    var detail: String
    var action: Action?
    var actionTitle: String? {
        switch action {
        case .startServer: return "Start TACIT"
        case .reconnect: return "Reconnect"
        case .start: return "Start communicating"
        case .resume: return "Resume communicating"
        case .restartCamera: return "Restart camera"
        case .openCameraSettings: return "Open Camera Settings"
        case .type: return "Type it instead"
        case nil: return nil
        }
    }

    struct Facts: Equatable {
        var connected = false
        var serverDown = false
        var starting = false
        var recognizerReachable: Bool?
        var camera: NativeCamera.State = .off
        var live: String?
        var ownsLive = false
        var liveElsewhere = false
        var processing = false
        var reviewExpired = false
        var abstained = false
    }

    static func resolve(_ f: Facts) -> Self {
        if !f.connected {
            return f.serverDown
                ? .init(title: "TACIT isn't running", detail: "Start it here. Your draft is kept.", action: .startServer)
                : .init(title: "Reconnecting…", detail: "Your draft is kept. Nothing is spoken while disconnected.", action: .reconnect)
        }
        switch f.camera {
        case .denied: return .init(title: "Allow camera access for TACIT", detail: "System Settings › Privacy & Security › Camera › TACIT. Typing and phrases still work.", action: .openCameraSettings)
        case .noCamera: return .init(title: "No camera found", detail: "Connect a camera, or type your message.", action: .type)
        case .requestingPermission: return .init(title: "Allow camera access", detail: "Choose Allow in the macOS prompt. TACIT uses the camera only while communicating.", action: nil)
        default: break
        }
        if f.liveElsewhere { return .init(title: "Live is running in the browser workspace", detail: "Recognized words still appear here for review.", action: nil) }
        if f.live == "paused" { return .init(title: "Paused", detail: "Camera off. Nothing is being sent.", action: .resume) }
        let liveHere = f.live == "active" && f.ownsLive
        if liveHere || f.camera.running {
            if f.recognizerReachable == false { return .init(title: "Silent speech is reconnecting", detail: "Type or use your phrases meanwhile.", action: .type) }
            if case .interrupted(let why) = f.camera { return .init(title: "Camera interrupted", detail: why, action: .restartCamera) }
            if f.processing { return .init(title: "Interpreting your words", detail: "Hold still for a moment.", action: nil) }
            if f.reviewExpired { return .init(title: "That sentence is no longer available", detail: "Mouth another sentence, or type it.", action: .type) }
            if f.abstained { return .init(title: "No clear words that time", detail: "Mouth it again, or type it.", action: .type) }
            switch f.camera {
            case .starting: return .init(title: "Starting camera…", detail: "Look at the screen with your face in view.", action: nil)
            case .searching: return .init(title: "Move into view of the camera", detail: "TACIT needs one clearly visible face.", action: nil)
            case .multipleFaces: return .init(title: "Only one face, please", detail: "Capture pauses while more than one face is in view.", action: nil)
            case .capturing: return .init(title: "Reading your lips…", detail: "Pause briefly when you finish the sentence.", action: nil)
            default: return .init(title: "Mouth a sentence to begin", detail: "Your words appear here to review. Nothing is spoken until you press Speak.", action: nil)
            }
        }
        if case .interrupted(let why) = f.camera { return .init(title: "Camera interrupted", detail: why, action: .restartCamera) }
        if f.starting { return .init(title: "Getting ready…", detail: "Turning on your voice and camera.", action: nil) }
        if f.recognizerReachable == false {
            return .init(title: "Silent speech is unavailable", detail: "Type or use your phrases. Silent speech returns when the recognizer is back.", action: .type)
        }
        return .init(title: "Ready to start", detail: "TACIT opens your camera and shows the words you mouth. You choose what is spoken.", action: .start)
    }
}

/// The call side, stated as what TACIT can actually observe. A reader on the virtual mic is not proof of a listener.
enum CallRouteLine {
    static func text(routeState: String?, device: String?, readers: [String]?, output: String?) -> String {
        let name = device ?? "BlackHole 16ch"
        guard routeState == "ready" else { return "Call microphone unavailable — open Settings & output." }
        let voice = output == "ready" ? "Voice on" : output == "paused" ? "Voice paused" : "Voice off"
        guard let readers else { return "\(voice) · calling-app microphone not reported" }
        if readers.isEmpty { return "\(voice) · In Google Meet, choose \(name) as the microphone" }
        return "\(voice) · a calling app is using \(name)"
    }
}

/// Mirrored live preview of the camera TACIT is using (the same capture session; no extra camera access).
struct CameraPreview: NSViewRepresentable {
    let session: AVCaptureSession
    func makeNSView(context: Context) -> NSView {
        let v = NSView(); v.wantsLayer = true
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.connection?.automaticallyAdjustsVideoMirroring = false
        layer.connection?.isVideoMirrored = true
        layer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        v.layer = CALayer(); v.layer?.addSublayer(layer); layer.frame = v.bounds
        return v
    }
    func updateNSView(_ v: NSView, context: Context) {
        guard let layer = v.layer?.sublayers?.first as? AVCaptureVideoPreviewLayer else { return }
        layer.frame = v.bounds
        if let c = layer.connection, c.isVideoMirroringSupported, !c.isVideoMirrored { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = true }
    }
}
