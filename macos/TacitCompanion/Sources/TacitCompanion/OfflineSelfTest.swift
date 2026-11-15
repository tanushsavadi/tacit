import Foundation

/// Runs the release client's real action methods with a recorder instead of a network/audio transport.
@MainActor enum OfflineSelfTest {
    static func run() -> Never {
        var requests: [[String: Any]] = []
        let client = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { requests.append($0) }))
        let session = CommunicationSession(defaults: nil)
        var passed = 0
        var failed = 0
        func check(_ condition: Bool, _ name: String) {
            if condition { passed += 1 } else { failed += 1 }
            print("\(condition ? "PASS" : "FAIL") \(name)")
        }
        func emit(_ type: String, _ key: String, _ value: [String: Any]) {
            client.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type":type, key:value]), encoding: .utf8)!)
        }
        emit("output_status", "status", ["state":"ready", "authorizationId":"offline-output", "generation":1, "route":["state":"ready"]])
        emit("live_status", "status", ["state":"active", "authorizationId":"offline-live", "generation":1])
        let text = "OFFLINE REVIEW FIXTURE"
        emit("recognition_hypothesis", "hypothesis", ["authorizationId":"offline-live", "generation":1,
            "utteranceId":"offline-one", "decision":"shown", "rawText":text,
            "reviewExpiresAt":Date().timeIntervalSince1970 * 1000 + 30000,
            "reviewCandidates":[["kind":"raw", "index":0, "text":text, "textHash":TacitClient.textHash(text)]]])
        check(requests.isEmpty && client.reviewDraft.candidate == nil, "recognition never selects or speaks")
        client.chooseReview(client.lastHypothesis!.candidates[0], of:"offline-one")
        check(client.speakReviewed() && requests.last?["type"] as? String == "speak_reviewed", "dedicated reviewed path")
        check(!client.speakReviewed(), "review is single use")
        client.typedDraft = "My unfinished draft."
        check(session.holdTurn(using: client) && client.typedDraft == "My unfinished draft.", "hold preserves draft")
        check(!session.speakSelection(using: client), "phrases have no preselection")
        session.phraseSelection = session.phrases[0].id
        check(session.speakSelection(using: client) && requests.last?["text"] as? String == session.phrases[0].text, "selected exact phrase")
        let count = requests.count
        session.presence.context = "A supplied question"
        session.presence.choose(.buyTime, client: client)
        check(!requests.suffix(from: count).contains { $0["type"] as? String == "speak_typed" } && !PresenceModel.liveCaptureAvailable,
              "Help Me Respond never speaks by itself and has no meeting capture")
        client.pauseEverything()
        check(!session.holdTurn(using: client) && !client.speakReviewed(), "pause blocks before acknowledgment")
        client.stopEverything()
        check(requests.suffix(2).compactMap { $0["action"] as? String } == ["end", "stop"], "stop requests both cancellations")
        client.disconnectIsolatedTransport()
        check(!session.speakDraft(using: client) && client.typedDraft == "My unfinished draft.", "disconnect blocks while keeping draft")
        print("OFFLINE SELFTEST \(passed) passed, \(failed) failed. No sockets, credentials, camera or audio used.")
        exit(failed == 0 ? 0 : 1)
    }
}
