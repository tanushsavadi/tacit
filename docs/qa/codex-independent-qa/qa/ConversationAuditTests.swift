import XCTest
import AppKit
@testable import TacitCompanion

/// Independent audit. Synthetic protocol events and recorder transport only; no real speech/recognition.
final class ConversationAuditTests: XCTestCase {
    @MainActor private func emit(_ c: TacitClient, _ type: String, _ key: String, _ body: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": type, key: body]), encoding: .utf8)!)
    }
    @MainActor private func ready(_ c: TacitClient, generation: Int = 4, liveGeneration: Int = 2) {
        emit(c, "output_status", "status", ["state":"ready", "authorizationId":"QA-output", "generation":generation,
            "voice":"QA voice A", "voiceId":"qa:A", "voiceRevision":7, "queued":0, "route":["state":"ready"]])
        emit(c, "live_status", "status", ["state":"active", "authorizationId":"QA-live", "generation":liveGeneration])
    }
    @MainActor private func result(_ c: TacitClient, _ id: String, generation: Int = 2) {
        let text = "QA exact words for " + id
        emit(c, "recognition_hypothesis", "hypothesis", ["utteranceId":id,"authorizationId":"QA-live","generation":generation,
            "decision":"shown","rawText":text,"reviewExpiresAt":Date().timeIntervalSince1970 * 1000 + 60000,
            "reviewCandidates":[["index":0,"kind":"raw","text":text,"textHash":TacitClient.textHash(text)]]])
    }

    @MainActor func testRepeatedRecognitionDoesNotOverwriteEditingAndNewHeaderPreservesReference() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
        ready(c); result(c,"A")
        c.chooseReview(c.lastHypothesis!.candidates[0],of:"A",editing:true)
        c.reviewDraft.text = "My unfinished correction"
        result(c,"A")
        XCTAssertEqual(c.reviewDraft.text,"My unfinished correction")
        c.handle("{\"type\":\"review_invalidated\",\"authorizationId\":\"QA-live\",\"generation\":2,\"utteranceId\":\"B\"}")
        XCTAssertFalse(c.speakReviewed())
        XCTAssertEqual(c.preservedCorrection,"My unfinished correction")
        result(c,"B")
        XCTAssertNil(c.reviewDraft.candidate)
        XCTAssertTrue(sent.isEmpty)
    }

    @MainActor func testRapidPauseResumeRejectsOldResultsAndKeepsTypedDraftAcrossReconnect() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
        ready(c); c.typedDraft = "My draft must survive."
        for i in 0..<20 {
            c.pauseEverything()
            XCTAssertFalse(c.speakTyped("must not leave"))
            emit(c,"output_status","status",["state":"paused","authorizationId":"QA-output","generation":5+i*2,"route":["state":"ready"]])
            emit(c,"live_status","status",["state":"paused","authorizationId":"QA-live","generation":3+i*2])
            c.output("resume")
            c.live("resume")
            ready(c,generation:6+i*2,liveGeneration:4+i*2)
            XCTAssertTrue(c.canSpeakAuthored,"A real resume acknowledgment must restore authored speech")
        }
        c.disconnectIsolatedTransport()
        XCTAssertFalse(c.speakTyped(c.typedDraft)); XCTAssertNil(c.output); XCTAssertNil(c.lastHypothesis)
        c.connect(); XCTAssertFalse(c.canSpeakAuthored)
        ready(c); result(c,"old",generation:1)
        XCTAssertFalse(c.canReviewCurrent)
        XCTAssertEqual(c.typedDraft,"My draft must survive.")
        XCTAssertFalse(sent.contains { $0["type"] as? String == "speak_typed" })
    }

    @MainActor func testNativeWireContractsExportForBackendReplay() async throws {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
        let s = CommunicationSession(defaults:nil)
        ready(c); result(c,"A")
        let draft = "A longer approved user message that I was writing before holding my turn."
        c.typedDraft = draft
        XCTAssertTrue(s.holdTurn(using:c)); XCTAssertEqual(c.typedDraft,draft)
        XCTAssertTrue(s.speakDraft(using:c))
        s.phraseSelection = s.phrases[1].id
        XCTAssertTrue(s.speakSelection(using:c)); XCTAssertNil(c.reviewDraft.candidate)
        c.chooseReview(c.lastHypothesis!.candidates[0],of:"A")
        XCTAssertTrue(c.speakReviewed()); XCTAssertFalse(c.speakReviewed())
        let count = sent.count
        c.stopEverything(); XCTAssertFalse(c.speakTyped("revoked")); XCTAssertFalse(c.speakReviewed())
        XCTAssertEqual(sent.count,count+2)
        if let path = ProcessInfo.processInfo.environment["TACIT_QA_WIRE_PATH"] {
            try JSONSerialization.data(withJSONObject:["source":"SYNTHETIC native action recorder; no audio", "requests":sent],options:[.sortedKeys,.prettyPrinted]).write(to:URL(fileURLWithPath:path))
        }
    }

    @MainActor func testAdversarialRapidAuthoredSpeakMustNotDuplicatePendingMessage() async {
        var captures: [String: [[String:Any]]] = [:]
        for mode in ["draft", "hold", "phrase"] {
            var sent: [[String: Any]] = []
            let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
            let s = CommunicationSession(defaults:nil)
            ready(c); c.typedDraft = "One intended message"; s.phraseSelection = s.phrases[0].id
            for _ in 0..<3 {
                if mode == "draft" { s.speakDraft(using:c) }
                if mode == "hold" { s.holdTurn(using:c) }
                if mode == "phrase" { s.speakSelection(using:c) }
            }
            XCTAssertEqual(sent.filter { $0["type"] as? String == "speak_typed" }.count,1,
                "P1 QA-01: \(mode) accepts repeated clicks before any acknowledgment")
            captures[mode] = sent
        }
        if let path = ProcessInfo.processInfo.environment["TACIT_QA_WIRE_PATH"] {
            try! JSONSerialization.data(withJSONObject:captures,options:[.sortedKeys,.prettyPrinted]).write(to:URL(fileURLWithPath:path+".rapid.json"))
        }
    }

    @MainActor func testVoiceRevisionMustAccompanyApprovalAfterVoiceStatus() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
        ready(c)
        emit(c,"voice_status","status",["revision":7,"selected":["voiceId":"qa:A"],"effective":["voiceId":"qa:A","label":"QA voice A"]])
        XCTAssertTrue(c.speakTyped("Voice-bound typed approval"))
        result(c,"A"); c.chooseReview(c.lastHypothesis!.candidates[0],of:"A"); XCTAssertTrue(c.speakReviewed())
        for r in sent {
            XCTAssertEqual(r["voiceRevision"] as? Int,7,"P1 QA-02: approval omits the voice revision displayed to the user")
        }
    }

    @MainActor func testSubmittedCorrectionSurvivesDisconnectionAsReadOnlyReference() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
        ready(c); result(c,"A")
        c.chooseReview(c.lastHypothesis!.candidates[0],of:"A",editing:true)
        c.reviewDraft.text = "This correction cost real effort to write."
        XCTAssertTrue(c.speakReviewed())
        c.disconnectIsolatedTransport(); c.connect()
        XCTAssertEqual(c.preservedCorrection,"This correction cost real effort to write.",
            "P1 QA-03: a requested correction vanishes if the connection fails before delivery is known")
        XCTAssertTrue(c.typedDraft.isEmpty,"Never reclassify recognition as typed speech")
        XCTAssertFalse(c.speakReviewed(),"Recovery is reference only; never authorize stale speech")
    }

    @MainActor func testDisconnectDuringDeliveryClearsSpeakingStateAndNeverResends() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ sent.append($0) }))
        ready(c); c.typedDraft = "An intentionally retained draft."
        XCTAssertTrue(c.speakTyped(c.typedDraft))
        let id = sent[0]["requestId"] as! String
        emit(c,"speech_delivery","delivery",["requestId":id,"text":c.typedDraft,"source":"typed","state":"routing",
            "outputAuthorizationId":"QA-output","generation":4,"timings":["firstAudioAt":1]])
        XCTAssertNotNil(c.lastDelivery?.firstAudioAt)
        c.disconnectIsolatedTransport(); XCTAssertNil(c.lastDelivery)
        c.stopEverything(); XCTAssertTrue(c.notice?.contains("could not be confirmed") == true)
        c.connect(); ready(c)
        XCTAssertEqual(sent.count,1,"No automatic resend when delivery outcome is unknown")
        XCTAssertEqual(c.typedDraft,"An intentionally retained draft.")
    }

    @MainActor func testMeasuredHiddenWindowReversalSettlesAndStopsTimer() async throws {
        _ = NSApplication.shared
        let window = NSWindow(contentRect:NSRect(x:100,y:100,width:260,height:35),styleMask:.borderless,backing:.buffered,defer:false)
        let animator = IslandFrameAnimator()
        final class Samples { var times: [Double] = [] }
        let samples = Samples()
        let observer = NotificationCenter.default.addObserver(forName:NSWindow.didResizeNotification,object:window,queue:.main) { _ in
            samples.times.append(ProcessInfo.processInfo.systemUptime)
        }
        defer { NotificationCenter.default.removeObserver(observer); animator.cancel(); window.orderOut(nil) }
        let collapsed = NSRect(x:200,y:400,width:260,height:35), expanded = NSRect(x:100,y:85,width:460,height:350)
        for i in 0..<20 {
            animator.setFrame(i % 2 == 0 ? collapsed : expanded,on:window,animated:true)
            try await Task.sleep(nanoseconds:16_000_000)
        }
        try await Task.sleep(nanoseconds:900_000_000)
        XCTAssertEqual(window.frame.width,expanded.width,accuracy:0.1)
        XCTAssertEqual(window.frame.height,expanded.height,accuracy:0.1)
        XCTAssertFalse(window.isKeyWindow); XCTAssertFalse(window.isVisible)
        let settledCount = samples.times.count
        try await Task.sleep(nanoseconds:150_000_000)
        XCTAssertEqual(samples.times.count,settledCount,"No idle resize timer should remain")
        let intervals = zip(samples.times.dropFirst(),samples.times).map { ($0 - $1) * 1000 }.sorted()
        if let path = ProcessInfo.processInfo.environment["TACIT_QA_WIRE_PATH"] {
            let data: [String:Any] = ["measuredAt":ISO8601DateFormatter().string(from:Date()),
                "scope":"Hidden NSWindow resize notifications; NOT compositor frames, FPS or user input latency",
                "count":settledCount,"p50Ms":intervals.isEmpty ? 0 : intervals[intervals.count/2],
                "p95Ms":intervals.isEmpty ? 0 : intervals[min(intervals.count-1,Int(Double(intervals.count)*0.95))],
                "settled":true,"timerStopped":samples.times.count == settledCount]
            try JSONSerialization.data(withJSONObject:data,options:[.sortedKeys,.prettyPrinted]).write(to:URL(fileURLWithPath:path+".motion.json"))
        }
    }
}
