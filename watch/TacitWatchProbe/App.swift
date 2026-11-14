import SwiftUI

@main
struct TacitWatchProbeApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

/// Labels for the passive feasibility trials (Priority 3). Nothing is emitted except the manual 1 kHz duplex test.
let TRIALS = ["still", "silent", "silent-deliberate", "voiced", "silent-wrist-near-mouth", "silent-wrist-normal",
              "fan-noise-still", "fan-noise-silent", "keys-jingle (HF check)", "wrist-down-30s (background)"]

struct ContentView: View {
    @StateObject private var rec = Recorder()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        List {
            Section(rec.status) {
                if rec.isRecording {
                    Button("Stop") { rec.stop(reason: "user") }
                        .handGestureShortcut(.primaryAction) // Apple Watch double tap = stop (watchOS 11)
                        .tint(.red)
                }
            }
            Section("Passive trials (mic + motion)") {
                ForEach(TRIALS, id: \.self) { label in
                    Button(label) { rec.start(label: label, seconds: label.hasPrefix("wrist-down") ? 30 : 6, duplex: false) }
                        .disabled(rec.isRecording)
                }
            }
            Section("Manual duplex check") {
                Button("Play quiet 1 kHz + record (3 s)") { rec.start(label: "duplex-1khz", seconds: 3, duplex: true) }
                    .disabled(rec.isRecording)
            }
            Section("Device") { Text(rec.deviceInfo).font(.footnote) }
        }
        .onChange(of: phase) { _, p in rec.event("scenePhase", "\(p)") }
    }
}
