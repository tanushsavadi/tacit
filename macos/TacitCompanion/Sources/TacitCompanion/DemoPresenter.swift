import AppKit
import SwiftUI

enum DemoCorrection {
    static func make(previous: String, correction: String) -> String {
        let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        let old = days.filter { previous.localizedCaseInsensitiveContains($0) }
        let new = days.filter { correction.localizedCaseInsensitiveContains($0) }
        if old.count == 1, new.count == 1, old[0] != new[0] { return "Sorry, I meant \(new[0]), not \(old[0])." }
        return "Sorry, a correction: " + correction.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
@MainActor final class DemoPresenter {
    static let shared = DemoPresenter()
    private var window: NSWindow?
    func show(runtime: CompanionRuntime) {
        if let window { window.makeKeyAndOrderFront(nil); return }
        let p = NSWindow(contentRect: NSRect(x: 50, y: 80, width: 510, height: 650), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        p.title = "TACIT Flow Demo · Control Center"; p.isReleasedWhenClosed = false
        p.contentView = NSHostingView(rootView: DemoPresenterView(flow: runtime.client.flow, client: runtime.client, island: runtime.island).preferredColorScheme(.dark))
        p.minSize = NSSize(width: 510, height: 540); p.makeKeyAndOrderFront(nil); window = p
    }
}
struct DemoPresenterView: View {
    @ObservedObject var flow: FlowClient
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 17) {
            HStack { Text("tacit").font(.system(size: 34, weight: .light)); Spacer(); Text("FLOW DEMO").tracking(2).font(.system(size: 11, weight: .bold)).foregroundStyle(.mint) }
            Text("Your words. Your place in the conversation.").font(.system(size: 18))
            Label("Demo conversation · Simulated input", systemImage: "testtube.2").foregroundStyle(.mint)
            Text("The incoming meeting context is simulated. The native response workflow and authorized voice pipeline are real.").font(.system(size: 12)).foregroundStyle(.secondary)
            Divider()
            if let d = flow.demo {
                Picker("Scenario", selection: Binding(get: { d.scenarioId }, set: { flow.demoAction("reset", scenario: $0) })) {
                    ForEach(d.scenarios, id: \.id) { Text("\($0.id) · \($0.title)").tag($0.id) }
                }
                HStack { Text(d.title).font(.headline); Spacer(); Text("Event \(d.step) / \(d.total)").monospacedDigit() }
                HStack {
                    Button("Start") { flow.demoAction("start") }.keyboardShortcut("s", modifiers: [.command, .option])
                    Button("Next event →") { flow.demoAction("next") }.keyboardShortcut(.rightArrow, modifiers: [.command, .option]).disabled(!d.running || d.paused || d.step >= d.total)
                    Button(d.paused ? "Resume" : "Pause") { flow.demoAction(d.paused ? "resume" : "pause") }.disabled(!d.running)
                }.controlSize(.large)
                HStack { Button("Restart scenario") { flow.demoAction("restart") }; Button("Reset to initial") { flow.demoAction("reset") }; Button("Clear context") { flow.demoAction("clear") } }
                Picker("Playback", selection: Binding(get: { d.playback }, set: { flow.demoMode(playback: $0) })) { Text("Manual advance").tag("manual"); Text("Timed playback").tag("timed") }.pickerStyle(.segmented)
                Picker("Analysis", selection: Binding(get: { d.analysis }, set: { flow.demoMode(analysis: $0) })) { Text("Gemini live analysis").tag("gemini"); Text("Deterministic analysis").tag("deterministic") }.pickerStyle(.segmented)
                Text(d.provenance).font(.system(size: 12, weight: .medium)).foregroundStyle(.mint)
                Toggle("Simulated context provider", isOn: Binding(get: { d.enabled }, set: { flow.demoAction($0 ? "enable" : "disable") }))
                Text(d.running ? (d.paused ? "Events paused · drafts kept" : "Scenario active · Review First") : "Ready · press Start, then Next event").font(.system(size: 12))
                Divider()
                HStack { Label(flow.connected ? "Flow connected" : "Flow disconnected", systemImage: flow.connected ? "checkmark.circle" : "exclamationmark.circle"); Spacer(); Button("Check connection") { if flow.connected { flow.demoAction("check") } else { client.connect() } } }
                Text("Gemini: \(d.providerAvailable ? "configured · bounded live requests" : "unavailable · deterministic fallback")").font(.system(size: 12))
                Text("Voice: \(client.route?.state ?? "connecting") · \(client.output?.voice ?? "choose a voice")").font(.system(size: 12))
                Text(d.audioMode == "local" ? "LOCAL REHEARSAL AUDIO · no meeting delivery" : "Remote listener: UNVERIFIED").font(.system(size: 11)).foregroundStyle(.secondary)
                DisclosureGroup("Gemini invocation evidence") {
                    ForEach(Array(d.operations.enumerated()), id: \.offset) { _, op in
                        Text("\(op.model) · \(op.status)\n\(Int(op.elapsedMs)) ms · \(op.validation)").font(.system(size: 11)).textSelection(.enabled).padding(.vertical, 3)
                    }
                    if d.operations.isEmpty { Text("No completed request in this runtime.").font(.caption) }
                }
                DisclosureGroup("Recent operational errors") { ForEach(Array(d.errors.enumerated()), id: \.offset) { _, e in Text("\(e.at) · \(e.code)").font(.caption) } }
            } else { ProgressView("Connecting to the isolated demo…"); Button("Reconnect") { client.connect() } }
            Divider()
            HStack { Button("Open Flow notch") { island.showCommunication(.flow); island.focusEditor() }; Button("My Voice") { island.showCommunication(.voice); island.focusEditor() }; Spacer(); Button("Stop everything", role: .destructive) { client.stopEverything() }.keyboardShortcut(".", modifiers: .command) }
            Text("Advance: ⌥⌘→ · Start: ⌥⌘S · Stop: ⌘.\nShortcuts apply while this demo is focused; stable app hotkeys stay untouched.").font(.system(size: 10)).foregroundStyle(.secondary)
        }.padding(24) }.background(Color(red: 0.035, green: 0.045, blue: 0.05)).buttonStyle(.bordered)
    }
}
