import XCTest
@testable import TacitCompanion

final class FlowTests: XCTestCase {
    @MainActor private func state(_ flow: FlowClient, epoch: Int = 1, version: Int = 1, serverText: String = "", relation: String? = nil, status: String = "capturing") {
        let before: [String: Any] = ["turnId": "t1", "revision": 1, "start": 0, "end": 30, "quote": "Could we meet Thursday at four?"]
        let after: [String: Any] = ["turnId": "t2", "revision": 1, "start": 0, "end": 25, "quote": "Actually Thursday at five."]
        let draft: [String: Any] = ["id": "d1", "text": serverText, "version": version, "anchor": before, "startedAtRevision": 1, "saved": true, "authorship": "typed", "acknowledged": []]
        let snapshot: [String: Any] = ["epoch": epoch, "revision": 2, "state": status, "source": "Selected Google Meet tab", "textConsent": true,
            "turns": [], "anchors": [], "changes": relation.map { [["id": "c1", "relation": $0, "before": before, "after": after, "detailBefore": "four", "detailAfter": "five"]] } ?? [],
            "drafts": status == "off" ? [] : [draft], "status": "Local capture", "semantic": "Gemini · source checked"]
        flow.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": "state", "snapshot": snapshot, "providerPolicyVerified": true]), encoding: .utf8)!)
    }
    @MainActor func testLateAnnotationNeverReplacesEditingTextOrSpeaks() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        state(f); f.edit("I would still prefer four."); state(f, relation: "correction")
        XCTAssertEqual(f.text, "I would still prefer four."); XCTAssertEqual(f.relevant?.detailAfter, "five")
        XCTAssertTrue(commands.isEmpty, "Annotations have no speech action")
    }
    @MainActor func testStopClearsAllLocalWordsAndSendsOnlyFlowStop() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        state(f); f.edit("Private reply"); f.stop()
        XCTAssertTrue(f.words.isEmpty); XCTAssertNil(f.activeID); XCTAssertEqual(commands.last?["type"] as? String, "stop")
    }
    @MainActor func testOldEpochCannotResurrectContext() {
        let f = FlowClient(); state(f, epoch: 4, status: "off"); state(f, epoch: 3)
        XCTAssertEqual(f.snapshot?.state, "off"); XCTAssertTrue(f.words.isEmpty)
    }
    @MainActor func testPausePreservesWordsWithoutSpeech() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        state(f); f.edit("My unfinished reply"); f.pause(); state(f, epoch: 2, status: "paused")
        XCTAssertEqual(f.text, "My unfinished reply"); XCTAssertFalse(commands.contains { ($0["type"] as? String)?.hasPrefix("speak") == true })
    }
    @MainActor func testVersionedFlushUsesUnchangedLocalText() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        state(f); f.edit("I disagree"); f.flush(); f.edit("I disagree, only after testing."); f.flush()
        XCTAssertEqual(commands.count, 1, "One edit in flight at a time")
        state(f, version: 1, serverText: ""); f.flush()
        XCTAssertEqual(commands.count, 1, "An unrelated snapshot must not clear an in-flight edit")
        state(f, version: 2, serverText: "I disagree"); f.flush()
        XCTAssertEqual(commands.last?["text"] as? String, "I disagree, only after testing.")
        XCTAssertEqual(commands.last?["version"] as? Int, 2)
    }
    @MainActor func testRecoveryPreservesSavedAnswerAndDoesNotSpeak() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        state(f); f.edit("Thursday is impossible for me."); f.recovery("rejoin")
        XCTAssertEqual(f.text, "Thursday is impossible for me."); XCTAssertEqual(f.recoveryText, "I wanted to return to your earlier question.")
        XCTAssertTrue(commands.isEmpty)
    }
    @MainActor func testConsentCannotBeInferredFromConnection() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        f.start(participants: false, textConsent: false); f.start(participants: true, textConsent: true)
        XCTAssertTrue(commands.isEmpty)
        f.start(participants: true, textConsent: false); XCTAssertEqual(commands.count, 1)
    }
    @MainActor func testAuthoredFlowSpeakUsesExistingVoiceGenerationAndExactWords() {
        let f = FlowClient(); f.testSend = { _ in }; state(f); f.edit("I still prefer four.")
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        c.handle("{\"type\":\"output_status\",\"status\":{\"state\":\"ready\",\"authorizationId\":\"voice\",\"generation\":4,\"route\":{\"state\":\"ready\"}}}")
        XCTAssertTrue(f.speak(using: c)); XCTAssertEqual(sent.last?["type"] as? String, "speak_typed")
        XCTAssertEqual(sent.last?["text"] as? String, "I still prefer four."); XCTAssertEqual(sent.last?["outputGeneration"] as? Int, 4)
        XCTAssertFalse(f.speak(using: c), "Existing duplicate-send protection stays active")
    }
    @MainActor func testGlobalStopAndPauseReachFlow() {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        var commands: [[String: Any]] = []; c.flow.testSend = { commands.append($0) }
        c.pauseEverything(); XCTAssertEqual(commands.last?["type"] as? String, "pause")
        c.stopEverything(); XCTAssertEqual(commands.last?["type"] as? String, "stop")
    }
    @MainActor func testExplicitMeetingImportPreservesExistingWorkAndLabelsAuthorship() {
        let p = PresenceModel(defaults: nil)
        p.useSelectedMeetingContext("Could we meet Thursday?")
        XCTAssertEqual(p.contextSource, .meetingSelected); XCTAssertNil(p.intent); XCTAssertTrue(p.point.isEmpty)
        p.useSelectedMeetingContext("Different question?"); XCTAssertEqual(p.context, "Could we meet Thursday?")
        p.context += " My edit"; XCTAssertEqual(p.contextSource, .userProvided)
    }
    @MainActor func testGlobalStopRejectsQueuedOldFlowSnapshotImmediately() {
        let f = FlowClient(); f.testSend = { _ in }; state(f); f.edit("Do not restore this."); f.stop(); state(f)
        XCTAssertNil(f.snapshot); XCTAssertTrue(f.words.isEmpty)
    }
    @MainActor func testContinuationDoesNotBecomeAnUnnecessaryChangeWarning() {
        let f = FlowClient(); state(f, relation: "continuation"); XCTAssertNil(f.relevant)
    }
}
