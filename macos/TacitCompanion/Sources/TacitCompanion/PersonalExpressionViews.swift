import SwiftUI

struct PhrasePicker: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var session: CommunicationSession
    var customize: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Sounds like you").font(.system(size: 13, weight: .semibold))
                Spacer()
                Button("Customize", action: customize).font(.system(size: 11))
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 7) {
                ForEach(session.phrases) { phrase in
                    Button { session.phraseSelection = phrase.id } label: {
                        HStack(spacing: 5) {
                            Text(phrase.text).font(.system(size: 12, weight: .medium)).lineLimit(2).multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                            if session.phraseSelection == phrase.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(.mint) }
                        }.padding(10).frame(maxWidth: .infinity, minHeight: 45, alignment: .leading)
                            .background(.white.opacity(session.phraseSelection == phrase.id ? 0.14 : 0.07), in: RoundedRectangle(cornerRadius: 11))
                    }.buttonStyle(CommunicationButtonStyle()).accessibilityLabel("Select saved phrase: \(phrase.text)")
                        .accessibilityAddTraits(session.phraseSelection == phrase.id ? .isSelected : [])
                }
            }
            HStack {
                Text(client.authoredUnavailableReason ?? "Saved wording · selected by you")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.72)).lineLimit(2)
                Spacer()
                if client.output?.state != "ready" {
                    OutputAuthorizationButton(client: client)
                } else {
                    IslandAction("Speak", symbol: "arrow.up", prominent: true) {
                        session.speakSelection(using: client)
                    }.disabled(!client.canSpeakAuthored || session.phraseSelection == nil)
                }
            }
        }
    }
}

struct PhraseCustomization: View {
    @ObservedObject var session: CommunicationSession
    @State private var hold = ""
    @State private var phrases = PersonalPhrase.defaults
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("Make it yours").font(.system(size: 13, weight: .semibold))
                Spacer()
                Button("Cancel") { session.surface = .phrases }
                Button("Save") { if session.save(hold: hold, phrases: phrases) { session.surface = .phrases } }
                    .keyboardShortcut("s", modifiers: .command)
            }.font(.system(size: 11))
            ScrollView {
                VStack(alignment: .leading, spacing: 7) {
                    Text("Hold my turn").font(.system(size: 10)).foregroundStyle(.secondary)
                    TextField("Hold my turn wording", text: $hold).textFieldStyle(.roundedBorder)
                    ForEach(phrases.indices, id: \.self) { index in
                        TextField("Favorite \(index + 1)", text: $phrases[index].text).textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Favorite phrase \(index + 1)")
                    }
                }
            }
            Text(session.customizationError ?? "Only these saved phrases are stored on this Mac. Drafts and context stay in this session.")
                .font(.system(size: 10)).foregroundStyle(session.customizationError == nil ? .white.opacity(0.7) : .orange)
        }.onAppear { hold = session.holdPhrase; phrases = session.phrases }
    }
}

/// Local writing scaffolds, deliberately labelled. No language model, transcript access, or automatic delivery.
struct ResponseAssistance: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var session: CommunicationSession
    @FocusState private var draftFocused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("Help Me Respond").font(.system(size: 13, weight: .semibold))
                Spacer()
                Button("Clear") { session.clearContext() }.font(.system(size: 11))
            }
            if session.selectedPath == nil {
                TextField("Paste a question or context, if useful…", text: $session.context, axis: .vertical)
                    .lineLimit(1...2).textFieldStyle(.plain).padding(9)
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9))
                    .accessibilityLabel("Optional context provided by you. Not a live transcript")
                    .onChange(of: session.context) { _, value in if value.count > 4000 { session.context = String(value.prefix(4000)) } }
                Text("Provided by you · no meeting capture · no AI connected")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    ForEach(ResponsePath.allCases) { path in
                        Button { session.choosePath(path); draftFocused = true } label: {
                            Label(path.rawValue, systemImage: path.symbol).font(.system(size: 11)).frame(maxWidth: .infinity, minHeight: 33, alignment: .leading).padding(.horizontal, 8)
                                .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9))
                        }.buttonStyle(CommunicationButtonStyle())
                    }
                }
                Text("Choose your intention. A starter opens for you to finish.")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
            } else {
                if let context = session.contextProvider.context(from: session.context) {
                    Text("\(context.source.rawValue): \(context.text)").font(.system(size: 10)).foregroundStyle(.white.opacity(0.7)).lineLimit(2)
                }
                TextField("Write what you mean…", text: $session.assistanceDraft, axis: .vertical)
                    .lineLimit(2...3).textFieldStyle(.plain).font(.system(size: 17)).focused($draftFocused)
                    .padding(9).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9))
                    .accessibilityLabel("Editable response starter. Finish it with your meaning")
                HStack {
                    Button("Other intentions") { session.selectedPath = nil }.font(.system(size: 11))
                    Spacer()
                    IslandAction(client.typedDraft.isEmpty ? "Use draft" : "Add to draft", symbol: "pencil") {
                        _ = session.useAssistanceDraft(in: client)
                    }.disabled(!PersonalPhrase.valid(session.assistanceDraft) || (client.typedDraft + "\n" + session.assistanceDraft).utf16.count > 500)
                }
                Text("Local starter · finish and review in Your words before Speak.")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.7))
            }
        }
    }
}
