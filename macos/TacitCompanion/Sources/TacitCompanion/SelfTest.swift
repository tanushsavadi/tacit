import AppKit
import Foundation

/// `TACIT.app/Contents/MacOS/TacitCompanion --selftest`: drives the SAME TacitClient methods the menu buttons call,
/// against the running local server, and exits 0/1. A separate raw socket plays the workspace's part (activating
/// Live), since the companion itself never activates Live. Speaks one labelled test phrase into the virtual mic only
/// when no calling app is reading it.
@MainActor
enum SelfTest {
    static func run() {
        Task { @MainActor in
            let ok = await steps()
            print(ok ? "COMPANION SELFTEST OK" : "COMPANION SELFTEST FAILED")
            exit(ok ? 0 : 1)
        }
    }

    private static func wait(_ what: String, _ seconds: Double = 10, _ cond: @escaping () -> Bool) async -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end { if cond() { return true }; try? await Task.sleep(nanoseconds: 50_000_000) }
        print("FAIL  timed out waiting for: \(what)")
        return false
    }

    private static func check(_ ok: Bool, _ what: String) -> Bool { print("\(ok ? "PASS" : "FAIL")  \(what)"); return ok }

    private static func steps() async -> Bool {
        let c = TacitClient(registerHotKey: false)
        var ok = true
        guard await wait("connection + status", 15, { c.conn == .connected && c.output != nil && c.live != nil && c.route != nil }) else { return false }
        ok = check(true, "connected; Live \(c.live!.state), voice output \(c.output!.state), virtual mic \(c.route!.state) \(c.route!.device ?? "")") && ok

        guard c.live?.state == "off", c.output?.state == "off" else {
            return check(false, "Selftest requires idle Live and voice output; no active session was changed")
        }

        // Voice output buttons
        c.output("enable")
        ok = await wait("voice output ready") { c.output?.state == "ready" } && ok
        ok = check(c.output?.authorizationId != nil, "Turn voice output on → ready with an authorization") && ok
        if c.route?.state == "ready", (c.route?.readers ?? ["?"]).isEmpty {
            c.speakTyped("TACIT companion self test.")
            ok = await wait("typed delivery terminal state", 15) { ["rendered", "refused", "interrupted", "failed"].contains(c.lastDelivery?.state ?? "") } && ok
            ok = check(c.lastDelivery?.state == "rendered", "Speak → delivery \(c.lastDelivery?.state ?? "none") \(c.lastDelivery?.reason ?? "")") && ok
        } else {
            print("SKIP  Speak: virtual mic \(c.route?.state ?? "?") with readers \(c.route?.readers ?? []) (would be heard in a call)")
        }
        c.output("pause")
        ok = await wait("voice paused") { c.output?.state == "paused" } && ok
        c.notice = nil
        c.speakTyped("must not be spoken")
        ok = check(c.notice == "Turn voice output on first.", "Speak while paused is blocked in the companion (\(c.notice ?? "no notice"))") && ok
        c.output("resume")
        ok = await wait("voice resumed") { c.output?.state == "ready" } && ok
        ok = check(true, "Pause voice / Resume voice") && ok

        // Live buttons: a raw socket stands in for the workspace that owns the camera.
        guard let ws = workspaceSocket() else { return check(false, "workspace stand-in socket") }
        ws.resume()
        try? await Task.sleep(nanoseconds: 300_000_000)
        ws.send(.string(#"{"type":"live_control","action":"activate","mode":"display-only","inputSource":"camera"}"#)) { _ in }
        ok = await wait("Live active (activated by the workspace stand-in)") { c.live?.state == "active" } && ok
        c.live("activate") // companion must refuse to activate
        c.live("pause")
        ok = await wait("Live paused from the companion") { c.live?.state == "paused" } && ok
        c.live("resume")
        ok = await wait("Live resumed from the companion") { c.live?.state == "active" } && ok
        ok = check(true, "Live Pause / Resume") && ok

        // Stop everything (button and ⌃⇧⌘. call the same method)
        c.stopEverything()
        ok = await wait("Stop everything → Live off and voice output off") { c.live?.state == "off" && c.output?.state == "off" } && ok
        ok = check(c.live?.state == "off" && c.output?.state == "off", "Stop everything ends Live and voice output") && ok
        ws.cancel(with: .goingAway, reason: nil)
        return ok
    }

    private static func workspaceSocket() -> URLSessionWebSocketTask? {
        guard let root = Bundle.main.object(forInfoDictionaryKey: "TACITRepoRoot") as? String,
              let data = FileManager.default.contents(atPath: root + "/server/data/secrets.json"),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let tok = obj["userToken"] as? String,
              var comps = URLComponents(string: "ws://127.0.0.1:8790/ws") else { return nil }
        comps.queryItems = [URLQueryItem(name: "token", value: tok)]
        return comps.url.map { URLSession(configuration: .ephemeral).webSocketTask(with: $0) }
    }
}
