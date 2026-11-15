import AppKit
import SwiftUI

struct CommunicationWorkspace: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    @ObservedObject var session: CommunicationSession
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || CompanionAccessibility.reducedMotionPreview }
    @Environment(\.colorSchemeContrast) private var contrast
    @FocusState private var composerFocused: Bool

    private var state: CommunicationState {
        .resolve(.init(connected: client.conn == .connected,
            paused: client.output?.state == "paused" || (client.live?.state == "paused" && client.output?.state != "ready"),
            delivery: client.lastDelivery?.state, firstAudio: client.lastDelivery?.firstAudioAt != nil,
            editing: session.surface == .compose || client.reviewDraft.editing,
            assistance: session.surface == .assistance, review: client.canReviewCurrent,
            liveEnabled: client.live?.state == "active", outputEnabled: client.output?.state == "ready",
            error: ["failed", "refused"].contains(client.lastDelivery?.state ?? "") || client.route?.state == "unavailable"
                || (client.live?.state == "active" && client.recognition?.reachable == false)))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            Group {
                switch session.surface {
                case .conversation: conversation
                case .compose: composer
                case .phrases: PhrasePicker(client: client, session: session, customize: { island.showCommunication(.customize) })
                case .customize: PhraseCustomization(session: session)
                case .assistance: ResponseAssistance(client: client, session: session)
                case .recovery:
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Previous correction").font(.system(size: 13, weight: .semibold))
                        ScrollView { Text(client.preservedCorrection ?? "No previous correction.").font(.system(size: 18)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                        Text("Kept for reference only. Select current recognized words to write a new correction. This old review cannot be sent.")
                            .font(.system(size: 11)).foregroundStyle(.white.opacity(0.72))
                    }
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .transition(.opacity)
            dock
        }
        .foregroundStyle(.white).tint(.mint).preferredColorScheme(.dark)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: session.surface)
        .onChange(of: session.surface) { _, surface in composerFocused = surface == .compose }
        .onChange(of: client.lastHypothesis?.id) { _, id in
            // A new result never steals an editor or selects words on the user's behalf.
            if id != nil, session.surface == .conversation { island.expand() }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button { session.surface = .conversation } label: {
                Text("tacit").font(.system(size: 15, weight: .semibold, design: .rounded)).tracking(-0.5)
            }.buttonStyle(CommunicationButtonStyle()).accessibilityLabel("TACIT conversation")
            Text(client.isIsolated ? "OFFLINE · " + statusTitle : statusTitle).font(.system(size: 11, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8).foregroundStyle(statusColor)
                .accessibilityIdentifier("communication-state")
            Spacer(minLength: 0)
            if client.live?.state == "active" || client.output?.state == "ready" {
                icon("pause.fill", "Pause Live and voice") { client.pauseEverything() }
            }
            Menu {
                Button("Open camera workspace") { client.openWorkspace() }
                Button("Settings & output") { island.showUtility(.diagnostics) }
                Button(island.pinned ? "Unpin island" : "Keep island open") { island.togglePin() }
                Button("Collapse") { island.collapse() }
            } label: { Image(systemName: "ellipsis").frame(width: 28, height: 28) }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().accessibilityLabel("More controls")
            icon("stop.fill", "Stop everything") { client.stopEverything() }
                .help("Stop Live and voice · ⌃⇧⌘.")
        }.frame(height: 28)
    }
    private var statusTitle: String {
        switch state {
        case .off: return "Your voice, on your terms"
        case .ready: return client.live?.state == "active" ? "Live · review before speaking" : "Voice ready"
        case .reviewAvailable: return "Your words to review"
        case .editing: return "Writing"
        case .synthesizing: return "Preparing voice"
        case .speaking: return "Sending to call microphone"
        case .paused: return "Paused"
        case .disconnected: return "Not connected"
        case .error: return "Check voice output"
        case .assistance: return "Help Me Respond"
        case .visuallyActive: return "Visual activity"
        case .processing: return "Recognizing"
        }
    }
    private var statusColor: Color {
        [.paused, .disconnected, .error].contains(state) ? .orange : state == .off ? .white.opacity(0.72) : .mint
    }

    @ViewBuilder private var conversation: some View {
        if client.canReviewCurrent {
            RecognitionReview(client: client, onEdit: { island.focusEditor() })
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Spacer(minLength: 0)
                Text(headline).font(.system(size: 25, weight: .medium)).tracking(-0.7)
                    .fixedSize(horizontal: false, vertical: true).lineLimit(3)
                Text(detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.72)).lineLimit(3)
                Spacer(minLength: 0)
                if client.preservedCorrection != nil {
                    Button("View previous correction") { session.surface = .recovery }
                        .font(.system(size: 11)).buttonStyle(.plain).foregroundStyle(.mint)
                }
                HStack(spacing: 10) {
                    if client.conn != .connected {
                        IslandAction("Reconnect", symbol: "arrow.clockwise") { client.connect() }
                    } else if client.live?.state == "paused" {
                        IslandAction("Resume camera workspace", symbol: "arrow.up.right") { client.openWorkspace() }
                    } else if client.live?.state != "active" {
                        IslandAction("Start in camera workspace", symbol: "viewfinder") { client.openWorkspace() }
                    }
                    if client.conn == .connected && client.output?.state != "ready" {
                        IslandAction(client.output?.state == "paused" ? "Resume voice" : "Enable voice", symbol: "speaker.wave.2") {
                            client.output(client.output?.state == "paused" ? "resume" : "enable")
                        }.disabled(client.route?.state != "ready")
                    }
                }
            }
        }
    }
    private var headline: String {
        if client.conn != .connected { return "A connection away." }
        if state == .error { return client.live?.state == "active" && client.recognition?.reachable == false ? "Silent speech is unavailable." : "Voice needs attention." }
        if state == .speaking { return "Your words are on their way." }
        if state == .synthesizing { return "Preparing your voice." }
        if client.live?.state == "paused" { return "Ready when you are." }
        if client.reviewExpired { return "Those words have expired." }
        if client.lastHypothesis?.decision == "abstained" { return "No clear words this time." }
        if client.reviewSubmittedID != nil { return "Your words. Your choice." }
        return client.live?.state == "active" ? "There's room for your words." : "Join the conversation."
    }
    private var detail: String {
        if client.conn != .connected { return "Your draft is kept here. Reconnect to use voice output." }
        if client.live?.state == "active", client.recognition?.reachable == false { return "The visual recognizer is unavailable. Type or use your phrases while it reconnects." }
        if let notice = client.notice { return notice }
        if state == .error { return client.authoredUnavailableReason ?? client.deliveryDetail ?? "Check voice output in settings, then try again." }
        if let delivery = client.deliveryDetail { return delivery }
        if client.reviewSubmittedID != nil { return "Speech requested. Waiting for voice status." }
        if client.reviewExpired { return "That review is no longer current. Mouth it again to start a new review." }
        if client.lastHypothesis?.decision == "abstained" { return "Try again, or type your message. You decide what is spoken." }
        if client.live?.state == "paused" { return "Camera recognition is paused. Resume from its workspace when you're ready." }
        return client.live?.state == "active"
            ? "Silently articulate, choose your words, then Speak. Nothing is spoken automatically."
            : "Start silent speech in the camera workspace, or use your own phrases and typed words here."
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Your words").font(.system(size: 13, weight: .semibold))
                Spacer()
                if let previous = session.lastRequestedWords {
                    Button("Use last message") { client.typedDraft = previous; composerFocused = true }
                        .font(.system(size: 11)).disabled(!client.typedDraft.isEmpty)
                }
            }
            TextField("What would you like to say?", text: $client.typedDraft, axis: .vertical)
                .lineLimit(3...4).textFieldStyle(.plain).font(.system(size: 19)).focused($composerFocused)
                .padding(10).background(.white.opacity(contrast == .increased ? 0.14 : 0.065), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("Your typed message, up to 500 characters").defaultFocus($composerFocused, true)
            HStack {
                Text("Written by you · \(client.typedDraft.utf16.count)/500").font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
                Spacer()
                if client.output?.state != "ready" {
                    OutputAuthorizationButton(client: client)
                } else {
                    IslandAction("Speak", symbol: "arrow.up", prominent: true) {
                        session.speakDraft(using: client)
                    }.keyboardShortcut(.return, modifiers: .command)
                        .disabled(!client.canSpeakAuthored || !PersonalPhrase.valid(client.typedDraft))
                }
            }
            Text(client.authoredUnavailableReason ?? client.notice ?? client.deliveryDetail ?? "Your draft stays here while you use other controls.")
                .font(.system(size: 11)).foregroundStyle(.white.opacity(0.7)).lineLimit(2)
        }.task { await Task.yield(); composerFocused = true }
    }

    private var dock: some View {
        HStack(spacing: 6) {
            Button {
                session.holdTurn(using: client)
            } label: {
                Label("Hold my turn", systemImage: "hand.raised").font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 10).frame(height: 36)
            }.buttonStyle(CommunicationButtonStyle()).background(.mint.opacity(0.13), in: Capsule()).foregroundStyle(.mint)
                .disabled(!client.canSpeakAuthored).help(client.authoredUnavailableReason ?? "Speak: \(session.holdPhrase) · ⌃⇧⌘H")
                .accessibilityLabel("Hold my turn. Speak: \(session.holdPhrase)")
                .keyboardShortcut("h", modifiers: [.command, .shift])
            Spacer(minLength: 0)
            dockButton("heart.text.clipboard", "My phrases", .phrases)
            dockButton("keyboard", "Type a message", .compose)
            dockButton("text.bubble", "Help Me Respond", .assistance)
        }
        .padding(.top, 9).overlay(alignment: .top) { Rectangle().fill(.white.opacity(contrast == .increased ? 0.45 : 0.12)).frame(height: 1) }
    }
    private func dockButton(_ symbol: String, _ label: String, _ surface: CommunicationSession.Surface) -> some View {
        Button { island.showCommunication(session.surface == surface ? .conversation : surface) } label: {
            Image(systemName: symbol).font(.system(size: 14)).frame(width: 36, height: 36)
                .background(session.surface == surface ? .white.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 10))
        }.buttonStyle(CommunicationButtonStyle()).foregroundStyle(.white.opacity(0.85)).accessibilityLabel(label).help(label)
    }
    private func icon(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol).font(.system(size: 11)).frame(width: 28, height: 28) }
            .buttonStyle(CommunicationButtonStyle()).accessibilityLabel(label)
    }
}

struct IslandAction: View {
    var title: String
    var symbol: String
    var prominent = false
    var action: () -> Void
    init(_ title: String, symbol: String, prominent: Bool = false, action: @escaping () -> Void) {
        self.title = title; self.symbol = symbol; self.prominent = prominent; self.action = action
    }
    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol).font(.system(size: 11, weight: .semibold))
                .padding(.horizontal, 12).frame(minHeight: 34)
                .foregroundStyle(prominent ? .black : .white)
                .background(prominent ? Color.mint : .white.opacity(0.12), in: Capsule())
        }.buttonStyle(CommunicationButtonStyle())
    }
}

struct OutputAuthorizationButton: View {
    @ObservedObject var client: TacitClient
    var body: some View {
        IslandAction(client.output?.state == "paused" ? "Resume voice" : "Enable voice", symbol: "speaker.wave.2") {
            client.output(client.output?.state == "paused" ? "resume" : "enable")
        }.disabled(client.conn != .connected || client.route?.state != "ready")
    }
}
