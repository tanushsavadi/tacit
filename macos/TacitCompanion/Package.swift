// swift-tools-version: 5.9
import PackageDescription

// TACIT menu-bar companion: a small native CLIENT of the local TACIT server (127.0.0.1:8790). It shows status and
// gives one-click Live / voice-output control, typed speech and an always-available Stop. It owns no Live state.
let package = Package(
    name: "TacitCompanion",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "TacitCompanion", linkerSettings: [.linkedFramework("Carbon"), .linkedFramework("AppKit")]),
    ]
)
