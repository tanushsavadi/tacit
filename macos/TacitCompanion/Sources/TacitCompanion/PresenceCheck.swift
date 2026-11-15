import AppKit
import Foundation

/// `TacitCompanion --presence-check`: the real Help Me Respond path end to end — the SAME PresenceModel/TacitClient the
/// notch uses, over a real socket, against a running server with a real model: context → intent → AI wording →
/// edit → explicit Speak (speak_typed). Prints measured latency. Run it against an ISOLATED server (e.g. PORT=8799,
/// TACIT_ROUTE=off) so nothing reaches a call: with the route off the final Speak is refused by the server's route
/// check, which is reported as such — never as audio delivered.
@MainActor
enum PresenceCheck {
    static func run() {
        Task { @MainActor in
            let ok = await steps()
            print(ok ? "PRESENCE CHECK OK" : "PRESENCE CHECK FAILED")
            exit(ok ? 0 : 1)
        }
    }
    private static func wait(_ what: String, _ seconds: Double = 15, _ cond: @escaping () -> Bool) async -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end { if cond() { return true }; try? await Task.sleep(nanoseconds: 20_000_000) }
        print("FAIL  timed out waiting for: \(what)"); return false
    }
    private static func check(_ ok: Bool, _ what: String) -> Bool { print("\(ok ? "PASS" : "FAIL")  \(what)"); return ok }

    private static func steps() async -> Bool {
        let c = TacitClient(registerHotKey: false)
        let s = CommunicationSession(defaults: nil); s.attach(c); let p = s.presence
        var ok = true
        guard await wait("connection + respond_status", 15, { c.conn == .connected && c.respondStatus != nil && c.output != nil }) else { return false }
        guard c.respondStatus?.available == true else { return check(false, "server reports no AI: \(c.respondStatus?.reason ?? "?")") }
        ok = check(true, "connected; AI = \(c.respondStatus!.provider ?? "?"); voice output \(c.output!.state); route \(c.route?.state ?? "?")") && ok
        guard c.live?.state != "active" else { return check(false, "refusing to run while Live is active") }

        // 1. Neutral intent on the labelled sample → real model wording.
        p.useSample()
        var t0 = Date()
        p.choose(.clarify, client: c)
        ok = check(p.step == .working, "Ask a question → request sent, step = working") && ok
        ok = await wait("clarify suggestion") { p.step != .working } && ok
        let ms1 = Int(Date().timeIntervalSince(t0) * 1000)
        ok = check(p.step == .draft && !p.drafts.isEmpty, "clarify → \(p.drafts.count) draft(s) in \(ms1) ms (native round trip) · \(p.provenance ?? "-")") && ok
        for d in p.drafts { print("        · \(d)") }
        ok = check(p.focus == PresenceModel.sampleQuestion, "focus is a verbatim quote of the context") && ok

        // 2. Opinion intent requires the user's point; then wording keeps it.
        p.back(c); p.back(c)
        p.choose(.shareView, client: c)
        ok = check(p.step == .point && c.pendingSuggestionID == nil, "Share my view → asks for the user's own point first (no request)") && ok
        p.point = "yes, but only if QA signs off"
        t0 = Date(); p.request(c)
        ok = await wait("share_view suggestion") { p.step != .working } && ok
        let ms2 = Int(Date().timeIntervalSince(t0) * 1000)
        ok = check(p.step == .draft && !p.drafts.isEmpty && p.drafts.allSatisfy { $0.contains("QA") }, "share view keeps the user's condition (QA) in every draft · \(ms2) ms") && ok
        for d in p.drafts { print("        · \(d)") }

        // 3. Rapid cancel: a request cancelled at once never produces wording.
        p.choose(.buyTime, client: c)
        let cancelled = c.pendingSuggestionID
        p.cancel(c)
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        ok = check(cancelled != nil && c.pendingSuggestionID == nil && c.suggestion == nil, "cancelled request: no late result accepted after 3 s") && ok

        // 4. Supersede: two quick requests → only the second is shown.
        p.useSample()
        p.choose(.clarify, client: c); let first = c.pendingSuggestionID
        p.choose(.buyTime, client: c); let second = c.pendingSuggestionID
        ok = await wait("superseding suggestion") { p.step != .working } && ok
        ok = check(first != second && p.intent == .buyTime && !p.drafts.isEmpty && p.basis?.intent == .buyTime, "superseded request dropped; shown wording is for Buy a moment") && ok

        // 5. Edit + explicit Speak through the normal authorized typed route. Nothing was spoken before this.
        let spokenBefore = c.lastDelivery
        ok = check(spokenBefore == nil, "no speech at any point before Speak") && ok
        if c.output?.state != "ready" { c.output("enable"); _ = await wait("voice output ready") { c.output?.state == "ready" } }
        p.draft = p.draft.trimmed + " Thanks."
        let text = p.draft
        s.surface = .assistance
        let sent = s.speakPresence(using: c)
        if sent {
            ok = await wait("delivery result", 20) { ["rendered", "refused", "failed"].contains(c.lastDelivery?.state ?? "") } && ok
            let d = c.lastDelivery
            ok = check(d?.text == text && d?.source == "typed", "Speak sent exactly the edited text via speak_typed → \(d?.state ?? "?")\(d?.reason.map { " (\($0))" } ?? "")") && ok
        } else {
            ok = check(c.route?.state != "ready", "Speak blocked locally: \(c.authoredUnavailableReason ?? c.notice ?? "?") (expected with TACIT_ROUTE=off)") && ok
        }
        ok = check(s.isHome == sent, sent ? "returned to the camera view after Speak" : "stayed in Help Me Respond; draft kept: \(p.draft == text)") && ok
        c.output("stop")
        return ok
    }
}
