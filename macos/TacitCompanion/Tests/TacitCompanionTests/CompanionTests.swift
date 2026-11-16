import XCTest
@testable import TacitCompanion

final class CompanionTests: XCTestCase {
    func testNotchedDisplayUsesMeasuredGapAndTopEdge() {
        let g = IslandGeometry(frame: CGRect(x: 1512, y: -200, width: 1512, height: 982), safeTop: 37,
            leftArea: CGRect(x: 1512, y: 745, width: 656, height: 37),
            rightArea: CGRect(x: 2368, y: 745, width: 656, height: 37))
        XCTAssertTrue(g.hasNotch); XCTAssertEqual(g.cutoutWidth, 200)
        XCTAssertEqual(g.compactSize.width, 276)
        XCTAssertEqual(g.frame(size: g.compactSize).midX, 2268)
        XCTAssertEqual(g.frame(size: g.expandedSize).maxY, 782)
    }
    func testNonNotchAndSmallDisplayStayOnScreen() {
        let g = IslandGeometry(frame: CGRect(x: -800, y: 1200, width: 800, height: 600), safeTop: 0, leftArea: nil, rightArea: nil)
        XCTAssertFalse(g.hasNotch); XCTAssertEqual(g.compactSize.width, 116)
        XCTAssertEqual(g.frame(size: g.expandedSize).maxY, 1794)
        XCTAssertTrue(g.screenFrame.contains(g.frame(size: g.expandedSize)))
    }
    func testInvalidAuxiliaryAreasUseFallback() {
        let g = IslandGeometry(frame: CGRect(x: 0, y: 0, width: 1000, height: 800), safeTop: 37, leftArea: nil, rightArea: nil)
        XCTAssertFalse(g.hasNotch)
    }

    @MainActor func emit(_ c: TacitClient, _ type: String, _ key: String, _ value: [String: Any]) {
        let data = try! JSONSerialization.data(withJSONObject: ["type": type, key: value])
        c.handle(String(data: data, encoding: .utf8)!)
    }
    @MainActor func live(_ c: TacitClient, _ state: String = "active", auth: String = "live", generation: Int = 1) {
        emit(c, "live_status", "status", ["state":state,"authorizationId":auth,"generation":generation])
    }
    @MainActor func hypothesis(_ c: TacitClient, id: String = "one", auth: String = "live", extras: [String: Any] = [:]) {
        emit(c, "recognition_hypothesis", "hypothesis", ["utteranceId":id,"authorizationId":auth,"rawText":"REAL TEST WORDS", "decision":"shown","recognitionMs":800.0].merging(extras) { _, b in b })
    }
    @MainActor func output(_ c: TacitClient, generation: Int = 1, state: String = "ready") {
        emit(c, "output_status", "status", ["state":state,"authorizationId":"voice","generation":generation])
    }
    @MainActor func delivery(_ c: TacitClient, generation: Int = 1, auth: String = "voice", firstAudio: Bool = false) {
        emit(c, "speech_delivery", "delivery", ["requestId":"speech","outputAuthorizationId":auth,"generation":generation,
            "source":"typed","state":"routing","timings":firstAudio ? ["firstAudioAt":1234.0] : [:]])
    }

    @MainActor func testRecognitionRequiresNonNilCurrentActiveAuthorization() async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false)
        emit(c, "recognition_hypothesis", "hypothesis", ["utteranceId":"nil-auth","rawText":"must not show"])
        XCTAssertNil(c.lastHypothesis)
        live(c); hypothesis(c, auth: "other"); XCTAssertNil(c.lastHypothesis)
        hypothesis(c); XCTAssertEqual(c.lastHypothesis?.text, "REAL TEST WORDS")
        live(c, "paused", generation: 2); XCTAssertNil(c.lastHypothesis)
        hypothesis(c, id: "during-pause"); XCTAssertNil(c.lastHypothesis)
        live(c, generation: 3); hypothesis(c, id: "during-pause"); XCTAssertNil(c.lastHypothesis)
        hypothesis(c, id: "new"); XCTAssertNotNil(c.lastHypothesis)
        live(c, "off", auth: "", generation: 4); XCTAssertNil(c.lastHypothesis)
    }
    @MainActor func testHypothesisDedupReplacementAndMeasuredMetadata() async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false); live(c)
        hypothesis(c, extras: ["stages":["endpoint_wait":480.0,"upload":2.0],"gate":["mouth_brightness":72.5],
            "phraseMatch":["phrase":"EXAMPLE","accepted":true,"rule":"v1"]])
        XCTAssertEqual(c.lastHypothesis?.endToResultMs, 1282)
        XCTAssertEqual(c.lastHypothesis?.brightness, 72.5)
        XCTAssertEqual(c.lastHypothesis?.phrase?.text, "EXAMPLE")
        hypothesis(c, extras: ["rawText":"DUPLICATE"]); XCTAssertEqual(c.lastHypothesis?.text,"REAL TEST WORDS")
        live(c, auth:"replacement", generation:2); XCTAssertNil(c.lastHypothesis)
        hypothesis(c); XCTAssertNil(c.lastHypothesis)
    }
    @MainActor func testMissingTimingsAreNotInventedAndStaleRefusalsNotRevealed() async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false); live(c)
        hypothesis(c); XCTAssertNil(c.lastHypothesis?.endToResultMs)
        hypothesis(c, id:"stale", extras:["decision":"abstained","reason":"Dropped: Live was paused, interrupted or ended."])
        XCTAssertEqual(c.lastHypothesis?.id,"one")
    }
    @MainActor func testVoiceDeliveryScopedToOutputAuthorizationAndGeneration() async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false); output(c)
        delivery(c, auth:"old"); XCTAssertNil(c.lastDelivery)
        delivery(c, generation:0); XCTAssertNil(c.lastDelivery)
        delivery(c); XCTAssertNotNil(c.lastDelivery); XCTAssertNil(c.lastDelivery?.firstAudioAt)
        delivery(c, firstAudio:true); XCTAssertEqual(c.lastDelivery?.firstAudioAt,1234)
        output(c, generation:2, state:"paused"); XCTAssertNil(c.lastDelivery)
        delivery(c, generation:2); XCTAssertNil(c.lastDelivery)
        output(c, generation:3); delivery(c); XCTAssertNil(c.lastDelivery)
    }
    @MainActor func testReconnectClearsAllServerDerivedState() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false); live(c); hypothesis(c); output(c); delivery(c)
        c.connect()
        XCTAssertNil(c.lastHypothesis); XCTAssertNil(c.lastDelivery); XCTAssertNil(c.live); XCTAssertNil(c.output)
    }
    @MainActor func testTypedSpeechCannotSendWhilePaused() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false); output(c, state:"paused")
        XCTAssertFalse(c.speakTyped("Typed words")); XCTAssertEqual(c.notice,"Turn voice output on first.")
    }
    @MainActor func testRouteReadersDoNotClaimACallOrRemoteAudibility() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false)
        emit(c,"output_status","status",["state":"off","route":["state":"ready","deviceName":"BlackHole","readers":[]]])
        XCTAssertTrue(c.routeDetail.contains("No app is reading"))
        emit(c,"output_status","status",["state":"off","route":["state":"ready","deviceName":"BlackHole"]])
        XCTAssertEqual(c.routeDetail,"Calling-app use is unknown")
    }
    @MainActor func testCompactLayoutIsBoundedAndNeverDashboardSized() async {
        let g = IslandGeometry(frame:CGRect(x:0,y:0,width:1512,height:982),safeTop:37,
            leftArea:CGRect(x:0,y:945,width:656,height:37),rightArea:CGRect(x:856,y:945,width:656,height:37))
        XCTAssertEqual(g.expandedSize.width,460); XCTAssertEqual(g.expandedSize.height,350)
        XCTAssertLessThan(g.expandedSize.height,360)
    }
    @MainActor func testReviewedCandidateProvenanceExpiryAndGeneration() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false); live(c)
        let text = "EXACT WORDS"
        hypothesis(c,extras:["generation":1,"reviewExpiresAt":Date().timeIntervalSince1970 * 1000 + 10000,
            "reviewCandidates":[["kind":"raw","index":0,"text":text,"textHash":TacitClient.textHash(text)]]])
        XCTAssertNil(c.reviewDraft.candidate, "A model event must never preselect words")
        XCTAssertTrue(c.reviewIsCurrent(connected:true,now:Date().timeIntervalSince1970 * 1000))
        XCTAssertFalse(c.reviewIsCurrent(connected:false,now:0))
        XCTAssertFalse(c.reviewIsCurrent(connected:true,now:Date().timeIntervalSince1970 * 1000 + 20000))
        live(c,generation:2); XCTAssertFalse(c.reviewIsCurrent(connected:true,now:0))
        hypothesis(c,id:"old-generation",extras:["generation":1]); XCTAssertNil(c.lastHypothesis)
    }
    @MainActor func testDelayedChoiceFromOlderRenderNeverBindsToNewerUtterance() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false); live(c); output(c)
        let text = "SAME WORDS"; let now = Date().timeIntervalSince1970 * 1000
        let cand: [String: Any] = ["kind":"raw","index":0,"text":text,"textHash":TacitClient.textHash(text)]
        let review: [String: Any] = ["generation":1,"reviewExpiresAt":now + 60000,"reviewCandidates":[cand]]
        hypothesis(c,id:"A",extras:review)
        let rendered = c.lastHypothesis!.candidates[0]
        hypothesis(c,id:"B",extras:review)   // identical candidate value, different utterance
        c.chooseReview(rendered, of:"A", editing:false, connected:true, now:now)
        XCTAssertNil(c.reviewDraft.candidate, "A's control must not select B's words")
        c.chooseReview(rendered, of:"B", editing:false, connected:true, now:now)
        XCTAssertEqual(c.reviewDraft.utteranceID,"B")
    }
    @MainActor func testReviewInvalidatedClearsChoiceUntilNewerResult() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false); live(c); output(c)
        let text = "WORDS A"; let now = Date().timeIntervalSince1970 * 1000
        let review: [String: Any] = ["generation":1,"reviewExpiresAt":now + 60000,
            "reviewCandidates":[["kind":"raw","index":0,"text":text,"textHash":TacitClient.textHash(text)]]]
        hypothesis(c,id:"A",extras:review)
        c.chooseReview(c.lastHypothesis!.candidates[0], of:"A", editing:true, connected:true, now:now)
        XCTAssertNotNil(c.reviewDraft.candidate)
        // Wrong authorization / generation / same utterance: ignored.
        emit2(c, ["type":"review_invalidated","authorizationId":"other","generation":1,"utteranceId":"B"])
        emit2(c, ["type":"review_invalidated","authorizationId":"live","generation":0,"utteranceId":"B"])
        emit2(c, ["type":"review_invalidated","authorizationId":"live","generation":1,"utteranceId":"A"])
        XCTAssertTrue(c.reviewIsCurrent(connected:true,now:now)); XCTAssertNotNil(c.reviewDraft.candidate)
        emit2(c, ["type":"review_invalidated","authorizationId":"live","generation":1,"utteranceId":"B"])
        XCTAssertNil(c.reviewDraft.candidate)
        XCTAssertFalse(c.reviewIsCurrent(connected:true,now:now))
        c.chooseReview(c.lastHypothesis!.candidates[0], of:"A", editing:false, connected:true, now:now)
        XCTAssertNil(c.reviewDraft.candidate, "an invalidated review cannot be chosen again")
        XCTAssertFalse(c.speakReviewed())
        hypothesis(c,id:"B",extras:review)
        XCTAssertTrue(c.reviewIsCurrent(connected:true,now:now))
    }
    @MainActor func emit2(_ c: TacitClient, _ m: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: m), encoding: .utf8)!)
    }
    @MainActor func testCandidateHashMismatchNeverCreatesReviewChoice() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false); live(c)
        hypothesis(c,extras:["generation":1,"reviewExpiresAt":9999999999999.0,
            "reviewCandidates":[["kind":"raw","index":0,"text":"WORDS","textHash":"wrong"]]])
        XCTAssertEqual(c.lastHypothesis?.candidates.count,0)
        XCTAssertFalse(c.reviewIsCurrent(connected:true,now:0))
    }
    @MainActor func testReviewDraftOnlyChangesOnExplicitSelectionAndPreservesExactCorrection() async {
        var draft = ReviewDraft(); XCTAssertNil(draft.candidate); XCTAssertEqual(draft.text,"")
        let candidate = TacitClient.ReviewCandidate(kind:"raw",index:0,text:"EXACT WORDS",textHash:TacitClient.textHash("EXACT WORDS"))
        draft.choose(candidate,utteranceID:"current",outputGeneration:4,editing:false)
        XCTAssertEqual(draft.text,"EXACT WORDS"); XCTAssertFalse(draft.editing)
        draft.choose(candidate,utteranceID:"current",outputGeneration:4,editing:true)
        draft.text = "My own correction."
        XCTAssertTrue(draft.editing); XCTAssertEqual(draft.candidate?.index,0)
        XCTAssertEqual(TacitClient.textHash("abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    func testGlobalShortcutsOnlyDispatchTheirOwnEvent() {
        XCTAssertTrue(HotKey.matches(signature:0x5441_4354,id:18,expectedID:18))
        XCTAssertFalse(HotKey.matches(signature:0x5441_4354,id:18,expectedID:48))
        XCTAssertFalse(HotKey.matches(signature:0x1234,id:18,expectedID:18))
    }

    @MainActor func testNewOutputGenerationClearsAnOldControlNotice() async {
        let c = TacitClient(registerHotKey:false,connectOnInit:false)
        c.notice = "An old control notice"
        output(c,generation:4)
        XCTAssertNil(c.notice)
    }

}
