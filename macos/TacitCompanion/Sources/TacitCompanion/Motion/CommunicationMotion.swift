import SwiftUI

/// Original TACIT motion tokens. No looping, flashing or animation-delayed actions.
enum CommunicationMotion {
    static func expansion(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 1)
    }

    static func feedback(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeOut(duration: 0.12)
    }

    static func contentTransition(reduceMotion: Bool) -> AnyTransition {
        // Opacity alone avoids sliding text or briefly moving a safety control's target.
        reduceMotion ? .identity : .opacity
    }

    static func pressScale(isPressed: Bool, reduceMotion: Bool) -> CGFloat {
        isPressed && !reduceMotion ? 0.98 : 1
    }
}

/// Subtle press feedback without replacing Button's action, keyboard or accessibility semantics.
/// Apply to a label that already supplies its padding, background and focus affordance.
struct CommunicationButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || CompanionAccessibility.reducedMotionPreview }
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(CommunicationMotion.pressScale(
                isPressed: configuration.isPressed && isEnabled, reduceMotion: reduceMotion))
            .contentShape(Rectangle())
            .opacity(isEnabled ? (configuration.isPressed ? 0.82 : 1) : 0.45)
            .animation(CommunicationMotion.feedback(reduceMotion: reduceMotion), value: configuration.isPressed)
            .transaction { if reduceMotion { $0.animation = nil; $0.disablesAnimations = true } }
    }
}
