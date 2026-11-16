import XCTest
@testable import TacitCompanion

final class LivingNotchTests: XCTestCase {
    func testNotchedSurfacesSitInTheNotchBandAndPillsClearTheMenuBar() {
        for frame in [CGRect(x: 0, y: 0, width: 1512, height: 982), CGRect(x: -1800, y: 900, width: 1800, height: 1100), CGRect(x: 2500, y: -600, width: 800, height: 600)] {
            for notched in [true, false] {
                let g = IslandGeometry(frame: frame, safeTop: notched ? 37 : 0,
                    leftArea: notched ? CGRect(x: frame.minX, y: frame.maxY - 37, width: frame.width / 2 - 100, height: 37) : nil,
                    rightArea: notched ? CGRect(x: frame.midX + 100, y: frame.maxY - 37, width: frame.width / 2 - 100, height: 37) : nil)
                for size in [g.compactSize, g.compactSize(discreet: true), g.peekSize, g.expandedSize] {
                    let panel = g.frame(size: size)
                    XCTAssertTrue(frame.contains(panel))
                    if notched { XCTAssertEqual(panel.maxY, frame.maxY, "notched: drops down from the top edge") }
                    else { XCTAssertLessThanOrEqual(panel.maxY, frame.maxY - 30) }
                    XCTAssertEqual(panel.midX, frame.midX)
                }
                if notched {
                    // The branding wing to the left of the cutout must fit "tacit".
                    XCTAssertGreaterThanOrEqual((g.compactSize.width - g.cutoutWidth) / 2, 60)
                    XCTAssertEqual(g.crownHeight, g.compactSize.height)
                }
                XCTAssertGreaterThanOrEqual(g.compactSize.height, 32)
                XCTAssertLessThanOrEqual(g.compactSize.height, 40)
                XCTAssertGreaterThan(g.peekSize.height, g.compactSize.height)
                XCTAssertLessThan(g.peekSize.height, g.expandedSize.height)
            }
        }
    }

    func testLargeMenuBarAlsoStaysClearOnNonNotchDisplays() {
        let g = IslandGeometry(frame: CGRect(x: 0, y: 0, width: 1920, height: 1080), safeTop: 0,
            leftArea: nil, rightArea: nil, menuBarHeight: 40)
        XCTAssertEqual(g.frame(size: g.compactSize).maxY, 1034)
    }

    @MainActor func testHoverOnlyRevealsPeekAndLeavesTheWorkspaceClosed() async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        let island = IslandController(client: c, registerHotKey: false)
        island.hover(true)
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertTrue(island.peeking)
        XCTAssertFalse(island.expanded, "Passing the pointer nearby must not open the full workspace")
        island.hover(false)
        try? await Task.sleep(nanoseconds: 450_000_000)
        XCTAssertFalse(island.peeking)
    }

    func testSpeakingRequiresFirstAudioAndCompletionNeverPretendsToKeepSpeaking() {
        for stage in ["queued", "synthesizing", "routing"] {
            XCTAssertEqual(LivingNotchPresentation.resolve(.init(delivery: stage)).kind, .preparing)
        }
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(delivery: "routing", firstAudio: true)).kind, .speaking)
        for stage in ["rendered", "interrupted", nil] {
            XCTAssertFalse(LivingNotchPresentation.resolve(.init(delivery: stage, firstAudio: true)).busy)
        }
    }

    func testRealCameraAndProcessingFactsDoNotInventCapture() {
        XCTAssertEqual(LivingNotchPresentation.resolve(.init()).title, "Ready to communicate")
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(live: "active")).title, "Live session active")
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(camera: .tracking, live: "active")).title, "Camera live")
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(camera: .capturing, live: "active")).title, "Reading your lips…")
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(camera: .tracking, processing: true)).kind, .processing)
    }

    func testRealtimeNeverPresentsWordsForApprovalAndAlwaysLabelsUnreviewed() {
        let p = LivingNotchPresentation.resolve(.init(camera: .tracking, live: "active", realtime: true, review: true))
        XCTAssertNotEqual(p.kind, .review)
        XCTAssertTrue(p.realtime)
        XCTAssertEqual(p.detail, "REAL-TIME · Unreviewed")
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(review: true)).kind, .review)
    }

    func testErrorsAndPauseHaveReadableRecoveryStates() {
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(camera: .denied)).title, "Camera needs permission")
        XCTAssertTrue(LivingNotchPresentation.resolve(.init(camera: .interrupted("Device removed"))).problem)
        XCTAssertTrue(LivingNotchPresentation.resolve(.init(routeUnavailable: true)).problem)
        XCTAssertTrue(LivingNotchPresentation.resolve(.init(connected: false)).problem)
        XCTAssertEqual(LivingNotchPresentation.resolve(.init(live: "paused")).kind, .paused)
    }

    func testActionableReviewAndSpeechSurviveTransientTimeoutAndPointerLeave() {
        XCTAssertTrue(LivingNotchVisibility.peek(expanded: false, hovered: false, review: true, busy: false, problem: false, transient: false))
        XCTAssertTrue(LivingNotchVisibility.peek(expanded: false, hovered: false, review: false, busy: true, problem: false, transient: false))
        XCTAssertFalse(LivingNotchVisibility.peek(expanded: false, hovered: false, review: false, busy: false, problem: false, transient: false))
        XCTAssertFalse(LivingNotchVisibility.peek(expanded: true, hovered: true, review: true, busy: true, problem: true, transient: true))
    }

    @MainActor func testCollapseAndHoverNeverAuthorizeSpeechOrLoseDrafts() async {
        var sent: [[String: Any]] = []
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { sent.append($0) }))
        let island = IslandController(client: c, registerHotKey: false)
        c.typedDraft = "My unfinished message"
        c.reviewDraft.editing = true; c.reviewDraft.text = "My correction"
        island.focusEditor()
        XCTAssertFalse(island.pinned, "Editor focus must allow hover retraction; pinning is an explicit choice")
        island.collapse(); island.hover(true); island.hover(false)
        try? await Task.sleep(nanoseconds: 420_000_000)
        XCTAssertFalse(island.expanded)
        XCTAssertEqual(c.typedDraft, "My unfinished message")
        XCTAssertEqual(c.reviewDraft.text, "My correction")
        XCTAssertTrue(sent.isEmpty)
    }
}
