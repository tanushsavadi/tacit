import SwiftUI

/// Original attached silhouette. The narrow neck meets the hardware cutout; all hit targets are below the menu bar.
struct IslandSilhouette: Shape {
    var neckWidth: CGFloat = 180
    var attached = true
    var animatableData: CGFloat {
        get { neckWidth }
        set { neckWidth = newValue }
    }
    func path(in r: CGRect) -> Path {
        guard attached else { return Path(roundedRect: r.insetBy(dx: 2, dy: 1), cornerRadius: min(24, r.height / 2)) }
        let edge: CGFloat = 4
        let shoulder: CGFloat = 8
        let radius = min(22, r.height / 2)
        let neck = min(max(40, neckWidth), r.width - 24)
        let left = r.midX - neck / 2, right = r.midX + neck / 2
        var p = Path()
        p.move(to: CGPoint(x: left, y: 0))
        p.addCurve(to: CGPoint(x: edge, y: shoulder), control1: CGPoint(x: left, y: shoulder), control2: CGPoint(x: edge, y: 0))
        p.addLine(to: CGPoint(x: edge, y: r.height - radius))
        p.addQuadCurve(to: CGPoint(x: edge + radius, y: r.height), control: CGPoint(x: edge, y: r.height))
        p.addLine(to: CGPoint(x: r.width - edge - radius, y: r.height))
        p.addQuadCurve(to: CGPoint(x: r.width - edge, y: r.height - radius), control: CGPoint(x: r.width - edge, y: r.height))
        p.addLine(to: CGPoint(x: r.width - edge, y: shoulder))
        p.addCurve(to: CGPoint(x: right, y: 0), control1: CGPoint(x: r.width - edge, y: 0), control2: CGPoint(x: right, y: shoulder))
        p.closeSubpath()
        return p
    }
}

struct IslandView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    @ObservedObject var live: LiveCoordinator
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.colorSchemeContrast) private var contrast
    private var reduceMotion: Bool { systemReduceMotion || CompanionAccessibility.reducedMotionPreview }
    private var state: LivingNotchPresentation { island.presentation }
    private var silhouette: IslandSilhouette { .init(neckWidth: island.geometry.cutoutWidth, attached: island.geometry.hasNotch) }

    init(client: TacitClient, island: IslandController) {
        self.client = client; self.island = island; self.live = island.live
    }
    var body: some View {
        VStack(spacing: 0) {
            crown
            if island.expanded {
                ConversationView(client: client, island: island)
                    .padding(.horizontal, 28).padding(.top, 4).padding(.bottom, 22)
                    .transition(CommunicationMotion.contentTransition(reduceMotion: reduceMotion))
            } else if island.peeking {
                peek.padding(.horizontal, 22).padding(.top, 3).padding(.bottom, 16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .transition(CommunicationMotion.contentTransition(reduceMotion: reduceMotion))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(silhouette.fill(.black))
        .overlay(silhouette.stroke(.white.opacity(contrast == .increased ? 0.65 : (island.hovered || island.expanded ? 0.13 : 0.055)), lineWidth: 1).allowsHitTesting(false))
        .clipShape(silhouette)
        .contentShape(silhouette)
        .foregroundStyle(.white).preferredColorScheme(.dark)
        .onHover { island.hover($0) }
        // AppKit's spring owns geometry. Content only dissolves, so there is no competing layout spring.
        .transaction { if reduceMotion { $0.animation = nil; $0.disablesAnimations = true } }
    }

    private var crown: some View {
        HStack(spacing: 8) {
            Button { island.expanded ? island.collapse() : island.expand() } label: {
                HStack(spacing: 8) {
                    Text(client.isIsolated ? "TEST" : "tacit").font(.system(size: 12, weight: .semibold, design: .rounded)).tracking(-0.4)
                        .foregroundStyle(.white.opacity(island.hovered ? 0.95 : 0.78))
                    Capsule().fill(.white.opacity(0.18)).frame(width: 1, height: 10).accessibilityHidden(true)
                    if state.kind != .ready {
                        Circle().fill(state.color).frame(width: 4, height: 4).accessibilityHidden(true)
                    }
                    Text(state.compactTitle)
                        .font(.system(size: 11.5, weight: .medium)).lineLimit(1).minimumScaleFactor(0.9)
                        .foregroundStyle(state.realtime ? .orange : .white.opacity(0.83))
                        .contentTransition(.opacity)
                        .animation(CommunicationMotion.feedback(reduceMotion: reduceMotion), value: state.compactTitle)
                    Spacer(minLength: 0)
                    if !state.busy && client.live?.state != "active" {
                        Image(systemName: island.expanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 8, weight: .semibold)).foregroundStyle(.white.opacity(island.hovered ? 0.8 : 0.4))
                    }
                }.contentShape(Rectangle())
            }.buttonStyle(CommunicationButtonStyle())
                .accessibilityLabel("TACIT. \(state.title). \(state.detail). \(island.expanded ? "Collapse" : "Open") communication workspace")
                .accessibilityIdentifier("living-notch-status")
                .help("Open TACIT · ⌃⇧⌘T. Right-click for notch appearance.")
            if state.busy {
                Button { client.stopEverything() } label: {
                    Image(systemName: "stop.fill").font(.system(size: 9, weight: .bold)).frame(width: 26, height: 28)
                        .background(.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 8))
                }.buttonStyle(CommunicationButtonStyle()).accessibilityLabel("Stop everything immediately")
                    .accessibilityIdentifier("living-notch-stop").help("Stop camera, Live and voice · ⌃⇧⌘.")
            } else if client.live?.state == "active" {
                Button { live.pause() } label: {
                    Image(systemName: "pause.fill").font(.system(size: 9, weight: .semibold)).frame(width: 26, height: 28)
                }.buttonStyle(CommunicationButtonStyle()).foregroundStyle(.white.opacity(0.7))
                    .accessibilityLabel("Pause camera, Live and voice")
            }
        }
        .padding(.horizontal, 18)
        .frame(height: island.discreet && !island.expanded && !island.peeking ? 28 : 38)
        .contextMenu {
            Button("Visible notch (recommended)") { island.setDiscreet(false) }
            Button("Discreet notch") { island.setDiscreet(true) }
            Button(island.expanded ? "Collapse" : "Open workspace · ⌃⇧⌘T") { island.expanded ? island.collapse() : island.showForKeyboard() }
        }
    }

    @ViewBuilder private var peek: some View {
        if state.problem {
            guidancePeek
        } else if client.canReviewCurrent, !client.realtimeActive, let h = client.lastHypothesis {
            reviewPeek(h)
        } else if let d = client.lastDelivery, state.busy || (island.reveal && ["rendered", "interrupted"].contains(d.state)) {
            VStack(alignment: .leading, spacing: 10) {
                Text(d.state == "rendered" ? "Speech complete · call microphone" : d.state == "interrupted" ? "Speech stopped" : state.title)
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(state.color)
                ScrollView { Text(d.text).font(.system(size: 18, weight: .medium)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                Text(client.realtimeActive ? "Experimental · spoken without review" : "Your exact words · local output status")
                    .font(.system(size: 11)).foregroundStyle(client.realtimeActive ? .orange : .white.opacity(0.72))
                if state.busy {
                    IslandAction("Stop", symbol: "stop.fill") { client.stopEverything() }
                }
            }.accessibilityElement(children: .contain).accessibilityLabel("Speech delivery")
        } else {
            guidancePeek
        }
    }

    private func reviewPeek(_ h: TacitClient.Hypothesis) -> some View {
        let words = client.reviewDraft.editing ? client.reviewDraft.text : client.reviewDraft.candidate?.text ?? h.text
        return VStack(alignment: .leading, spacing: 10) {
            ScrollView {
                Text(words).font(.system(size: 18, weight: .medium)).tracking(-0.3)
                    .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
            }.accessibilityLabel("Exact recognized words to review: \(words)")
            Text(client.reviewDraft.editing ? "Your correction · only Speak sends it" : "Review first · only Speak sends these words")
                .font(.system(size: 11)).foregroundStyle(.white.opacity(0.76))
            HStack(spacing: 10) {
                IslandAction("Edit", symbol: "pencil") {
                    guard client.lastHypothesis?.id == h.id else { return }
                    if !client.reviewDraft.editing, let base = client.reviewDraft.candidate ?? h.candidates.first(where: { $0.kind == "raw" }) {
                        client.chooseReview(base, of: h.id, editing: true)
                    }
                    island.beginReview(); island.focusEditor()
                }.accessibilityIdentifier("peek-edit")
                Spacer(minLength: 0)
                if client.output?.state != "ready" { OutputAuthorizationButton(client: client) }
                else {
                    IslandAction("Speak", symbol: "arrow.up", prominent: true) {
                        guard client.lastHypothesis?.id == h.id,
                              words == (client.reviewDraft.editing ? client.reviewDraft.text : client.reviewDraft.candidate?.text ?? client.lastHypothesis?.text) else { return }
                        _ = client.reviewDraft.editing ? client.speakReviewed() : client.speakShownWords()
                    }.disabled(client.route?.state != "ready" || words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || words.utf16.count > 500)
                        .accessibilityLabel("Speak exactly: \(words)").accessibilityIdentifier("peek-speak")
                        .keyboardShortcut(.return, modifiers: .command)
                }
            }
        }
    }

    private var guide: CommunicationGuide {
        .resolve(.init(connected: client.conn == .connected, serverDown: live.serverDown, starting: live.starting,
            recognizerReachable: client.recognition?.reachable, camera: client.isIsolated ? ExperienceLab.shared.cameraFixture ?? live.camera.state : live.camera.state, live: client.live?.state,
            ownsLive: client.ownsLive, liveElsewhere: live.liveElsewhere, processing: client.processingUtteranceID != nil,
            reviewExpired: client.reviewExpired, abstained: client.lastHypothesis?.decision == "abstained", realtime: client.realtimeActive))
    }
    private var recoveryDetail: String {
        if client.route?.state == "unavailable" || ["failed", "refused"].contains(client.lastDelivery?.state ?? "") {
            return client.lastDelivery?.reason ?? client.route?.reason ?? "Voice output is unavailable. Open settings to check the selected microphone and voice."
        }
        return guide.detail
    }
    private var guidancePeek: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(state.problem ? state.title : guide.title)
                .font(.system(size: 17, weight: .medium)).tracking(-0.3)
            Text(recoveryDetail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.8)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if client.route?.state == "unavailable" || ["failed", "refused"].contains(client.lastDelivery?.state ?? "") {
                IslandAction("Output settings", symbol: "slider.horizontal.3", prominent: true) { island.showUtility(.diagnostics) }
            } else if let action = guide.action, let title = guide.actionTitle {
                IslandAction(title, symbol: "arrow.right", prominent: true) { perform(action) }
            } else {
                IslandAction("Open workspace", symbol: "arrow.down.right") { island.expand() }
            }
        }
    }
    private func perform(_ action: CommunicationGuide.Action) {
        guard !client.isIsolated else { client.notice = "Offline lab · recovery action not performed."; return }
        switch action {
        case .startServer: client.startServer()
        case .reconnect: client.connect()
        case .start, .resume: live.startCommunicating()
        case .restartCamera: live.restartCamera()
        case .openCameraSettings: LiveCoordinator.openCameraSettings()
        case .type: island.showCommunication(.compose)
        }
    }
}
