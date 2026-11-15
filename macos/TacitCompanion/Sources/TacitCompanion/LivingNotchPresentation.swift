import SwiftUI

/// Presentation only. These facts never authorize capture or speech, or synthesize activity.
struct LivingNotchPresentation: Equatable {
    enum Kind { case ready, live, processing, review, preparing, speaking, paused, attention }
    struct Facts {
        var connected = true
        var connecting = false
        var camera: NativeCamera.State = .off
        var starting = false
        var live: String?
        var realtime = false
        var processing = false
        var review = false
        var delivery: String?
        var firstAudio = false
        var output: String?
        var routeUnavailable = false
        var recognizerUnavailable = false
    }
    let kind: Kind
    let title: String
    let detail: String
    let symbol: String
    let realtime: Bool
    var compactTitle: String {
        if realtime { return kind == .speaking ? "Speaking · Real-time" : "Real-time · Unreviewed" }
        switch kind {
        case .ready: return title == "Ready to communicate" ? "Ready" : title
        case .live: return title == "Live session active" ? "Live session" : title
        case .review: return "Words ready"
        case .attention:
            if title.contains("permission") { return "Camera access" }
            if title.contains("Voice") { return "Check voice" }
            return title
        default: return title
        }
    }
    var busy: Bool { kind == .speaking || kind == .preparing }
    var problem: Bool { kind == .attention }
    var color: Color { realtime || problem || kind == .paused ? .orange : kind == .ready ? .white.opacity(0.88) : .mint }

    static func resolve(_ f: Facts) -> Self {
        func state(_ kind: Kind, _ title: String, _ detail: String, _ symbol: String) -> Self {
            .init(kind: kind, title: title, detail: f.realtime ? "REAL-TIME · Unreviewed" : detail, symbol: symbol, realtime: f.realtime)
        }
        guard f.connected else {
            return state(f.connecting ? .ready : .attention, f.connecting ? "Connecting…" : "Not connected", "TACIT · Open to reconnect", "bolt.slash")
        }
        if f.delivery == "routing", f.firstAudio { return state(.speaking, "Speaking…", "Your words · Stop anytime", "speaker.wave.2.fill") }
        if ["queued", "synthesizing", "routing"].contains(f.delivery ?? "") { return state(.preparing, "Preparing voice…", "Your words · Stop anytime", "speaker.fill") }
        if f.routeUnavailable || ["failed", "refused"].contains(f.delivery ?? "") { return state(.attention, "Voice needs attention", "Open output settings", "exclamationmark.triangle.fill") }
        switch f.camera {
        case .denied: return state(.attention, "Camera needs permission", "Open Camera Settings", "camera.fill")
        case .noCamera: return state(.attention, "No camera available", "Type a message instead", "camera.fill")
        case .interrupted: return state(.attention, "Camera interrupted", "Restart the camera", "camera.fill")
        case .requestingPermission: return state(.ready, "Allow camera access", "Check the macOS prompt", "camera.fill")
        default: break
        }
        if f.live == "paused" { return state(.paused, "Paused", "Live paused · No speech sent", "pause.fill") }
        if f.output == "paused" { return state(.paused, "Voice paused", "Output paused · Open to resume", "pause.fill") }
        if f.recognizerUnavailable { return state(.attention, "Recognition unavailable", "Type a message instead", "exclamationmark.triangle.fill") }
        if f.processing { return state(.processing, "Interpreting…", "Your silent words", "text.bubble.fill") }
        if f.review && !f.realtime { return state(.review, "Words ready", "Review first · Speak or edit", "text.bubble.fill") }
        if f.camera.running { return state(.live, f.camera == .capturing ? "Reading your lips…" : "Camera live", "Review first", "camera.fill") }
        if f.live == "active" { return state(.live, "Live session active", "Review first · Camera external", "viewfinder") }
        if f.starting { return state(.ready, "Getting ready…", "Preparing camera and voice", "camera.fill") }
        return state(.ready, "Ready to communicate", "TACIT · Hover or click to open", "bubble.left.and.bubble.right.fill")
    }

    @MainActor static func current(_ client: TacitClient, live: LiveCoordinator) -> Self {
        resolve(.init(connected: client.conn == .connected, connecting: client.conn == .connecting,
            camera: client.isIsolated ? ExperienceLab.shared.cameraFixture ?? live.camera.state : live.camera.state, starting: live.starting, live: client.live?.state,
            realtime: client.realtimeActive, processing: client.processingUtteranceID != nil,
            review: client.canReviewCurrent, delivery: client.lastDelivery?.state,
            firstAudio: client.lastDelivery?.firstAudioAt != nil, output: client.output?.state,
            routeUnavailable: client.route?.state == "unavailable", recognizerUnavailable: client.recognition?.reachable == false))
    }
}

/// A pending review and speech lifecycle are persistent; only informational events have a timer.
enum LivingNotchVisibility {
    static func peek(expanded: Bool, hovered: Bool, review: Bool, busy: Bool, problem: Bool, transient: Bool) -> Bool {
        !expanded && (hovered || review || busy || problem || transient)
    }
}
