import XCTest
@testable import TacitCompanion

final class MotionTests: XCTestCase {
    private func frame(_ width: CGFloat, _ height: CGFloat) -> CGRect {
        CGRect(x: 800 - width / 2, y: 1000 - height, width: width, height: height)
    }

    func testExpansionConvergesWithFixedTopCenterAndNoOvershoot() {
        let compact = frame(180, 34), expanded = frame(420, 258)
        var spring = IslandFrameSpring(frame: compact)
        spring.retarget(expanded, animated: true, reduceMotion: false)
        var previous = compact
        for _ in 0..<120 {
            spring.advance(by: 1.0 / 60)
            XCTAssertEqual(spring.frame.midX, 800, accuracy: 0.00001)
            XCTAssertEqual(spring.frame.maxY, 1000, accuracy: 0.00001)
            XCTAssertGreaterThanOrEqual(spring.frame.width, previous.width)
            XCTAssertGreaterThanOrEqual(spring.frame.height, previous.height)
            XCTAssertLessThanOrEqual(spring.frame.width, expanded.width)
            XCTAssertLessThanOrEqual(spring.frame.height, expanded.height)
            previous = spring.frame
        }
        XCTAssertTrue(spring.isSettled)
        XCTAssertEqual(spring.frame, expanded)
    }

    func testReversalStartsAtPresentedSizeAndImmediatelyMovesTowardNewTarget() {
        let compact = frame(180, 34), expanded = frame(420, 258)
        var spring = IslandFrameSpring(frame: compact)
        spring.retarget(expanded, animated: true, reduceMotion: false)
        spring.advance(by: 0.08)
        let interrupted = spring.frame
        XCTAssertGreaterThan(interrupted.width, compact.width)
        XCTAssertLessThan(interrupted.width, expanded.width)
        spring.retarget(compact, animated: true, reduceMotion: false)
        XCTAssertEqual(spring.frame, interrupted)
        spring.advance(by: 1.0 / 60)
        XCTAssertLessThan(spring.frame.width, interrupted.width)
        for _ in 0..<120 { spring.advance(by: 1.0 / 60) }
        XCTAssertEqual(spring.frame, compact)
    }

    func testRapidRetargetingRemainsWithinEachNewEnvelope() {
        var spring = IslandFrameSpring(frame: frame(180, 34))
        for index in 0..<200 {
            let target = index.isMultiple(of: 2) ? frame(420, 258) : frame(180, 34)
            let before = spring.frame
            spring.retarget(target, animated: true, reduceMotion: false)
            spring.advance(by: index.isMultiple(of: 3) ? 1.0 / 120 : 1.0 / 60)
            XCTAssertTrue(spring.frame.width.isFinite)
            XCTAssertGreaterThanOrEqual(spring.frame.width, min(before.width, target.width))
            XCTAssertLessThanOrEqual(spring.frame.width, max(before.width, target.width))
            XCTAssertGreaterThanOrEqual(spring.frame.height, min(before.height, target.height))
            XCTAssertLessThanOrEqual(spring.frame.height, max(before.height, target.height))
        }
        for _ in 0..<120 { spring.advance(by: 1.0 / 60) }
        XCTAssertTrue(spring.isSettled)
    }

    func testReduceMotionInterruptsImmediately() {
        var spring = IslandFrameSpring(frame: frame(180, 34))
        let target = frame(420, 258)
        spring.retarget(target, animated: true, reduceMotion: false)
        spring.advance(by: 0.08)
        spring.retarget(target, animated: true, reduceMotion: true)
        XCTAssertEqual(spring.frame, target)
        XCTAssertTrue(spring.isSettled)
        XCTAssertNil(CommunicationMotion.expansion(reduceMotion: true))
        XCTAssertNil(CommunicationMotion.feedback(reduceMotion: true))
        XCTAssertEqual(CommunicationMotion.pressScale(isPressed: true, reduceMotion: true), 1)
    }

    func testNonanimatedPlacementAndDisplayChangeAreImmediate() {
        var spring = IslandFrameSpring(frame: frame(180, 34))
        let expanded = frame(420, 258)
        spring.retarget(expanded, animated: false, reduceMotion: false)
        XCTAssertEqual(spring.frame, expanded)
        let otherDisplay = CGRect(x: -1500, y: 500, width: 180, height: 34)
        spring.retarget(otherDisplay, animated: true, reduceMotion: false)
        XCTAssertEqual(spring.frame, otherDisplay)
    }

    func testExactSolutionIsIndependentOfTickRate() {
        var oneStep = IslandFrameSpring(frame: frame(180, 34))
        oneStep.retarget(frame(420, 258), animated: true, reduceMotion: false)
        var manySteps = oneStep
        oneStep.advance(by: 0.2)
        for _ in 0..<24 { manySteps.advance(by: 1.0 / 120) }
        XCTAssertEqual(oneStep.frame.width, manySteps.frame.width, accuracy: 0.00001)
        XCTAssertEqual(oneStep.frame.height, manySteps.frame.height, accuracy: 0.00001)
    }

    func testRepeatedTargetDoesNotRestartOrLoseForwardMomentum() {
        let target = frame(420, 258)
        var baseline = IslandFrameSpring(frame: frame(180, 34))
        baseline.retarget(target, animated: true, reduceMotion: false)
        baseline.advance(by: 0.08)
        var repeated = baseline
        repeated.retarget(target, animated: true, reduceMotion: false)
        baseline.advance(by: 0.08)
        repeated.advance(by: 0.08)
        XCTAssertEqual(repeated.frame, baseline.frame)
    }

    func testInvalidFramesAndTimesLeaveValidStateUntouched() {
        var spring = IslandFrameSpring(frame: frame(180, 34))
        let before = spring.frame
        spring.retarget(CGRect(x: 0, y: 0, width: -1, height: 10), animated: true, reduceMotion: false)
        XCTAssertEqual(spring.frame, before)
        spring.retarget(frame(420, 258), animated: true, reduceMotion: false)
        for elapsed in [Double.nan, Double.infinity, -1, 0] { spring.advance(by: elapsed) }
        XCTAssertEqual(spring.frame, before)
    }

    func testFinishDiscardsMomentumAndNextAnimationStartsCleanly() {
        var spring = IslandFrameSpring(frame: frame(180, 34))
        spring.retarget(frame(420, 258), animated: true, reduceMotion: false)
        spring.advance(by: 0.07)
        spring.finish()
        XCTAssertEqual(spring.frame, frame(420, 258))
        spring.retarget(frame(180, 34), animated: true, reduceMotion: false)
        spring.advance(by: 0.05)
        XCTAssertLessThan(spring.frame.width, 420)
        XCTAssertGreaterThan(spring.frame.width, 180)
    }

    func testSuspensionFinishesWithoutNonfiniteArithmetic() {
        var spring = IslandFrameSpring(frame: frame(180, 34))
        spring.retarget(frame(420, 258), animated: true, reduceMotion: false)
        spring.advance(by: Double.greatestFiniteMagnitude)
        XCTAssertEqual(spring.frame, frame(420, 258))
        XCTAssertTrue(spring.isSettled)
    }
}
