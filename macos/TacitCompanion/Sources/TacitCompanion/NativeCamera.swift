import AppKit
import AVFoundation
import Combine

/// The Mac camera, owned by the TACIT app. It runs only after an explicit "Start communicating" and stops on Pause,
/// Stop, disconnect or when another client takes Live over; it never restarts by itself. Frames stay in RAM (≤ 10 s);
/// only endpointed windows are uploaded to the local server while this app owns a display-only Live authorization.
@MainActor final class NativeCamera: NSObject, ObservableObject {
    enum State: Equatable {
        case off, requestingPermission, denied, noCamera, starting
        case searching, tracking, multipleFaces, capturing
        case interrupted(String)
        var running: Bool { [.starting, .searching, .tracking, .multipleFaces, .capturing].contains(self) }
    }
    @Published private(set) var state: State = .off
    @Published private(set) var deviceName: String?
    @Published private(set) var windows = 0

    let session = AVCaptureSession()
    /// Endpointed windows (main actor). The owner decides whether Live is still authorized before uploading.
    var onWindow: ((CapturedWindow) -> Void)?

    private let sessionQueue = DispatchQueue(label: "tacit.camera.session")
    private let processor = FrameProcessor()
    private var configured = false
    private var watchdog: Timer?
    private var epoch = 0

    static var permission: AVAuthorizationStatus { AVCaptureDevice.authorizationStatus(for: .video) }

    /// Asks macOS for camera access when needed (the system prompt names TACIT), then starts capture.
    func start() async {
        guard !state.running else { return }
        switch Self.permission {
        case .authorized: break
        case .notDetermined:
            state = .requestingPermission
            NSApp.activate(ignoringOtherApps: true)
            let ok = await AVCaptureDevice.requestAccess(for: .video)
            guard ok else { state = .denied; return }
        default: state = .denied; return
        }
        guard let device = Self.preferredDevice() else { state = .noCamera; return }
        deviceName = device.localizedName
        state = .starting
        epoch += 1
        let current = epoch
        processor.reset(epoch: current) { [weak self] event in
            Task { @MainActor in self?.handle(event, epoch: current) }
        }
        let ok = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            sessionQueue.async { [session, processor, configured] in
                if !configured {
                    session.beginConfiguration()
                    session.sessionPreset = session.canSetSessionPreset(.hd1280x720) ? .hd1280x720 : .high
                    guard let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
                        session.commitConfiguration(); done.resume(returning: false); return
                    }
                    session.addInput(input)
                    let output = AVCaptureVideoDataOutput()
                    output.alwaysDiscardsLateVideoFrames = true
                    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                    output.setSampleBufferDelegate(processor, queue: processor.queue)
                    guard session.canAddOutput(output) else { session.commitConfiguration(); done.resume(returning: false); return }
                    session.addOutput(output)
                    session.commitConfiguration()
                }
                session.startRunning()
                done.resume(returning: session.isRunning)
            }
        }
        configured = configured || ok
        guard current == epoch else { return } // stopped meanwhile
        guard ok else { state = .interrupted("The camera could not start. Another app may be using it exclusively."); return }
        state = .searching
        watchdog?.invalidate()
        watchdog = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.checkFrames() }
        }
    }

    /// Releases the camera immediately and discards every buffered frame.
    func stop() {
        epoch += 1
        watchdog?.invalidate(); watchdog = nil
        processor.reset(epoch: epoch, events: nil)
        sessionQueue.async { [session] in if session.isRunning { session.stopRunning() } }
        if state != .denied && state != .noCamera { state = .off }
    }

    private func checkFrames() {
        guard state.running, state != .starting else { return }
        if processor.secondsSinceLastFrame > 2.5 {
            state = .interrupted("The camera stopped sending video. Close other apps using it exclusively, then Restart camera.")
        }
    }

    private func handle(_ e: FrameProcessor.Event, epoch: Int) {
        guard epoch == self.epoch, state.running || { if case .interrupted = state { return true }; return false }() else { return }
        switch e {
        case .face(let face, let capturing):
            state = face == .many ? .multipleFaces : face == .none ? .searching : capturing ? .capturing : .tracking
        case .window(let w):
            windows += 1
            onWindow?(w)
        }
    }

    static func preferredDevice() -> AVCaptureDevice? {
        let builtIn = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: .unspecified).devices
        return builtIn.first ?? AVCaptureDevice.default(for: .video)
    }
}

/// Runs on its own serial queue: Vision + endpointing + JPEG buffer per sampled frame.
final class FrameProcessor: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    enum Event { case face(NativeLivePipeline.Face, capturing: Bool), window(CapturedWindow) }
    let queue = DispatchQueue(label: "tacit.camera.frames", qos: .userInitiated)
    private let lock = NSLock()
    private var pipeline = NativeLivePipeline()
    private var events: ((Event) -> Void)?
    private var epoch = 0
    private var lastFace: NativeLivePipeline.Face?
    private var lastCapturing = false
    private var lastFrame = Date.distantFuture

    var secondsSinceLastFrame: Double { lock.lock(); defer { lock.unlock() }; return Date().timeIntervalSince(lastFrame) }

    func reset(epoch: Int, events: ((Event) -> Void)?) {
        lock.lock(); self.epoch = epoch; self.events = events; lastFrame = events == nil ? .distantFuture : Date(); lock.unlock()
        queue.async { [self] in pipeline.reset(); lastFace = nil; lastCapturing = false }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        lock.lock(); let sink = events; lastFrame = Date(); lock.unlock()
        guard let sink, let px = CMSampleBufferGetImageBuffer(sample) else { return }
        let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds * 1000
        guard t.isFinite, let o = pipeline.process(px, t: t) else { return }
        let face: NativeLivePipeline.Face = o.features.faceCount > 1 ? .many : o.features.tracked ? .one : .none
        let capturing = o.update.phase == .capturing
        if face != lastFace || capturing != lastCapturing { lastFace = face; lastCapturing = capturing; sink(.face(face, capturing: capturing)) }
        if let w = o.window { sink(.window(w)) }
    }
}
