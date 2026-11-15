import AppKit
import Carbon.HIToolbox
import Foundation
import CryptoKit

/// Connection to the local TACIT server's user WebSocket. All state lives on the main actor; when disconnected every
/// server-derived field is reset to nil ("unknown") so the menu never shows stale state as current.
@MainActor
final class TacitClient: ObservableObject {
    enum Conn: Equatable { case noToken, connecting, connected, disconnected(String) }

    struct Live { var state: String; var authorizationId: String?; var generation: Int; var reason: String }
    struct Output { var state: String; var authorizationId: String?; var generation: Int; var reason: String; var voice: String; var queued: Int }
    struct Route { var state: String; var device: String?; var readers: [String]?; var warnings: [String]; var reason: String?; var gainDb: Double; var calibrated: Bool }
    struct Recognition { var reachable: Bool; var model: String? }
    struct Phrase { var text: String; var accepted: Bool; var reason: String?; var rule: String }
    struct ReviewCandidate: Equatable, Identifiable {
        var kind: String; var index: Int; var text: String; var textHash: String
        var id: Int { index }
    }
    struct Hypothesis {
        var id: String; var text: String; var decision: String; var reason: String?; var ms: Int; var at: Date
        var brightness: Double?; var endToResultMs: Double?; var phrase: Phrase?
        var authorizationId: String; var generation: Int?; var candidates: [ReviewCandidate]; var expiresAt: Double?
    }
    struct Delivery { var requestId: String; var text: String; var state: String; var reason: String?; var at: Date; var firstAudioAt: Double?; var voice: String?; var source: String }

    @Published private(set) var conn: Conn = .connecting
    @Published private(set) var live: Live?
    @Published private(set) var output: Output?
    @Published private(set) var route: Route?
    @Published private(set) var recognition: Recognition?
    @Published private(set) var lastHypothesis: Hypothesis?
    @Published private(set) var lastDelivery: Delivery?
    @Published var notice: String?
    @Published var typedDraft = ""
    @Published var reviewDraft = ReviewDraft()
    @Published private(set) var reviewSubmittedID: String?
    private var serverClockOffset: Double = 0
    private var reviewExpiryWork: DispatchWorkItem?
    private var pendingReviewedRequest: String?
    @Published private(set) var reviewExpired = false

    let repoRoot: String?
    let port = Int(ProcessInfo.processInfo.environment["PORT"] ?? "") ?? 8790
    private var task: URLSessionWebSocketTask?
    private var session = URLSession(configuration: .ephemeral)
    private var backoff: Double = 0.5
    private var connectGeneration = 0
    private var reconnectWork: DispatchWorkItem?

    private var seenHypotheses = Set<String>()
    private var hypothesisOrder: [String] = []
    private var pendingLiveGeneration: Int?
    private var pendingOutputGeneration: Int?
    private var hotKey: HotKey?
    @Published private(set) var hotKeyRegistered = false

    init(registerHotKey: Bool = true, connectOnInit: Bool = true) {
        repoRoot = Bundle.main.object(forInfoDictionaryKey: "TACITRepoRoot") as? String
            ?? ProcessInfo.processInfo.environment["TACIT_REPO_ROOT"]
        // Ctrl-Shift-Cmd-. = Stop everything, from any app, registered at launch (not when the menu first opens).
        // (Ctrl-Opt-Cmd-. is taken by macOS "Increase contrast".)
        if registerHotKey {
            hotKey = HotKey(keyCode: UInt32(kVK_ANSI_Period), modifiers: UInt32(controlKey | shiftKey | cmdKey)) { [weak self] in
                Task { @MainActor in self?.stopEverything() }
            }
        }
        hotKeyRegistered = hotKey?.registered ?? false
        if connectOnInit { connect() }
    }

    private var cachedToken: String?
    /// Read credentials off the UI thread: macOS may wait for Documents access on an ad-hoc-signed build.
    /// No credential is logged, persisted by the companion or passed in process arguments.
    nonisolated private static func readToken(root: String?) -> String? {
        if let t = ProcessInfo.processInfo.environment["TACIT_USER_TOKEN"], !t.isEmpty { return t }
        guard let root,
              let data = FileManager.default.contents(atPath: root + "/server/data/secrets.json"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["userToken"] as? String
    }

    func connect() {
        reconnectWork?.cancel(); connectGeneration += 1
        task?.cancel(with: .goingAway, reason: nil); task = nil
        resetServerState(); cachedToken = nil; conn = .connecting
        let gen = connectGeneration, root = repoRoot
        Task { [weak self] in
            let tok = await Task.detached(priority: .userInitiated) { TacitClient.readToken(root: root) }.value
            guard let self, gen == self.connectGeneration else { return }
            guard let tok, var comps = URLComponents(string: "ws://127.0.0.1:\(self.port)/ws") else { self.conn = .noToken; return }
            self.cachedToken = tok
            comps.queryItems = [URLQueryItem(name: "token", value: tok)]
            guard let url = comps.url else { self.conn = .noToken; return }
            let t = self.session.webSocketTask(with: url)
            self.task = t; t.resume(); self.receive(t, gen)
        }
    }

    private func resetServerState() {
        live = nil; output = nil; route = nil; recognition = nil
        lastHypothesis = nil; lastDelivery = nil; reviewDraft = ReviewDraft(); reviewSubmittedID = nil
        seenHypotheses.removeAll(); hypothesisOrder.removeAll()
        pendingLiveGeneration = nil; pendingOutputGeneration = nil
        reviewExpiryWork?.cancel(); reviewExpired = false; pendingReviewedRequest = nil
    }

    private func receive(_ t: URLSessionWebSocketTask, _ gen: Int) {
        t.receive { [weak self] result in
            Task { @MainActor in
                guard let self, gen == self.connectGeneration else { return }
                switch result {
                case .failure(let e):
                    // Never surface localizedDescription/userInfo: the failing URL carries the access token.
                    let code = (e as? URLError)?.code
                    let down: Set<URLError.Code> = [.cannotConnectToHost, .networkConnectionLost, .timedOut, .notConnectedToInternet]
                    self.lost(code.map { down.contains($0) } == true ? "TACIT server not running"
                              : code == .badServerResponse ? "connection refused (token?)" : "disconnected (code \((e as NSError).code))")
                case .success(let msg):
                    if self.conn != .connected { self.conn = .connected; self.backoff = 0.5 }
                    if case .string(let s) = msg { self.handle(s) }
                    self.receive(t, gen)
                }
            }
        }
    }

    private func lost(_ why: String) {
        resetServerState()
        lastHypothesis = nil; lastDelivery = nil
        conn = .disconnected(why)
        let w = DispatchWorkItem { [weak self] in Task { @MainActor in self?.connect() } }
        reconnectWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + backoff, execute: w)
        backoff = min(backoff * 2, 5)
    }

    func handle(_ s: String) {
        guard let d = s.data(using: .utf8), let m = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let type = m["type"] as? String else { return }
        switch type {
        case "live_status":
            if let st = m["status"] as? [String: Any] {
                if (st["authorizationId"] as? String) != live?.authorizationId {
                    lastHypothesis = nil; seenHypotheses.removeAll(); hypothesisOrder.removeAll()
                }
                let generation = st["generation"] as? Int ?? 0
                if generation != live?.generation { notice = nil }
                if st["state"] as? String != "active" || generation != live?.generation {
                    lastHypothesis = nil; reviewDraft = ReviewDraft(); reviewSubmittedID = nil
                }
                if let pending = pendingLiveGeneration, generation > pending { pendingLiveGeneration = nil }
                live = Live(state: st["state"] as? String ?? "?", authorizationId: st["authorizationId"] as? String,
                            generation: st["generation"] as? Int ?? 0, reason: st["reason"] as? String ?? "")
            }
        case "output_status":
            if let st = m["status"] as? [String: Any] {
                let auth = st["authorizationId"] as? String
                let generation = st["generation"] as? Int ?? 0
                if generation != output?.generation { notice = nil }
                if auth != output?.authorizationId || generation != output?.generation || st["state"] as? String != "ready" {
                    lastDelivery = nil; reviewDraft = ReviewDraft()
                }
                if let pending = pendingOutputGeneration, generation > pending { pendingOutputGeneration = nil }
                output = Output(state: st["state"] as? String ?? "?", authorizationId: st["authorizationId"] as? String,
                                generation: st["generation"] as? Int ?? 0, reason: st["reason"] as? String ?? "",
                                voice: st["voice"] as? String ?? "", queued: st["queued"] as? Int ?? 0)
                if let r = st["route"] as? [String: Any] { route = parseRoute(r) }
            }
        case "snapshot":
            if let now = (m["snapshot"] as? [String: Any])?["now"] as? Double {
                serverClockOffset = now - Date().timeIntervalSince1970 * 1000
            }
            if let sv = (m["snapshot"] as? [String: Any])?["services"] as? [String: Any] {
                if let r = sv["recognition"] as? [String: Any] {
                    recognition = Recognition(reachable: r["reachable"] as? Bool ?? false, model: r["model"] as? String)
                }
                if let r = sv["voiceRoute"] as? [String: Any] { route = parseRoute(r) }
            }
        case "recognition_hypothesis":
            guard let h = m["hypothesis"] as? [String: Any],
                  let auth = live?.authorizationId, !auth.isEmpty, h["authorizationId"] as? String == auth,
                  let id = h["utteranceId"] as? String, !id.isEmpty, !seenHypotheses.contains(id) else { return }
            seenHypotheses.insert(id); hypothesisOrder.append(id)
            if hypothesisOrder.count > 512 { seenHypotheses.remove(hypothesisOrder.removeFirst()) }
            guard live?.state == "active", pendingLiveGeneration == nil else { return }
            if let generation = h["generation"] as? Int, generation != live?.generation { return }
            let reason = h["reason"] as? String
            // A stale/duplicate server refusal is not a new recognition to reveal after Resume.
            if h["decision"] as? String == "abstained",
               ["dropped", "stale", "paused", "duplicate", "incomplete"].contains(where: { reason?.lowercased().contains($0) == true }) { return }
            let stages = h["stages"] as? [String: Any]
            let ms = h["recognitionMs"] as? Double ?? 0
            let total: Double?
            if let wait = stages?["endpoint_wait"] as? Double, let upload = stages?["upload"] as? Double {
                total = wait + upload + ms
            } else { total = nil }
            var phrase: Phrase?
            if let p = h["phraseMatch"] as? [String: Any] {
                phrase = Phrase(text: p["phrase"] as? String ?? "", accepted: p["accepted"] as? Bool ?? false,
                                reason: p["reason"] as? String, rule: p["rule"] as? String ?? "")
            }
            let candidates = (h["reviewCandidates"] as? [[String: Any]] ?? []).compactMap { p -> ReviewCandidate? in
                guard let kind = p["kind"] as? String, ["raw", "alternative", "phrase"].contains(kind),
                      let index = p["index"] as? Int, let text = p["text"] as? String,
                      let hash = p["textHash"] as? String, hash == Self.textHash(text) else { return nil }
                return ReviewCandidate(kind: kind, index: index, text: text, textHash: hash)
            }
            reviewDraft = ReviewDraft(); reviewSubmittedID = nil; reviewExpired = false
            reviewExpiryWork?.cancel()
            if let expiry = h["reviewExpiresAt"] as? Double {
                let work = DispatchWorkItem { [weak self] in self?.reviewExpired = true; self?.reviewDraft = ReviewDraft() }
                reviewExpiryWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + max(0, (expiry - estimatedServerNow) / 1000), execute: work)
            }
            lastHypothesis = Hypothesis(id: id, text: h["rawText"] as? String ?? "", decision: h["decision"] as? String ?? "?",
                                        reason: reason, ms: Int(ms), at: Date(),
                                        brightness: (h["gate"] as? [String: Any])?["mouth_brightness"] as? Double,
                                        endToResultMs: total, phrase: phrase, authorizationId: auth,
                                        generation: h["generation"] as? Int, candidates: candidates,
                                        expiresAt: h["reviewExpiresAt"] as? Double)
        case "review_invalidated":
            // A newer utterance header was accepted: every earlier choice/edit is void, even before its result arrives
            // (the server already refuses it; this keeps the notch from offering it).
            guard let auth = live?.authorizationId, !auth.isEmpty, m["authorizationId"] as? String == auth,
                  m["generation"] as? Int == live?.generation, let id = m["utteranceId"] as? String,
                  id != lastHypothesis?.id else { return }
            reviewExpiryWork?.cancel(); reviewExpired = true; reviewDraft = ReviewDraft()
        case "speech_delivery":
            guard let dl = m["delivery"] as? [String: Any], let auth = output?.authorizationId,
                  dl["outputAuthorizationId"] as? String == auth, dl["generation"] as? Int == output?.generation,
                  output?.state == "ready", pendingOutputGeneration == nil,
                  ["typed", "reviewed-recognition", "user-corrected"].contains(dl["source"] as? String ?? "") else { return }
            lastDelivery = Delivery(requestId: dl["requestId"] as? String ?? "", text: dl["text"] as? String ?? "",
                                    state: dl["state"] as? String ?? "?", reason: dl["reason"] as? String, at: Date(),
                                    firstAudioAt: (dl["timings"] as? [String: Any])?["firstAudioAt"] as? Double,
                                    voice: dl["voice"] as? String, source: dl["source"] as? String ?? "typed")
            if dl["state"] as? String == "refused", dl["requestId"] as? String == pendingReviewedRequest, (dl["review"] as? [String: Any])?["utteranceId"] as? String == reviewSubmittedID {
                reviewSubmittedID = nil
            }
        default: break
        }
    }

    private func parseRoute(_ r: [String: Any]) -> Route {
        Route(state: r["state"] as? String ?? "?", device: r["deviceName"] as? String, readers: r["readers"] as? [String],
              warnings: r["warnings"] as? [String] ?? [], reason: r["reason"] as? String,
              gainDb: r["gainDb"] as? Double ?? 0, calibrated: r["calibrated"] as? Bool ?? false)
    }

    private func send(_ obj: [String: Any]) {
        guard conn == .connected, let t = task, let d = try? JSONSerialization.data(withJSONObject: obj),
              let s = String(data: d, encoding: .utf8) else { notice = "Not connected to TACIT."; return }
        t.send(.string(s)) { [weak self] e in
            if let e { Task { @MainActor in self?.notice = "Control could not be sent (code \((e as NSError).code)). Delivery is unconfirmed." } }
        }
    }

    // MARK: - user actions (each is one explicit user action)

    /// Pause / resume / end only. Activation belongs to the workspace that owns the camera (activating here would
    /// mint a new authorization and cut off the browser's capture).
    func live(_ action: String) {
        guard ["pause", "resume", "end"].contains(action) else { return }
        if conn == .connected { pendingLiveGeneration = live?.generation; lastHypothesis = nil; lastDelivery = nil; reviewDraft = ReviewDraft() }
        send(["type": "live_control", "action": action])
    }
    func output(_ action: String) {
        guard ["enable", "pause", "resume", "stop"].contains(action) else { return }
        if conn == .connected { pendingOutputGeneration = output?.generation; lastDelivery = nil; reviewDraft = ReviewDraft() }
        send(["type": "output_control", "action": action])
    }

    func pauseEverything() {
        if live?.state == "active" { live("pause") }
        if output?.state == "ready" { output("pause") }
    }

    /// User-authored typed text only. Never fed from recognised text.
    @discardableResult
    func speakTyped(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return false }
        guard let auth = output?.authorizationId, output?.state == "ready", pendingOutputGeneration == nil else { notice = "Turn voice output on first."; return false }
        guard conn == .connected, route?.state == "ready", t.utf16.count <= 500 else {
            notice = t.utf16.count > 500 ? "Keep typed speech within 500 characters." : "The virtual microphone is not ready."
            return false
        }
        // outputGeneration: if output was paused/interrupted after this was written, the server refuses it.
        send(["type": "speak_typed", "requestId": UUID().uuidString, "outputAuthorizationId": auth, "text": t, "outputGeneration": output?.generation ?? -1])
        return true
    }

    var estimatedServerNow: Double { Date().timeIntervalSince1970 * 1000 + serverClockOffset }
    var canReviewCurrent: Bool { reviewIsCurrent(connected: conn == .connected, now: estimatedServerNow) }
    func reviewIsCurrent(connected: Bool, now: Double) -> Bool {
        guard connected, !reviewExpired, live?.state == "active", pendingLiveGeneration == nil,
              let h = lastHypothesis, h.decision == "shown", !h.candidates.isEmpty,
              h.authorizationId == live?.authorizationId, h.generation == live?.generation,
              let expiry = h.expiresAt, now < expiry, reviewSubmittedID != h.id else { return false }
        return true
    }
    static func textHash(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    /// `utteranceID` is the hypothesis the user saw when the control was rendered. A delayed closure from an older
    /// render must never bind its choice (even an identical candidate) to a newer utterance.
    func chooseReview(_ candidate: ReviewCandidate, of utteranceID: String, editing: Bool = false) {
        chooseReview(candidate, of: utteranceID, editing: editing, connected: conn == .connected, now: estimatedServerNow)
    }
    func chooseReview(_ candidate: ReviewCandidate, of utteranceID: String, editing: Bool, connected: Bool, now: Double) {
        guard reviewIsCurrent(connected: connected, now: now), let h = lastHypothesis, h.id == utteranceID,
              h.candidates.contains(candidate) else { return }
        reviewDraft.choose(candidate, utteranceID: h.id, outputGeneration: output?.generation ?? -1, editing: editing)
    }
    /// Dedicated reviewed path only. Every field comes from the current hypothesis and an explicit user choice.
    @discardableResult func speakReviewed() -> Bool {
        guard canReviewCurrent, let h = lastHypothesis, let candidate = reviewDraft.candidate,
              reviewDraft.utteranceID == h.id, h.candidates.contains(candidate),
              let output, output.state == "ready", let outputAuth = output.authorizationId,
              pendingOutputGeneration == nil, reviewDraft.outputGeneration == output.generation,
              route?.state == "ready", let generation = h.generation else {
            notice = "Review expired or voice is unavailable. Choose the current words again."; return false
        }
        let text = reviewDraft.text
        guard reviewDraft.editing || text == candidate.text else { notice = "Choose the exact current candidate again."; return false }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 500 else {
            notice = "Keep your words within 500 characters."; return false
        }
        let requestID = UUID().uuidString
        let request: [String: Any] = ["type":"speak_reviewed", "requestId":requestID,
            "outputAuthorizationId":outputAuth, "outputGeneration":output.generation,
            "liveAuthorizationId":h.authorizationId, "liveGeneration":generation, "utteranceId":h.id,
            "candidate":reviewDraft.editing ? "edited" : candidate.kind, "index":candidate.index,
            "text":text, "textHash":reviewDraft.editing ? Self.textHash(text) : candidate.textHash]
        pendingReviewedRequest = requestID; reviewSubmittedID = h.id; reviewDraft = ReviewDraft()
        send(request)
        return true
    }

    /// Stop everything: ends Live and voice output (cuts audio that has not been played yet).
    func stopEverythingAndQuit() {
        guard conn == .connected else { NSApp.terminate(nil); return }
        stopEverything()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { NSApp.terminate(nil) }
    }

    func stopEverything() {
        if conn != .connected { notice = "Disconnected. Stop could not be confirmed; check the call and TACIT server."; return }
        live("end")
        output("stop")
        notice = "Stop requested for Live and voice output."
    }

    // MARK: - local runtime

    func startServer() {
        guard let root = repoRoot else { notice = "Unknown TACIT folder (rebuild the app with build-app.sh)."; return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = [root + "/scripts/tacit.sh", "start"]
        var env = ProcessInfo.processInfo.environment
        // GUI apps get a minimal PATH; add the node found at build time (tsx uses #!/usr/bin/env node) and Homebrew.
        let nodeDir = Bundle.main.object(forInfoDictionaryKey: "TACITNodeBinDir") as? String ?? ""
        env["PATH"] = [nodeDir, "/opt/homebrew/bin", "/usr/local/bin", env["PATH"] ?? "/usr/bin:/bin"].filter { !$0.isEmpty }.joined(separator: ":")
        p.environment = env
        p.currentDirectoryURL = URL(fileURLWithPath: root)
        p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
        notice = "Starting TACIT…"
        p.terminationHandler = { [weak self] proc in
            Task { @MainActor [weak self] in
                self?.notice = proc.terminationStatus == 0 ? "TACIT started." : "TACIT failed to start — run ./scripts/tacit.sh preflight"
                self?.connect()
            }
        }
        do { try p.run() } catch { notice = "Could not run the launcher: \(error.localizedDescription)" }
    }

    /// Opens the detailed workspace in the browser. The token goes straight to NSWorkspace (no child process argv).
    func openWorkspace() {
        guard let tok = cachedToken, var c = URLComponents(string: "http://127.0.0.1:\(port)/") else { notice = "No access token found."; return }
        c.queryItems = [URLQueryItem(name: "token", value: tok)]
        if let u = c.url { NSWorkspace.shared.open(u) }
    }
}
