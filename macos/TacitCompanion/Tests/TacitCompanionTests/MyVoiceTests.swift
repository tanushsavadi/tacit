import XCTest
@testable import TacitCompanion

final class MyVoiceTests: XCTestCase {
    @MainActor private func emit(_ c: TacitClient, _ type: String, _ key: String, _ values: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": type, key: values]), encoding: .utf8)!)
    }
    private let rate: [String: Any] = ["min": 0.3, "max": 0.7, "default": 0.5, "step": 0.05]
    private let pitch: [String: Any] = ["min": 0.8, "max": 1.25, "default": 1.0, "step": 0.05]
    private func voice(_ id: String, _ name: String, novelty: Bool = false, personal: Bool = false, available: Bool = true, controls: Bool = true) -> [String: Any] {
        ["id": id, "name": name, "locale": "en-US", "language": "en", "provider": id.hasPrefix("apple:") ? "apple-speech" : "macos-say",
         "quality": "default", "kind": personal ? "apple-personal-voice" : "system", "novelty": novelty, "available": available,
         "unavailableReason": available ? NSNull() : "Apple restriction", "local": true,
         "controls": controls ? ["rate": rate, "pitch": pitch] : [:]]
    }
    @MainActor private func status(_ c: TacitClient, revision: Int = 3, selected: String = "apple:sam", lastChange: [String: Any]? = nil) {
        emit(c, "voice_status", "status", ["revision": revision, "selected": ["voiceId": selected, "source": "saved"],
            "effective": ["voiceId": selected, "label": "Samantha (en-US, macOS voice, on this Mac)"], "fallback": NSNull(), "persisted": true,
            "voices": [voice("apple:sam", "Samantha"), voice("apple:eddy", "Eddy"), voice("apple:bells", "Bells", novelty: true),
                       voice("apple:pv", "Mine", personal: true, available: false, controls: false), voice("system:default", "macOS default voice", controls: false)],
            "samples": ["Sample one"], "engine": ["state": "ready"],
            "applePersonalVoice": ["authorization": "denied", "usableInCalls": false, "reason": "Apple restriction"],
            "lastChange": lastChange ?? NSNull()])
    }
    @MainActor private func ready(_ c: TacitClient) {
        emit(c, "output_status", "status", ["state": "ready", "authorizationId": "voice", "generation": 4, "route": ["state": "ready", "deviceName": "TEST"]])
        emit(c, "live_status", "status", ["state": "active", "authorizationId": "live", "generation": 2])
    }
    @MainActor private func client(_ requests: @escaping ([String: Any]) -> Void) -> TacitClient {
        TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: requests))
    }

    @MainActor func testParsesTheServerRegistryWithoutInventingVoices() {
        let c = client { _ in }
        status(c)
        let s = c.myVoice!
        XCTAssertEqual(s.revision, 3)
        XCTAssertEqual(s.voices.map(\.id), ["apple:sam", "apple:eddy", "apple:bells", "apple:pv", "system:default"])
        XCTAssertEqual(s.voices.filter(\.offered).map(\.id), ["apple:sam", "apple:eddy", "system:default"], "novelty and Personal Voice are not offered")
        XCTAssertEqual(s.voices[0].rate, .init(min: 0.3, max: 0.7, defaultValue: 0.5, step: 0.05))
        XCTAssertNil(s.voices[4].rate, "no controls unless the server reports them")
        XCTAssertEqual(s.effective?.name, "Samantha")
        c.connect() // isolated reconnect clears server-derived state
        XCTAssertNil(c.myVoice)
    }

    @MainActor func testSelectSendsOnlyValidChoicesAndReportsRefusals() {
        var requests: [[String: Any]] = []
        let c = client { requests.append($0) }
        status(c)
        XCTAssertFalse(c.selectVoice("apple:pv"), "unavailable voice is never sent")
        XCTAssertFalse(c.selectVoice("apple:nope"))
        XCTAssertFalse(c.selectVoice("apple:sam", rate: 0.95), "out of the reported range")
        XCTAssertFalse(c.selectVoice("system:default", rate: 0.5), "no rate control reported")
        XCTAssertTrue(requests.isEmpty)
        XCTAssertTrue(c.selectVoice("apple:eddy", rate: 0.45, pitch: 1.1))
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests[0]["type"] as? String, "voice_select")
        XCTAssertEqual(requests[0]["voiceId"] as? String, "apple:eddy")
        XCTAssertEqual(requests[0]["rate"] as? Double, 0.45)
        XCTAssertEqual(requests[0]["pitch"] as? Double, 1.1)
        let rid = requests[0]["requestId"] as! String
        status(c, revision: 3, lastChange: ["requestId": rid, "ok": false, "reason": "That voice is not installed on this Mac."])
        XCTAssertEqual(c.voiceNotice, "That voice is not installed on this Mac.")
        c.resetVoice()
        XCTAssertTrue(requests.last?["voiceId"] is NSNull)
    }

    @MainActor func testEverySpeakRequestCarriesTheVoiceRevisionTheUserSaw() {
        var requests: [[String: Any]] = []
        let c = client { requests.append($0) }
        ready(c)
        XCTAssertTrue(c.speakTyped("before any voice status"))
        XCTAssertNil(requests.last?["voiceRevision"], "older servers: no revision is invented")
        status(c, revision: 7)
        let session = CommunicationSession(defaults: nil)
        XCTAssertTrue(session.holdTurn(using: c))
        XCTAssertEqual(requests.last?["type"] as? String, "speak_typed")
        XCTAssertEqual(requests.last?["voiceRevision"] as? Int, 7)
        emit(c, "recognition_hypothesis", "hypothesis", ["utteranceId": "A", "authorizationId": "live", "generation": 2, "decision": "shown",
            "rawText": "HELLO", "reviewExpiresAt": Date().timeIntervalSince1970 * 1000 + 60000,
            "reviewCandidates": [["kind": "raw", "index": 0, "text": "HELLO", "textHash": TacitClient.textHash("HELLO")]]])
        c.chooseReview(c.lastHypothesis!.candidates[0], of: "A")
        status(c, revision: 8) // voice changed after the choice: the request carries 8 (what is now shown); the server binds it
        XCTAssertTrue(c.speakReviewed())
        XCTAssertEqual(requests.last?["type"] as? String, "speak_reviewed")
        XCTAssertEqual(requests.last?["voiceRevision"] as? Int, 8)
        XCTAssertEqual(requests.last?["text"] as? String, "HELLO", "voice choice never edits the words")
    }

    @MainActor func testPreviewIsAPrivateRequestNeverASpeakRequestAndStopEndsIt() {
        var requests: [[String: Any]] = []
        let c = client { requests.append($0) }
        status(c)
        XCTAssertFalse(c.previewVoice("apple:pv"))
        XCTAssertTrue(c.previewVoice("apple:eddy", rate: 0.4, pitch: 3, sample: 0))
        XCTAssertEqual(requests.last?["type"] as? String, "voice_preview")
        XCTAssertEqual(requests.last?["rate"] as? Double, 0.4)
        XCTAssertNil(requests.last?["pitch"], "out-of-range control is dropped, not sent")
        XCTAssertFalse(requests.contains { ($0["type"] as? String)?.hasPrefix("speak") == true })
        emit(c, "voice_preview", "preview", ["previewId": requests.last!["previewId"]!, "voiceId": "apple:eddy", "state": "playing", "output": "MacBook Pro Speakers"])
        XCTAssertTrue(c.previewActive)
        ready(c)
        c.stopEverything()
        XCTAssertTrue(requests.contains { $0["type"] as? String == "voice_preview_stop" }, "Stop also ends a preview")
        emit(c, "voice_preview", "preview", ["previewId": "x", "voiceId": "apple:eddy", "state": "refused", "reason": "virtual microphone"])
        XCTAssertFalse(c.previewActive)
        XCTAssertEqual(c.voicePreview?.reason, "virtual microphone")
    }
}
