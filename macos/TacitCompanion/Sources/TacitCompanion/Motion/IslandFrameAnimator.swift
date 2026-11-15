import AppKit
import QuartzCore

/// Own one per island panel. Only changes the frame; never changes key status, hit testing or order.
@MainActor
final class IslandFrameAnimator {
    private weak var window: NSWindow?
    private var spring: IslandFrameSpring?
    private var timer: Timer?
    private var generation: UInt64 = 0
    private var lastTick: CFTimeInterval = 0
    private var accessibilityObserver: NSObjectProtocol?

    init() {
        accessibilityObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
                self?.finish()
            }
        }
    }

    deinit {
        // Timer closures hold self weakly. Main-runloop removal also works if the final release
        // occurs off-main; no dead timer is left polling a deallocated animator.
        let pendingTimer = timer
        if Thread.isMainThread { pendingTimer?.invalidate() }
        else {
            let cleanup = DispatchWorkItem { pendingTimer?.invalidate() }
            DispatchQueue.main.async(execute: cleanup)
        }
        if let accessibilityObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(accessibilityObserver)
        }
    }

    func setFrame(_ target: CGRect, on window: NSWindow, animated: Bool) {
        guard IslandFrameSpring.isValid(target) else { return }
        if self.window !== window || spring == nil {
            cancel()
            self.window = window
            spring = IslandFrameSpring(frame: window.frame)
        }
        // Repeated state notifications must not reset an in-flight animation's velocity or clock.
        spring?.retarget(target, animated: animated,
                         reduceMotion: NSWorkspace.shared.accessibilityDisplayShouldReduceMotion)
        guard let spring else { return }
        if spring.isSettled {
            window.setFrame(spring.frame, display: true)
            cancel()
            return
        }
        guard timer == nil else { return }
        lastTick = CACurrentMediaTime()
        generation &+= 1
        let expectedGeneration = generation
        // Match the display's advertised maximum when available. This is a run-loop timer,
        // not a display link: scheduling cadence is not a rendered-frame-rate guarantee.
        let refreshRate = min(120, max(60, window.screen?.maximumFramesPerSecond ?? 60))
        let timer = Timer(timeInterval: 1.0 / Double(refreshRate), repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick(generation: expectedGeneration) }
        }
        timer.tolerance = 0.001
        self.timer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    /// Freeze the current presentation frame. Call when hiding/closing the panel.
    func cancel() {
        generation &+= 1
        timer?.invalidate()
        timer = nil
        spring = nil
        window = nil
    }

    private func tick(generation expectedGeneration: UInt64) {
        guard generation == expectedGeneration else { return }
        guard let window, spring != nil else { cancel(); return }
        let now = CACurrentMediaTime()
        let elapsed = now - lastTick
        lastTick = now
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion || elapsed > 0.25 {
            finish()
            return
        }
        spring?.advance(by: elapsed)
        guard let spring else { return }
        window.setFrame(spring.frame, display: true)
        if spring.isSettled { cancel() }
    }

    private func finish() {
        spring?.finish()
        if let spring, let window { window.setFrame(spring.frame, display: true) }
        cancel()
    }
}
