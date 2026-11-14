// swift-tools-version: 5.9
import PackageDescription

// tacit-route: plays TACIT's synthesized speech into ONE explicitly selected output device (e.g. BlackHole 2ch/16ch,
// which a calling app then uses as its microphone). Never changes the system default devices.
// The Info.plist is embedded so TCC can show NSMicrophoneUsageDescription for `verify` (it captures the virtual input).
let infoPlist = Context.packageDirectory + "/Sources/tacit-route/Info.plist"

let package = Package(
    name: "tacit-route",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "tacit-route", targets: ["tacit-route"]),
        .library(name: "TacitRouteCore", targets: ["TacitRouteCore"]),
    ],
    targets: [
        // Pure, deterministic: queue/epoch state machine and line protocol. No CoreAudio, no clocks, no I/O.
        .target(name: "TacitRouteCore"),
        .executableTarget(
            name: "tacit-route",
            dependencies: ["TacitRouteCore"],
            exclude: ["Info.plist"],
            linkerSettings: [
                .linkedFramework("CoreAudio"),
                .linkedFramework("AudioToolbox"),
                .linkedFramework("AVFoundation"),
                .unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", infoPlist]),
            ]
        ),
        .testTarget(name: "TacitRouteCoreTests", dependencies: ["TacitRouteCore"]),
    ]
)
