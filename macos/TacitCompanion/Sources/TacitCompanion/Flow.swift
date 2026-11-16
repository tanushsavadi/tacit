import Foundation
import Combine

struct FlowCitation: Codable, Equatable { var turnId: String; var revision: Int; var start: Int; var end: Int; var quote: String }
struct FlowTurn: Codable, Identifiable { var id: String; var revision: Int; var order: Int; var text: String; var final: Bool; var at: Double }
struct FlowAnchor: Codable, Identifiable { var id: String; var source: FlowCitation; var selected: Bool }
struct FlowChange: Codable, Identifiable { var id: String; var relation: String; var before: FlowCitation; var after: FlowCitation; var detailBefore: String; var detailAfter: String }
struct FlowDraft: Codable, Identifiable { var id: String; var text: String; var version: Int; var anchor: FlowCitation?; var startedAtRevision: Int; var saved: Bool; var authorship: String; var acknowledged: [String] }
struct FlowDemoStatus: Codable {
    struct Scenario: Codable { var id: String; var title: String }
    struct Operation: Codable { var at: String; var model: String; var status: String; var elapsedMs: Double; var validation: String }
    struct Failure: Codable { var at: String; var code: String }
    struct Outgoing: Codable { var text: String; var requestId: String; var state: String }
    var audioMode: String?; var scenarioId: String; var title: String; var step: Int; var total: Int; var running: Bool; var paused: Bool; var enabled: Bool; var playback: String; var analysis: String; var providerAvailable: Bool; var provenance: String; var inputSource: String; var scenarios: [Scenario]; var operations: [Operation]; var errors: [Failure]; var lastOutgoing: Outgoing?
}
struct FlowSnapshot: Codable {
    var epoch: Int; var revision: Int; var state: String; var source: String?; var textConsent: Bool
    var turns: [FlowTurn]; var anchors: [FlowAnchor]; var changes: [FlowChange]; var drafts: [FlowDraft]; var status: String; var semantic: String
}

/// Private native-owner socket. Capture never starts on connect/relaunch. Draft words are owned by the local editor.
@MainActor final class FlowClient: ObservableObject {
    @Published private(set) var snapshot: FlowSnapshot?
    @Published private(set) var demo: FlowDemoStatus?
    static var isDemo: Bool { Bundle.main.object(forInfoDictionaryKey: "TACITFlowDemo") as? Bool == true }
    @Published private(set) var connected = false
    @Published private(set) var notice = "Flow candidate is not connected. Ordinary TACIT remains available."
    @Published private(set) var pairingCode: String?
    @Published private(set) var policyVerified = false
    @Published var activeID: String?
    @Published private(set) var orphanedText: String?
    @Published private(set) var words: [String: String] = [:]
    private var socket: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .ephemeral)
    private var connection = 0
    private var minimumEpoch = 0
    private var flushWork: DispatchWorkItem?
    private var awaiting: [String: Int] = [:]
    var testSend: (([String: Any]) -> Void)?
    var active: FlowDraft? { snapshot?.drafts.first { $0.id == activeID } }
    var text: String { activeID.flatMap { words[$0] } ?? "" }
    var listening: Bool { snapshot?.state == "capturing" }
    var available: Bool { connected || testSend != nil }
    var relevant: FlowChange? {
        guard let d = active, let anchor = d.anchor else { return nil }
        return snapshot?.changes.last { ["correction", "condition", "ambiguous"].contains($0.relation) && $0.before == anchor && !d.acknowledged.contains($0.id) }
    }
    var question: FlowAnchor? {
        guard let snapshot else { return nil }
        let latest = snapshot.anchors.compactMap { a in snapshot.turns.first { $0.id == a.source.turnId }?.order }.max()
        return snapshot.anchors.filter { a in snapshot.turns.first { $0.id == a.source.turnId }?.order == latest }.max { $0.source.quote.count < $1.source.quote.count }
    }
    var peek: String? {
        if let c = relevant { return c.relation == "ambiguous" ? "Context link uncertain" : "Possible change: \(c.detailAfter)" }
        if let d = active, d.saved { return "Your answer is saved" }
        return question?.source.quote
    }
    var assistanceContext: String? {
        guard snapshot?.textConsent == true, listening, let anchor = active?.anchor,
              snapshot?.turns.contains(where: { $0.id == anchor.turnId && $0.revision == anchor.revision && $0.final }) == true else { return nil }
        return anchor.quote + (relevant.map { "\nLater: " + $0.after.quote } ?? "")
    }
    func connect(token: String) {
        disconnect(preserveWords: true); connection += 1; let generation = connection
        let port = Int(ProcessInfo.processInfo.environment["TACIT_FLOW_PORT"] ?? "") ?? (Bundle.main.object(forInfoDictionaryKey: "TACITFlowPort") as? Int ?? 18892)
        guard let url = URL(string: "ws://127.0.0.1:\(port)/flow") else { return }
        var request = URLRequest(url: url); request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let ws = session.webSocketTask(with: request); socket = ws; ws.resume(); receive(ws, generation)
    }
    func disconnect(preserveWords: Bool = false) {
        if preserveWords, !text.isEmpty { orphanedText = text }
        if !preserveWords { orphanedText = nil }
        connection += 1; flushWork?.cancel(); socket?.cancel(with: .goingAway, reason: nil); socket = nil
        connected = false; snapshot = nil; demo = nil; pairingCode = nil; words = [:]; activeID = nil; awaiting.removeAll(); minimumEpoch = 0; recoveryText = nil
    }
    private func receive(_ ws: URLSessionWebSocketTask, _ gen: Int) {
        ws.receive { [weak self] result in Task { @MainActor in
            guard let self, self.connection == gen else { return }
            switch result {
            case .failure:
                // Keep authored text locally on an unexpected transport loss; clear on deliberate Stop.
                if !self.text.isEmpty { self.orphanedText = self.text }
                self.connected = false; self.snapshot = nil; self.pairingCode = nil
                self.notice = "Flow disconnected. Capture stopped. Copy your draft before reconnecting."
            case .success(let message):
                self.connected = true
                if case .string(let text) = message { self.handle(text) }
                self.receive(ws, gen)
            }
        } }
    }
    func handle(_ text: String) {
        guard text.utf8.count < 120000, let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let type = object["type"] as? String else { return }
        if type == "state", let value = object["snapshot"], let json = try? JSONSerialization.data(withJSONObject: value),
           let next = try? JSONDecoder().decode(FlowSnapshot.self, from: json) {
            if next.epoch < minimumEpoch { return }
            if let old = snapshot, next.epoch < old.epoch || (next.epoch == old.epoch && next.revision < old.revision) { return }
            let oldIDs = Set(snapshot?.drafts.map(\.id) ?? [])
            if let value = object["demo"], let json = try? JSONSerialization.data(withJSONObject: value) { demo = try? JSONDecoder().decode(FlowDemoStatus.self, from: json) }
            snapshot = next; policyVerified = object["providerPolicyVerified"] as? Bool ?? false; notice = next.status
            if next.state == "off" { words = [:]; activeID = nil; pairingCode = nil }
            for draft in next.drafts {
                if words[draft.id] == nil { words[draft.id] = draft.text }
                if let version = awaiting[draft.id], draft.version > version { awaiting.removeValue(forKey: draft.id) }
            }
            if let fresh = next.drafts.first(where: { !oldIDs.contains($0.id) }) { activeID = fresh.id }
            let ids = Set(next.drafts.map(\.id)); words = words.filter { ids.contains($0.key) }
            if let id = activeID, !ids.contains(id) { activeID = next.drafts.first?.id }
            scheduleFlush()
        } else if type == "pairing" {
            pairingCode = object["token"] as? String
        } else if type == "error" {
            awaiting.removeAll(); notice = object["message"] as? String ?? "Flow action unavailable. Your words are kept."
        }
    }
    private func send(_ command: [String: Any]) {
        if let testSend { testSend(command); return }
        guard connected, let data = try? JSONSerialization.data(withJSONObject: command), let text = String(data: data, encoding: .utf8) else { return }
        socket?.send(.string(text)) { _ in }
    }
    func demoAction(_ action: String, scenario: String? = nil) {
        flush()
        var command: [String: Any] = ["type": "demo", "action": action]
        if let scenario { command["scenarioId"] = scenario }
        if action == "next" { command["expectedStep"] = demo?.step ?? 0 }
        send(command)
    }
    func demoMode(playback: String? = nil, analysis: String? = nil) {
        var command: [String: Any] = ["type": "demo_mode"]
        if let playback { command["playback"] = playback }; if let analysis { command["analysis"] = analysis }
        send(command)
    }
    func start(participants: Bool, textConsent: Bool) {
        guard participants, !textConsent || policyVerified else { notice = "Confirm participant agreement. Gemini also needs verified provider terms."; return }
        send(["type": "start", "participantsAgreed": true, "textConsent": textConsent])
    }
    func stop() {
        minimumEpoch = (snapshot?.epoch ?? minimumEpoch) + 1
        flushWork?.cancel(); words = [:]; orphanedText = nil; activeID = nil; pairingCode = nil; recoveryText = nil; awaiting.removeAll()
        send(["type": "stop"]); snapshot = nil
    }
    func pause() { flush(); send(["type": "pause"]); pairingCode = nil }
    func pair() { send(["type": "pair"]) }
    func clear() { send(["type": "clear"]) }
    func analyse() { send(["type": "analyse"]) }
    func select(_ turn: FlowTurn) { flush(); send(["type": "select", "turnId": turn.id, "revision": turn.revision]) }
    func select(_ anchor: FlowAnchor) { flush(); send(["type": "select", "turnId": anchor.source.turnId, "revision": anchor.source.revision, "anchorId": anchor.id]) }
    func choose(_ id: String) { flush(); activeID = id }
    func edit(_ text: String) {
        guard let id = activeID, text.utf16.count <= 500 else { return }
        words[id] = text; scheduleFlush()
    }
    private func scheduleFlush() {
        flushWork?.cancel()
        guard snapshot?.drafts.contains(where: { words[$0.id] != $0.text && awaiting[$0.id] == nil }) == true else { return }
        let work = DispatchWorkItem { [weak self] in Task { @MainActor in self?.flush() } }
        flushWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }
    func flush() {
        flushWork?.cancel()
        for draft in snapshot?.drafts ?? [] {
            if let text = words[draft.id], text != draft.text, awaiting[draft.id] == nil {
                awaiting[draft.id] = draft.version; send(["type": "edit", "id": draft.id, "version": draft.version, "text": text])
            }
        }
    }
    func save() { flush(); if let id = activeID { send(["type": "save", "id": id]) } }
    func discard() { if let id = activeID { send(["type": "discard", "id": id]) } }
    func acknowledge() { if let id = activeID, let change = relevant { send(["type": "acknowledge", "id": id, "change": change.id]) } }
    /// Authored Flow drafts use exactly the existing explicit output/voice-revision/deduplication controls.
    /// Raw recognition is never copied here; it keeps the dedicated current-utterance speak_reviewed path.
    @discardableResult func speak(using client: TacitClient) -> Bool {
        guard available, let active, ["typed", "user-corrected"].contains(active.authorship), PersonalPhrase.valid(text) else { return false }
        flush(); return client.speakTyped(text)
    }
    func recovery(_ action: String) {
        guard activeID != nil else { return }
        let template: String
        switch action {
        case "repeat": template = "Could you repeat your earlier question?"
        case "clarify": template = "Could you clarify the last part of your earlier question?"
        case "rejoin": template = "I wanted to return to your earlier question."
        default: template = "I wanted to finish my thought."
        }
        // A separate explicit user action inserts editable wording. Existing draft is always preserved.
        notice = "Template ready to copy into Type a message. Your saved answer is unchanged."
        recoveryText = template
    }
    @Published private(set) var recoveryText: String?
}
