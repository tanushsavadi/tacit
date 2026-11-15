// swift-tools-version: 5.9
import PackageDescription

// tacit-voice: lists the macOS speech voices (AVSpeechSynthesisVoice) and renders TACIT's approved text to WAV with the
// voice the user chose. It never plays audio and never routes it: the server hands the WAV to tacit-route (call) or to
// the local speakers (private preview). Apple Personal Voice is listed for status only and is never rendered.
let package = Package(
    name: "tacit-voice",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "tacit-voice", targets: ["tacit-voice"]),
        .library(name: "TacitVoiceCore", targets: ["TacitVoiceCore"]),
    ],
    targets: [
        // Pure and deterministic: request validation, FIFO/cancel state machine, WAV encoding. No AVFoundation.
        .target(name: "TacitVoiceCore"),
        .executableTarget(
            name: "tacit-voice",
            dependencies: ["TacitVoiceCore"],
            linkerSettings: [.linkedFramework("AVFoundation")]
        ),
        .testTarget(name: "TacitVoiceCoreTests", dependencies: ["TacitVoiceCore"]),
    ]
)
