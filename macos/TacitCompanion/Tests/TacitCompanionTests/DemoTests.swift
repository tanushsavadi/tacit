import XCTest
@testable import TacitCompanion
final class DemoTests: XCTestCase {
    func testDeterministicCorrectionUsesUserSuppliedMeaning() {
        XCTAssertEqual(DemoCorrection.make(previous: "I can send the report on Monday.", correction: "Tuesday instead."), "Sorry, I meant Tuesday, not Monday.")
        XCTAssertEqual(DemoCorrection.make(previous: "Monday or Wednesday", correction: "Tuesday instead."), "Sorry, a correction: Tuesday instead.")
    }
    @MainActor func testDemoAdvanceCarriesExpectedStepAndDoesNotSpeak() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        f.demoAction("next")
        XCTAssertEqual(commands.last?["type"] as? String, "demo")
        XCTAssertEqual(commands.last?["expectedStep"] as? Int, 0)
        XCTAssertFalse(commands.contains { ($0["type"] as? String)?.hasPrefix("speak") == true })
    }
    @MainActor func testDemoProviderChoiceIsExplicit() {
        let f = FlowClient(); var commands: [[String: Any]] = []; f.testSend = { commands.append($0) }
        f.demoMode(analysis: "deterministic")
        XCTAssertEqual(commands.last?["analysis"] as? String, "deterministic")
        XCTAssertNil(commands.last?["text"])
    }
}

extension DemoTests {
    @MainActor func testRecoverableTextSurvivesReconnectButNeverReappearsAfterStop() {
        let f = FlowClient(); f.testSend = { _ in }
        let snapshot = "{\"type\":\"state\",\"snapshot\":{\"epoch\":1,\"revision\":1,\"state\":\"capturing\",\"source\":\"Demo conversation\",\"textConsent\":false,\"turns\":[],\"anchors\":[],\"changes\":[],\"drafts\":[{\"id\":\"d\",\"text\":\"\",\"version\":1,\"anchor\":null,\"startedAtRevision\":1,\"saved\":false,\"authorship\":\"typed\",\"acknowledged\":[]}],\"status\":\"demo\",\"semantic\":\"off\"}}"
        f.handle(snapshot); f.edit("Keep my exact words"); f.disconnect(preserveWords: true)
        XCTAssertEqual(f.orphanedText, "Keep my exact words")
        XCTAssertNil(f.activeID)
        f.stop(); XCTAssertNil(f.orphanedText)
    }
}
