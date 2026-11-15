import AppKit
import Carbon.HIToolbox
import Foundation
import CryptoKit

/// Connection to the local TACIT server's user WebSocket. All state lives on the main actor; when disconnected every
/// server-derived field is reset to nil ("unknown") so the menu never shows stale state as current.
@MainActor
final class TacitClient: ObservableObject {
    enum Conn: Equatable { case noToken, connecting, connected, disconnected(String) }

    struct Live { var state: String; var authorizationId: String?; var generation: Int; var reason: String; var unreviewed = false }
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

    // My Voice (server `voice_status` / `voice_preview`). Everything shown comes from the server registry.
    struct VoiceControl: Equatable { var min: Double; var max: Double; var defaultValue: Double; var step: Double
        func contains(_ v: Double) -> Bool { v >= min - 1e-9 && v <= max + 1e-9 } }
    struct VoiceOption: Equatable, Identifiable {
        var id: String; var name: String; var locale: String; var language: String; var provider: String
        var quality: String?; var kind: String; var novelty: Bool; var available: Bool; var unavailableReason: String?
        var local: Bool; var rate: VoiceControl?; var pitch: VoiceControl?
        /// What the main list offers: real, available, non-effect voices (Personal Voice is reported separately).
        var offered: Bool { available && !novelty && kind != "apple-personal-voice" }
    }
    struct VoiceState: Equatable {
        var revision: Int
        var selectedId: String; var selectedRate: Double?; var selectedPitch: Double?; var source: String
        var effectiveId: String; var effectiveLabel: String; var fallback: String?
        var persisted: Bool; var persistError: String?
        var voices: [VoiceOption]; var samples: [String]
        var engineState: String; var engineReason: String?
        var personalVoiceAuthorization: String; var personalVoiceReason: String
        var lastChange: (requestId: String?, ok: Bool, reason: String?)?
        static func == (a: VoiceState, b: VoiceState) -> Bool {
            a.revision == b.revision && a.selectedId == b.selectedId && a.selectedRate == b.selectedRate && a.selectedPitch == b.selectedPitch
                && a.effectiveId == b.effectiveId && a.fallback == b.fallback && a.voices == b.voices && a.engineState == b.engineState
                && a.lastChange?.requestId == b.lastChange?.requestId && a.lastChange?.ok == b.lastChange?.ok
        }
        var effective: VoiceOption? { voices.first { $0.id == effectiveId } }
    }
    struct VoicePreview: Equatable { var previewId: String; var voiceId: String; var state: String; var reason: String?; var output: String? }
    // Presence (server `respond_status` / `respond_suggestion`). Suggestions are text only; nothing here can speak.
    struct RespondStatus: Equatable { var available: Bool; var provider: String?; var dataNotice: String; var reason: String? }
    struct Suggestion: Equatable {
        var requestId: String; var state: String; var drafts: [String]; var focus: String?
        var model: String?; var reason: String?; var generationMs: Int?; var removed: Int
    }

    @Published private(set) var conn: Conn = .connecting
    @Published private(set) var live: Live?
    @Published private(set) var output: Output?
    @Published private(set) var route: Route?
    @Published private(set) var recognition: Recognition?
    @Published private(set) var lastHypothesis: Hypothesis?
    @Published private(set) var lastDelivery: Delivery?
    @Published private(set) var myVoice: VoiceState?
    @Published private(set) var voicePreview: VoicePreview?
    @Published private(set) var voiceNotice: String?
    @Published private(set) var respondStatus: RespondStatus?
    @Published private(set) var suggestion: Suggestion?
    /// The only request whose results are accepted; anything else (older, cancelled, another client's) is dropped.
    private(set) var pendingSuggestionID: String?
    private var pendingVoiceSelect: String?
    @Published var notice: String?
    @Published var typedDraft = ""
    @Published private(set) var preservedCorrection: String?
    @Published var reviewDraft = ReviewDraft() {
        willSet {
            if reviewDraft.editing, !reviewDraft.text.isEmpty,
               newValue.utteranceID != reviewDraft.utteranceID,
               reviewSubmittedID != reviewDraft.utteranceID {
                preservedCorrection = reviewDraft.text
            }
        }
    }
    @Published private(set) var reviewSubmittedID: String?
    private var serverClockOffset: Double = 0
    private var reviewExpiryWork: DispatchWorkItem?
    private var pendingReviewedRequest: String?
    private struct AuthoredApproval: Equatable {
        let authorizationId: String
        let generation: Int
        let textHash: String
    }
    /// One pending operation per exact message and authorization, even if My Voice changes meanwhile.
    private var pendingAuthored: [String: AuthoredApproval] = [:]
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

    // Native Live (camera in this app, NativeCamera). The app owns Live only for the authorization it activated itself.
    /// Authorization minted by this app's own `activate`; nil when Live is off or another client (browser) took over.
    @Published private(set) var ownedLiveAuthorization: String?
    private var awaitingOwnActivation: Int?
    /// Utterance uploaded by this app whose result has not arrived yet ("Interpreting your words").
    @Published private(set) var processingUtteranceID: String?
    private var processingTimeout: DispatchWorkItem?
    /// Every recognition result for the current authorization (evidence tools; never feeds speech).
    var onHypothesis: ((_ id: String, _ decision: String, _ text: String, _ reason: String?) -> Void)?
    var liveActivationPending: Bool { awaitingOwnActivation != nil }
    /// Real-time (unreviewed) mode is on for the current Live authorization (server-reported, never assumed).
    var realtimeActive: Bool { live?.state == "active" && live?.unreviewed == true }
    struct RealtimeLine: Equatable, Identifiable { var id: String; var text: String; var state: String }
    /// Sentences spoken automatically in real-time mode (server deliveries), newest first, at most 3.
    @Published private(set) var realtimeSpoken: [RealtimeLine] = []
    var ownsLive: Bool { ownedLiveAuthorization != nil && live?.state == "active" && live?.authorizationId == ownedLiveAuthorization }
    @Published private(set) var hotKeyRegistered = false

    /// Dependency injection for offline tests/lab. This transport never opens a socket or reads credentials.
    struct IsolatedTransport { var send: ([String: Any]) -> Void }
    private let isolatedTransport: IsolatedTransport?
    var isIsolated: Bool { isolatedTransport != nil }
    init(registerHotKey: Bool = true, connectOnInit: Bool = true, isolatedTransport: IsolatedTransport? = nil) {
        self.isolatedTransport = isolatedTransport
        if isolatedTransport != nil { conn = .connected }
        repoRoot = Bundle.main.object(forInfoDictionaryKey: "TACITRepoRoot") as? String
            ?? ProcessInfo.processInfo.environment["TACIT_REPO_ROOT"]
        // Ctrl-Shift-Cmd-. = Stop everything, from any app, registered at launch (not when the menu first opens).
        // (Ctrl-Opt-Cmd-. is taken by macOS "Increase contrast".)
        if registerHotKey && isolatedTransport == nil {
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
        if isolatedTransport != nil { resetServerState(); conn = .connected; return }
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

    func disconnectIsolatedTransport() {
        guard isolatedTransport != nil else { return }
        resetServerState(); conn = .disconnected("Offline lab connection-loss fixture")
    }

    private func resetServerState() {
        live = nil; output = nil; route = nil; recognition = nil
        lastHypothesis = nil; lastDelivery = nil; reviewDraft = ReviewDraft(); reviewSubmittedID = nil
        seenHypotheses.removeAll(); hypothesisOrder.removeAll()
        pendingLiveGeneration = nil; pendingOutputGeneration = nil
        pendingAuthored.removeAll()
        ownedLiveAuthorization = nil; awaitingOwnActivation = nil; clearProcessing(); realtimeSpoken.removeAll()
        reviewExpiryWork?.cancel(); reviewExpired = false; pendingReviewedRequest = nil
        myVoice = nil; voicePreview = nil; voiceNotice = nil; pendingVoiceSelect = nil
        respondStatus = nil; suggestion = nil; pendingSuggestionID = nil
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
                let auth = st["authorizationId"] as? String, state = st["state"] as? String
                if let awaiting = awaitingOwnActivation, generation > awaiting {
                    awaitingOwnActivation = nil
                    if state == "active", let auth { ownedLiveAuthorization = auth }
                } else if auth != ownedLiveAuthorization { ownedLiveAuthorization = nil }
                if state != "active" || generation != live?.generation { clearProcessing() }
                live = Live(state: st["state"] as? String ?? "?", authorizationId: st["authorizationId"] as? String,
                            generation: st["generation"] as? Int ?? 0, reason: st["reason"] as? String ?? "",
                            unreviewed: st["unreviewed"] as? Bool == true && st["mode"] as? String == "automatic")
                if state != "active" || st["unreviewed"] as? Bool != true { realtimeSpoken.removeAll() }
            }
        case "output_status":
            if let st = m["status"] as? [String: Any] {
                let auth = st["authorizationId"] as? String
                let generation = st["generation"] as? Int ?? 0
                if generation != output?.generation { notice = nil }
                if auth != output?.authorizationId || generation != output?.generation || st["state"] as? String != "ready" {
                    lastDelivery = nil; reviewDraft = ReviewDraft(); pendingAuthored.removeAll()
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
            if id == processingUtteranceID { clearProcessing() }
            onHypothesis?(id, h["decision"] as? String ?? "?", h["rawText"] as? String ?? "", h["reason"] as? String)
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
                  ["typed", "reviewed-recognition", "user-corrected", "recognized"].contains(dl["source"] as? String ?? "") else { return }
            if dl["source"] as? String == "recognized" { // real-time (unreviewed): keep a short visible log, newest first
                let id = dl["requestId"] as? String ?? ""
                let entry = RealtimeLine(id: id, text: dl["text"] as? String ?? "", state: dl["state"] as? String ?? "?")
                if let i = realtimeSpoken.firstIndex(where: { $0.id == id }) { realtimeSpoken[i] = entry } else { realtimeSpoken.insert(entry, at: 0) }
                if realtimeSpoken.count > 3 { realtimeSpoken.removeLast(realtimeSpoken.count - 3) }
            }
            // The guard above already rejects revoked authorization/generation and untrusted sources.
            if dl["source"] as? String == "typed", let id = dl["requestId"] as? String,
               ["rendered", "failed", "refused", "interrupted"].contains(dl["state"] as? String ?? "") {
                pendingAuthored.removeValue(forKey: id)
            }
            lastDelivery = Delivery(requestId: dl["requestId"] as? String ?? "", text: dl["text"] as? String ?? "",
                                    state: dl["state"] as? String ?? "?", reason: dl["reason"] as? String, at: Date(),
                                    firstAudioAt: (dl["timings"] as? [String: Any])?["firstAudioAt"] as? Double,
                                    voice: dl["voice"] as? String, source: dl["source"] as? String ?? "typed")
            if dl["state"] as? String == "refused", dl["requestId"] as? String == pendingReviewedRequest, (dl["review"] as? [String: Any])?["utteranceId"] as? String == reviewSubmittedID {
                reviewSubmittedID = nil
            }
        case "voice_status":
            guard let st = m["status"] as? [String: Any], let parsed = Self.parseVoiceStatus(st) else { return }
            myVoice = parsed
            if let change = parsed.lastChange, let pending = pendingVoiceSelect, change.requestId == pending {
                pendingVoiceSelect = nil
                voiceNotice = change.ok ? (change.reason ?? nil) : (change.reason ?? "That voice could not be chosen.")
            }
        case "voice_preview":
            guard let p = m["preview"] as? [String: Any], let id = p["previewId"] as? String else { return }
            // Only the preview this client started (or a newer one from another client) replaces the shown state.
            voicePreview = VoicePreview(previewId: id, voiceId: p["voiceId"] as? String ?? "", state: p["state"] as? String ?? "?",
                                        reason: p["reason"] as? String, output: p["output"] as? String)
        case "respond_status":
            guard let st = m["status"] as? [String: Any] else { return }
            respondStatus = RespondStatus(available: st["available"] as? Bool == true, provider: st["provider"] as? String,
                                          dataNotice: st["dataNotice"] as? String ?? "", reason: st["reason"] as? String)
        case "respond_suggestion":
            guard let s = m["suggestion"] as? [String: Any], let id = s["requestId"] as? String, id == pendingSuggestionID else { return }
            let state = s["state"] as? String ?? "?"
            let drafts = (s["drafts"] as? [[String: Any]] ?? []).compactMap { $0["text"] as? String }.filter(PersonalPhrase.valid)
            if state != "generating" { pendingSuggestionID = nil }
            suggestion = Suggestion(requestId: id, state: state, drafts: Array(drafts.prefix(3)), focus: s["focus"] as? String,
                                    model: s["model"] as? String, reason: s["reason"] as? String,
                                    generationMs: s["generationMs"] as? Int, removed: s["removed"] as? Int ?? 0)
        default: break
        }
    }

    /// Presence: ask the server for wording. Explicit user action (choosing an intention). Never speaks anything.
    @discardableResult
    func requestSuggestion(intent: String, context: String, contextSource: String, point: String, tone: String?) -> String? {
        guard conn == .connected, respondStatus?.available == true else { return nil }
        let id = UUID().uuidString
        pendingSuggestionID = id // the server supersedes any older request of ours
        suggestion = Suggestion(requestId: id, state: "generating", drafts: [], focus: nil, model: nil, reason: nil, generationMs: nil, removed: 0)
        var msg: [String: Any] = ["type": "respond_suggest", "requestId": id, "intent": intent, "context": context, "contextSource": contextSource]
        if !point.isEmpty { msg["userPoint"] = point }
        if let tone { msg["tone"] = tone }
        send(msg)
        return id
    }
    func cancelSuggestion() {
        if let id = pendingSuggestionID, conn == .connected { send(["type": "respond_cancel", "requestId": id]) }
        pendingSuggestionID = nil; suggestion = nil
    }

    static func parseVoiceStatus(_ st: [String: Any]) -> VoiceState? {
        guard let revision = st["revision"] as? Int, let selected = st["selected"] as? [String: Any],
              let effective = st["effective"] as? [String: Any], let selectedId = selected["voiceId"] as? String,
              let effectiveId = effective["voiceId"] as? String else { return nil }
        func control(_ o: Any?) -> VoiceControl? {
            guard let c = o as? [String: Any], let lo = c["min"] as? Double, let hi = c["max"] as? Double,
                  let d = c["default"] as? Double, let step = c["step"] as? Double, lo < hi, step > 0 else { return nil }
            return VoiceControl(min: lo, max: hi, defaultValue: d, step: step)
        }
        let voices = (st["voices"] as? [[String: Any]] ?? []).compactMap { v -> VoiceOption? in
            guard let id = v["id"] as? String, let name = v["name"] as? String else { return nil }
            let controls = v["controls"] as? [String: Any]
            return VoiceOption(id: id, name: name, locale: v["locale"] as? String ?? "und", language: v["language"] as? String ?? "und",
                provider: v["provider"] as? String ?? "", quality: v["quality"] as? String, kind: v["kind"] as? String ?? "system",
                novelty: v["novelty"] as? Bool ?? false, available: v["available"] as? Bool ?? false,
                unavailableReason: v["unavailableReason"] as? String, local: v["local"] as? Bool ?? true,
                rate: control(controls?["rate"]), pitch: control(controls?["pitch"]))
        }
        let engine = st["engine"] as? [String: Any]
        let pv = st["applePersonalVoice"] as? [String: Any]
        let lc = st["lastChange"] as? [String: Any]
        return VoiceState(revision: revision, selectedId: selectedId, selectedRate: selected["rate"] as? Double,
            selectedPitch: selected["pitch"] as? Double, source: selected["source"] as? String ?? "default",
            effectiveId: effectiveId, effectiveLabel: effective["label"] as? String ?? effectiveId,
            fallback: st["fallback"] as? String, persisted: st["persisted"] as? Bool ?? false, persistError: st["persistError"] as? String,
            voices: voices, samples: st["samples"] as? [String] ?? [], engineState: engine?["state"] as? String ?? "unavailable",
            engineReason: engine?["reason"] as? String, personalVoiceAuthorization: pv?["authorization"] as? String ?? "unknown",
            personalVoiceReason: pv?["reason"] as? String ?? "",
            lastChange: lc.map { (requestId: $0["requestId"] as? String, ok: $0["ok"] as? Bool ?? false, reason: $0["reason"] as? String) })
    }

    // MARK: - My Voice actions (explicit user actions; none of them speaks into the call)

    /// Choose the voice approved messages are spoken with. Values must be inside the server-reported range.
    @discardableResult func selectVoice(_ voiceId: String, rate: Double? = nil, pitch: Double? = nil) -> Bool {
        guard conn == .connected, let state = myVoice, let v = state.voices.first(where: { $0.id == voiceId }), v.available else {
            voiceNotice = "That voice is not available right now."; return false
        }
        if let rate, v.rate?.contains(rate) != true { voiceNotice = "Speed is outside what this voice supports."; return false }
        if let pitch, v.pitch?.contains(pitch) != true { voiceNotice = "Pitch is outside what this voice supports."; return false }
        let requestId = UUID().uuidString
        var msg: [String: Any] = ["type": "voice_select", "requestId": requestId, "voiceId": voiceId]
        if let rate { msg["rate"] = rate }
        if let pitch { msg["pitch"] = pitch }
        pendingVoiceSelect = requestId; voiceNotice = nil
        send(msg)
        return true
    }
    func resetVoice() {
        guard conn == .connected else { return }
        let requestId = UUID().uuidString
        pendingVoiceSelect = requestId; voiceNotice = nil
        send(["type": "voice_select", "requestId": requestId, "voiceId": NSNull()])
    }
    func refreshVoices() { if conn == .connected { send(["type": "voice_refresh"]) } }
    /// Private preview on this Mac's own speakers (the server refuses if they are the call microphone).
    @discardableResult func previewVoice(_ voiceId: String, rate: Double? = nil, pitch: Double? = nil, sample: Int = 0) -> Bool {
        guard conn == .connected, let v = myVoice?.voices.first(where: { $0.id == voiceId }), v.available else { return false }
        var msg: [String: Any] = ["type": "voice_preview", "previewId": UUID().uuidString, "voiceId": voiceId, "sample": sample]
        if let rate, v.rate?.contains(rate) == true { msg["rate"] = rate }
        if let pitch, v.pitch?.contains(pitch) == true { msg["pitch"] = pitch }
        send(msg)
        return true
    }
    func stopVoicePreview() { if conn == .connected { send(["type": "voice_preview_stop"]) } }
    var previewActive: Bool { ["synthesizing", "playing"].contains(voicePreview?.state ?? "") }

    private func parseRoute(_ r: [String: Any]) -> Route {
        Route(state: r["state"] as? String ?? "?", device: r["deviceName"] as? String, readers: r["readers"] as? [String],
              warnings: r["warnings"] as? [String] ?? [], reason: r["reason"] as? String,
              gainDb: r["gainDb"] as? Double ?? 0, calibrated: r["calibrated"] as? Bool ?? false)
    }

    private func send(_ obj: [String: Any]) {
        if let isolatedTransport { isolatedTransport.send(obj); return }
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
    /// Native camera only (NativeCamera owns the frames): mint a display-only Live authorization for this app.
    /// Explicit user action ("Start communicating"); recognised words are still only shown, never spoken automatically.
    /// `realtime: true` only after the user explicitly confirmed real-time (unreviewed) speech for this session.
    func activateLive(realtime: Bool = false) {
        guard conn == .connected else { notice = "Not connected to TACIT."; return }
        awaitingOwnActivation = live?.generation ?? 0
        pendingLiveGeneration = live?.generation; lastHypothesis = nil; reviewDraft = ReviewDraft()
        var msg: [String: Any] = ["type": "live_control", "action": "activate", "mode": realtime ? "automatic" : "display-only", "inputSource": "camera"]
        if realtime { msg["acknowledgeUnreviewed"] = true }
        send(msg)
    }

    /// Uploads one endpointed camera window: the JSON header, then exactly one binary message per JPEG, in order.
    /// Returns the utteranceId, or nil (with a notice) when Live is not owned by this app.
    @discardableResult
    func sendVisualUtterance(_ w: CapturedWindow) -> String? {
        guard ownsLive, pendingLiveGeneration == nil, let auth = ownedLiveAuthorization else { return nil }
        guard w.valid else { notice = "That capture was incomplete and was discarded."; return nil }
        let id = UUID().uuidString
        processingUtteranceID = id
        let header: [String: Any] = ["type": "visual_utterance", "utteranceId": id, "authorizationId": auth,
            "startMs": w.startMs, "endMs": w.endMs, "endpointMs": w.endpointMs, "frameTimesMs": w.frames.map(\.t)]
        if let isolatedTransport {
            isolatedTransport.send(header)
            for f in w.frames { isolatedTransport.send(["binaryFrameBytes": f.jpeg.count]) }
        } else {
            guard conn == .connected, let t = task, let d = try? JSONSerialization.data(withJSONObject: header),
                  let s = String(data: d, encoding: .utf8) else { notice = "Not connected to TACIT."; return nil }
            // Chained so the frames follow their header strictly in order on this socket.
            FrameUploader(task: t, frames: w.frames.map(\.jpeg)) { [weak self] in
                Task { @MainActor in self?.notice = "The capture could not be uploaded. Mouth it again."; self?.clearProcessing() }
            }.start(header: s)
        }
        processingTimeout?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.processingUtteranceID == id else { return }
            self.processingUtteranceID = nil; self.notice = "No result for that sentence. Mouth it again, or type it."
        }
        processingTimeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: work)
        return id
    }
    private func clearProcessing() { processingTimeout?.cancel(); processingTimeout = nil; processingUtteranceID = nil }

    func output(_ action: String) {
        guard ["enable", "pause", "resume", "stop"].contains(action) else { return }
        if conn == .connected { pendingOutputGeneration = output?.generation; lastDelivery = nil; reviewDraft = ReviewDraft() }
        send(["type": "output_control", "action": action])
    }

    func pauseEverything() {
        if previewActive { stopVoicePreview() }
        if live?.state == "active" { live("pause") }
        if output?.state == "ready" { output("pause") }
    }

    var canSpeakAuthored: Bool {
        conn == .connected && output?.state == "ready" && output?.authorizationId != nil
            && pendingOutputGeneration == nil && route?.state == "ready"
    }
    var authoredUnavailableReason: String? {
        if conn != .connected { return "Reconnect to use voice output." }
        if route?.state != "ready" { return "Voice output unavailable. Check your call microphone in settings." }
        if pendingOutputGeneration != nil { return "Waiting for voice authorization…" }
        if output?.state == "paused" { return "Voice is paused. Resume it deliberately to speak." }
        if output?.state != "ready" { return "Enable voice for this session before speaking." }
        return nil
    }

    /// User-authored or deliberately selected saved text only. Never fed from recognised text.
    @discardableResult
    func speakTyped(_ text: String, assisted: Bool = false) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return false }
        guard let auth = output?.authorizationId, output?.state == "ready", pendingOutputGeneration == nil else { notice = "Turn voice output on first."; return false }
        guard conn == .connected, route?.state == "ready", t.utf16.count <= 500 else {
            notice = t.utf16.count > 500 ? "Keep typed speech within 500 characters." : "The virtual microphone is not ready."
            return false
        }
        let approval = AuthoredApproval(authorizationId: auth, generation: output?.generation ?? -1,
            textHash: Self.textHash(t))
        guard !pendingAuthored.values.contains(approval) else {
            notice = "That message is already pending. Check its delivery before repeating it."
            return false
        }
        let requestID = UUID().uuidString
        pendingAuthored[requestID] = approval // set before send, including synchronous fixture acknowledgments
        notice = nil
        // outputGeneration: if output was paused/interrupted after this was written, the server refuses it.
        var request: [String: Any] = ["type": "speak_typed", "requestId": requestID, "outputAuthorizationId": auth, "text": t, "outputGeneration": output?.generation ?? -1]
        // voiceRevision: spoken only in the voice the user saw; a voice change in between is refused, never substituted.
        if let revision = myVoice?.revision { request["voiceRevision"] = revision }
        if assisted { request["assisted"] = true } // provenance: began as an AI suggestion the user approved
        send(request)
        return true
    }

    var estimatedServerNow: Double { Date().timeIntervalSince1970 * 1000 + serverClockOffset }
    var canReviewCurrent: Bool { reviewIsCurrent(connected: conn == .connected, now: estimatedServerNow) }
    func reviewIsCurrent(connected: Bool, now: Double) -> Bool {
        guard connected, !reviewExpired, live?.state == "active", live?.unreviewed != true, pendingLiveGeneration == nil,
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
    /// One tap: speak exactly the words shown (the chosen alternative, or the raw words when none was chosen).
    /// The tap itself is the explicit choice; it still goes through the dedicated reviewed path below.
    @discardableResult func speakShownWords() -> Bool {
        guard let h = lastHypothesis else { return false }
        if reviewDraft.candidate == nil || reviewDraft.utteranceID != h.id {
            guard let raw = h.candidates.first(where: { $0.kind == "raw" }) else { return false }
            chooseReview(raw, of: h.id)
        }
        return speakReviewed()
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
        notice = nil
        let requestID = UUID().uuidString
        var request: [String: Any] = ["type":"speak_reviewed", "requestId":requestID,
            "outputAuthorizationId":outputAuth, "outputGeneration":output.generation,
            "liveAuthorizationId":h.authorizationId, "liveGeneration":generation, "utteranceId":h.id,
            "candidate":reviewDraft.editing ? "edited" : candidate.kind, "index":candidate.index,
            "text":text, "textHash":reviewDraft.editing ? Self.textHash(text) : candidate.textHash]
        if let revision = myVoice?.revision { request["voiceRevision"] = revision }
        if reviewDraft.editing { preservedCorrection = text } // RAM-only reference, never a new speech authorization
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
        if previewActive { stopVoicePreview() }
        cancelSuggestion()
        live("end")
        output("stop")
        notice = "Stop requested for Live and voice output."
    }

    // MARK: - local runtime

    func startServer() {
        guard isolatedTransport == nil else { notice = "Offline lab · runtime controls disabled."; return }
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
        guard isolatedTransport == nil else { notice = "Offline lab · no camera or workspace connection."; return }
        guard let tok = cachedToken, var c = URLComponents(string: "http://127.0.0.1:\(port)/") else { notice = "No access token found."; return }
        c.queryItems = [URLQueryItem(name: "token", value: tok)]
        if let u = c.url { NSWorkspace.shared.open(u) }
    }
}

/// Sends one header then its frames, each only after the previous write completed (strict order on one socket).
private final class FrameUploader: @unchecked Sendable {
    private let task: URLSessionWebSocketTask
    private var frames: [Data]
    private let failed: @Sendable () -> Void
    init(task: URLSessionWebSocketTask, frames: [Data], failed: @escaping @Sendable () -> Void) { self.task = task; self.frames = frames; self.failed = failed }
    func start(header: String) { task.send(.string(header)) { self.step($0) } }
    private func step(_ error: Error?) {
        if error != nil { failed(); return }
        guard !frames.isEmpty else { return }
        task.send(.data(frames.removeFirst())) { self.step($0) }
    }
}
