import XCTest
@testable import TacitCompanion
final class NotchHoverTests: XCTestCase {
    func testHoverRestoresWorkspaceAndReviewWithoutOwningDrafts() {
        var hover = NotchHoverState()
        hover.retract(expanded: true, reviewing: true)
        XCTAssertTrue(hover.restoreWorkspace); XCTAssertTrue(hover.restoreReview)
        hover.retract(expanded: false, reviewing: false)
        XCTAssertTrue(hover.restoreWorkspace); XCTAssertTrue(hover.restoreReview)
        hover.explicitCollapse()
        XCTAssertFalse(hover.restoreWorkspace); XCTAssertFalse(hover.restoreReview)
    }
    @MainActor func testEditorFocusDoesNotImplicitlyPinWorkspace() {
        let client = TacitClient(registerHotKey: false, connectOnInit: false)
        let island = IslandController(client: client, registerHotKey: false)
        island.focusEditor()
        XCTAssertTrue(island.expanded); XCTAssertFalse(island.pinned)
        island.togglePin(); XCTAssertTrue(island.pinned)
    }
    @MainActor func testHoverAwayAndBackKeepsSurfaceAndAuthoredText() async throws {
        let client = TacitClient(registerHotKey: false, connectOnInit: false)
        let session = CommunicationSession(defaults: nil)
        let island = IslandController(client: client, communication: session, registerHotKey: false)
        client.typedDraft = "Keep these exact words."
        island.showCommunication(.compose); island.hover(false)
        try await Task.sleep(nanoseconds: 360_000_000)
        XCTAssertFalse(island.expanded); XCTAssertEqual(session.surface, .compose)
        island.hover(true)
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertTrue(island.expanded); XCTAssertEqual(client.typedDraft, "Keep these exact words.")
        island.collapse(); island.hover(true)
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertFalse(island.expanded, "Explicit collapse returns to Peek until deliberately opened")
    }
}
