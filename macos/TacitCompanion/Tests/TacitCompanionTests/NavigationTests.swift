import XCTest
@testable import TacitCompanion

/// The camera / recognition view is home; every other surface leads back to it.
final class NavigationTests: XCTestCase {
    @MainActor private func readyClient(_ sent: @escaping ([String: Any]) -> Void) -> TacitClient {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: sent))
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": "output_status", "status":
            ["state": "ready", "authorizationId": "V", "generation": 1, "route": ["state": "ready"]]]), encoding: .utf8)!)
        return c
    }

    @MainActor func testEscapeStepsBackTowardHomeBeforeCollapsing() {
        let s = CommunicationSession(defaults: nil)
        XCTAssertEqual(s.escape(), .collapse)
        for surface in [CommunicationSession.Surface.compose, .phrases, .voice, .assistance, .recovery] {
            s.surface = surface
            XCTAssertEqual(s.escape(), .navigated); XCTAssertTrue(s.isHome, "\(surface) → home")
        }
        s.surface = .customize
        XCTAssertEqual(s.escape(), .navigated); XCTAssertEqual(s.surface, .phrases)
        XCTAssertEqual(s.escape(), .navigated); XCTAssertTrue(s.isHome)
        XCTAssertEqual(s.escape(), .collapse)
    }

    @MainActor func testSpeakingAPhraseOrDraftReturnsHomeAndKeepsTheDraft() {
        var sent: [[String: Any]] = []
        let c = readyClient { sent.append($0) }
        let s = CommunicationSession(defaults: nil)
        s.surface = .phrases; s.phraseSelection = s.phrases[0].id
        XCTAssertTrue(s.speakSelection(using: c)); XCTAssertTrue(s.isHome)
        s.surface = .compose; c.typedDraft = "My own words"
        XCTAssertTrue(s.speakDraft(using: c)); XCTAssertTrue(s.isHome)
        XCTAssertEqual(c.typedDraft, "My own words", "draft kept for reuse")
    }

    @MainActor func testFailedSpeakStaysOnTheSurface() {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        let s = CommunicationSession(defaults: nil)
        s.surface = .compose; c.typedDraft = "unsent"
        XCTAssertFalse(s.speakDraft(using: c)); XCTAssertEqual(s.surface, .compose)
        s.surface = .phrases; s.phraseSelection = s.phrases[0].id
        XCTAssertFalse(s.speakSelection(using: c)); XCTAssertEqual(s.surface, .phrases)
    }

    @MainActor func testHoldMyTurnDoesNotNavigate() {
        let c = readyClient { _ in }
        let s = CommunicationSession(defaults: nil)
        s.surface = .compose
        XCTAssertTrue(s.holdTurn(using: c)); XCTAssertEqual(s.surface, .compose, "typing continues after Hold my turn")
    }
}
