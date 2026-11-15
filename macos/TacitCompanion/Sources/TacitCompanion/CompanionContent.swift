import AppKit
import SwiftUI

/// One glance, one primary action. Setup and editors live in deliberately opened utility windows.
struct ConversationView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    private var activity: ActivityPresentation { ActivityPresentation.current(client) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text("tacit").font(.system(size: 14, weight: .semibold, design: .rounded)).tracking(-0.4)
                Spacer()
                Circle().fill(activity.color).frame(width: 4, height: 4)
                Text(activity.title).font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.65))
            }
            Spacer(minLength: 10)
            Button { island.showUtility(.transcript) } label: {
                Text(headline).font(.system(size: 21, weight: .medium)).tracking(-0.5)
                    .lineLimit(3).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(.white.opacity(client.lastHypothesis == nil ? 0.8 : 1))
            }.buttonStyle(.plain).accessibilityLabel("\(headline). Open full recognized text")
            Spacer(minLength: 8)
            HStack(spacing: 5) {
                if let b = client.lastHypothesis?.brightness, b < 90 {
                    Label("More front light", systemImage: "sun.max").foregroundStyle(.orange)
                } else {
                    Text(client.lastHypothesis == nil ? "Camera in workspace" : "Raw words · display only").foregroundStyle(.white.opacity(0.48))
                }
                Spacer(minLength: 0)
                if let time = client.lastHypothesis?.endToResultMs {
                    Text(String(format: "%.1f s", time / 1000)).foregroundStyle(.white.opacity(0.45))
                        .accessibilityLabel("\(Int(time)) milliseconds from articulation end to result")
                }
            }.font(.system(size: 10))
            HStack(spacing: 8) {
                primary
                Spacer(minLength: 4)
                Button { island.showUtility(.typed) } label: { Image(systemName: "keyboard").frame(width: 26, height: 28) }
                    .accessibilityLabel("Type to speak").help("Type to speak")
                Menu {
                    Button("Open workspace") { client.openWorkspace() }
                    if client.live?.state == "active" { Button("Pause Live & voice") { client.pauseEverything() } }
                    if client.live?.state == "paused" { Button("Resume server Live") { client.live("resume") } }
                    Button("End Live") { client.live("end") }.disabled(client.live?.state == "off")
                    Button("Settings & diagnostics") { island.showUtility(.diagnostics) }
                    Button("Collapse") { island.collapse() }
                    Button("Stop everything", role: .destructive) { client.stopEverything() }
                } label: { Image(systemName: "ellipsis").frame(width: 24, height: 28) }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).tint(.white.opacity(0.6)).fixedSize().accessibilityLabel("More TACIT controls")
                Button { client.stopEverything() } label: { Image(systemName: "stop.fill").font(.system(size: 10)).frame(width: 26, height: 28) }
                    .accessibilityLabel("Emergency stop everything").help("Stop everything · ⌃⇧⌘.")
            }
            .buttonStyle(.plain).foregroundStyle(.white.opacity(0.7)).padding(.top, 14)
        }
        .foregroundStyle(.white).tint(.mint).preferredColorScheme(.dark)
    }

    private var headline: String {
        if client.conn != .connected { return "Let’s reconnect." }
        if let h = client.lastHypothesis { return h.decision == "shown" ? h.text : "No words recognized." }
        if client.live?.state == "paused" { return "Take your time." }
        if client.live?.state == "active" { return "Ready for your words." }
        return "A little space for your voice."
    }
    @ViewBuilder private var primary: some View {
        if client.conn != .connected {
            action("Reconnect", symbol: "arrow.clockwise") { client.connect() }
        } else if client.canReviewCurrent {
            action("Review", symbol: "text.bubble") { island.beginReview() }
        } else if client.live?.state == "active" {
            action("Pause", symbol: "pause.fill") { client.pauseEverything() }
        } else if client.live?.state == "paused" {
            action("Resume in workspace", symbol: "arrow.up.right") { client.openWorkspace() }
        } else {
            action("Open workspace", symbol: "arrow.up.right") { client.openWorkspace() }
        }
    }
    private func action(_ title: String, symbol: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) { Label(title, systemImage: symbol).font(.system(size: 11, weight: .medium)).padding(.horizontal, 12).frame(height: 29) }
            .buttonStyle(.plain).foregroundStyle(.white).background(.white.opacity(0.1), in: Capsule())
    }
}

struct UtilitySurface: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    let surface: IslandController.Utility
    var body: some View {
        Group {
            switch surface {
            case .typed: TypedComposer(client: client)
            case .diagnostics: DiagnosticsView(client: client, island: island)
            case .review: RecognitionReview(client: client)
            case .transcript: TranscriptDetail(client: client)
            }
        }.padding(22).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color(white: 0.055)).preferredColorScheme(.dark).tint(.mint)
    }
}

struct TypedComposer: View {
    @ObservedObject var client: TacitClient
    @FocusState private var editing: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Your words.").font(.system(size: 20, weight: .medium))
                Spacer()
                Button { client.output("pause") } label: { Image(systemName: "pause.fill") }.disabled(client.output?.state != "ready").accessibilityLabel("Pause voice")
                Button { client.stopEverything() } label: { Image(systemName: "stop.fill") }.accessibilityLabel("Stop everything")
            }.buttonStyle(.plain)
            TextField("Type what you want to say…", text: $client.typedDraft, axis: .vertical)
                .lineLimit(3...5).textFieldStyle(.plain).font(.system(size: 17))
                .padding(12).background(.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 12))
                .focused($editing).accessibilityLabel("Your typed words, up to 500 characters")
            HStack {
                Text("Typed by you · \(client.typedDraft.utf16.count)/500").font(.system(size: 10)).foregroundStyle(.secondary)
                Spacer()
                if client.output?.state == "ready" {
                    Button("Speak") { if client.speakTyped(client.typedDraft) { client.typedDraft = "" } }
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(client.typedDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.typedDraft.utf16.count > 500 || client.route?.state != "ready")
                } else {
                    Button(client.output?.state == "paused" ? "Resume voice" : "Enable voice") { client.output(client.output?.state == "paused" ? "resume" : "enable") }
                        .disabled(client.conn != .connected || client.route?.state != "ready")
                }
            }
            Text(client.deliveryDetail ?? client.notice ?? "Uses your selected call microphone route.")
                .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2)
        }.onAppear { editing = true }
    }
}

struct TranscriptDetail: View {
    @ObservedObject var client: TacitClient
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Recognized words").font(.headline)
                Text(client.lastHypothesis?.text ?? "No current recognized words.").font(.title3).textSelection(.enabled)
                Text("Raw visual model output · experimental · not spoken automatically.").font(.caption).foregroundStyle(.secondary)
                if let h = client.lastHypothesis {
                    if let b = h.brightness, b < 90 { Label("Light your face from the front", systemImage: "sun.max").foregroundStyle(.orange) }
                    if let p = h.phrase {
                        Text(p.accepted ? "Phrase list match: \(p.text) · display only, may be wrong" : "Phrase rejected: \(p.reason ?? "not accepted")").font(.caption)
                    }
                    Text(h.endToResultMs.map { "\(Int($0)) ms · articulation end to result" } ?? "\(h.ms) ms · server recognition only").font(.caption).foregroundStyle(.secondary)
                    if let reason = h.reason { Text(reason).font(.caption) }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct DiagnosticsView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Settings & diagnostics").font(.title3.weight(.medium))
                Toggle("Show conversation island", isOn: Binding(get: { island.enabled }, set: { island.setEnabled($0) }))
                Menu("Display · \(island.displayName)") {
                    ForEach(Array(NSScreen.screens.enumerated()), id: \.offset) { _, screen in Button(screen.localizedName) { island.selectDisplay(screen) } }
                }
                Text("Camera").font(.headline)
                Text("The browser owns capture. Keep the workspace visible beside your call. Hidden tabs pause capture; resume in the original workspace.").font(.caption).foregroundStyle(.secondary)
                Button("Open workspace") { client.openWorkspace() }
                Text("Voice route").font(.headline)
                Text(client.route?.device ?? "Not reported")
                Text(client.routeDetail).font(.caption).foregroundStyle(.secondary)
                Text(client.lastDelivery?.voice ?? client.output?.voice ?? "Voice not reported").font(.caption)
                HStack {
                    Button("Enable voice") { client.output("enable") }.disabled(client.route?.state != "ready")
                    Button("Pause") { client.output("pause") }
                    Button("Resume") { client.output("resume") }
                    Button("Off") { client.output("stop") }
                }
                ForEach(client.route?.warnings ?? [], id: \.self) { Text($0).font(.caption).foregroundStyle(.orange) }
                Text("Island · \(Int(island.geometry.expandedSize.width)) × \(Int(island.geometry.expandedSize.height)) pt · \(island.geometry.hasNotch ? "physical notch" : "non-notch display")").font(.caption)
                Text("Measured cutout · \(Int(island.geometry.cutoutWidth)) × \(Int(island.geometry.cutoutHeight)) pt").font(.caption)
                Text("Live · \(client.live?.state ?? "unknown") · \(client.live?.reason ?? "")").font(.caption)
                Text("Model · \(client.recognition?.model ?? "not reported")").font(.caption)
                Text("Articulation / recognition processing activity is not published to this client. Automatic transmission disabled. Remote audibility unknown.").font(.caption).foregroundStyle(.secondary)
                Text(client.hotKeyRegistered ? "⌃⇧⌘. · emergency stop" : "Global Stop unavailable · use the button").font(.caption)
                Text(island.showKeyRegistered ? "⌃⇧⌘T · open island for keyboard use" : "Open island from menu bar for keyboard use").font(.caption)
                HStack {
                    Button("Reconnect") { client.connect() }
                    Button("Start TACIT") { client.startServer() }
                    Button("Stop everything", role: .destructive) { client.stopEverything() }
                }
                if let notice = client.notice { Text(notice).font(.caption).foregroundStyle(.orange) }
                Menu("Quit") {
                    Button("Stop everything and quit") { client.stopEverythingAndQuit() }
                    Button("Quit companion (server keeps running)") { NSApp.terminate(nil) }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
