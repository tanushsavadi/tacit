import AppKit
import SwiftUI

@MainActor
final class CompanionRuntime: ObservableObject {
    static let shared = CompanionRuntime()
    let client: TacitClient
    let island: IslandController
    private init() {
        let testing = CommandLine.arguments.contains("--selftest")
        client = TacitClient(registerHotKey: !testing, connectOnInit: false)
        island = IslandController(client: client)
    }
}

@MainActor
final class CompanionDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard !CommandLine.arguments.contains("--selftest") else { return }
        if CommandLine.arguments.contains("--inspect-ui") { NSApp.setActivationPolicy(.regular) }
        CompanionRuntime.shared.island.start()
        CompanionRuntime.shared.client.connect()
        if CommandLine.arguments.contains("--inspect-ui") {
            CompanionRuntime.shared.island.showForKeyboard()
            CompanionRuntime.shared.island.togglePin()
        }
    }
}

@main
struct TacitCompanionApp: App {
    @NSApplicationDelegateAdaptor(CompanionDelegate.self) private var delegate
    private let runtime = CompanionRuntime.shared
    init() {
        if CommandLine.arguments.contains("--selftest") { SelfTest.run(); return }
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
            .padding(20).frame(width: 400, height: 222)
            .background(.black).preferredColorScheme(.dark)
    }
}
