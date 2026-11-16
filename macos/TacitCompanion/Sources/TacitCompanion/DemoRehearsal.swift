import Foundation
import AppKit

/// Test operator driving the same native model and sockets as the clickable UI.
/// Screens are the actual native view, not a fixture render. Audio mocks are separately labelled.
@MainActor enum DemoRehearsal {
    static func run(_ directory: String, runtime: CompanionRuntime) {
        let c = runtime.client, f = c.flow, island = runtime.island
        Task { @MainActor in
            var results: [[String: Any]] = []
            let live = CommandLine.arguments.contains("--demo-live")
            let realSpeech = CommandLine.arguments.contains("--demo-real-audio")
            let testSpeech = CommandLine.arguments.contains("--demo-test-audio") || realSpeech
            do {
                try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
                try await wait { c.conn == .connected && f.demo != nil }
                for run in 1...((live || realSpeech) ? 1 : 5) {
                    for scenario in (live ? ["A"] : ["A", "B", "C"]) {
                        f.demoAction("reset", scenario: scenario)
                        try await wait { f.demo?.scenarioId == scenario && f.demo?.step == 0 && f.demo?.running == false }
                        f.demoMode(analysis: live ? "gemini" : "deterministic")
                        f.demoAction("start")
                        try await wait { f.demo?.running == true }
                        f.demoAction("next")
                        try await wait { f.demo?.step == 1 && f.question != nil }
                        if live { try await wait { f.demo?.operations.isEmpty == false } }
                        guard let question = f.question else { throw Failure("No source-backed question") }
                        f.select(question)
                        try await wait { f.active != nil }
                        let words = scenario == "A" ? "Thursday at four works for me." : scenario == "B" ? "I think we should wait until testing is done." : "I can send the report on Monday."
                        f.edit(words); f.flush()
                        try await wait { f.active?.text == words }
                        island.showCommunication(.flow); island.focusEditor()
                        if run == 1 { try island.saveRenderedIsland(to: directory + "/\(scenario)-composing.png") }
                        if scenario != "C" {
                            f.demoAction("next")
                            try await wait { f.demo?.step == 2 }
                            if live { try await wait { (f.demo?.operations.count ?? 0) >= 2 } }
                            guard f.text == words else { throw Failure("Authored words were replaced") }
                            if scenario == "A" {
                                try await wait { f.relevant != nil }
                                guard let change = f.relevant, change.detailAfter.lowercased().contains("five") else { throw Failure("Missing time change") }
                                if run == 1 { try island.saveRenderedIsland(to: directory + "/A-context-update.png") }
                                f.edit("Five works better for me."); f.flush()
                                try await wait { f.active?.text == "Five works better for me." }
                            } else {
                                f.save(); try await wait { f.active?.saved == true }
                                f.demoAction("pause"); try await wait { f.demo?.paused == true }
                                f.demoAction("resume"); try await wait { f.demo?.paused == false }
                                guard f.text == words, f.active?.anchor?.quote.contains("launching") == true else { throw Failure("Saved answer lost its question") }
                                if run == 1 { try island.saveRenderedIsland(to: directory + "/B-saved.png") }
                            }
                        }
                        if testSpeech {
                            c.output("enable"); try await wait { c.canSpeakAuthored }
                            guard f.speak(using: c) else { throw Failure("Explicit native Speak refused") }
                            try await wait { c.lastDelivery?.state == "rendered" && f.demo?.lastOutgoing != nil }
                            if scenario == "C" {
                                guard let prior = f.demo?.lastOutgoing else { throw Failure("No authorized prior message") }
                                let correction = DemoCorrection.make(previous: prior.text, correction: "Tuesday instead.")
                                guard correction == "Sorry, I meant Tuesday, not Monday.", c.speakTyped(correction) else { throw Failure("Correction failed") }
                                try await wait { c.lastDelivery?.state == "rendered" && c.lastDelivery?.text == correction }
                                if run == 1 { try island.saveRenderedIsland(to: directory + "/C-correction.png") }
                            }
                            if realSpeech && scenario == "A" {
                                guard c.speakTyped(String(repeating: "This is a local demonstration of stopping speech. ", count: 7)) else { throw Failure("Stop test speech refused") }
                                try await wait { c.lastDelivery?.state == "routing" && c.lastDelivery?.firstAudioAt != nil }
                            }
                            c.output("stop"); try await wait { c.output?.state == "off" && c.output?.queued == 0 }
                        }
                        results.append(["run": run, "scenario": scenario, "result": "PASS", "source": "simulated transcript", "analysis": f.demo?.provenance ?? "unknown", "draftPreserved": true, "speech": realSpeech ? "real TTS and local physical output; remote listener UNVERIFIED" : testSpeech ? "real authorization state machine; MOCK TTS/route" : "not attempted; output disabled", "remoteListener": "UNVERIFIED", "at": ISO8601DateFormatter().string(from: Date())])
                        if live, let demo = f.demo { let data = try JSONEncoder().encode(demo.operations); try data.write(to: URL(fileURLWithPath: directory + "/gemini-operations.json")) }
                        f.demoAction("reset")
                        try await wait { f.snapshot?.turns.isEmpty == true && f.snapshot?.drafts.isEmpty == true }
                    }
                }
                try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: directory + "/rehearsal.json"))
                print("NATIVE DEMO REHEARSAL PASS: \(results.count) scenarios. \(realSpeech ? "REAL local audio, no remote listener" : testSpeech ? "MOCK audio" : "No audio") · remote listener UNVERIFIED")
                f.disconnect(); exit(0)
            } catch {
                results.append(["result":"FAIL", "reason": String(describing: error)])
                try? JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted]).write(to: URL(fileURLWithPath: directory + "/rehearsal.json"))
                print("NATIVE DEMO REHEARSAL FAIL: \(error)"); f.disconnect(); exit(1)
            }
        }
    }
    struct Failure: Error, CustomStringConvertible { var description: String; init(_ text: String) { description = text } }
    private static func wait(_ condition: @escaping () -> Bool) async throws {
        for _ in 0..<200 { if condition() { return }; try await Task.sleep(nanoseconds: 50_000_000) }
        throw Failure("Timed out waiting for native/server state")
    }
}
