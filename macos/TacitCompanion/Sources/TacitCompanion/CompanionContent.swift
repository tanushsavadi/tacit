import AppKit
import SwiftUI

struct ConversationView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    var body: some View {
        CommunicationWorkspace(client: client, island: island, session: island.communication)
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
                Text(island.holdKeyRegistered ? "⌃⇧⌘H · Hold my turn (requires voice enabled)" : "Global Hold unavailable · use Hold my turn in the island").font(.caption)
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
