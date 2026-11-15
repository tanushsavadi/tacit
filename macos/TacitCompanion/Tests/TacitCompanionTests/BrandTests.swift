import XCTest
import SwiftUI
@testable import TacitCompanion

final class BrandTests: XCTestCase {
    typealias M = LivingMark

    func testModesComeOnlyFromRealPresentationFacts() {
        XCTAssertEqual(M.mode(.ready), .idle)
        XCTAssertEqual(M.mode(.ready, connecting: true), .connecting)
        XCTAssertEqual(M.mode(.live), .live, "camera on but no lip motion reported: lips stay (nearly) closed")
        XCTAssertEqual(M.mode(.live, capturing: true), .articulating, "lips part only while the endpointer reports capture")
        XCTAssertEqual(M.mode(.processing, capturing: true), .processing)
        XCTAssertEqual(M.mode(.preparing), .preparing)
        XCTAssertEqual(M.mode(.speaking), .speaking)
        // Speaking motion requires server-reported first audio (presentation decides; the mark only follows).
        XCTAssertEqual(M.mode(LivingNotchPresentation.resolve(.init(delivery: "routing")).kind), .preparing)
        XCTAssertEqual(M.mode(LivingNotchPresentation.resolve(.init(delivery: "routing", firstAudio: true)).kind), .speaking)
        XCTAssertEqual(M.mode(LivingNotchPresentation.resolve(.init(delivery: "rendered", firstAudio: true)).kind), .idle)
    }

    func testOnlyActiveModesLoopAndStillModesAreTimeInvariant() {
        let looping: Set<M.Mode> = [.processing, .speaking] // short, event-bounded states only
        for mode in M.Mode.allCases {
            XCTAssertEqual(M.tick(mode) != nil, looping.contains(mode), "\(mode)")
            if !looping.contains(mode) {
                XCTAssertEqual(M.frame(mode, t: 1.234), M.frame(mode, t: 98.7), "\(mode) must not move once settled")
            }
            XCTAssertEqual(M.frame(mode, t: 0.1, sinceChange: 0.1, reduceMotion: true),
                           M.frame(mode, t: 57.3, sinceChange: 9, reduceMotion: true), "Reduce Motion: \(mode) is a still image")
        }
        XCTAssertNil(M.tick(.live), "a camera session can last a whole call: no continuous animation")
        XCTAssertNil(M.tick(.articulating))
        XCTAssertNotEqual(M.frame(.speaking, t: 0.2), M.frame(.speaking, t: 0.7))
    }

    func testEveryModeHasAColourIndependentShape() {
        struct Signature: Hashable { var separation: Int; var rotation: Int; var dot: Int; var cores: [String]; var voice: Int; var halo: Bool }
        func sig(_ m: M.Mode) -> Signature {
            let f = M.frame(m, t: 0, reduceMotion: true)
            return .init(separation: Int((f.separation * 10).rounded()), rotation: Int(f.rotation.rounded()), dot: Int((f.dotScale * 100).rounded()),
                         cores: f.cores.map { "\($0.core)" }, voice: f.voice.count, halo: f.halo != nil)
        }
        let all = M.Mode.allCases.map(sig)
        XCTAssertEqual(Set(all).count, all.count, "two states would differ only by colour")
    }

    func testVoiceArcsOnlyWhenTheOutputPathIsActiveAndStayInsideTheMark() {
        for mode in M.Mode.allCases where ![.preparing, .speaking].contains(mode) {
            XCTAssertTrue(M.frame(mode, t: 3).voice.isEmpty, "\(mode)")
        }
        for t in stride(from: 0.0, to: 3, by: 0.05) {
            for ring in M.frame(.speaking, t: t).voice {
                XCTAssertLessThanOrEqual(ring.radius + M.voiceStroke / 2, 12.001, "speaking waves must not clip in a 24-unit frame")
                XCTAssertGreaterThan(ring.radius - M.voiceStroke / 2, TacitBrand.ringRadius + TacitBrand.stroke / 2, "waves stay outside the lips")
            }
        }
        let separated = M.frame(.articulating, t: 0, reduceMotion: true).separation / 2 + TacitBrand.ringRadius + TacitBrand.stroke / 2
        XCTAssertLessThanOrEqual(separated, 12, "parted lips stay inside the frame")
    }

    func testRealtimeAndProblemsUseAmberNeverMint() {
        let amber = M.RGBA(TacitBrand.amber), mint = M.RGBA(TacitBrand.mint)
        XCTAssertEqual(M.frame(.speaking, realtime: true, t: 0).dot, amber)
        XCTAssertEqual(M.frame(.speaking, t: 0).dot, mint)
        XCTAssertEqual(M.frame(.attention, t: 0).arcs, amber)
        XCTAssertEqual(M.frame(.paused, t: 0).dot, amber)
        XCTAssertGreaterThan(M.frame(.idle, t: 0, highContrast: true).arcs.a, M.frame(.idle, t: 0).arcs.a)
    }

    func testBlendIsContinuousAndEndsExactlyOnTarget() {
        let a = M.frame(.processing, t: 0.7), b = M.frame(.review, t: 0, sinceChange: 2)
        XCTAssertEqual(M.Frame.mix(a, b, 1).separation, b.separation)
        XCTAssertEqual(M.Frame.mix(a, b, 1).rotation, b.rotation, accuracy: 1e-9)
        let mid = M.Frame.mix(a, b, 0.5)
        XCTAssertLessThanOrEqual(abs(mid.rotation), 90, "rotation unwinds along the shortest half-turn")
    }

    func testAnnouncementsAreSparseAndTruthful() {
        XCTAssertNil(M.announcement(from: .live, to: .articulating, title: ""))
        XCTAssertNil(M.announcement(from: .articulating, to: .processing, title: ""))
        XCTAssertNil(M.announcement(from: .review, to: .review, title: ""))
        XCTAssertEqual(M.announcement(from: .processing, to: .review, title: ""), "Words ready to review. Only Speak sends them.")
        XCTAssertFalse(M.announcement(from: .preparing, to: .speaking, title: "")!.lowercased().contains("heard"))
    }

    func testCompactWingsFitTheMarkControlsAndWordmarkWithoutGrowingTheNotch() {
        XCTAssertLessThanOrEqual(NotchLayout.rightWing, IslandGeometry.notchWing, "mark + Pause/Stop fit beside the cutout")
        XCTAssertLessThanOrEqual(NotchLayout.leftWing, IslandGeometry.notchWing)
        XCTAssertTrue((14...18).contains(NotchLayout.markSize))
        // Pill on non-notch displays stays 264 × 38 and holds wordmark + status + mark + Stop.
        let pill = IslandGeometry(frame: CGRect(x: 0, y: 0, width: 1920, height: 1080), safeTop: 0, leftArea: nil, rightArea: nil)
        XCTAssertEqual(pill.compactSize, CGSize(width: 264, height: 38))
        XCTAssertLessThan(18 + NotchLayout.wordmarkWidth + 17 + NotchLayout.markSlot + 8 + NotchLayout.control + 12, pill.compactSize.width - 80,
                          "leaves at least 80 pt for the status line")
        // Scaled-resolution notched displays: the wings are fixed points, the cutout comes from the screen.
        for (screen, cutout) in [(1512.0, 185.0), (1800, 185), (1352, 175), (1728, 194)] {
            let g = IslandGeometry(frame: CGRect(x: 0, y: 0, width: screen, height: 1000), safeTop: 32,
                leftArea: CGRect(x: 0, y: 968, width: (screen - cutout) / 2, height: 32),
                rightArea: CGRect(x: (screen + cutout) / 2, y: 968, width: (screen - cutout) / 2, height: 32))
            XCTAssertEqual((g.compactSize.width - g.cutoutWidth) / 2, IslandGeometry.notchWing, accuracy: 0.01)
        }
    }

    func testDeliveryTrackFollowsServerStatesAndNeverClaimsListeners() {
        func statuses(_ s: String, _ audio: Bool) -> [DeliveryTrack.Status] { DeliveryTrack.steps(state: s, firstAudio: audio).map(\.status) }
        XCTAssertEqual(statuses("queued", false), [.current, .pending, .pending])
        XCTAssertEqual(statuses("synthesizing", false), [.current, .pending, .pending])
        XCTAssertEqual(statuses("routing", false), [.done, .current, .pending])
        XCTAssertEqual(DeliveryTrack.steps(state: "routing", firstAudio: true)[1].label, "Playing")
        XCTAssertEqual(statuses("rendered", true), [.done, .done, .done])
        XCTAssertEqual(statuses("interrupted", true).last, .stopped)
        XCTAssertEqual(statuses("interrupted", false).first, .stopped)
        XCTAssertTrue(statuses("failed", false).contains(.failed))
        for s in ["queued", "routing", "rendered", "interrupted", "failed"] {
            let text = DeliveryTrack.summary(DeliveryTrack.steps(state: s, firstAudio: true)).lowercased()
            XCTAssertFalse(text.contains("heard") || text.contains("delivered to"), text)
        }
    }

    func testSVGAndDrawnPathsShareOneGeometry() {
        let shapes = TacitBrand.mark()
        XCTAssertEqual(shapes.count, 3)
        // Upper arc starts at the left mouth corner, ends at the right one (y-down: above the centre line).
        let upper = shapes[0].svg
        XCTAssertTrue(upper.hasPrefix("M"))
        XCTAssertTrue(upper.contains("A7.25 7.25 0 0 1"))
        let start = BrandShape.point(TacitBrand.center, TacitBrand.ringRadius, 204)
        XCTAssertLessThan(start.y, TacitBrand.center.y)
        let drawn = shapes[0].path().boundingRect
        XCTAssertEqual(drawn.minY, TacitBrand.center.y - TacitBrand.ringRadius, accuracy: 0.05)
        XCTAssertLessThan(drawn.maxY, TacitBrand.center.y, "upper lip never crosses the centre line")
        // Wordmark: drawn bounds (plus half stroke) sit inside the published view box.
        let union = TacitBrand.wordmark.map { $0.path().boundingRect }.reduce(CGRect.null) { $0.union($1) }
        let box = TacitBrand.wordBox, h = TacitBrand.wordStroke / 2
        XCTAssertGreaterThanOrEqual(union.minX - h, box.minX - 0.01)
        XCTAssertLessThanOrEqual(union.maxX + h, box.maxX + 0.01)
        XCTAssertGreaterThanOrEqual(union.minY + 0.02, box.minY)
        XCTAssertLessThanOrEqual(union.maxY + h, box.maxY + 0.01)
    }
}
