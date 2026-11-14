import AppKit
import Carbon.HIToolbox
import SwiftUI

@main
struct TacitCompanionApp: App {
    @StateObject private var client = TacitClient()

    init() {
        // One instance only (two would register the same shortcut and double every control).
        let me = Bundle.main.bundleIdentifier ?? ""
        if !me.isEmpty, NSRunningApplication.runningApplications(withBundleIdentifier: me).count > 1 { exit(0) }
    }

    var body: some Scene {
        MenuBarExtra {
            MenuView(client: client, hotKeyRegistered: client.hotKeyRegistered)
        } label: {
            Image(systemName: icon).accessibilityLabel("TACIT: \(summary)")
        }
        .menuBarExtraStyle(.window)
    }

    private var icon: String {
        guard client.conn == .connected else { return "waveform.slash" }
        if client.output?.state == "ready" || client.live?.state == "active" { return "waveform.circle.fill" }
        if client.live?.state == "paused" || client.output?.state == "paused" { return "pause.circle" }
        return "waveform.circle"
    }
    private var summary: String {
        guard client.conn == .connected else { return "not connected" }
        return "Live \(client.live?.state ?? "unknown"), voice \(client.output?.state ?? "unknown")"
    }
}

struct MenuView: View {
    @ObservedObject var client: TacitClient
    let hotKeyRegistered: Bool
    @State private var typed = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if client.conn == .connected {
                Divider()
                liveSection
                Divider()
                outputSection
                Divider()
                Button(role: .destructive) { client.stopEverything() } label: {
                    Label("Stop everything" + (hotKeyRegistered ? "  ⌃⇧⌘." : ""), systemImage: "stop.circle.fill").frame(maxWidth: .infinity)
                }
                .controlSize(.large)
                .accessibilityHint("Ends Live recognition and voice output, cutting any speech not yet played")
            }
            if !hotKeyRegistered { Text("Global Stop shortcut unavailable (taken by another app) — use the button.").font(.caption2).foregroundStyle(.orange) }
            if let n = client.notice { Text(n).font(.caption).foregroundStyle(.secondary) }
            Divider()
            HStack {
                Button("Open workspace") { client.openWorkspace() }.disabled(client.conn != .connected)
                Spacer()
                Menu("Quit") {
                    Button("Stop everything and quit") { client.stopEverythingAndQuit() }
                    Button("Quit (TACIT server keeps running)") { NSApp.terminate(nil) }
                }
                .fixedSize()
            }
        }
        .padding(14)
        .frame(width: 340)
    }

    @ViewBuilder private var header: some View {
        HStack {
            Text("TACIT").font(.headline)
            Spacer()
            switch client.conn {
            case .connected: Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(.green).font(.caption)
            case .connecting: Label("Connecting…", systemImage: "hourglass").font(.caption)
            case .noToken: Label("No access token", systemImage: "key.slash").foregroundStyle(.orange).font(.caption)
            case .disconnected(let why): Label(why, systemImage: "bolt.horizontal.circle").foregroundStyle(.orange).font(.caption)
            }
        }
        if client.conn != .connected {
            Text("Status unknown while disconnected.").font(.caption).foregroundStyle(.secondary)
            Button("Start TACIT") { client.startServer() }
        } else if let r = client.recognition {
            Text(r.reachable ? "Recognition model ready" : "Recognition model NOT available")
                .font(.caption).foregroundStyle(r.reachable ? Color.secondary : Color.red)
        }
    }

    @ViewBuilder private var liveSection: some View {
        let state = client.live?.state ?? "unknown"
        Text("Silent speech (display only)").font(.subheadline.bold())
        Text(liveLine(state)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        HStack {
            switch state {
            case "off": Button("Start Live in the workspace…") { client.openWorkspace() }.help("Live starts where the camera is: the TACIT workspace")
            case "active": Button("Pause") { client.live("pause") }; Button("Stop") { client.live("end") }
            case "paused": Button("Resume") { client.live("resume") }; Button("Stop") { client.live("end") }
            default: EmptyView()
            }
        }
        if let h = client.lastHypothesis {
            VStack(alignment: .leading, spacing: 2) {
                Text(h.decision == "shown" ? "“\(h.text)”" : "No words (\(h.reason ?? "abstained"))")
                    .font(.body).textSelection(.enabled)
                Text("Raw model output · not spoken · uncertainty uncalibrated · \(h.ms) ms").font(.caption2).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func liveLine(_ s: String) -> String {
        switch s {
        case "active": return "Listening — recognised words appear here and in the workspace. They are never spoken automatically."
        case "paused": return "Paused."
        case "off": return "Off. Live is started from the TACIT workspace, which uses the camera. You can pause or stop it from here."
        default: return client.live?.reason ?? "Unknown."
        }
    }

    @ViewBuilder private var outputSection: some View {
        let o = client.output, r = client.route
        Text("Voice into calls").font(.subheadline.bold())
        if let r {
            Text(routeLine(r)).font(.caption).foregroundStyle(r.state == "ready" ? Color.secondary : Color.orange)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(r.warnings, id: \.self) { Text("⚠︎ \($0)").font(.caption2).foregroundStyle(.orange) }
        }
        HStack {
            switch o?.state ?? "unknown" {
            case "off": Button("Turn voice output on") { client.output("enable") }.disabled(r?.state != "ready")
            case "ready": Button("Pause voice") { client.output("pause") }; Button("Off") { client.output("stop") }
            case "paused": Button("Resume voice") { client.output("resume") }; Button("Off") { client.output("stop") }
            default: EmptyView()
            }
        }
        if o?.state == "ready" {
            HStack {
                TextField("Type what you want to say", text: $typed, axis: .vertical)
                    .lineLimit(1...3)
                    .onSubmit(speak)
                    .accessibilityLabel("Typed speech")
                Button("Speak", action: speak).keyboardShortcut(.return, modifiers: .command).disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Text("Typed by you — spoken in \(o?.voice ?? "the system voice").").font(.caption2).foregroundStyle(.secondary)
        }
        if let d = client.lastDelivery {
            Text(deliveryLine(d)).font(.caption).foregroundStyle(d.state == "failed" || d.state == "refused" ? Color.red : Color.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func speak() {
        client.speakTyped(typed)
        typed = ""
    }

    private func routeLine(_ r: TacitClient.Route) -> String {
        switch r.state {
        case "ready":
            let readers = r.readers.map { $0.isEmpty ? "no app is using it yet — pick “\(r.device ?? "BlackHole")” as the microphone in FaceTime/Zoom" : "in use by \($0.joined(separator: ", "))" } ?? ""
            return "Virtual mic \(r.device ?? "") ready · \(readers)"
        default: return "Virtual mic \(r.state): \(r.reason ?? "")"
        }
    }

    private func deliveryLine(_ d: TacitClient.Delivery) -> String {
        switch d.state {
        case "queued", "synthesizing": return "Preparing “\(d.text)”…"
        case "routing": return "Speaking “\(d.text)”…"
        case "rendered": return "Spoken into the virtual mic: “\(d.text)” (whether the other person heard it is not known)"
        default: return "\(d.state.capitalized): \(d.reason ?? "")"
        }
    }
}
