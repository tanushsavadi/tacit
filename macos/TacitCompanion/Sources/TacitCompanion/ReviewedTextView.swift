import SwiftUI

/// Explicit user choice only. New utterances, Live changes and output-generation changes clear this state.
struct ReviewDraft: Equatable {
    var candidate: TacitClient.ReviewCandidate?
    var utteranceID: String?
    var outputGeneration: Int?
    var editing = false
    var text = ""
    mutating func choose(_ candidate: TacitClient.ReviewCandidate, utteranceID: String, outputGeneration: Int, editing: Bool) {
        self.candidate = candidate; self.utteranceID = utteranceID; self.outputGeneration = outputGeneration
        self.editing = editing; text = candidate.text
    }
}

/// Compact review: exact backend candidates, no preselection, one deliberate Speak.
/// The correction editor remains in the same surface and takes focus only after Edit.
struct RecognitionReview: View {
    @ObservedObject var client: TacitClient
    var onEdit: (() -> Void)?
    @FocusState private var editing: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(client.reviewDraft.editing ? "Your correction" : "Silent speech · choose what you mean")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.72))
                Spacer()
                if onEdit == nil { Button { client.pauseEverything() } label: { Image(systemName: "pause.fill") }.accessibilityLabel("Pause Live and voice")
                Button { client.stopEverything() } label: { Image(systemName: "stop.fill") }.accessibilityLabel("Emergency stop everything") }
            }.buttonStyle(CommunicationButtonStyle())
            if client.canReviewCurrent, let h = client.lastHypothesis {
                if client.reviewDraft.editing {
                    TextField("Your exact words", text: $client.reviewDraft.text, axis: .vertical)
                        .lineLimit(2...3).font(.system(size: 18)).textFieldStyle(.plain).focused($editing)
                        .accessibilityLabel("Your correction, user-authored text").defaultFocus($editing, true)
                    Text("Written by you · \(client.reviewDraft.text.utf16.count)/500").font(.system(size: 10)).foregroundStyle(.secondary)
                } else {
                    ScrollView {
                        Text(client.reviewDraft.candidate?.text ?? h.text).font(.system(size: 20, weight: .medium))
                            .tracking(-0.4).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                    }.frame(maxHeight: onEdit == nil ? 120 : 78)
                        .accessibilityLabel("Exact words to review")
                    HStack(spacing: 8) {
                        Button {
                            if let raw = h.candidates.first(where: { $0.kind == "raw" }) { client.chooseReview(raw, of: h.id) }
                        } label: {
                            Label(client.reviewDraft.candidate?.kind == "raw" ? "Raw words selected" : "Choose raw words",
                                  systemImage: client.reviewDraft.candidate?.kind == "raw" ? "checkmark.circle.fill" : "circle")
                                .padding(.horizontal, 9).frame(height: 30)
                                .background(.white.opacity(0.10), in: Capsule())
                        }.buttonStyle(CommunicationButtonStyle())
                        if h.candidates.count > 1 {
                            Menu("Alternatives") {
                                ForEach(h.candidates.filter { $0.kind != "raw" }) { c in
                                    Button("\(c.kind == "phrase" ? "Phrase list" : "Decoder alternative"): \(c.text)") { client.chooseReview(c, of: h.id) }
                                }
                            }.menuStyle(.borderlessButton).fixedSize().padding(.horizontal, 6).frame(height: 30)
                                .background(.white.opacity(0.08), in: Capsule())
                        }
                        Spacer(minLength: 0)
                    }.font(.system(size: 10)).controlSize(.small)
                }
                Spacer(minLength: 0)
                HStack(spacing: 10) {
                    Text(client.reviewDraft.candidate == nil ? "Choose the words you intend." : client.reviewDraft.editing ? "Your correction · explicit send" : "Selected by you · explicit send")
                        .font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(2)
                    Spacer(minLength: 0)
                    if !client.reviewDraft.editing {
                        IslandAction("Edit", symbol: "pencil") {
                            guard let base = client.reviewDraft.candidate ?? h.candidates.first else { return }
                            client.chooseReview(base, of: h.id, editing: true)
                            if let onEdit { onEdit() } else { editing = true }
                        }
                    }
                    if client.output?.state != "ready" {
                        OutputAuthorizationButton(client: client)
                    } else {
                        IslandAction("Speak", symbol: "arrow.up", prominent: true) { _ = client.speakReviewed() }
                            .keyboardShortcut(.return, modifiers: .command)
                            .disabled(client.reviewDraft.candidate == nil || client.reviewDraft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.reviewDraft.text.utf16.count > 500 || client.route?.state != "ready")
                    }
                }
                if let d = client.lastDelivery, ["refused", "failed"].contains(d.state), d.source != "typed" {
                    Text(d.reason ?? "Speech could not be delivered.").font(.system(size: 10)).foregroundStyle(.orange).lineLimit(2)
                }
            } else {
                Text(client.reviewSubmittedID == nil ? "No current words to review." : "Speech requested.")
                    .font(.system(size: 19, weight: .medium))
                Text(client.deliveryDetail ?? "Mouth a new sentence in the visible workspace.")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
            }
        }.tint(.mint).preferredColorScheme(.dark)
        .task(id: client.reviewDraft.editing) {
            await Task.yield()
            editing = client.reviewDraft.editing
        }
    }
}
