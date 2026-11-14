import XCTest
@testable import TacitRouteCore

final class PlaybackQueueTests: XCTestCase {
    func testFifoStartFinishOrder() {
        var q = PlaybackQueue()
        XCTAssertEqual(q.enqueue("a").events, [.started(id: "a")])
        XCTAssertEqual(q.enqueue("b").events, [])
        XCTAssertEqual(q.playedBack("a", epoch: 0), [.finished(id: "a"), .started(id: "b")])
        XCTAssertEqual(q.playedBack("b", epoch: 0), [.finished(id: "b")])
        XCTAssertTrue(q.scheduled.isEmpty)
    }

    func testStopInterruptsAllAndIgnoresLateCompletions() {
        var q = PlaybackQueue()
        _ = q.enqueue("a"); _ = q.enqueue("b")
        XCTAssertEqual(q.stopAll(reason: "stop"), [.interrupted(id: "a", reason: "stop"), .interrupted(id: "b", reason: "stop")])
        XCTAssertEqual(q.playedBack("a", epoch: 0), [], "completion from the old epoch must not report finished")
        let r = q.enqueue("c")
        XCTAssertEqual(r.epoch, 1)
        XCTAssertEqual(r.events, [.started(id: "c")])
    }

    func testDuplicateAndCapacityRejected() {
        var q = PlaybackQueue(capacity: 2)
        _ = q.enqueue("a"); _ = q.enqueue("b")
        XCTAssertEqual(q.enqueue("a").events, [.rejected(id: "a", reason: "duplicate id")])
        XCTAssertEqual(q.enqueue("c").events, [.rejected(id: "c", reason: "queue full (2)")])
    }

    func testDeviceLossFailsClosedUntilRestored() {
        var q = PlaybackQueue()
        _ = q.enqueue("a")
        XCTAssertEqual(q.setAvailable(false, reason: "device removed"), [.interrupted(id: "a", reason: "device removed")])
        XCTAssertEqual(q.enqueue("b").events, [.rejected(id: "b", reason: "device removed")])
        _ = q.setAvailable(true)
        XCTAssertEqual(q.enqueue("b").events, [.started(id: "b")])
    }
}
