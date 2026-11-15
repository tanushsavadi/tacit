import AppKit
import SwiftUI

struct ActivityPresentation: Equatable {
    enum Kind { case inactive, active, processing, speaking, paused, attention }
    let kind: Kind
    let title: String
    let symbol: String
    var color: Color {
        switch kind { case .attention: return .orange; case .paused: return .yellow; case .inactive: return .white.opacity(0.65); default: return .mint }
    }

    @MainActor static func current(_ c: TacitClient) -> Self {
        guard c.conn == .connected else {
            if c.conn == .connecting { return Self(kind: .inactive, title: "Connecting", symbol: "ellipsis") }
            return Self(kind: .attention, title: c.conn == .noToken ? "Setup needed" : "Not connected", symbol: "bolt.slash")
        }
        if let d = c.lastDelivery {
            if d.state == "routing", d.firstAudioAt != nil { return Self(kind: .speaking, title: "Speaking", symbol: "speaker.wave.2.fill") }
            if ["queued", "synthesizing", "routing"].contains(d.state) { return Self(kind: .processing, title: "Preparing voice", symbol: "ellipsis") }
            if ["failed", "refused"].contains(d.state) { return Self(kind: .attention, title: "Check voice output", symbol: "exclamationmark.circle") }
        }
        if c.live?.state == "active", c.recognition?.reachable == false {
            return Self(kind: .attention, title: "Model unavailable", symbol: "exclamationmark.circle")
        }
        if c.live?.state == "paused" { return Self(kind: .paused, title: "Paused", symbol: "pause.fill") }
        if c.live?.state == "active" { return Self(kind: .active, title: "Live preview", symbol: "viewfinder") }
        if c.output?.state == "paused" { return Self(kind: .paused, title: "Voice paused", symbol: "pause.fill") }
        return Self(kind: .inactive, title: "Ready", symbol: "circle.dotted")
    }
}

extension TacitClient {
    var routeDetail: String {
        guard let r = route else { return "Virtual microphone status not reported" }
        guard r.state == "ready" else { return "\(r.state.capitalized) · \(r.reason ?? "Check the TACIT workspace")" }
        guard let readers = r.readers else { return "Calling-app use is unknown" }
        if readers.isEmpty { return "No app is reading it · choose it as your call microphone" }
        return "In use by " + readers.map { NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0)?.deletingPathExtension().lastPathComponent ?? $0 }.joined(separator: ", ")
    }
    var deliveryDetail: String? {
        guard let d = lastDelivery else { return nil }
        switch d.state {
        case "queued", "synthesizing": return d.source == "user-corrected" ? "Preparing your correction…" : d.source == "reviewed-recognition" ? "Preparing your selected words…" : "Preparing your typed words…"
        case "routing": return d.firstAudioAt == nil ? "Waiting for the virtual microphone…" : "Speaking into \(route?.device ?? "the virtual microphone")"
        case "rendered": return "Audio written to \(route?.device ?? "the virtual microphone") · remote audibility unknown"
        case "interrupted": return "Speech interrupted"
        default: return "\(d.state.capitalized) · \(d.reason ?? "Check output settings")"
        }
    }
}
