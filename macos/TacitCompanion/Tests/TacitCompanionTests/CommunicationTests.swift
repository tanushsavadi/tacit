import XCTest
@testable import TacitCompanion

final class CommunicationTests: XCTestCase {
    @MainActor private func fixture(_ c: TacitClient, _ type: String, _ key: String, _ values: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type":type, key:values]), encoding: .utf8)!)
    }
    @MainActor private func ready(_ c: TacitClient) {
        fixture(c, "output_status", "status", ["state":"ready", "authorizationId":"voice", "generation":4,
            "route":["state":"ready", "deviceName":"OFFLINE TEST ONLY"]])
        fixture(c, "live_status", "status", ["state":"active", "authorizationId":"live", "generation":2])
    }
    @MainActor private func review(_ c: TacitClient, id: String = "A") {
        fixture(c, "recognition_hypothesis", "hypothesis", ["utteranceId":id, "authorizationId":"live", "generation":2,
            "decision":"shown", "rawText":"RAW exact WORDS", "reviewExpiresAt":Date().timeIntervalSince1970 * 1000 + 60000,
            "reviewCandidates":[["kind":"raw", "index":0, "text":"RAW exact WORDS", "textHash":TacitClient.textHash("RAW exact WORDS")]]])
    }
    @MainActor func testWholeReviewedFlowOnlySendsDedicatedExactOnceRequest() async {
        var requests: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false, connectOnInit:false, isolatedTransport:.init(send: { requests.append($0) }))
        ready(c); review(c)
        XCTAssertTrue(requests.isEmpty, "A result must never cause speech")
        XCTAssertFalse(c.speakReviewed(), "No default selection")
        let candidate = c.lastHypothesis!.candidates[0]
        c.chooseReview(candidate, of:"A")
        XCTAssertTrue(requests.isEmpty, "Selecting is not sending")
        XCTAssertTrue(c.speakReviewed()); XCTAssertFalse(c.speakReviewed())
        XCTAssertEqual(requests.count,1)
        let request = requests[0]
        XCTAssertEqual(request["type"] as? String,"speak_reviewed")
        XCTAssertEqual(request["text"] as? String,"RAW exact WORDS")
        XCTAssertEqual(request["textHash"] as? String,candidate.textHash)
        XCTAssertEqual(request["outputGeneration"] as? Int,4)
        XCTAssertEqual(request["liveGeneration"] as? Int,2)
        XCTAssertEqual(request["utteranceId"] as? String,"A")
        XCTAssertEqual(request["candidate"] as? String,"raw")
    }
    @MainActor func testInlineCorrectionProvenanceAndRecoveryNeverBecomeTypedSpeech() async {
        var requests: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false, connectOnInit:false, isolatedTransport:.init(send: { requests.append($0) }))
        ready(c); review(c)
        c.chooseReview(c.lastHypothesis!.candidates[0], of:"A", editing:true)
        c.reviewDraft.text = "My exact correction — café."
        review(c,id:"B")
        XCTAssertEqual(c.preservedCorrection,"My exact correction — café.")
        XCTAssertTrue(c.typedDraft.isEmpty)
        XCTAssertFalse(c.speakReviewed())
        c.chooseReview(c.lastHypothesis!.candidates[0], of:"B", editing:true)
        c.reviewDraft.text = "My current correction."
        XCTAssertTrue(c.speakReviewed())
        XCTAssertEqual(requests.last?["candidate"] as? String,"edited")
        XCTAssertEqual(requests.last?["textHash"] as? String,TacitClient.textHash("My current correction."))
        XCTAssertFalse(requests.contains { $0["type"] as? String == "speak_typed" })
    }
    @MainActor func testHoldPhraseLeavesDraftAndReviewIntactAndRequiresCurrentOutput() async {
        var requests: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false, connectOnInit:false, isolatedTransport:.init(send: { requests.append($0) }))
        let session = CommunicationSession(defaults:nil)
        ready(c); review(c); c.typedDraft = "A thought I am still writing"
        c.chooseReview(c.lastHypothesis!.candidates[0],of:"A")
        XCTAssertTrue(session.holdTurn(using:c))
        XCTAssertEqual(requests.last?["text"] as? String,"One moment, I'm responding.")
        XCTAssertEqual(requests.last?["type"] as? String,"speak_typed")
        XCTAssertEqual(c.typedDraft,"A thought I am still writing")
        XCTAssertEqual(c.reviewDraft.utteranceID,"A")
        c.pauseEverything()
        let count = requests.count
        XCTAssertFalse(c.canSpeakAuthored)
        XCTAssertFalse(session.holdTurn(using:c), "Pause blocks before its acknowledgment")
        XCTAssertEqual(requests.count,count)
        XCTAssertFalse(c.speakReviewed())
        XCTAssertEqual(c.typedDraft,"A thought I am still writing")
    }
    @MainActor func testStopAndOutputReplacementBlockStaleChoice() async {
        var requests: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false, connectOnInit:false, isolatedTransport:.init(send: { requests.append($0) }))
        ready(c); review(c)
        c.chooseReview(c.lastHypothesis!.candidates[0],of:"A")
        c.stopEverything()
        XCTAssertEqual(requests.compactMap { $0["action"] as? String },["end","stop"])
        XCTAssertFalse(c.speakReviewed()); XCTAssertFalse(c.canSpeakAuthored)
        fixture(c,"output_status","status",["state":"ready","authorizationId":"new","generation":5,"route":["state":"ready"]])
        XCTAssertNil(c.reviewDraft.candidate)
        XCTAssertFalse(c.speakReviewed())
    }
    @MainActor func testSavedPhrasePersistenceValidationAndNoDraftOrContextRetention() async {
        let name = "tacit-tests-" + UUID().uuidString
        let defaults = UserDefaults(suiteName:name)!
        defer { defaults.removePersistentDomain(forName:name) }
        let session = CommunicationSession(defaults:defaults)
        var phrases = session.phrases; phrases[0].text = "That's so me!"
        session.context = "Private meeting context"; session.assistanceDraft = "A private draft"
        XCTAssertNil(session.phraseSelection)
        XCTAssertTrue(session.save(hold:"Just a second, my thought is coming.",phrases:phrases))
        let restored = CommunicationSession(defaults:defaults)
        XCTAssertEqual(restored.phrases[0].text,"That's so me!")
        XCTAssertEqual(restored.holdPhrase,"Just a second, my thought is coming.")
        XCTAssertTrue(restored.context.isEmpty); XCTAssertTrue(restored.assistanceDraft.isEmpty)
        XCTAssertNil(restored.lastRequestedWords)
        XCTAssertFalse(session.save(hold:" ",phrases:phrases))
        XCTAssertFalse(PersonalPhrase.valid(String(repeating:"😀",count:251)))
        XCTAssertEqual(CommunicationSession(defaults:defaults).phrases[0].text,"That's so me!")
    }
    @MainActor func testAssistanceOnlyOffersEditableScaffoldsAndRevocableSuppliedContext() async {
        let session = CommunicationSession(defaults:nil)
        XCTAssertFalse(session.contextProvider.liveCaptureAvailable)
        XCTAssertNil(session.contextProvider.context(from:"  "))
        session.context = "How should we approach this?"
        session.choosePath(.thought)
        XCTAssertEqual(session.assistanceDraft,"I'd like to add ")
        XCTAssertEqual(session.contextProvider.context(from:session.context)?.source,.userProvided)
        session.assistanceDraft += "my own opinion."
        session.clearContext()
        XCTAssertTrue(session.context.isEmpty); XCTAssertTrue(session.assistanceDraft.isEmpty); XCTAssertNil(session.selectedPath)
    }
    @MainActor func testAssistanceMergeAndPhraseActionsUseSameViewModelAsInterface() async {
        var requests: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send: { requests.append($0) }))
        let session = CommunicationSession(defaults:nil)
        ready(c)
        XCTAssertFalse(session.speakSelection(using:c))
        session.phraseSelection = session.phrases[2].id
        XCTAssertTrue(session.speakSelection(using:c))
        XCTAssertEqual(requests.last?["text"] as? String,session.phrases[2].text)
        c.typedDraft = "My own point."
        session.assistanceDraft = "My chosen new wording."
        let before = requests.count
        XCTAssertTrue(session.useAssistanceDraft(in:c))
        XCTAssertEqual(c.typedDraft,"My own point.\nMy chosen new wording.")
        XCTAssertEqual(requests.count,before, "Using a starter only edits a draft")
        session.assistanceDraft = String(repeating:"x",count:500)
        let preserved = c.typedDraft
        XCTAssertFalse(session.useAssistanceDraft(in:c))
        XCTAssertEqual(c.typedDraft,preserved)
        c.disconnectIsolatedTransport()
        XCTAssertFalse(session.speakDraft(using:c))
        XCTAssertEqual(requests.count,before)
        XCTAssertEqual(c.typedDraft,preserved)
    }

    func testStatePriorityNeverInventsVisualActivityOrReadinessFromSocket() {
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true)),.off)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,liveEnabled:true)),.ready)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,review:true)),.reviewAvailable)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,editing:true,review:true)),.editing)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,delivery:"routing",firstAudio:false)),.synthesizing)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,delivery:"routing",firstAudio:true)),.speaking)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,paused:true,review:true)),.paused)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:false,delivery:"routing",firstAudio:true)),.disconnected)
        XCTAssertEqual(CommunicationState.resolve(.init(connected:true,assistance:true)),.assistance)
    }
}
