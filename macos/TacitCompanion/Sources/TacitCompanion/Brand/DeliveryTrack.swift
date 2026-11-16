import SwiftUI

/// "Voice transfer": where the user's approved words are, using only server-reported delivery states.
/// Voice = synthesis, Call mic = playing into the selected virtual microphone, Done = rendered there.
/// It never claims that a remote participant heard anything.
enum DeliveryTrack {
    enum Status: Equatable { case done, current, pending, stopped, failed }
    struct Step: Equatable { var label: String; var status: Status }

    static func steps(state: String, firstAudio: Bool) -> [Step] {
        let voice = "Voice", mic = firstAudio ? "Playing" : "Call mic", done = "Done"
        switch state {
        case "queued", "synthesizing": return [.init(label: voice, status: .current), .init(label: "Call mic", status: .pending), .init(label: done, status: .pending)]
        case "routing": return [.init(label: voice, status: .done), .init(label: mic, status: .current), .init(label: done, status: .pending)]
        case "rendered": return [.init(label: voice, status: .done), .init(label: "Call mic", status: .done), .init(label: done, status: .done)]
        case "interrupted":
            return firstAudio ? [.init(label: voice, status: .done), .init(label: "Call mic", status: .done), .init(label: "Stopped", status: .stopped)]
                              : [.init(label: "Stopped", status: .stopped), .init(label: "Call mic", status: .pending), .init(label: done, status: .pending)]
        default: // failed / refused
            return firstAudio ? [.init(label: voice, status: .done), .init(label: "Call mic", status: .failed), .init(label: done, status: .pending)]
                              : [.init(label: "Not sent", status: .failed), .init(label: "Call mic", status: .pending), .init(label: done, status: .pending)]
        }
    }

    static func summary(_ steps: [Step]) -> String {
        let words = steps.map { s -> String in
            switch s.status {
            case .done: return "\(s.label) done"
            case .current: return "\(s.label) in progress"
            case .pending: return "\(s.label) waiting"
            case .stopped: return "stopped"
            case .failed: return "\(s.label) failed"
            }
        }
        return "Speech delivery: " + words.joined(separator: ", ") + ". Local output status only."
    }
}

struct DeliveryTrackView: View {
    let steps: [DeliveryTrack.Step]
    var signal: Color = TacitBrand.mint.color
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                if index > 0 {
                    Capsule().fill(step.status == .pending ? Color.white.opacity(0.18) : color(steps[index - 1].status))
                        .frame(width: 14, height: 1.5)
                }
                HStack(spacing: 4) {
                    marker(step.status)
                    Text(step.label).font(.system(size: 11, weight: step.status == .current ? .semibold : .medium))
                        .foregroundStyle(step.status == .pending ? .white.opacity(0.5) : step.status == .current ? .white : color(step.status))
                }
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: steps)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(DeliveryTrack.summary(steps))
    }
    private func color(_ s: DeliveryTrack.Status) -> Color {
        switch s {
        case .done, .current: return signal
        case .pending: return .white.opacity(0.35)
        case .stopped, .failed: return TacitBrand.amber.color
        }
    }
    /// Shape differs per status (filled / ringed / hollow / square / cross) so colour is never the only cue.
    @ViewBuilder private func marker(_ s: DeliveryTrack.Status) -> some View {
        switch s {
        case .done: Image(systemName: "checkmark.circle.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(signal)
        case .current: Circle().fill(signal).frame(width: 7, height: 7).overlay(Circle().stroke(signal.opacity(0.35), lineWidth: 3).frame(width: 11, height: 11))
        case .pending: Circle().stroke(.white.opacity(0.35), lineWidth: 1.2).frame(width: 7, height: 7)
        case .stopped: RoundedRectangle(cornerRadius: 1.5).fill(TacitBrand.amber.color).frame(width: 7, height: 7)
        case .failed: Image(systemName: "xmark.circle.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(TacitBrand.amber.color)
        }
    }
}
