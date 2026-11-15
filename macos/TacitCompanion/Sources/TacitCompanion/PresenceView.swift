import SwiftUI

/// Help Me Respond — a conversation, not a prompt box: what THEY said (left bubble) → YOUR move (intent) →
/// YOUR words (right bubble, editable) → one deliberate Speak. Provenance is always visible: where the context
/// came from (you / sample — never "live"), and whether the wording was suggested by AI, edited by you or written by you.
struct PresenceView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var session: CommunicationSession
    @ObservedObject var presence: PresenceModel
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    private var reduceMotion: Bool { systemReduceMotion || CompanionAccessibility.reducedMotionPreview }
    @Environment(\.colorSchemeContrast) private var contrast
    @Namespace private var ns
    @FocusState private var focus: Field?
    @State private var editingContext = false
    enum Field { case context, point, draft }

    init(client: TacitClient, session: CommunicationSession) {
        self.client = client; self.session = session; self.presence = session.presence
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch presence.step {
            case .intent: intentStep
            case .point: pointStep
            case .working: workingStep
            case .draft: draftStep
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(CommunicationMotion.expansion(reduceMotion: reduceMotion), value: presence.step)
        .animation(CommunicationMotion.feedback(reduceMotion: reduceMotion), value: presence.drafts)
        .onChange(of: presence.step) { _, step in
            focus = step == .point ? .point : step == .draft ? .draft : nil
            if step == .draft, !presence.drafts.isEmpty, presence.problem == nil {
                AccessibilityNotification.Announcement("Suggested wording ready. Edit it, then press Speak.").post()
            }
        }
    }

    // MARK: steps

    private var intentStep: some View {
        VStack(alignment: .leading, spacing: 7) {
            theirBubble(compact: false)
            HStack(spacing: 6) {
                StepTrail(current: 1)
                Spacer(minLength: 0)
                toneMenu
            }
            HStack(spacing: 6) {
                ForEach(Array(PresenceIntent.allCases.enumerated()), id: \.element) { index, intent in
                    IntentTile(intent: intent, ns: ns, disabled: intent.needsContext && !presence.hasContext) {
                        presence.choose(intent, client: client)
                    }.keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
                }
            }
            Text(presence.problem ?? footnote)
                .font(.system(size: 10)).foregroundStyle(presence.problem == nil ? .white.opacity(0.62) : .orange)
                .lineLimit(2).fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("presence-footnote")
        }
    }

    private var pointStep: some View {
        VStack(alignment: .leading, spacing: 6) {
            theirBubble(compact: true)
            HStack(spacing: 6) {
                if let intent = presence.intent { IntentPill(intent: intent, ns: ns) }
                Text(presence.intent?.pointPrompt ?? "").font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.85)
            }
            TextField(presence.intent?.pointPlaceholder ?? "", text: $presence.point, axis: .vertical)
                .lineLimit(2...2).textFieldStyle(.plain).font(.system(size: 18)).focused($focus, equals: .point)
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(Color.mint.opacity(contrast == .increased ? 0.2 : 0.09), in: YourBubbleShape())
                .overlay(YourBubbleShape().stroke(Color.mint.opacity(0.45), lineWidth: 1))
                .onSubmit { presence.request(client) }
                .accessibilityLabel("Your point, in your own words. Required. TACIT only rewords it")
                .accessibilityIdentifier("presence-point")
            HStack(spacing: 8) {
                Text(presence.problem ?? "Only your words decide what you think. TACIT just helps say it.")
                    .font(.system(size: 10)).foregroundStyle(presence.problem == nil ? .white.opacity(0.62) : .orange).lineLimit(2)
                Spacer(minLength: 0)
                IslandAction(aiAvailable ? "Suggest wording" : "Write it", symbol: aiAvailable ? "sparkles" : "pencil", prominent: true) {
                    presence.request(client)
                }.disabled(presence.point.trimmed.isEmpty).accessibilityIdentifier("presence-suggest")
                    .help("Return")
            }
        }
    }

    private var workingStep: some View {
        VStack(alignment: .leading, spacing: 6) {
            theirBubble(compact: true)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    if let intent = presence.intent { IntentPill(intent: intent, ns: ns) }
                    if !reduceMotion { ProgressView().controlSize(.small) }
                    Text("Finding the words…").font(.system(size: 12, weight: .medium)).foregroundStyle(.mint)
                }
                RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.10)).frame(height: 10)
                RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.07)).frame(width: 220, height: 10)
            }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.mint.opacity(0.06), in: YourBubbleShape())
                .overlay(YourBubbleShape().stroke(Color.mint.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                .accessibilityElement(children: .combine).accessibilityLabel("Finding wording for \(presence.intent?.title ?? "your intention")")
            HStack {
                Text("Sent to \(client.respondStatus?.provider ?? "the AI") to suggest wording. Nothing is spoken.")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.62)).lineLimit(2)
                Spacer(minLength: 0)
                IslandAction("Cancel", symbol: "xmark") { presence.cancel(client) }
                    .help("esc").accessibilityIdentifier("presence-cancel")
            }
        }
    }

    private var draftStep: some View {
        VStack(alignment: .leading, spacing: 6) {
            theirBubble(compact: true)
            VStack(alignment: .leading, spacing: 5) {
                TextField("Write what you mean…", text: $presence.draft, axis: .vertical)
                    .lineLimit(2...3).textFieldStyle(.plain).font(.system(size: 18, weight: .medium)).focused($focus, equals: .draft)
                    .accessibilityLabel("Your words. \(originText). Editable. Spoken only when you press Speak")
                    .accessibilityIdentifier("presence-draft")
                HStack(spacing: 5) {
                    if let intent = presence.intent { IntentPill(intent: intent, ns: ns, small: true) }
                    Text(originText).font(.system(size: 10, weight: .medium)).foregroundStyle(presence.assisted ? .mint : .white.opacity(0.7))
                        .lineLimit(1).accessibilityIdentifier("presence-origin")
                    Spacer(minLength: 0)
                    Text("\(presence.draft.utf16.count)/500").font(.system(size: 9.5).monospacedDigit()).foregroundStyle(.white.opacity(0.45))
                }
            }.padding(.horizontal, 12).padding(.vertical, 9)
                .background(Color.mint.opacity(contrast == .increased ? 0.2 : 0.09), in: YourBubbleShape())
                .overlay(YourBubbleShape().stroke(Color.mint.opacity(0.5), lineWidth: 1))
            if let problem = presence.problem {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.circle").foregroundStyle(.orange)
                    Text(problem).font(.system(size: 10.5)).foregroundStyle(.orange).lineLimit(2).accessibilityIdentifier("presence-problem")
                    Spacer(minLength: 0)
                    if aiAvailable { Button("Try again") { presence.request(client) }.font(.system(size: 11, weight: .semibold)) }
                }
            }
            HStack(spacing: 6) {
                alternatives
                Spacer(minLength: 0)
                VoiceChip(client: client)
                if client.output?.state != "ready" {
                    OutputAuthorizationButton(client: client)
                } else {
                    IslandAction("Speak", symbol: "arrow.up", prominent: true) { session.speakPresence(using: client) }
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(!client.canSpeakAuthored || !presence.canSpeakDraft)
                        .accessibilityLabel("Speak these words now")
                        .help(client.authoredUnavailableReason ?? "Speak exactly these words · ⌘↩")
                        .accessibilityIdentifier("presence-speak")
                }
            }
        }
    }

    // MARK: pieces

    @ViewBuilder private func theirBubble(compact: Bool) -> some View {
        let shown = presence.focus ?? presence.context.trimmed
        if presence.hasContext && !(editingContext && !compact) {
            Button { presence.editContext(client); editingContext = true } label: {
                VStack(alignment: .leading, spacing: compact ? 1 : 3) {
                    HStack(spacing: 5) {
                        Text("THEY SAID").tracking(0.6)
                        Text("·")
                        Text(presence.contextSource.label).tracking(0.6)
                            .foregroundStyle(presence.contextSource == .sample ? Color.orange : .white.opacity(0.75))
                        if presence.draftsOutOfDate && presence.step == .draft { Text("· changed — suggest again").foregroundStyle(.orange) }
                        Spacer(minLength: 0)
                        if !compact { Image(systemName: "pencil").font(.system(size: 9)) }
                    }.font(.system(size: 9, weight: .bold)).foregroundStyle(.white.opacity(0.6))
                    Text(shown).font(.system(size: compact ? 12 : 15, weight: .medium)).lineLimit(compact ? 1 : 2)
                        .multilineTextAlignment(.leading).foregroundStyle(.white.opacity(compact ? 0.8 : 0.95))
                }.padding(.horizontal, 11).padding(.vertical, compact ? 5 : 8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(.white.opacity(contrast == .increased ? 0.16 : 0.08), in: TheirBubbleShape())
            }.buttonStyle(CommunicationButtonStyle()).matchedGeometryEffect(id: "their-bubble", in: ns)
                .accessibilityLabel("They said, \(presence.contextSource == .sample ? "sample text" : "added by you"): \(shown). Edit")
                .accessibilityIdentifier("presence-context")
        } else if !compact {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    TextField("What did they say?", text: $presence.context, axis: .vertical)
                        .lineLimit(1...2).textFieldStyle(.plain).font(.system(size: 14)).focused($focus, equals: .context)
                        .onSubmit { editingContext = false }
                        .accessibilityLabel("What the other person said. Added by you; TACIT does not listen to the meeting")
                        .accessibilityIdentifier("presence-context-field")
                    if editingContext && presence.hasContext {
                        Button("Done") { editingContext = false }.font(.system(size: 11, weight: .semibold))
                    } else if !presence.hasContext {
                        Button("Try a sample") { presence.useSample() }.font(.system(size: 11, weight: .semibold)).foregroundStyle(.orange)
                            .accessibilityHint("Fills in a sample question, labelled SAMPLE")
                    }
                }
                Text("TACIT doesn't listen to your meeting. Add what was said — or skip it.")
                    .font(.system(size: 9.5)).foregroundStyle(.white.opacity(0.55))
            }.padding(.horizontal, 11).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
                .background(TheirBubbleShape().stroke(.white.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                .matchedGeometryEffect(id: "their-bubble", in: ns)
                .onAppear { if editingContext { focus = .context } }
        }
    }

    @ViewBuilder private var alternatives: some View {
        if presence.drafts.count > 1 || presence.ownDraft != nil {
            HStack(spacing: 4) {
                ForEach(presence.drafts.indices, id: \.self) { i in
                    let selected = presence.origin == .suggestion(i)
                    Button { presence.pick(i) } label: {
                        Text("\(i + 1)").font(.system(size: 11, weight: .bold)).frame(width: 26, height: 26)
                            .foregroundStyle(selected ? .black : .white)
                            .background(selected ? Color.mint : .white.opacity(0.1), in: Circle())
                    }.buttonStyle(CommunicationButtonStyle())
                        .help(presence.drafts[i]).accessibilityLabel("Suggestion \(i + 1): \(presence.drafts[i])")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                }
                if presence.ownDraft != nil {
                    Button("Mine") { presence.restoreOwnDraft() }.font(.system(size: 10.5, weight: .semibold))
                        .accessibilityLabel("Bring back the words you wrote")
                }
            }
        }
        if aiAvailable && presence.intent != nil && presence.problem == nil {
            Button { presence.request(client) } label: {
                Image(systemName: "arrow.clockwise").font(.system(size: 11, weight: .semibold)).frame(width: 26, height: 26)
                    .background(.white.opacity(0.08), in: Circle())
            }.buttonStyle(CommunicationButtonStyle()).keyboardShortcut("r", modifiers: .command)
                .accessibilityLabel("Suggest different wording").help("Suggest again · ⌘R")
                .accessibilityIdentifier("presence-again")
        }
    }

    private var toneMenu: some View {
        Menu {
            Picker("Tone", selection: $presence.tone) { ForEach(PresenceTone.allCases) { Text($0.title).tag($0) } }
                .pickerStyle(.inline)
            Divider()
            Button("Clear context and wording") { presence.clearAll(client); editingContext = false }
        } label: {
            Text("Tone: \(presence.tone.title)").font(.system(size: 10.5, weight: .medium)).foregroundStyle(.white.opacity(0.75))
        }.menuStyle(.borderlessButton).menuIndicator(.visible).fixedSize()
            .accessibilityLabel("Wording tone, \(presence.tone.title). Your saved preference")
    }

    private var aiAvailable: Bool { client.respondStatus?.available == true }
    private var footnote: String {
        guard client.conn == .connected else { return "Not connected — intentions open a starter you finish yourself." }
        guard aiAvailable else { return "No AI connected — intentions open a starter you finish yourself. Nothing is sent anywhere." }
        return "Pick what you want to do. What you added goes to \(client.respondStatus?.provider ?? "the AI") for wording only — nothing is spoken until you press Speak."
    }
    private var originText: String {
        switch presence.origin {
        case .suggestion: return presence.provenance ?? "Suggested by AI"
        case .edited: return "Your edit of an AI suggestion"
        case .manual:
            if presence.draft.trimmed.isEmpty { return "Write it yourself" }
            return presence.draft == presence.intent?.starter ? "Starter · finish in your words" : "Written by you"
        }
    }
}

/// Where the user is in the arc. Small, but answers "what is this for?" at a glance.
private struct StepTrail: View {
    var current: Int
    private let steps = ["They said", "Your move", "Your words", "Speak"]
    var body: some View {
        HStack(spacing: 4) {
            ForEach(steps.indices, id: \.self) { i in
                Text(steps[i]).font(.system(size: 10.5, weight: i == current ? .bold : .medium))
                    .foregroundStyle(i == current ? Color.mint : .white.opacity(i < current ? 0.6 : 0.38))
                if i < steps.count - 1 { Image(systemName: "chevron.right").font(.system(size: 7, weight: .bold)).foregroundStyle(.white.opacity(0.3)) }
            }
        }.accessibilityElement(children: .ignore).accessibilityLabel("Step \(current + 1) of 4: \(steps[current])")
    }
}

private struct IntentTile: View {
    var intent: PresenceIntent
    var ns: Namespace.ID
    var disabled: Bool
    var action: () -> Void
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: intent.symbol).font(.system(size: 17, weight: .medium)).foregroundStyle(.mint)
                Text(intent.title).font(.system(size: 10.5, weight: .semibold)).multilineTextAlignment(.center)
                    .lineLimit(2).minimumScaleFactor(0.85).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, minHeight: 60).padding(.horizontal, 3)
                .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(contrast == .increased ? 0.16 : 0.075))
                    .matchedGeometryEffect(id: "intent-\(intent.id)", in: ns))
        }.buttonStyle(CommunicationButtonStyle()).disabled(disabled)
            .accessibilityLabel(intent.title).accessibilityHint(disabled ? "Add what was said first" : intent.hint)
            .help(disabled ? "Add what was said first" : intent.hint)
            .accessibilityIdentifier("presence-intent-\(intent.id)")
    }
}

private struct IntentPill: View {
    var intent: PresenceIntent
    var ns: Namespace.ID
    var small = false
    var body: some View {
        Label(intent.title, systemImage: intent.symbol).font(.system(size: small ? 9.5 : 10.5, weight: .semibold))
            .padding(.horizontal, small ? 6 : 8).frame(height: small ? 18 : 22).foregroundStyle(.mint)
            .background(RoundedRectangle(cornerRadius: 11).fill(.white.opacity(0.08)).matchedGeometryEffect(id: "intent-\(intent.id)", in: ns))
            .fixedSize().accessibilityLabel("Your intention: \(intent.title)")
    }
}

/// Which voice Speak will use (the server's effective My Voice), so the user knows before pressing.
private struct VoiceChip: View {
    @ObservedObject var client: TacitClient
    var body: some View {
        let name = client.myVoice?.effective?.name ?? (client.output?.voice.isEmpty == false ? client.output?.voice : nil) ?? "voice off"
        Label(name, systemImage: "speaker.wave.2.fill").font(.system(size: 10, weight: .medium)).lineLimit(1)
            .padding(.horizontal, 7).frame(height: 22).frame(maxWidth: 110)
            .background(.white.opacity(0.07), in: Capsule()).foregroundStyle(.white.opacity(0.8))
            .accessibilityLabel("Speaks in your chosen voice: \(name)")
    }
}

/// Incoming speech bubble: tail at the bottom-left.
private struct TheirBubbleShape: Shape {
    func path(in r: CGRect) -> Path {
        Path(roundedRect: r, cornerRadii: .init(topLeading: 12, bottomLeading: 3, bottomTrailing: 12, topTrailing: 12))
    }
}
/// Outgoing speech bubble (the user's words): tail at the bottom-right.
private struct YourBubbleShape: Shape {
    func path(in r: CGRect) -> Path {
        Path(roundedRect: r, cornerRadii: .init(topLeading: 12, bottomLeading: 12, bottomTrailing: 3, topTrailing: 12))
    }
}
