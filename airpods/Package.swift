// swift-tools-version: 5.9
import PackageDescription

// The Info.plist is embedded into the Mach-O (__TEXT,__info_plist) so that macOS TCC can find
// NSMotionUsageDescription for a bare command-line binary. Absolute path so the build works
// from any working directory.
let infoPlist = Context.packageDirectory + "/Sources/tacit-airpods/Info.plist"

let package = Package(
    name: "tacit-airpods",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "tacit-airpods", targets: ["tacit-airpods"]),
        .library(name: "TacitMotionCore", targets: ["TacitMotionCore"]),
    ],
    targets: [
        // Pure, deterministic: samples in, events out. No CoreMotion, no clocks, no I/O.
        .target(name: "TacitMotionCore"),
        .executableTarget(
            name: "tacit-airpods",
            dependencies: ["TacitMotionCore"],
            exclude: ["Info.plist"],
            linkerSettings: [
                .linkedFramework("CoreMotion"),
                .linkedFramework("MediaPlayer"),
                .linkedFramework("AppKit"),
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", infoPlist,
                ]),
            ]
        ),
    ]
)
