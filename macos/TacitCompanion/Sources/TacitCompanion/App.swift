import AppKit
import SwiftUI

@MainActor
final class CompanionRuntime: ObservableObject {
    static let shared = CompanionRuntime()
    let client: TacitClient
    let island: IslandController
    private init() {
        let lab = ExperienceLab.isEnabled
        let testing = CommandLine.arguments.contains("--selftest") || CommandLine.arguments.contains("--offline-selftest") || CommandLine.arguments.contains("--presence-check") || CommandLine.arguments.contains("--render-presence") || lab
        client = TacitClient(registerHotKey: !testing, connectOnInit: false,
            isolatedTransport: lab ? .init(send: { ExperienceLab.shared.record($0) }) : nil)
        let communication = CommunicationSession(defaults: lab ? nil : .standard)
        communication.attach(client) // Help Me Respond follows its own suggestion requests on this client
        island = IslandController(client: client, communication: communication, registerHotKey: !testing)
    }
}

@MainActor
final class CompanionDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard !CommandLine.arguments.contains("--selftest"), !CommandLine.arguments.contains("--offline-selftest"), !CommandLine.arguments.contains("--presence-check") else { return }
        if let i = CommandLine.arguments.firstIndex(of: "--render-presence"), CommandLine.arguments.count > i + 1 { PresenceRender.run(CommandLine.arguments[i + 1]); return }
        let lab = ExperienceLab.isEnabled
        if CommandLine.arguments.contains("--inspect-ui") || lab { NSApp.setActivationPolicy(.regular) }
        CompanionRuntime.shared.island.start()
        if lab {
            ExperienceLab.shared.start(client: CompanionRuntime.shared.client, island: CompanionRuntime.shared.island)
        } else { CompanionRuntime.shared.client.connect() }
        if CommandLine.arguments.contains("--inspect-ui") {
            CompanionRuntime.shared.island.showForKeyboard()
            CompanionRuntime.shared.island.togglePin()
        }
    }

    /// `open TACIT.app` (or the demo launcher) while it is already running: bring the notch forward, never start capture.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        guard !ExperienceLab.isEnabled else { return false }
        CompanionRuntime.shared.island.showForKeyboard()
        return false
    }
}

@main
struct TacitCompanionApp: App {
    @NSApplicationDelegateAdaptor(CompanionDelegate.self) private var delegate
    private let runtime = CompanionRuntime.shared
    init() {
        if let i = CommandLine.arguments.firstIndex(of: "--analyze-video") { VideoAnalysis.run(Array(CommandLine.arguments[(i + 1)...])) }
        if CommandLine.arguments.contains("--offline-selftest") { OfflineSelfTest.run() }
        if CommandLine.arguments.contains("--selftest") { SelfTest.run(); return }
        if CommandLine.arguments.contains("--presence-check") { PresenceCheck.run(); return }
        let me = Bundle.main.bundleIdentifier ?? ""
        if !me.isEmpty, NSRunningApplication.runningApplications(withBundleIdentifier: me).count > 1 { exit(0) }
    }
    var body: some Scene {
        MenuBarExtra {
            MenuView(client: runtime.client, island: runtime.island)
        } label: {
            MenuIcon(client: runtime.client)
        }.menuBarExtraStyle(.window)
    }
}

private struct MenuIcon: View {
    @ObservedObject var client: TacitClient
    var body: some View {
        let state = ActivityPresentation.current(client)
        Image(systemName: state.symbol).accessibilityLabel("TACIT: \(state.title)")
    }
}

struct MenuView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    var body: some View {
        ConversationView(client: client, island: island)
            .padding(20).frame(width: 460, height: 320)
            .background(.black).preferredColorScheme(.dark)
    }
}
