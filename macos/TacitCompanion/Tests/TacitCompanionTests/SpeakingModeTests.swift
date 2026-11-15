import XCTest
@testable import TacitCompanion

/// Review first (one tap speaks exactly the shown words) and Real-time (explicit, unreviewed, server-reported).
final class SpeakingModeTests: XCTestCase {
    @MainActor private func emit(_ c: TacitClient, _ type: String, _ key: String, _ body: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": type, key: body]), encoding: .utf8)!)
    }
    @MainActor private func voiceReady(_ c: TacitClient) {
        emit(c, "output_status", "status", ["state": "ready", "authorizationId": "OUT", "generation": 1, "route": ["state": "ready"]])
    }
    @MainActor private func live(_ c: TacitClient, generation: Int, unreviewed: Bool = false, auth: String = "LIVE", state: String = "active") {
        emit(c, "live_status", "status", ["state": state, "authorizationId": auth, "generation": generation,
            "mode": unreviewed ? "automatic" : "display-only", "unreviewed": unreviewed])
    }
    @MainActor private func result(_ c: TacitClient, _ id: String, generation: Int, alt: String? = nil) {
        let raw = "HOW ARE YOU DOING"
        var cands: [[String: Any]] = [["index": 0, "kind": "raw", "text": raw, "textHash": TacitClient.textHash(raw)]]
        if let alt { cands.append(["index": 1, "kind": "alternative", "text": alt, "textHash": TacitClient.textHash(alt)]) }
        emit(c, "recognition_hypothesis", "hypothesis", ["utteranceId": id, "authorizationId": "LIVE", "generation": generation,
            "decision": "shown", "rawText": raw, "reviewExpiresAt": Date().timeIntervalSince1970 * 1000 + 60000, "reviewCandidates": cands])
    }

    @MainActor func testOneTapSpeaksExactlyTheShownRawWords() {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        voiceReady(c); live(c, generation: 2); result(c, "u1", generation: 2)
        XCTAssertTrue(c.canReviewCurrent)
        XCTAssertNil(c.reviewDraft.candidate, "nothing is pre-selected")
        XCTAssertTrue(c.speakShownWords())
        let req = try! XCTUnwrap(sent.last)
        XCTAssertEqual(req["type"] as? String, "speak_reviewed")
        XCTAssertEqual(req["candidate"] as? String, "raw")
        XCTAssertEqual(req["text"] as? String, "HOW ARE YOU DOING")
        XCTAssertEqual(req["textHash"] as? String, TacitClient.textHash("HOW ARE YOU DOING"))
        XCTAssertEqual(req["utteranceId"] as? String, "u1")
    }

    @MainActor func testOneTapSpeaksTheAlternativeTheUserChose() {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        voiceReady(c); live(c, generation: 2); result(c, "u1", generation: 2, alt: "HOW ARE YOU DOING TODAY")
        let alt = c.lastHypothesis!.candidates[1]
        c.chooseReview(alt, of: "u1")
        XCTAssertTrue(c.speakShownWords())
        XCTAssertEqual(sent.last?["text"] as? String, "HOW ARE YOU DOING TODAY")
        XCTAssertEqual(sent.last?["candidate"] as? String, "alternative")
    }

    @MainActor func testActivationModes() {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        c.activateLive()
        XCTAssertEqual(sent.last?["mode"] as? String, "display-only"); XCTAssertNil(sent.last?["acknowledgeUnreviewed"])
        c.activateLive(realtime: true)
        XCTAssertEqual(sent.last?["mode"] as? String, "automatic")
        XCTAssertEqual(sent.last?["acknowledgeUnreviewed"] as? Bool, true)
    }

    @MainActor func testRealtimeIsWhatTheServerReportsAndHidesReview() {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        voiceReady(c); live(c, generation: 2, unreviewed: true); result(c, "u1", generation: 2)
        XCTAssertTrue(c.realtimeActive)
        XCTAssertFalse(c.canReviewCurrent, "no Speak button for words the server already speaks")
        XCTAssertFalse(c.speakShownWords())
        live(c, generation: 3, unreviewed: false)
        XCTAssertFalse(c.realtimeActive)
    }

    @MainActor func testRealtimeTranscriptKeepsLastThreeAndClearsWhenLiveStops() {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        voiceReady(c); live(c, generation: 2, unreviewed: true)
        for (i, t) in ["ONE", "TWO", "THREE", "FOUR"].enumerated() {
            emit(c, "speech_delivery", "delivery", ["requestId": "rec:LIVE:u\(i)", "source": "recognized", "state": "synthesizing",
                "text": t, "outputAuthorizationId": "OUT", "generation": 1, "timings": [:]])
        }
        emit(c, "speech_delivery", "delivery", ["requestId": "rec:LIVE:u3", "source": "recognized", "state": "rendered",
            "text": "FOUR", "outputAuthorizationId": "OUT", "generation": 1, "timings": [:]])
        XCTAssertEqual(c.realtimeSpoken.map(\.text), ["FOUR", "THREE", "TWO"])
        XCTAssertEqual(c.realtimeSpoken.first?.state, "rendered")
        live(c, generation: 3, state: "paused")
        XCTAssertTrue(c.realtimeSpoken.isEmpty)
    }

    @MainActor func testRealtimeNeedsConfirmationAndStopReturnsToReview() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        let coord = LiveCoordinator(client: c)
        coord.requestMode(realtime: true)
        XCTAssertTrue(coord.confirmingRealtime); XCTAssertFalse(coord.realtime)
        XCTAssertTrue(sent.isEmpty, "asking is not enabling")
        coord.requestMode(realtime: false)
        XCTAssertFalse(coord.confirmingRealtime); XCTAssertFalse(coord.realtime)

        // Live owned by this app: confirming re-activates in real-time; switching back re-activates review.
        c.activateLive(); live(c, generation: 2)
        sent.removeAll()
        coord.requestMode(realtime: true); coord.confirmRealtime()
        XCTAssertTrue(coord.realtime)
        XCTAssertEqual(sent.last?["mode"] as? String, "automatic")
        live(c, generation: 3, unreviewed: true)
        coord.requestMode(realtime: false)
        XCTAssertEqual(sent.last?["mode"] as? String, "display-only")
        XCTAssertFalse(coord.realtime)

        // Stop (active → off) after real-time → next session starts in review.
        coord.requestMode(realtime: true); coord.confirmRealtime()
        live(c, generation: 4, unreviewed: true)
        await Task.yield(); try? await Task.sleep(nanoseconds: 50_000_000)
        live(c, generation: 5, auth: "", state: "off")
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertFalse(coord.realtime)
    }

    func testGuideInRealtime() {
        let g = CommunicationGuide.resolve(.init(connected: true, recognizerReachable: true, camera: .tracking, live: "active", ownsLive: true, realtime: true))
        XCTAssertEqual(g.title, "Real-time · just mouth your words")
        XCTAssertTrue(g.detail.contains("unreviewed"))
    }
}
