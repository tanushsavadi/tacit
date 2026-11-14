import AppKit
import Carbon.HIToolbox
import Foundation

/// Connection to the local TACIT server's user WebSocket. All state lives on the main actor; when disconnected every
/// server-derived field is reset to nil ("unknown") so the menu never shows stale state as current.
@MainActor
final class TacitClient: ObservableObject {
    enum Conn: Equatable { case noToken, connecting, connected, disconnected(String) }

    struct Live { var state: String; var authorizationId: String?; var generation: Int; var reason: String }
    struct Output { var state: String; var authorizationId: String?; var generation: Int; var reason: String; var voice: String; var queued: Int }
    struct Route { var state: String; var device: String?; var readers: [String]?; var warnings: [String]; var reason: String?; var gainDb: Double; var calibrated: Bool }
    struct Recognition { var reachable: Bool; var model: String? }
    struct Hypothesis { var text: String; var decision: String; var reason: String?; var ms: Int; var at: Date }
    struct Delivery { var requestId: String; var text: String; var state: String; var reason: String?; var at: Date }

    @Published private(set) var conn: Conn = .connecting
    @Published private(set) var live: Live?
    @Published private(set) var output: Output?
    @Published private(set) var route: Route?
    @Published private(set) var recognition: Recognition?
    @Published private(set) var lastHypothesis: Hypothesis?
    @Published private(set) var lastDelivery: Delivery?
    @Published var notice: String?

    let repoRoot: String?
    let port = Int(ProcessInfo.processInfo.environment["PORT"] ?? "") ?? 8790
    private var task: URLSessionWebSocketTask?
    private var session = URLSession(configuration: .ephemeral)
    private var backoff: Double = 0.5
    private var connectGeneration = 0
    private var reconnectWork: DispatchWorkItem?

    private var hotKey: HotKey?
    @Published private(set) var hotKeyRegistered = false

    init() {
        repoRoot = Bundle.main.object(forInfoDictionaryKey: "TACITRepoRoot") as? String
            ?? ProcessInfo.processInfo.environment["TACIT_REPO_ROOT"]
        // Ctrl-Shift-Cmd-. = Stop everything, from any app, registered at launch (not when the menu first opens).
        // (Ctrl-Opt-Cmd-. is taken by macOS "Increase contrast".)
        hotKey = HotKey(keyCode: UInt32(kVK_ANSI_Period), modifiers: UInt32(controlKey | shiftKey | cmdKey)) { [weak self] in
            Task { @MainActor in self?.stopEverything() }
        }
        hotKeyRegistered = hotKey?.registered ?? false
        connect()
    }

    /// The user token: env TACIT_USER_TOKEN, else server/data/secrets.json (0600, written by the server). Never logged.
    private func token() -> String? {
        if let t = ProcessInfo.processInfo.environment["TACIT_USER_TOKEN"], !t.isEmpty { return t }
        guard let root = repoRoot,
              let data = FileManager.default.contents(atPath: root + "/server/data/secrets.json"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["userToken"] as? String
    }

    func connect() {
        reconnectWork?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        resetServerState()
        guard let tok = token(), var comps = URLComponents(string: "ws://127.0.0.1:\(port)/ws") else { conn = .noToken; return }
        comps.queryItems = [URLQueryItem(name: "token", value: tok)]
        guard let url = comps.url else { conn = .noToken; return }
        connectGeneration += 1
        let gen = connectGeneration
        conn = .connecting
        let t = session.webSocketTask(with: url)
        task = t
        t.resume()
        receive(t, gen)
    }

    private func resetServerState() {
        live = nil; output = nil; route = nil; recognition = nil
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

    private func handle(_ s: String) {
        guard let d = s.data(using: .utf8), let m = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let type = m["type"] as? String else { return }
        switch type {
        case "live_status":
            if let st = m["status"] as? [String: Any] {
                if (st["authorizationId"] as? String) != live?.authorizationId { lastHypothesis = nil }
                live = Live(state: st["state"] as? String ?? "?", authorizationId: st["authorizationId"] as? String,
                            generation: st["generation"] as? Int ?? 0, reason: st["reason"] as? String ?? "")
            }
        case "output_status":
            if let st = m["status"] as? [String: Any] {
                output = Output(state: st["state"] as? String ?? "?", authorizationId: st["authorizationId"] as? String,
                                generation: st["generation"] as? Int ?? 0, reason: st["reason"] as? String ?? "",
                                voice: st["voice"] as? String ?? "", queued: st["queued"] as? Int ?? 0)
                if let r = st["route"] as? [String: Any] { route = parseRoute(r) }
            }
        case "snapshot":
            if let sv = (m["snapshot"] as? [String: Any])?["services"] as? [String: Any] {
                if let r = sv["recognition"] as? [String: Any] {
                    recognition = Recognition(reachable: r["reachable"] as? Bool ?? false, model: r["model"] as? String)
                }
                if let r = sv["voiceRoute"] as? [String: Any] { route = parseRoute(r) }
            }
        case "recognition_hypothesis":
            if let h = m["hypothesis"] as? [String: Any], (h["authorizationId"] as? String) == live?.authorizationId {
                lastHypothesis = Hypothesis(text: h["rawText"] as? String ?? "", decision: h["decision"] as? String ?? "?",
                                            reason: h["reason"] as? String, ms: h["recognitionMs"] as? Int ?? 0, at: Date())
            }
        case "speech_delivery":
            if let dl = m["delivery"] as? [String: Any] {
                lastDelivery = Delivery(requestId: dl["requestId"] as? String ?? "", text: dl["text"] as? String ?? "",
                                        state: dl["state"] as? String ?? "?", reason: dl["reason"] as? String, at: Date())
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
            if let e { Task { @MainActor in self?.notice = "Send failed: \(e.localizedDescription)" } }
        }
    }

    // MARK: - user actions (each is one explicit user action)

    /// Pause / resume / end only. Activation belongs to the workspace that owns the camera (activating here would
    /// mint a new authorization and cut off the browser's capture).
    func live(_ action: String) {
        guard ["pause", "resume", "end"].contains(action) else { return }
        send(["type": "live_control", "action": action])
    }
    func output(_ action: String) { send(["type": "output_control", "action": action]) }

    /// User-authored typed text only. Never fed from recognised text.
    func speakTyped(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        guard let auth = output?.authorizationId, output?.state == "ready" else { notice = "Turn voice output on first."; return }
        // outputGeneration: if output was paused/interrupted after this was written, the server refuses it.
        send(["type": "speak_typed", "requestId": UUID().uuidString, "outputAuthorizationId": auth, "text": t, "outputGeneration": output?.generation ?? -1])
    }

    /// Stop everything: ends Live and voice output (cuts audio that has not been played yet).
    func stopEverythingAndQuit() {
        guard conn == .connected else { NSApp.terminate(nil); return }
        stopEverything()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { NSApp.terminate(nil) }
    }

    func stopEverything() {
        if conn != .connected { notice = "Not connected — nothing TACIT can be speaking through this server."; return }
        send(["type": "live_control", "action": "end"])
        send(["type": "output_control", "action": "stop"])
        notice = "Stopped Live and voice output."
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
        p.terminationHandler = { proc in
            Task { @MainActor [weak self] in
                self?.notice = proc.terminationStatus == 0 ? "TACIT started." : "TACIT failed to start — run ./scripts/tacit.sh preflight"
                self?.connect()
            }
        }
        do { try p.run() } catch { notice = "Could not run the launcher: \(error.localizedDescription)" }
    }

    /// Opens the detailed workspace in the browser. The token goes straight to NSWorkspace (no child process argv).
    func openWorkspace() {
        guard let tok = token(), var c = URLComponents(string: "http://127.0.0.1:\(port)/") else { notice = "No access token found."; return }
        c.queryItems = [URLQueryItem(name: "token", value: tok)]
        if let u = c.url { NSWorkspace.shared.open(u) }
    }
}
