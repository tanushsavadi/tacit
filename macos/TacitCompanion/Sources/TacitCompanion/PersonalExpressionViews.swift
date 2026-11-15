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
