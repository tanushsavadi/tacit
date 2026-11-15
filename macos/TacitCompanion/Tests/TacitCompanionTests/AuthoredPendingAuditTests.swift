import XCTest
@testable import TacitCompanion

/// Candidate-fix verification: user actions plus observable protocol events, no private-field assertions.
final class AuthoredPendingAuditTests: XCTestCase {
    @MainActor private func emit(_ c:TacitClient,_ type:String,_ key:String,_ value:[String:Any]) {
        c.handle(String(data:try! JSONSerialization.data(withJSONObject:["type":type,key:value]),encoding:.utf8)!)
    }
    @MainActor private func ready(_ c:TacitClient,_ generation:Int=1) {
        emit(c,"output_status","status",["state":"ready","authorizationId":"QA-voice","generation":generation,"route":["state":"ready"]])
    }
    @MainActor private func delivery(_ c:TacitClient,_ id:String,_ state:String,auth:String="QA-voice",generation:Int=1) {
        emit(c,"speech_delivery","delivery",["requestId":id,"source":"typed","state":state,"text":"same words",
            "outputAuthorizationId":auth,"generation":generation,"timings":[:]])
    }
    @MainActor func testPendingMessageSurvivesProgressAndUnrelatedOrStaleDelivery() async {
        var sent:[[String:Any]]=[]
        let c=TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{sent.append($0)}))
        ready(c); XCTAssertTrue(c.speakTyped("same words")); let id=sent[0]["requestId"] as! String
        for state in ["queued","synthesizing","routing"] {
            delivery(c,id,state); XCTAssertFalse(c.speakTyped("same words"))
        }
        delivery(c,"some-other-request","rendered"); XCTAssertFalse(c.speakTyped("same words"))
        delivery(c,id,"rendered",auth:"stale"); XCTAssertFalse(c.speakTyped("same words"))
        delivery(c,id,"rendered",generation:0); XCTAssertFalse(c.speakTyped("same words"))
        XCTAssertEqual(sent.count,1)
    }
    @MainActor func testMatchingTerminalAllowsLaterDeliberateRepeatWithoutAutomaticRetry() async {
        for terminal in ["rendered","failed","refused","interrupted"] {
            var sent:[[String:Any]]=[]
            let c=TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{sent.append($0)}))
            ready(c); XCTAssertTrue(c.speakTyped("same words")); let id=sent[0]["requestId"] as! String
            XCTAssertFalse(c.speakTyped("same words"))
            delivery(c,id,terminal)
            XCTAssertEqual(sent.count,1,"A terminal event must never automatically retry")
            XCTAssertTrue(c.speakTyped("same words"),"A later explicit repeat remains possible")
            XCTAssertNotEqual(sent[1]["requestId"] as? String,id)
        }
    }
    @MainActor func testHoldThenDifferentMessageAndFreshGenerationRemainUsable() async {
        var sent:[[String:Any]]=[]
        let c=TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{sent.append($0)}))
        ready(c); c.typedDraft="The longer message I am composing."
        XCTAssertTrue(c.speakTyped("One moment, I'm responding."))
        XCTAssertTrue(c.speakTyped(c.typedDraft))
        XCTAssertFalse(c.speakTyped("One moment, I'm responding."))
        c.output("pause")
        emit(c,"output_status","status",["state":"paused","authorizationId":"QA-voice","generation":2,"route":["state":"ready"]])
        c.output("resume"); ready(c,3)
        XCTAssertTrue(c.speakTyped("One moment, I'm responding."))
        let count=sent.count
        c.disconnectIsolatedTransport(); c.connect(); ready(c,3)
        XCTAssertEqual(sent.count,count,"Reconnection never replays unknown speech")
        XCTAssertEqual(c.typedDraft,"The longer message I am composing.")
    }
    @MainActor func testVoiceChangeAndQueueStatusNeverCreateANewPendingOperation() async {
        var sent:[[String:Any]]=[]
        let c=TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{sent.append($0)}))
        ready(c)
        emit(c,"voice_status","status",["revision":7,"selected":["voiceId":"qa:A"],"effective":["voiceId":"qa:A"]])
        XCTAssertTrue(c.speakTyped("same words"))
        let id=sent[0]["requestId"] as! String
        emit(c,"voice_status","status",["revision":8,"selected":["voiceId":"qa:B"],"effective":["voiceId":"qa:B"]])
        ready(c) // unsolicited queue/voice status is not a terminal acknowledgement
        XCTAssertFalse(c.speakTyped("  same words\n"))
        XCTAssertEqual(sent.count,1)
        XCTAssertEqual(sent[0]["voiceRevision"] as? Int,7)
        delivery(c,id,"rendered")
        XCTAssertTrue(c.speakTyped("same words"))
        XCTAssertEqual(sent[1]["voiceRevision"] as? Int,8)
        XCTAssertNotEqual(sent[1]["requestId"] as? String,id)
        delivery(c,id,"rendered") // duplicate terminal from the earlier operation
        XCTAssertFalse(c.speakTyped("same words"))
    }
    @MainActor func testSynchronousTerminalDoesNotLeaveAPhantomPendingOperation() async {
        var sent:[[String:Any]]=[]
        var c:TacitClient!
        c=TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{ request in
            sent.append(request)
            self.delivery(c,request["requestId"] as! String,"refused")
        }))
        ready(c)
        XCTAssertTrue(c.speakTyped("same words"))
        XCTAssertTrue(c.speakTyped("same words"))
        XCTAssertEqual(sent.count,2,"Only explicit actions retry a refused operation")
    }
    @MainActor func testUnknownDeliverySurvivesReconnectWithoutReplayAndNeedsExplicitSpeak() async {
        var sent:[[String:Any]]=[]
        let c=TacitClient(registerHotKey:false,connectOnInit:false,isolatedTransport:.init(send:{sent.append($0)}))
        ready(c); c.typedDraft="same words"
        XCTAssertTrue(c.speakTyped(c.typedDraft))
        let first=sent[0]["requestId"] as! String
        delivery(c,first,"routing")
        c.disconnectIsolatedTransport(); c.connect()
        XCTAssertFalse(c.speakTyped(c.typedDraft),"No authority until fresh server status")
        ready(c,3)
        XCTAssertEqual(sent.count,1)
        XCTAssertEqual(c.typedDraft,"same words")
        XCTAssertTrue(c.speakTyped(c.typedDraft),"Only this new explicit action retries")
        XCTAssertEqual(sent[1]["outputGeneration"] as? Int,3)
        delivery(c,first,"rendered")
        XCTAssertFalse(c.speakTyped(c.typedDraft),"Old connection/generation must not unlock the new operation")
    }
}
