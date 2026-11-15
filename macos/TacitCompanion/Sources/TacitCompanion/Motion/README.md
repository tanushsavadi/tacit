# TACIT native motion lab

Original implementation; no third-party source copied. The existing Cyclop and NotchDrop MIT adaptations and notices remain untouched. BoringNotch is a visual reference only; its [GPL-3.0 code](https://github.com/TheBoredTeam/boring.notch/blob/main/LICENSE) is not used.

## Integration

- Keep one `IslandFrameAnimator` as a controller property. Replace the `NSAnimationContext` resize with `setFrame(target, on: panel, animated: animated && enabled)`. It owns frame interpolation; do not wrap it in another AppKit animation.
- Call `cancel()` before hiding/closing the island. Cancellation freezes the current frame, invalidates the timer and releases its weak window reference. A later target begins from the window's actual current frame.
- Pass `animated: false` for initial placement/display changes. A changed top-center anchor also snaps automatically so the island does not travel across displays.
- Use `CommunicationMotion.contentTransition(reduceMotion:)` on conditional content and `expansion(reduceMotion:)` for relevant state changes. These should not animate safety authorization, delay actions, or gate input.
- `CommunicationButtonStyle()` provides press feedback while preserving ordinary Button actions, disabled state, layout-sized hit shape and accessibility semantics. Labels retain responsibility for clear focus affordances, padding, colors and semantic names.
- SwiftUI callers pass their `accessibilityReduceMotion` environment value. The window animator reads AppKit's setting and observes changes so an in-flight resize finishes immediately when Reduce Motion becomes enabled.

## Behavior and limits

The pure model uses the exact critically damped spring solution for width and height. Every frame is reconstructed around the target's top center. Reversal starts at the presented size; useful forward velocity is retained, while velocity away from a new target is discarded. Dimensions stay between the presented size and the new target, avoiding overshoot outside the resize envelope. Invalid targets are ignored. Long suspended ticks snap to completion.

The timer runs in the main run loop's common modes and uses the screen's advertised maximum refresh rate, bounded to 60–120 Hz, falling back to 60. This is **not vsync or a rendered-FPS guarantee**. The callback only computes and sets a frame; it never orders a window, changes key status, changes hit testing, or acquires input. Tick generations reject canceled callbacks. No idle timer remains after settling. Normal cancellation is main-actor isolated; destructor cleanup also schedules off-main releases back onto the main queue.

Resizing a real NSHostingView still performs AppKit/SwiftUI layout and rendering on the main thread. The spring's calculation cost does not establish that those costs meet a display's frame budget. Content that appears while a window grows must remain usable under the island's normal clipping; do not give child content a second size spring that overshoots the native window. The visible lab should check rapid hover reversal, text reflow, focus rings, VoiceOver, Pause/Stop activation, and a live Reduce Motion toggle.

## Checks run

2026-11-15 01:19 UTC: isolated package containing only these sources and `MotionTests.swift`: **10/10 tests passed**, covering convergence, anchor invariance, bounds, rapid reversal, repeated targets, variable timestep equivalence, Reduce Motion, immediate placement, invalid input and suspension. Command uses a per-process toolchain override because this machine's default CommandLineTools installation cannot resolve XCTest:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --filter MotionTests
```

A separate temporary hidden-window harness verified actual timer-driven reversal, cancellation freeze, convergence, and that its window stayed invisible and non-key. System Reduce Motion was false during this harness; Reduce Motion behavior was tested in the pure model. The harness also rendered its own isolated SwiftUI style sample to an image without capturing the desktop. No production app, server, camera or audio was started.

An optimized pure-model benchmark of 600,000 steps with repeated retargeting took **0.010997 seconds** on this machine. This is calculation-only timing, not AppKit frame pacing, GPU rendering, display FPS, or end-to-end responsiveness. Temporary harnesses and image live under `/tmp/tacit-motion-benchmark`; they are not production dependencies.

## API references

- Apple: [NSWindow.setFrame(_:display:)](https://developer.apple.com/documentation/appkit/nswindow/setframe(_:display:))
- Apple: [NSWorkspace Reduce Motion](https://developer.apple.com/documentation/appkit/nsworkspace/accessibilitydisplayshouldreducemotion)
- Apple: [SwiftUI Reduce Motion environment](https://developer.apple.com/documentation/swiftui/environmentvalues/accessibilityreducemotion)
- Apple: [Timer invalidation](https://developer.apple.com/documentation/foundation/timer/invalidate()) and [common run-loop modes](https://developer.apple.com/documentation/foundation/runloop/mode/common)
- Apple: [NSScreen.maximumFramesPerSecond](https://developer.apple.com/documentation/appkit/nsscreen/maximumframespersecond)
