import AppKit
import SwiftUI

struct CommunicationWorkspace: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    @ObservedObject var session: CommunicationSession
    @ObservedObject var live: LiveCoordinator
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
            visualActivity: live.camera.state == .capturing, recognitionProcessing: client.processingUtteranceID != nil,
            liveEnabled: client.live?.state == "active", outputEnabled: client.output?.state == "ready",
            error: ["failed", "refused"].contains(client.lastDelivery?.state ?? "") || client.route?.state == "unavailable"
                || (client.live?.state == "active" && client.recognition?.reachable == false)))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if !session.isHome, session.surface != .compose, client.canReviewCurrent, !client.reviewDraft.editing {
                Button { session.goHome() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "text.bubble.fill")
                        Text("New words to review").font(.system(size: 12, weight: .semibold))
                        Spacer(minLength: 0)
                        Text("Show").font(.system(size: 12, weight: .semibold))
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                    }.padding(.horizontal, 12).frame(height: 32).foregroundStyle(.black)
                        .background(Color.mint, in: Capsule())
                }.buttonStyle(CommunicationButtonStyle()).accessibilityIdentifier("review-banner")
                    .accessibilityLabel("New recognized words to review. Show them.")
            }
            Group {
                switch session.surface {
                case .conversation: conversation
                case .compose: composer
                case .phrases: PhrasePicker(client: client, session: session, customize: { island.showCommunication(.customize) })
                case .customize: PhraseCustomization(session: session)
                case .assistance: ResponseAssistance(client: client, session: session)
                case .voice: MyVoicePicker(client: client)
                case .recovery:
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Previous correction").font(.system(size: 13, weight: .semibold))
                        ScrollView { Text(client.preservedCorrection ?? "No previous correction.").font(.system(size: 18)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                        Text("Kept for reference only. If delivery was unconfirmed, some or all may have played. Nothing is retried automatically. Select current recognized words and explicitly press Speak for any new correction.")
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
            if session.isHome {
                Text("tacit").font(.system(size: 15, weight: .semibold, design: .rounded)).tracking(-0.5)
                    .accessibilityAddTraits(.isHeader)
            } else {
                Button { session.goHome() } label: {
                    Label("Camera", systemImage: "chevron.left").font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(.white.opacity(0.14), in: Capsule())
                }.buttonStyle(CommunicationButtonStyle()).foregroundStyle(.white)
                    .accessibilityLabel("Back to camera").help("Back to camera · esc")
                    .accessibilityIdentifier("back-to-camera")
            }
            Text(client.isIsolated ? "OFFLINE · " + statusTitle : statusTitle).font(.system(size: 11, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8).foregroundStyle(statusColor)
                .accessibilityIdentifier("communication-state")
            Spacer(minLength: 0)
            if client.live?.state == "active" || client.output?.state == "ready" || live.camera.state.running {
                icon("pause.fill", "Pause camera, Live and voice") { live.pause() }
            }
            Menu {
                Button("Open browser workspace (optional)") { client.openWorkspace() }
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
        case .off, .ready, .error: return voiceProblem && client.conn == .connected ? "Check voice output" : guide.title
        case .reviewAvailable: return "Review your words, then press Speak"
        case .editing: return "Writing"
        case .synthesizing: return "Preparing voice"
        case .speaking: return "Sending to call microphone"
        case .paused: return "Paused"
        case .disconnected: return "Not connected"
        case .assistance: return "Help Me Respond"
        case .visuallyActive: return "Reading your lips…"
        case .processing: return "Interpreting your words"
        }
    }
    private var statusColor: Color {
        [.paused, .disconnected, .error].contains(state) ? .orange : state == .off ? .white.opacity(0.72) : .mint
    }

    private var guide: CommunicationGuide {
        .resolve(.init(connected: client.conn == .connected, serverDown: live.serverDown, starting: live.starting,
            recognizerReachable: client.recognition?.reachable, camera: live.camera.state, live: client.live?.state,
            ownsLive: client.ownsLive, liveElsewhere: live.liveElsewhere, processing: client.processingUtteranceID != nil,
            reviewExpired: client.reviewExpired, abstained: client.lastHypothesis?.decision == "abstained"))
    }
    /// Voice-output problems (failed/refused delivery, unavailable route) outrank the camera guidance.
    private var voiceProblem: Bool {
        ["failed", "refused"].contains(client.lastDelivery?.state ?? "") || client.route?.state == "unavailable"
    }
    private func perform(_ action: CommunicationGuide.Action) {
        switch action {
        case .startServer: client.startServer()
        case .reconnect: client.connect()
        case .start, .resume: live.startCommunicating()
        case .restartCamera: live.restartCamera()
        case .openCameraSettings: LiveCoordinator.openCameraSettings()
        case .type: island.showCommunication(.compose)
        }
    }

    @ViewBuilder private var conversation: some View {
        if client.canReviewCurrent {
            RecognitionReview(client: client, onEdit: { island.focusEditor() })
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(headline).font(.system(size: 23, weight: .medium)).tracking(-0.6)
                            .fixedSize(horizontal: false, vertical: true).lineLimit(3)
                            .accessibilityIdentifier("guide-title")
                        Text(detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.72)).lineLimit(3)
                    }
                    Spacer(minLength: 0)
                    if live.camera.state.running {
                        CameraPreview(session: live.camera.session)
                            .frame(width: 112, height: 72).clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(live.camera.state == .capturing ? Color.mint : .white.opacity(0.2), lineWidth: live.camera.state == .capturing ? 2 : 1))
                            .accessibilityLabel("Camera preview · \(live.camera.deviceName ?? "camera") is on")
                    }
                }
                Spacer(minLength: 0)
                HStack(spacing: 10) {
                    if !voiceProblem || client.conn != .connected, let action = guide.action, let title = guide.actionTitle {
                        IslandAction(title, symbol: symbol(action), prominent: [.start, .resume, .startServer].contains(action)) { perform(action) }
                            .accessibilityIdentifier("guide-action")
                    }
                    if client.conn == .connected && client.output?.state != "ready" && client.route?.state == "ready"
                        && ![.start, .resume].contains(guide.action) {
                        IslandAction(client.output?.state == "paused" ? "Resume voice" : "Enable voice", symbol: "speaker.wave.2") {
                            client.output(client.output?.state == "paused" ? "resume" : "enable")
                        }
                    }
                }
                if client.conn == .connected {
                    Text(CallRouteLine.text(routeState: client.route?.state, device: client.route?.device, readers: client.route?.readers, output: client.output?.state))
                        .font(.system(size: 10.5)).foregroundStyle(.white.opacity(0.62)).lineLimit(1).minimumScaleFactor(0.85)
                        .accessibilityIdentifier("call-route-line")
                }
            }
        }
        if client.preservedCorrection != nil {
            Button("View previous correction") { session.surface = .recovery }
                .font(.system(size: 11)).buttonStyle(.plain).foregroundStyle(.mint)
        }
    }
    private func symbol(_ a: CommunicationGuide.Action) -> String {
        switch a {
        case .startServer: return "power"
        case .reconnect: return "arrow.clockwise"
        case .start, .resume: return "play.fill"
        case .restartCamera: return "camera.rotate"
        case .openCameraSettings: return "gearshape"
        case .type: return "keyboard"
        }
    }
    private var headline: String {
        if client.conn == .connected {
            if state == .speaking { return "Your words are on their way." }
            if state == .synthesizing { return "Preparing your voice." }
            if voiceProblem { return "Voice needs attention." }
            if client.reviewSubmittedID != nil, guide.action == nil, !client.ownsLive { return "Your words. Your choice." }
        }
        return guide.title
    }
    private var detail: String {
        if client.conn == .connected {
            if voiceProblem { return client.authoredUnavailableReason ?? client.deliveryDetail ?? "Check voice output in settings, then try again." }
            if let delivery = client.deliveryDetail, state == .speaking || state == .synthesizing { return delivery }
            if let notice = client.notice { return notice }
            if let delivery = client.deliveryDetail { return delivery }
        }
        return guide.detail
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
            Button { session.goHome() } label: {
                HStack(spacing: 5) {
                    Image(systemName: "viewfinder").font(.system(size: 13))
                        .overlay(alignment: .topTrailing) {
                            if live.camera.state.running { Circle().fill(Color.green).frame(width: 6, height: 6).offset(x: 3, y: -2) }
                        }
                    Text("Camera").font(.system(size: 11, weight: .semibold))
                }.padding(.horizontal, 10).frame(height: 36)
                    .background(session.isHome ? .white.opacity(0.16) : .white.opacity(0.06), in: Capsule())
            }.buttonStyle(CommunicationButtonStyle()).foregroundStyle(.white)
                .accessibilityLabel(live.camera.state.running ? "Camera and recognized words, camera on" : "Camera and recognized words")
                .accessibilityAddTraits(session.isHome ? .isSelected : []).accessibilityIdentifier("dock-camera")
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
            dockButton("waveform", "My Voice", .voice)
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
