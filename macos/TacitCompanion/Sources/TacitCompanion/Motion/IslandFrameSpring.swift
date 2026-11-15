import Foundation
import CoreGraphics

/// Original, deterministic window-size spring. Screen coordinates use AppKit's bottom-left origin.
/// Critically damped, with endpoint bounds: resizing never exceeds the requested envelope.
struct IslandFrameSpring {
    private(set) var frame: CGRect
    private(set) var target: CGRect
    private var width: Axis
    private var height: Axis

    init(frame: CGRect) {
        self.frame = frame
        target = frame
        width = Axis(value: frame.width)
        height = Axis(value: frame.height)
    }

    var isSettled: Bool { frame == target }

    mutating func retarget(_ target: CGRect, animated: Bool, reduceMotion: Bool) {
        guard Self.isValid(target) else { return }
        self.target = target
        // Moving between displays is placement, not a flying island animation.
        guard animated && !reduceMotion,
              abs(frame.midX - target.midX) < 0.5,
              abs(frame.maxY - target.maxY) < 0.5 else {
            finish()
            return
        }
        width.retarget(target.width)
        height.retarget(target.height)
        updateFrame()
    }

    mutating func advance(by seconds: TimeInterval) {
        guard seconds.isFinite, seconds > 0, !isSettled else { return }
        // Avoid replaying motion after suspension and keep the analytic expression bounded.
        if seconds > 1 { finish(); return }
        width.advance(by: seconds)
        height.advance(by: seconds)
        updateFrame()
    }

    mutating func finish() {
        width = Axis(value: target.width)
        height = Axis(value: target.height)
        frame = target
    }

    static func isValid(_ frame: CGRect) -> Bool {
        [frame.origin.x, frame.origin.y, frame.size.width, frame.size.height].allSatisfy { $0.isFinite }
            && frame.size.width > 0 && frame.size.height > 0
    }

    private mutating func updateFrame() {
        frame = CGRect(x: target.midX - width.value / 2, y: target.maxY - height.value,
                       width: width.value, height: height.value)
        if width.value == target.width && height.value == target.height { frame = target }
    }

    private struct Axis {
        var value: CGFloat
        private var velocity: CGFloat = 0
        private var destination: CGFloat
        // About 95% of the distance in 0.24 s; settling depends on distance.
        private let frequency: CGFloat = 20

        init(value: CGFloat) { self.value = value; destination = value }

        mutating func retarget(_ target: CGFloat) {
            destination = target
            // Preserve useful momentum; discard momentum away from a newly reversed target.
            // This prevents overshoot beyond the current window, keeping content inside its envelope.
            if velocity * (destination - value) <= 0 { velocity = 0 }
        }

        mutating func advance(by seconds: TimeInterval) {
            let previous = value
            let displacement = value - destination
            let coefficient = velocity + frequency * displacement
            let decay = exp(-frequency * seconds)
            value = destination + (displacement + coefficient * seconds) * decay
            velocity = (velocity - frequency * coefficient * seconds) * decay
            let lower = min(previous, destination), upper = max(previous, destination)
            if value < lower || value > upper { value = min(max(value, lower), upper); velocity = 0 }
            if abs(value - destination) < 0.15 && abs(velocity) < 0.5 {
                value = destination; velocity = 0
            }
        }
    }
}
