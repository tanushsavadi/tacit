import XCTest
@testable import TacitCompanion

/// Native camera path (no camera, no sockets): endpointing, bounded buffers, wire framing, Live ownership and the
/// guidance copy shown in the notch.
final class NativeStartTests: XCTestCase {
    private func face(_ t: Double, jaw: Double = 0.2, aspect: Double = 0.1, width: Double = 1.0, yaw: Double = 0, faces: Int = 1) -> LipFeatures {
        LipFeatures(t: t, tracked: faces == 1, faceCount: faces, jaw: jaw, mouthAspect: aspect, width: width, yaw: yaw, pitch: 0)
    }
    /// 25 fps: still → articulating (mouth opening oscillates) → still.
    private func sentence(still: Double = 400, moving: Double = 1500, after: Double = 800) -> [LipFeatures] {
        var out: [LipFeatures] = [], t = 0.0
        while t < still { out.append(face(t)); t += 40 }
        var k = 0
        while t < still + moving { let open = k % 2 == 0; out.append(face(t, jaw: open ? 0.32 : 0.2, aspect: open ? 0.25 : 0.1)); t += 40; k += 1 }
        while t < still + moving + after { out.append(face(t)); t += 40 }
        return out
    }

    func testStillFaceProducesNoWindow() {
        var s = ArticulationSegmenter()
        var t = 0.0, windows = 0
        while t < 5000 { if s.update(face(t)).window != nil { windows += 1 }; t += 40 }
        XCTAssertEqual(windows, 0)
    }

    func testOneSentenceProducesExactlyOneWindowWithPreRollAndEndpoint() {
        var s = ArticulationSegmenter()
        let ws = sentence().compactMap { s.update($0).window }
        XCTAssertEqual(ws.count, 1)
        let w = ws[0]
        XCTAssertEqual(w.startMs, 400 - 160, accuracy: 41, "window starts one pre-roll before motion onset")
        XCTAssertGreaterThanOrEqual(w.endpointMs, ArticulationConfig.standard.quietMs)
        XCTAssertGreaterThan(w.endMs, w.startMs + ArticulationConfig.standard.minMs)
    }

    func testMultipleFacesHeadMotionAndGapsDropTheCapture() {
        var s = ArticulationSegmenter()
        let frames = sentence()
        for f in frames.prefix(25) { _ = s.update(f) }
        let two = s.update(face(frames[25].t, faces: 2))
        XCTAssertEqual(two.dropped, .multipleFaces)
        XCTAssertEqual(two.phase, .trackingLost)
        var h = ArticulationSegmenter()
        _ = h.update(face(0)); XCTAssertEqual(h.update(face(40, yaw: 0.3)).dropped, .trackingLost)
        var g = ArticulationSegmenter()
        _ = g.update(face(0)); XCTAssertEqual(g.update(face(500)).dropped, .frameGap)
    }

    func testContinuousMotionLongerThanMaxIsDroppedNotSent() {
        var s = ArticulationSegmenter(), t = 0.0, k = 0
        var windows = 0, tooLong = false
        while t < 9500 { let o = k % 2 == 0; let u = s.update(face(t, jaw: o ? 0.32 : 0.2, aspect: o ? 0.25 : 0.1)); if u.window != nil { windows += 1 }; if u.dropped == .tooLong { tooLong = true }; t += 40; k += 1 }
        XCTAssertTrue(tooLong); XCTAssertEqual(windows, 0)
    }

    func testFrameRingIsBoundedAndMonotonic() {
        var r = FrameRing()
        for i in 0..<400 { r.push(CapturedFrame(t: Double(i) * 10, jpeg: Data([1, 2, 3]))) }
        XCTAssertEqual(r.frames.count, 300)
        XCTAssertFalse(r.push(CapturedFrame(t: 0, jpeg: Data([1]))), "older timestamp rejected")
        var long = FrameRing()
        for i in 0..<300 { long.push(CapturedFrame(t: Double(i) * 100, jpeg: Data([1]))) }
        XCTAssertLessThanOrEqual(long.frames.last!.t - long.frames.first!.t, 10_000)
    }

    func testSampleClockKeepsTwentyFiveFromThirty() {
        var c = SampleClock(), n = 0
        for i in 0..<300 { if c.due(Double(i) * 1000 / 30) { n += 1 } }
        XCTAssertEqual(Double(n), 250, accuracy: 3)
    }

    func testPipelineWindowCarriesOnlyBufferedFramesInsideIt() {
        let p = NativeLivePipeline(encodeJPEG: false)
        var window: CapturedWindow?
        for f in sentence() { p.push(CapturedFrame(t: f.t, jpeg: Data([9]))); if let w = p.observe(f).window { window = w } }
        let w = try! XCTUnwrap(window)
        XCTAssertTrue(w.valid)
        XCTAssertTrue(w.frames.allSatisfy { $0.t >= w.startMs && $0.t <= w.endpointMs })
        _ = p.observe(face(99_999, faces: 0))
        XCTAssertTrue(p.ring.frames.isEmpty, "tracking loss discards buffered frames")
    }

    func testLipGeometryRatios() {
        let f = LipGeometry.features(
            outer: [CGPoint(x: 0, y: 0), CGPoint(x: 50, y: 10), CGPoint(x: 100, y: 0), CGPoint(x: 50, y: -10)],
            inner: [CGPoint(x: 20, y: 4), CGPoint(x: 50, y: 5), CGPoint(x: 80, y: -5)],
            leftEye: [CGPoint(x: 0, y: 100)], rightEye: [CGPoint(x: 100, y: 100)], nose: [CGPoint(x: 50, y: 50)], t: 1)
        XCTAssertTrue(f.tracked)
        XCTAssertEqual(f.mouthAspect, 0.1, accuracy: 1e-9)
        XCTAssertEqual(f.jaw, 0.2, accuracy: 1e-9)
        XCTAssertEqual(f.width, 1.0, accuracy: 1e-9)
        XCTAssertEqual(f.yaw, 0, accuracy: 1e-9)
    }

    // MARK: client wire protocol

    @MainActor private func emit(_ c: TacitClient, _ obj: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: obj), encoding: .utf8)!)
    }
    private func window(_ n: Int = 5) -> CapturedWindow {
        CapturedWindow(startMs: 100, endMs: 300, endpointMs: 800, frames: (0..<n).map { CapturedFrame(t: 100 + Double($0) * 40, jpeg: Data([0xFF, 0xD8, UInt8($0)])) })
    }

    @MainActor func testActivationIsDisplayOnlyCameraAndOwnershipFollowsTheServer() {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        emit(c, ["type": "live_status", "status": ["state": "off", "generation": 3, "authorizationId": NSNull()]])
        XCTAssertNil(c.sendVisualUtterance(window()), "nothing is uploaded before this app owns Live")
        XCTAssertTrue(sent.isEmpty)
        c.activateLive()
        XCTAssertEqual(sent.last?["type"] as? String, "live_control")
        XCTAssertEqual(sent.last?["action"] as? String, "activate")
        XCTAssertEqual(sent.last?["mode"] as? String, "display-only")
        XCTAssertEqual(sent.last?["inputSource"] as? String, "camera")
        XCTAssertTrue(c.liveActivationPending)
        emit(c, ["type": "live_status", "status": ["state": "active", "generation": 4, "authorizationId": "MINE"]])
        XCTAssertTrue(c.ownsLive); XCTAssertFalse(c.liveActivationPending)

        sent.removeAll()
        let id = try! XCTUnwrap(c.sendVisualUtterance(window(5)))
        XCTAssertEqual(sent.count, 6, "one header then exactly one binary message per frame")
        XCTAssertEqual(sent[0]["type"] as? String, "visual_utterance")
        XCTAssertEqual(sent[0]["authorizationId"] as? String, "MINE")
        let times = sent[0]["frameTimesMs"] as! [Double]
        XCTAssertEqual(times.count, 5); XCTAssertEqual(times, times.sorted())
        XCTAssertEqual(c.processingUtteranceID, id)
        emit(c, ["type": "recognition_hypothesis", "hypothesis": ["utteranceId": id, "authorizationId": "MINE", "generation": 4,
            "rawText": "", "decision": "abstained", "reason": "No words decoded."]])
        XCTAssertNil(c.processingUtteranceID, "the result ends 'Interpreting your words'")

        // Another client (browser) activates: this app no longer owns Live and uploads nothing.
        emit(c, ["type": "live_status", "status": ["state": "active", "generation": 5, "authorizationId": "BROWSER"]])
        XCTAssertFalse(c.ownsLive)
        sent.removeAll()
        XCTAssertNil(c.sendVisualUtterance(window()))
        XCTAssertTrue(sent.isEmpty)
    }

    @MainActor func testPauseRevokesOwnershipAndInvalidWindowsAreNeverSent() {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        c.activateLive()
        emit(c, ["type": "live_status", "status": ["state": "active", "generation": 1, "authorizationId": "MINE"]])
        var bad = window(); bad.frames.swapAt(0, 1)
        sent.removeAll()
        XCTAssertNil(c.sendVisualUtterance(bad)); XCTAssertTrue(sent.isEmpty)
        emit(c, ["type": "live_status", "status": ["state": "paused", "generation": 2, "authorizationId": "MINE"]])
        XCTAssertFalse(c.ownsLive)
        XCTAssertNil(c.sendVisualUtterance(window())); XCTAssertTrue(sent.isEmpty)
    }

    @MainActor func testNativeActivationNeverMintsAutomaticSpeech() {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        c.activateLive()
        XCTAssertFalse(sent.contains { ($0["mode"] as? String) == "automatic" })
        XCTAssertFalse(sent.contains { ($0["type"] as? String)?.hasPrefix("speak") == true }, "starting Live never speaks")
    }

    // MARK: guidance

    func testGuideCoversEveryRecoverableState() {
        typealias F = CommunicationGuide.Facts
        func g(_ f: F) -> CommunicationGuide { .resolve(f) }
        XCTAssertEqual(g(F(connected: false, serverDown: true)).action, .startServer)
        XCTAssertEqual(g(F(connected: false)).action, .reconnect)
        XCTAssertEqual(g(F(connected: true, recognizerReachable: true)).action, .start)
        XCTAssertEqual(g(F(connected: true, recognizerReachable: true)).title, "Ready to start")
        XCTAssertEqual(g(F(connected: true, camera: .requestingPermission)).title, "Allow camera access")
        XCTAssertEqual(g(F(connected: true, camera: .denied)).action, .openCameraSettings)
        XCTAssertEqual(g(F(connected: true, camera: .noCamera)).action, .type)
        XCTAssertEqual(g(F(connected: true, live: "paused")).action, .resume)
        let live = F(connected: true, recognizerReachable: true, camera: .tracking, live: "active", ownsLive: true)
        XCTAssertEqual(g(live).title, "Mouth a sentence to begin")
        var f = live; f.camera = .searching; XCTAssertEqual(g(f).title, "Move into view of the camera")
        f = live; f.camera = .multipleFaces; XCTAssertEqual(g(f).title, "Only one face, please")
        f = live; f.camera = .capturing; XCTAssertEqual(g(f).title, "Reading your lips…")
        f = live; f.processing = true; XCTAssertEqual(g(f).title, "Interpreting your words")
        f = live; f.reviewExpired = true
        XCTAssertEqual(g(f).title, "That sentence is no longer available"); XCTAssertEqual(g(f).action, .type)
        f = live; f.abstained = true; XCTAssertEqual(g(f).action, .type)
        f = live; f.recognizerReachable = false; XCTAssertEqual(g(f).action, .type)
        f = live; f.camera = .interrupted("x"); XCTAssertEqual(g(f).action, .restartCamera)
        XCTAssertEqual(g(F(connected: true, live: "active", liveElsewhere: true)).title, "Live is running in the browser workspace")
        XCTAssertEqual(g(F(connected: true, recognizerReachable: false)).action, .type)
    }

    func testGuideNeverOverclaims() {
        let states: [NativeCamera.State] = [.off, .requestingPermission, .denied, .noCamera, .starting, .searching, .tracking, .multipleFaces, .capturing, .interrupted("x")]
        for cam in states { for live in [nil, "off", "active", "paused"] { for own in [false, true] {
            let g = CommunicationGuide.resolve(.init(connected: true, recognizerReachable: true, camera: cam, live: live, ownsLive: own))
            let text = (g.title + " " + g.detail).lowercased()
            XCTAssertFalse(text.contains("ready to communicate"))
            XCTAssertFalse(text.contains("heard"))
            XCTAssertFalse(text.contains("meet received"))
        } } }
    }

    func testCallRouteLineStatesOnlyWhatIsObservable() {
        XCTAssertEqual(CallRouteLine.text(routeState: "ready", device: "BlackHole 16ch", readers: [], output: "ready"),
                       "Voice on · In Google Meet, choose BlackHole 16ch as the microphone")
        let reading = CallRouteLine.text(routeState: "ready", device: "BlackHole 16ch", readers: ["Google Chrome"], output: "ready")
        XCTAssertTrue(reading.contains("a calling app is using")); XCTAssertFalse(reading.lowercased().contains("heard"))
        XCTAssertTrue(CallRouteLine.text(routeState: "ready", device: nil, readers: nil, output: nil).contains("not reported"))
        XCTAssertTrue(CallRouteLine.text(routeState: "unavailable", device: nil, readers: nil, output: "ready").contains("unavailable"))
    }

    func testCaptureIsHeldWhileReviewingOrSpeaking() {
        XCTAssertFalse(LiveCoordinator.holdCapture(candidateSelected: false, editing: false, delivery: nil))
        XCTAssertFalse(LiveCoordinator.holdCapture(candidateSelected: false, editing: false, delivery: "rendered"))
        XCTAssertTrue(LiveCoordinator.holdCapture(candidateSelected: true, editing: false, delivery: nil))
        XCTAssertTrue(LiveCoordinator.holdCapture(candidateSelected: false, editing: true, delivery: nil))
        for d in ["queued", "synthesizing", "routing"] { XCTAssertTrue(LiveCoordinator.holdCapture(candidateSelected: false, editing: false, delivery: d)) }
    }
}
