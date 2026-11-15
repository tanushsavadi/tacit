import XCTest
@testable import TacitCompanion

/// Help Me Respond (Presence): the user decides; AI only suggests wording; nothing is spoken without Speak.
final class PresenceTests: XCTestCase {
    @MainActor private func emit(_ c: TacitClient, _ type: String, _ key: String, _ values: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": type, key: values]), encoding: .utf8)!)
    }
    @MainActor private func setup(ai: Bool = true) -> (TacitClient, CommunicationSession, () -> [[String: Any]]) {
        var requests: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { requests.append($0) }))
        emit(c, "output_status", "status", ["state": "ready", "authorizationId": "voice", "generation": 4, "route": ["state": "ready"]])
        emit(c, "respond_status", "status", ai ? ["available": true, "provider": "Google Gemini", "models": ["m"], "dataNotice": "n", "reason": NSNull()]
                                              : ["available": false, "provider": NSNull(), "models": [], "dataNotice": "none", "reason": "no key"])
        let s = CommunicationSession(defaults: nil)
        s.attach(c)
        return (c, s, { requests })
    }
    @MainActor private func reply(_ c: TacitClient, _ id: String, _ state: String, drafts: [String] = [], reason: String? = nil, focus: String? = nil) {
        emit(c, "respond_suggestion", "suggestion", ["requestId": id, "state": state, "intent": "clarify", "contextSource": "sample",
            "drafts": drafts.map { ["text": $0] }, "focus": focus ?? NSNull(), "model": "gemini-3.5-flash-lite", "reason": reason ?? NSNull(),
            "generationMs": 912, "removed": 0])
    }
    private func lastSuggest(_ r: [[String: Any]]) -> [String: Any]? { r.last { $0["type"] as? String == "respond_suggest" } }
    private func speaks(_ r: [[String: Any]]) -> [[String: Any]] { r.filter { $0["type"] as? String == "speak_typed" } }

    @MainActor func testSampleContextIsLabelledAndEditingItMakesItYours() {
        let (_, s, _) = setup(); let p = s.presence
        p.useSample()
        XCTAssertEqual(p.contextSource, .sample); XCTAssertEqual(p.contextSource.label, "SAMPLE")
        p.context += " Thoughts?"
        XCTAssertEqual(p.contextSource, .userProvided, "Edited sample text is no longer presented as sample")
        XCTAssertFalse(PresenceModel.liveCaptureAvailable)
    }

    @MainActor func testNeutralIntentRequestsImmediatelyAndReadyResultNeverSpeaks() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample()
        p.choose(.clarify, client: c)
        XCTAssertEqual(p.step, .working)
        let req = lastSuggest(requests())!
        XCTAssertEqual(req["intent"] as? String, "clarify"); XCTAssertEqual(req["contextSource"] as? String, "sample")
        XCTAssertEqual(req["context"] as? String, PresenceModel.sampleQuestion); XCTAssertNil(req["userPoint"])
        XCTAssertEqual(req["tone"] as? String, "brief")
        reply(c, req["requestId"] as! String, "generating")
        reply(c, req["requestId"] as! String, "ready", drafts: ["What does launch include?", "Which part of next week?"], focus: PresenceModel.sampleQuestion)
        XCTAssertEqual(p.step, .draft)
        XCTAssertEqual(p.draft, "What does launch include?"); XCTAssertEqual(p.origin, .suggestion(0))
        XCTAssertEqual(p.provenance, "Suggested by Gemini · 0.9 s"); XCTAssertEqual(p.focus, PresenceModel.sampleQuestion)
        XCTAssertTrue(speaks(requests()).isEmpty, "An AI suggestion is never spoken by itself")
    }

    @MainActor func testOpinionIntentAsksForTheUsersPointBeforeAnyRequest() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample()
        p.choose(.shareView, client: c)
        XCTAssertEqual(p.step, .point)
        XCTAssertNil(lastSuggest(requests()), "No request until the user states their own view")
        XCTAssertFalse(p.request(c)); XCTAssertEqual(p.step, .point); XCTAssertNotNil(p.problem)
        p.point = "yes, but only after testing"
        XCTAssertTrue(p.request(c))
        XCTAssertEqual(lastSuggest(requests())?["userPoint"] as? String, "yes, but only after testing")
    }

    @MainActor func testClarifyNeedsContext() {
        let (c, s, requests) = setup(); let p = s.presence
        p.choose(.clarify, client: c)
        XCTAssertEqual(p.step, .intent); XCTAssertNotNil(p.problem); XCTAssertNil(lastSuggest(requests()))
    }

    @MainActor func testStaleAndForeignResultsAreDropped() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample()
        p.choose(.clarify, client: c)
        let first = lastSuggest(requests())!["requestId"] as! String
        p.choose(.buyTime, client: c) // a newer request replaces the first
        let second = lastSuggest(requests())!["requestId"] as! String
        reply(c, first, "ready", drafts: ["Old answer for the old intent?"])
        XCTAssertEqual(p.step, .working, "Result for a replaced request is ignored")
        reply(c, "someone-else", "ready", drafts: ["Not ours"])
        XCTAssertEqual(p.step, .working)
        reply(c, second, "ready", drafts: ["Give me a moment, please."])
        XCTAssertEqual(p.draft, "Give me a moment, please.")
        reply(c, second, "ready", drafts: ["Duplicate late delivery"])
        XCTAssertEqual(p.draft, "Give me a moment, please.", "A finished request accepts nothing more")
    }

    @MainActor func testCancelSendsCancelAndDropsLateResult() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample(); p.choose(.clarify, client: c)
        let id = lastSuggest(requests())!["requestId"] as! String
        p.cancel(c)
        XCTAssertEqual(requests().last?["type"] as? String, "respond_cancel"); XCTAssertEqual(requests().last?["requestId"] as? String, id)
        XCTAssertEqual(p.step, .intent)
        reply(c, id, "ready", drafts: ["Too late"])
        XCTAssertTrue(p.draft.isEmpty)
    }

    @MainActor func testEscapeStepsBackThroughTheFlowThenHome() {
        let (c, s, _) = setup(); let p = s.presence
        s.surface = .assistance
        p.useSample(); p.choose(.shareView, client: c); p.point = "not yet"; p.request(c)
        XCTAssertEqual(s.escape(), .navigated); XCTAssertEqual(p.step, .point, "working → cancel → point")
        XCTAssertEqual(s.escape(), .navigated); XCTAssertEqual(p.step, .intent)
        XCTAssertEqual(s.escape(), .navigated); XCTAssertTrue(s.isHome)
        _ = c
    }

    @MainActor func testAINeverOverwritesWhatTheUserWrote() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample(); p.choose(.clarify, client: c)
        reply(c, lastSuggest(requests())!["requestId"] as! String, "ready", drafts: ["First idea?", "Second idea?"])
        p.draft = "First idea, but in my words?"
        XCTAssertEqual(p.origin, .edited)
        p.request(c) // suggest again
        reply(c, lastSuggest(requests())!["requestId"] as! String, "ready", drafts: ["Fresh option?"])
        XCTAssertEqual(p.draft, "First idea, but in my words?", "New suggestions arrive as options; the user's text stays")
        XCTAssertEqual(p.drafts, ["Fresh option?"])
        p.pick(0)
        XCTAssertEqual(p.draft, "Fresh option?"); XCTAssertEqual(p.ownDraft, "First idea, but in my words?")
        p.restoreOwnDraft()
        XCTAssertEqual(p.draft, "First idea, but in my words?"); XCTAssertEqual(p.origin, .edited)
    }

    @MainActor func testFailureKeepsWordsAndOffersRetry() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample(); p.choose(.shareView, client: c); p.point = "yes"; p.request(c)
        reply(c, lastSuggest(requests())!["requestId"] as! String, "failed", reason: "The AI took too long.")
        XCTAssertEqual(p.step, .draft); XCTAssertEqual(p.problem, "The AI took too long.")
        XCTAssertEqual(p.point, "yes", "Context and point are kept for a retry")
        XCTAssertTrue(p.request(c))
    }

    @MainActor func testNoAIFallsBackToLabelledStarterAndSendsNothing() {
        let (c, s, requests) = setup(ai: false); let p = s.presence
        p.useSample(); p.choose(.buyTime, client: c)
        XCTAssertNil(lastSuggest(requests()))
        XCTAssertEqual(p.step, .draft); XCTAssertEqual(p.draft, PresenceIntent.buyTime.starter); XCTAssertEqual(p.origin, .manual)
        XCTAssertFalse(p.assisted)
        XCTAssertTrue(s.speakPresence(using: c))
        XCTAssertNil(speaks(requests()).last?["assisted"], "Rule-written starter is not labelled as AI")
    }

    @MainActor func testSpeakSendsExactlyTheShownTextOnceWithProvenanceAndVoiceLock() {
        let (c, s, requests) = setup(); let p = s.presence
        emit(c, "voice_status", "status", ["revision": 7, "selected": ["voiceId": "v", "source": "user"], "effective": ["voiceId": "v", "label": "V"],
            "voices": [], "samples": [], "engine": ["state": "ready"], "applePersonalVoice": ["authorization": "denied", "usableInCalls": false, "reason": ""],
            "persisted": true])
        p.useSample(); p.choose(.clarify, client: c)
        reply(c, lastSuggest(requests())!["requestId"] as! String, "ready", drafts: ["What does launch include?"])
        p.draft = "What exactly does launch include?"
        s.surface = .assistance
        XCTAssertTrue(s.speakPresence(using: c))
        let sent = speaks(requests())
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent[0]["text"] as? String, "What exactly does launch include?")
        XCTAssertEqual(sent[0]["assisted"] as? Bool, true)
        XCTAssertEqual(sent[0]["outputAuthorizationId"] as? String, "voice"); XCTAssertEqual(sent[0]["outputGeneration"] as? Int, 4)
        XCTAssertNotNil(c.myVoice, "voice fixture parsed"); XCTAssertEqual(sent[0]["voiceRevision"] as? Int, 7, "Spoken only in the voice version the user saw")
        XCTAssertTrue(s.isHome, "Speak returns to the camera view")
        XCTAssertEqual(s.lastRequestedWords, "What exactly does launch include?")
        XCTAssertEqual(p.step, .intent); XCTAssertTrue(p.draft.isEmpty)
        XCTAssertEqual(p.context, PresenceModel.sampleQuestion, "The conversation context stays for the next turn")
    }

    @MainActor func testPausedVoiceOrDisconnectBlocksSpeakAndKeepsDraft() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample(); p.choose(.buyTime, client: c)
        reply(c, lastSuggest(requests())!["requestId"] as! String, "ready", drafts: ["One moment, please."])
        emit(c, "output_status", "status", ["state": "paused", "authorizationId": "voice", "generation": 5, "route": ["state": "ready"]])
        XCTAssertFalse(s.speakPresence(using: c)); XCTAssertEqual(p.draft, "One moment, please.")
        c.disconnectIsolatedTransport()
        XCTAssertFalse(s.speakPresence(using: c)); XCTAssertEqual(p.draft, "One moment, please.")
        XCTAssertTrue(speaks(requests()).isEmpty)
        XCTAssertNil(c.respondStatus, "Server-derived AI status is reset on disconnect")
    }

    @MainActor func testStopCancelsPendingSuggestion() {
        let (c, s, requests) = setup(); let p = s.presence
        p.useSample(); p.choose(.clarify, client: c)
        let id = lastSuggest(requests())!["requestId"] as! String
        c.stopEverything()
        XCTAssertTrue(requests().contains { $0["type"] as? String == "respond_cancel" && $0["requestId"] as? String == id })
        reply(c, id, "ready", drafts: ["After stop"])
        XCTAssertNotEqual(p.draft, "After stop")
    }

    @MainActor func testRealtimeModeDoesNotMakeSuggestionsSpeak() {
        let (c, s, requests) = setup(); let p = s.presence
        emit(c, "live_status", "status", ["state": "active", "authorizationId": "live", "generation": 2, "mode": "automatic", "unreviewed": true])
        p.useSample(); p.choose(.clarify, client: c)
        reply(c, lastSuggest(requests())!["requestId"] as! String, "ready", drafts: ["What does launch include?"])
        XCTAssertTrue(speaks(requests()).isEmpty)
    }

    @MainActor func testToneIsTheOnlyPersistedPresenceSetting() {
        let name = "tacit-presence-" + UUID().uuidString
        let d = UserDefaults(suiteName: name)!; defer { d.removePersistentDomain(forName: name) }
        let p = PresenceModel(defaults: d)
        XCTAssertEqual(p.tone, .brief)
        p.tone = .direct; p.context = "secret"; p.point = "private"
        let q = PresenceModel(defaults: d)
        XCTAssertEqual(q.tone, .direct); XCTAssertTrue(q.context.isEmpty); XCTAssertTrue(q.point.isEmpty)
    }
}
