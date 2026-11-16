import AppKit
import SwiftUI

struct FlowView: View {
    @ObservedObject var flow: FlowClient
    @ObservedObject var client: TacitClient
    @ObservedObject var session: CommunicationSession
    @State private var participants = false
    @State private var textConsent = false
    @State private var inspect = false
    @FocusState private var editing: Bool
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Flow · conversation participation", systemImage: "point.3.connected.trianglepath.dotted").font(.system(size: 14, weight: .semibold))
                    Spacer()
                    if flow.snapshot?.state != "off", flow.snapshot != nil {
                        Button("Stop listening") { flow.pause() }.accessibilityIdentifier("flow-stop-listening")
                    }
                }
                if !flow.available { Text(flow.notice); Text("Start the isolated Flow candidate server, then reconnect TACIT. Ordinary communication stays available.") }
                else if flow.snapshot?.state == "off" || flow.snapshot?.state == "paused" {
                    consent
                    if flow.snapshot?.drafts.isEmpty == false { drafts }
                } else {
                    Text(flow.notice).font(.system(size: 11)).foregroundStyle(.mint)
                    if flow.snapshot?.state == "armed" { pairing }
                    else { workspace }
                }
                Text("Nothing here speaks automatically. Transcription and Gemini interpretations may be wrong.")
                    .font(.system(size: 11)).foregroundStyle(.white.opacity(0.74))
            }.padding(.trailing, 6)
        }.safeAreaInset(edge: .bottom, spacing: 0) {
            if flow.active != nil, flow.snapshot?.state == "capturing" { actionBar.padding(.top, 6).background(.black) }
        }.font(.system(size: 13)).buttonStyle(FlowActionStyle()).accessibilityElement(children: .contain)
    }
    private var actionBar: some View {
                HStack {
                    Button("Save my turn") { flow.save() }.frame(minHeight: 36)
                    Button("Discard") { flow.discard() }.frame(minHeight: 36)
                    Spacer()
                    if client.output?.state != "ready" { OutputAuthorizationButton(client: client) }
                    else {
                        Button("Speak") { _ = flow.speak(using: client) }.frame(minHeight: 36)
                            .disabled(!client.canSpeakAuthored || !PersonalPhrase.valid(flow.text))
                            .keyboardShortcut(.return, modifiers: .command).accessibilityIdentifier("flow-speak")
                    }
                }
    }
    private var consent: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Keep your place while you respond.").font(.system(size: 20, weight: .medium))
            Text("Flow hears only a Meet tab you choose in Chrome. Audio is transcribed locally, kept in memory, and cleared on Stop. Tell everyone before starting; system permission alone is not their agreement.")
            Toggle("Everyone in this meeting has agreed to capture", isOn: $participants)
            Toggle("Send recent transcript text to Google Gemini for interpretation", isOn: $textConsent).disabled(!flow.policyVerified)
            if !flow.policyVerified { Text("Gemini disabled until this project's provider terms are verified. Local transcription and saved turns work without it.").font(.system(size: 11)) }
            Button("Enable Flow for this meeting") { flow.start(participants: participants, textConsent: textConsent); participants = false; textConsent = false }
                .disabled(!participants).frame(minHeight: 36).accessibilityIdentifier("flow-consent")
        }
    }
    private var pairing: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Choose your Meet tab").font(.system(size: 18, weight: .semibold))
            Text("Generate a one-use code, then open TACIT Flow from Chrome's toolbar on your Meet tab and paste it. The code expires in one minute.")
            Button(flow.pairingCode == nil ? "Generate pairing code" : "New pairing code") { flow.pair() }.frame(minHeight: 36)
            if let code = flow.pairingCode {
                Button("Copy one-use code") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(code, forType: .string) }
                    .frame(minHeight: 36).accessibilityHint("Paste into the TACIT Flow extension. This code authorizes capture only, never speech.")
            }
        }
    }
    private var workspace: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let active = flow.active {
                if let source = active.anchor {
                    caption("YOU'RE RESPONDING TO · saved source")
                    Text("“\(source.quote)”").textSelection(.enabled)
                    Text("\(source.turnId.prefix(8)) · revision \(source.revision) · automatically transcribed")
                        .font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
                }
                if let change = flow.relevant { update(change) }
                caption("YOUR UNCHANGED WORDS")
                TextField("Your answer", text: Binding(get: { flow.text }, set: { flow.edit($0) }), axis: .vertical)
                    .lineLimit(2...5).textFieldStyle(.plain).font(.system(size: 18)).focused($editing)
                    .padding(10).background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityIdentifier("flow-draft").accessibilityLabel("Your answer. Written by you. Up to 500 characters.")
                Text("Written by you · \(flow.text.utf16.count)/500 · \(client.myVoice?.effectiveLabel ?? client.output?.voice ?? "selected voice")")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
                recovery
                if let context = flow.assistanceContext {
                    Button("Help Me Respond using this selected context") {
                        session.presence.useSelectedMeetingContext(context); session.surface = .assistance
                    }.disabled(!session.presence.context.isEmpty || !session.presence.point.isEmpty || !session.presence.draft.isEmpty)
                        .frame(minHeight: 36).accessibilityHint("You still choose your move and supply your own point. Your saved answer is kept.")
                }
            } else if let anchor = flow.snapshot?.anchors.last {
                caption("HEARD IN MEET · question or proposal")
                Text("“\(anchor.source.quote)”").font(.system(size: 19)).textSelection(.enabled)
                Text("Not necessarily addressed to you.").font(.system(size: 11))
                HStack {
                    Button("Respond / save question") { flow.select(anchor) }.frame(minHeight: 36)
                    Button("Dismiss context") { flow.clear() }.frame(minHeight: 36)
                }
            } else {
                Text("Listening for context. You can choose a finalized source below; no question is assumed to be yours.")
            }
            drafts
            DisclosureGroup("Inspect context / choose an earlier source", isExpanded: $inspect) {
                ForEach(flow.snapshot?.turns.reversed() ?? []) { turn in
                    VStack(alignment: .leading) {
                        Text(turn.text).textSelection(.enabled)
                        Text(turn.final ? "Finalized · revision \(turn.revision)" : "Provisional · not used by Gemini").font(.system(size: 10))
                        if turn.final { Button("Respond to this source") { flow.select(turn) }.frame(minHeight: 36) }
                    }.padding(.vertical, 6)
                }
                Button("Clear conversation context") { flow.clear() }.frame(minHeight: 36)
            }
            Text(flow.snapshot?.semantic ?? "Gemini off").font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
        }
    }
    private func update(_ change: FlowChange) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            caption(change.relation == "ambiguous" ? "CONTEXT LINK UNCERTAIN · Gemini" : "POSSIBLE CONTEXT CHANGE · Gemini")
            Text("Original: \(change.detailBefore)").fontWeight(.medium)
            Text("Later: \(change.detailAfter)").fontWeight(.medium)
            DisclosureGroup("Review source evidence") {
                Text("Before: “\(change.before.quote)”\nLater: “\(change.after.quote)”").textSelection(.enabled)
                Text("\(change.before.turnId.prefix(8)) r\(change.before.revision) → \(change.after.turnId.prefix(8)) r\(change.after.revision)").font(.system(size: 10))
            }
            HStack {
                Button("Keep my response") { flow.acknowledge() }.frame(minHeight: 36)
                Button("Edit my response") { editing = true }.frame(minHeight: 36)
                Button("Dismiss update") { flow.acknowledge() }.frame(minHeight: 36)
            }
        }.padding(10).background(.orange.opacity(0.13), in: RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("flow-change").accessibilityElement(children: .contain)
    }
    private var drafts: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(flow.snapshot?.drafts ?? []) { draft in
                if draft.id != flow.activeID {
                    Button { flow.choose(draft.id) } label: {
                        Label("Resume: \((flow.words[draft.id] ?? draft.text).isEmpty ? draft.anchor?.quote ?? "Saved question" : flow.words[draft.id] ?? draft.text)", systemImage: "bookmark")
                            .lineLimit(2).frame(minHeight: 36, alignment: .leading)
                    }.accessibilityIdentifier("flow-resume")
                }
            }
        }
    }
    private var recovery: some View {
        DisclosureGroup("Recover my turn") {
            HStack {
                Button("Repeat question") { flow.recovery("repeat") }
                Button("Clarify last part") { flow.recovery("clarify") }
                Button("Bring this back") { flow.recovery("rejoin") }
            }.frame(minHeight: 36)
            if let template = flow.recoveryText {
                Text(template)
                Button("Edit this request in Type a message") {
                    if client.typedDraft.isEmpty { client.typedDraft = template; session.surface = .compose }
                }.disabled(!client.typedDraft.isEmpty).frame(minHeight: 36)
            }
            Text("Your saved answer is kept. Each request stays editable and needs Speak.").font(.system(size: 10))
        }
    }
    private func caption(_ title: String) -> some View { Text(title).font(.system(size: 10, weight: .bold)).tracking(0.5).foregroundStyle(.mint) }
}

private struct FlowActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 9).frame(minHeight: 44)
            .background(.white.opacity(configuration.isPressed ? 0.23 : 0.12), in: RoundedRectangle(cornerRadius: 9))
            .contentShape(RoundedRectangle(cornerRadius: 9)).opacity(enabled ? 1 : 0.5)
    }
}

struct FlowIndicator: View {
    @ObservedObject var flow: FlowClient
    var body: some View {
        if flow.listening { Label("Meet", systemImage: "ear.badge.waveform").font(.system(size: 9, weight: .semibold)).foregroundStyle(.mint)
            .accessibilityLabel("Flow is listening to the selected Meet tab. Local transcription.") }
    }
}
