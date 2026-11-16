import Foundation
import Combine

struct PersonalPhrase: Codable, Equatable, Identifiable {
    var id: String
    var text: String
    static let defaults = [
        Self(id: "yes", text: "Absolutely!"),
        Self(id: "repeat", text: "Could you repeat that?"),
        Self(id: "add", text: "I have something to add."),
        Self(id: "laugh", text: "That's hilarious!")
    ]
    static func valid(_ text: String) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= 500
    }
}

/// Only deliberately saved wording persists. Drafts and supplied context stay in RAM.
@MainActor final class CommunicationSession: ObservableObject {
    enum Surface: String { case conversation, compose, phrases, customize, assistance, recovery }
    @Published var surface: Surface = .conversation
    @Published private(set) var phrases: [PersonalPhrase]
    @Published private(set) var holdPhrase: String
    @Published var phraseSelection: String?
    @Published var customizationError: String?
    @Published private(set) var lastRequestedWords: String?
    @Published var context = ""
    @Published var assistanceDraft = ""
    @Published var selectedPath: ResponsePath?
    let contextProvider: any MeetingContextProvider
    private let defaults: UserDefaults?
    private static let key = "TACITCommunicationPhrases.v1"
    private struct Saved: Codable { var hold: String; var phrases: [PersonalPhrase] }

    init(defaults: UserDefaults? = .standard, contextProvider: any MeetingContextProvider = UserProvidedContext()) {
        self.defaults = defaults; self.contextProvider = contextProvider
        let saved = defaults?.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(Saved.self, from: $0) }
        holdPhrase = saved.flatMap { PersonalPhrase.valid($0.hold) ? $0.hold : nil } ?? "One moment, I'm responding."
        phrases = saved.flatMap { value in
            value.phrases.count == 4 && Set(value.phrases.map(\.id)).count == 4 && value.phrases.allSatisfy { PersonalPhrase.valid($0.text) }
                ? value.phrases : nil
        } ?? PersonalPhrase.defaults
    }

    @discardableResult func save(hold: String, phrases: [PersonalPhrase]) -> Bool {
        guard PersonalPhrase.valid(hold), phrases.count == 4, Set(phrases.map(\.id)).count == 4,
              phrases.allSatisfy({ PersonalPhrase.valid($0.text) }) else {
            customizationError = "Give each phrase 1–500 characters."; return false
        }
        self.holdPhrase = hold; self.phrases = phrases; phraseSelection = nil; customizationError = nil
        if let data = try? JSONEncoder().encode(Saved(hold: hold, phrases: phrases)) { defaults?.set(data, forKey: Self.key) }
        return true
    }

    @discardableResult func holdTurn(using client: TacitClient) -> Bool {
        guard client.speakTyped(holdPhrase) else { return false }
        recordRequest(holdPhrase); return true
    }
    @discardableResult func speakSelection(using client: TacitClient) -> Bool {
        guard let phrase = phrases.first(where: { $0.id == phraseSelection }), client.speakTyped(phrase.text) else { return false }
        recordRequest(phrase.text); return true
    }
    @discardableResult func speakDraft(using client: TacitClient) -> Bool {
        guard client.speakTyped(client.typedDraft) else { return false }
        recordRequest(client.typedDraft); return true
    }
    @discardableResult func useAssistanceDraft(in client: TacitClient) -> Bool {
        let combined = client.typedDraft.isEmpty ? assistanceDraft : client.typedDraft + "\n" + assistanceDraft
        guard PersonalPhrase.valid(assistanceDraft), PersonalPhrase.valid(combined) else { return false }
        client.typedDraft = combined; surface = .compose; return true
    }

    func recordRequest(_ text: String) { lastRequestedWords = text }
    func clearContext() { context = ""; assistanceDraft = ""; selectedPath = nil }
    func choosePath(_ path: ResponsePath) {
        selectedPath = path
        assistanceDraft = path.starter
    }
}

struct MeetingContext: Equatable {
    enum Source: String { case userProvided = "Provided by you" }
    let source: Source
    let text: String
}

/// No capture adapter exists. A future adapter must report consent/source/revocation before supplying input.
protocol MeetingContextProvider {
    var label: String { get }
    var liveCaptureAvailable: Bool { get }
    func context(from suppliedText: String) -> MeetingContext?
}
struct UserProvidedContext: MeetingContextProvider {
    let label = "Provided by you · this session only"
    let liveCaptureAvailable = false
    func context(from suppliedText: String) -> MeetingContext? {
        let text = String(suppliedText.prefix(4000)).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : MeetingContext(source: .userProvided, text: text)
    }
}

enum ResponsePath: String, CaseIterable, Identifiable {
    case clarify = "Ask for clarity", thought = "Share a thought", disagree = "Different view", moment = "Buy a moment"
    var id: String { rawValue }
    var symbol: String {
        switch self { case .clarify: return "questionmark.bubble"; case .thought: return "text.bubble"; case .disagree: return "arrow.triangle.branch"; case .moment: return "hand.raised" }
    }
    var starter: String {
        switch self {
        case .clarify: return "Could you clarify what you mean by "
        case .thought: return "I'd like to add "
        case .disagree: return "I see it differently because "
        case .moment: return "I'd like a moment to think about that."
        }
    }
}

/// Deterministic presentation priority; camera activity/processing require actual signals, never a socket inference.
enum CommunicationState: String, Equatable {
    case off, ready, visuallyActive, processing, reviewAvailable, editing, synthesizing, speaking, paused, disconnected, error, assistance
    struct Facts {
        var connected = false
        var paused = false
        var delivery: String?
        var firstAudio = false
        var editing = false
        var assistance = false
        var review = false
        var visualActivity = false
        var recognitionProcessing = false
        var liveEnabled = false
        var outputEnabled = false
        var error = false
    }
    static func resolve(_ f: Facts) -> Self {
        if !f.connected { return .disconnected }
        if f.paused { return .paused }
        if f.delivery == "routing", f.firstAudio { return .speaking }
        if ["queued", "synthesizing", "routing"].contains(f.delivery ?? "") { return .synthesizing }
        if f.error { return .error }
        if f.assistance { return .assistance }
        if f.editing { return .editing }
        if f.review { return .reviewAvailable }
        if f.recognitionProcessing { return .processing }
        if f.visualActivity { return .visuallyActive }
        return f.liveEnabled || f.outputEnabled ? .ready : .off
    }
}
