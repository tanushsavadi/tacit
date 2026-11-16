import Foundation

/// Native binary -> real candidate sockets. Read-only connection/consent-default checks; no speech/capture.
@MainActor enum FlowCheck {
    static func run() {
        let c = TacitClient(registerHotKey: false, connectOnInit: true)
        Task { @MainActor in
            for _ in 0..<100 {
                if c.conn == .connected, c.flow.connected, let snapshot = c.flow.snapshot {
                    let ok = snapshot.state == "off" && !snapshot.textConsent && snapshot.turns.isEmpty && snapshot.drafts.isEmpty
                    print("FLOW NATIVE CONNECTION \(ok ? "PASS" : "FAIL") · capture off, consent off, context empty, output requests zero")
                    c.flow.disconnect(); exit(ok ? 0 : 1)
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            print("FLOW NATIVE CONNECTION FAIL · candidate unavailable"); exit(1)
        }
    }
}
