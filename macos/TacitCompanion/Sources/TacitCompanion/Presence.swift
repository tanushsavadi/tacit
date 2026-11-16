import Combine
import Foundation

/// The user's own communicative intent. TACIT never picks it and never guesses what the user thinks:
/// intents that state something need the user's own point, in their words.
enum PresenceIntent: String, CaseIterable, Identifiable {
    case clarify, shareView = "share_view", disagree, buyTime = "buy_time", phraseThis = "phrase_this"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .clarify: return "Ask a question"
        case .shareView: return "Share my view"
        case .disagree: return "Disagree kindly"
        case .buyTime: return "Buy a moment"
        case .phraseThis: return "Phrase it for me"
        }
    }
    /// What happens when chosen, for VoiceOver and the tooltip.
    var hint: String {
        switch self {
        case .clarify: return "Suggests a short question about what was said. Takes no side."
        case .shareView: return "You say what you think in a few words; TACIT helps word it."
        case .disagree: return "You say what you disagree with; TACIT words it respectfully."
        case .buyTime: return "Suggests a polite way to ask for a moment. Takes no side."
        case .phraseThis: return "Type rough notes; TACIT turns them into clear speech."
        }
    }
    var symbol: String {
        switch self {
        case .clarify: return "questionmark.bubble"
        case .shareView: return "text.bubble"
        case .disagree: return "arrow.triangle.branch"
        case .buyTime: return "hourglass"
        case .phraseThis: return "wand.and.stars"
        }
    }
    var needsPoint: Bool { [.shareView, .disagree, .phraseThis].contains(self) }
    var needsContext: Bool { self == .clarify }
    var pointPrompt: String {
        switch self {
        case .shareView: return "What do you think? A few words is enough."
        case .disagree: return "What do you disagree with, and why?"
        case .phraseThis: return "What do you want to say? Rough notes are fine."
        default: return "Anything to add? (optional)"
        }
    }
    var pointPlaceholder: String {
        switch self {
        case .shareView: return "e.g. yes, but only after testing"
        case .disagree: return "e.g. too early, tests aren't done"
        case .phraseThis: return "e.g. need more time not ready"
        default: return ""
        }
    }
    /// Local, rule-written starter for when no AI is available. Labelled as such; the user finishes it.
    var starter: String {
        switch self {
        case .clarify: return "Could you clarify what you mean by "
        case .shareView: return "I think "
        case .disagree: return "I see it differently, because "
        case .buyTime: return "Give me a moment to think about that."
        case .phraseThis: return ""
        }
    }
}

enum PresenceTone: String, CaseIterable, Identifiable {
    case brief, warm, direct
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

/// Where the shown context came from. There is deliberately no "live" case: no meeting capture is verified.
enum PresenceContextSource: String {
    case userProvided = "user-provided", sample, meetingSelected = "meeting-selected"
    var label: String { self == .sample ? "SAMPLE" : self == .meetingSelected ? "YOU SELECTED · MEET TRANSCRIPT" : "YOU ADDED" }
}

/// Help Me Respond, as a flow: what was said → what you want to do → (your point) → wording you edit → Speak.
/// Context, point and drafts live in RAM for this session only; only the tone preference is saved.
@MainActor final class PresenceModel: ObservableObject {
    enum Step: Equatable { case intent, point, working, draft }
    /// Where the editor text came from. `.manual` = typed by the user or a rule-written starter (not AI).
    enum Origin: Equatable { case suggestion(Int), edited, manual }
    struct Inputs: Equatable { var intent: PresenceIntent; var context: String; var source: PresenceContextSource; var point: String; var tone: PresenceTone }

    static let sampleQuestion = "Should we launch the project next week?"
    /// No meeting-audio adapter exists (see docs/research/PRESENCE_MEETING_AUDIO.md). Context is typed, pasted or sample.
    static let liveCaptureAvailable = false
    static let maxContext = 4000, maxPoint = 500

    @Published var context = "" {
        didSet {
            if context.count > Self.maxContext { context = String(context.prefix(Self.maxContext)) }
            if contextSource == .sample && context != Self.sampleQuestion || contextSource == .meetingSelected { contextSource = .userProvided }
        }
    }
    @Published private(set) var contextSource: PresenceContextSource = .userProvided
    @Published private(set) var intent: PresenceIntent?
    @Published var point = "" { didSet { if point.count > Self.maxPoint { point = String(point.prefix(Self.maxPoint)) } } }
    @Published private(set) var step: Step = .intent
    @Published var draft = "" {
        didSet { if case .suggestion(let i) = origin, i < drafts.count, draft != drafts[i] { origin = .edited } }
    }
    @Published private(set) var origin: Origin = .manual
    @Published private(set) var drafts: [String] = []
    /// The inputs that produced `drafts`; if the inputs change afterwards the drafts are marked out of date.
    @Published private(set) var basis: Inputs?
    @Published private(set) var focus: String?
    @Published private(set) var provenance: String?
    @Published private(set) var problem: String?
    /// The user's own text, kept when they tap an alternative over it (one tap brings it back).
    @Published private(set) var ownDraft: String?
    @Published var tone: PresenceTone { didSet { defaults?.set(tone.rawValue, forKey: Self.toneKey) } }

    private var requested: Inputs?
    private let defaults: UserDefaults?
    private static let toneKey = "TACITPresenceTone.v1"
    private var bag = Set<AnyCancellable>()

    init(defaults: UserDefaults? = .standard) {
        self.defaults = defaults
        tone = defaults?.string(forKey: Self.toneKey).flatMap(PresenceTone.init(rawValue:)) ?? .brief
    }

    /// Follows the client's suggestion for our request, even while another surface is showing.
    func bind(_ client: TacitClient) {
        bag.removeAll()
        client.$suggestion.sink { [weak self] s in self?.receive(s) }.store(in: &bag)
    }

    var current: Inputs? {
        intent.map { Inputs(intent: $0, context: context.trimmed, source: contextSource, point: point.trimmed, tone: tone) }
    }
    var draftsOutOfDate: Bool { basis != nil && basis != current }
    var assisted: Bool { origin != .manual }
    var hasContext: Bool { !context.trimmed.isEmpty }
    var canSpeakDraft: Bool { PersonalPhrase.valid(draft) }

    func useSample() { context = Self.sampleQuestion; contextSource = .sample }
    func useSelectedMeetingContext(_ text: String) {
        guard context.isEmpty, point.isEmpty, draft.isEmpty else { return }
        context = text; contextSource = .meetingSelected
    }

    /// Choosing an intention is the user's decision. Opinion intents ask for the user's point before any request.
    func choose(_ intent: PresenceIntent, client: TacitClient) {
        if self.intent != intent { point = "" }
        self.intent = intent; problem = nil
        if intent.needsPoint { step = .point } else { request(client) }
    }

    @discardableResult func request(_ client: TacitClient) -> Bool {
        guard let inputs = current else { step = .intent; return false }
        if inputs.intent.needsContext && inputs.context.isEmpty {
            problem = "Add what was said first, so TACIT knows what to ask about."; step = .intent; return false
        }
        if inputs.intent.needsPoint && inputs.point.isEmpty {
            problem = "Tell TACIT your point first. It never guesses what you think."; step = .point; return false
        }
        guard client.respondStatus?.available == true else {
            writeMyself(); problem = client.conn == .connected
                ? "No AI connected — here's a starter to finish in your own words." : "Not connected — write it in your own words."
            return false
        }
        guard client.requestSuggestion(intent: inputs.intent.rawValue, context: inputs.context, contextSource: inputs.source.rawValue,
                                       point: inputs.point, tone: inputs.tone.rawValue) != nil else {
            problem = "Not connected to TACIT. Your words are kept."; return false
        }
        requested = inputs; problem = nil; step = .working
        return true
    }

    /// Server result for the request in flight (the client has already dropped stale/foreign request IDs).
    func receive(_ s: TacitClient.Suggestion?) {
        guard let s, let inputs = requested, s.state != "generating" else { return }
        requested = nil
        switch s.state {
        case "ready":
            // AI never overwrites words the user wrote; new options appear as alternatives instead.
            let keepUserText = !draft.trimmed.isEmpty && !isUnchangedSuggestion
            drafts = s.drafts; basis = inputs; focus = s.focus
            let secs = s.generationMs.map { String(format: " · %.1f s", Double($0) / 1000) } ?? ""
            provenance = "Suggested by \(Self.modelName(s.model))\(secs)"
            if keepUserText { origin = .edited } else if let first = drafts.first { setDraft(first, origin: .suggestion(0)) }
            problem = nil; step = .draft
        case "refused" where inputs.intent.needsPoint && inputs.point.isEmpty:
            problem = s.reason; step = .point
        default: // failed / refused / cancelled by the server (Stop, disconnect)
            problem = s.reason ?? "No wording this time. Your words are kept."
            step = .draft
        }
    }
    private var isUnchangedSuggestion: Bool { if case .suggestion(let i) = origin { return i < drafts.count && drafts[i] == draft }; return false }

    func cancel(_ client: TacitClient) {
        client.cancelSuggestion(); requested = nil
        step = !draft.isEmpty || !drafts.isEmpty ? .draft : (intent?.needsPoint == true ? .point : .intent)
    }
    /// One step back inside the flow. Returns false when already at the first step.
    @discardableResult func back(_ client: TacitClient) -> Bool {
        switch step {
        case .intent: return false
        case .working: cancel(client); if step == .draft { step = intent?.needsPoint == true ? .point : .intent }
        case .draft: step = intent?.needsPoint == true ? .point : .intent
        case .point: step = .intent
        }
        problem = nil
        return true
    }

    /// Back to the first step to change what was said; an in-flight request is cancelled, wording is kept.
    func editContext(_ client: TacitClient) {
        if step == .working { client.cancelSuggestion(); requested = nil }
        step = .intent; problem = nil
    }

    func pick(_ index: Int) {
        guard drafts.indices.contains(index) else { return }
        if origin == .edited || (origin == .manual && !draft.trimmed.isEmpty) { ownDraft = draft }
        setDraft(drafts[index], origin: .suggestion(index))
    }
    func restoreOwnDraft() { guard let own = ownDraft else { return }; ownDraft = nil; setDraft(own, origin: .edited) }
    func writeMyself() {
        if draft.trimmed.isEmpty { setDraft(intent?.starter ?? "", origin: .manual) }
        step = .draft
    }

    /// The one deliberate action: speaks exactly the editor text through the normal authorized typed route.
    @discardableResult func speak(using client: TacitClient) -> Bool {
        guard canSpeakDraft, client.speakTyped(draft, assisted: assisted) else { return false }
        resetTurn(); return true
    }
    /// Context stays (the conversation is still going); the turn's intent, point and wording are cleared.
    func resetTurn() {
        intent = nil; point = ""; drafts = []; basis = nil; focus = nil; provenance = nil; problem = nil; ownDraft = nil
        requested = nil; setDraft("", origin: .manual); step = .intent
    }
    func clearAll(_ client: TacitClient) {
        if requested != nil { client.cancelSuggestion() }
        resetTurn(); context = ""; contextSource = .userProvided
    }

    private func setDraft(_ text: String, origin: Origin) { self.origin = origin; draft = text; self.origin = origin }
    static func modelName(_ model: String?) -> String {
        guard let model, !model.isEmpty else { return "AI" }
        return model.hasPrefix("gemini") ? "Gemini" : model
    }
}

extension String { var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) } }
