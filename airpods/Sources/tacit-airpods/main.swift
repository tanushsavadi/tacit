// Minimal AirPods motion probe. Streams CMHeadphoneMotionManager samples as CSV on stdout
// (field layout follows Subvox's MotionSample, MIT, (c) 2026 Joe Blau). Status lines go to stderr.
//
// macOS attributes motion-permission requests to the *responsible* process. Run as a bare child of a terminal,
// that is the terminal app (no NSMotionUsageDescription) and no prompt appears. Launch the bundled app instead:
//   airpods/tools/build-app.sh && airpods/tools/check.sh
// Args: --seconds N   --parent-pid P (exit when P dies)   --check (exit with a status code after ~12 s)
// Exit codes: 0 streaming, 3 denied/restricted, 4 motion unavailable, 5 permission undetermined (no answer),
//             6 authorized + connected but no samples, 7 authorized but no headphones connected.
import AppKit
import CoreMotion
import Foundation
import TacitMotionCore

setvbuf(stdout, nil, _IOLBF, 0)
func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
func arg(_ k: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: k), i + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[i + 1]
}
let check = CommandLine.arguments.contains("--check")
let seconds = Double(arg("--seconds") ?? "") ?? (check ? 12 : .infinity)
let parentPid = Int32(arg("--parent-pid") ?? "")

func authName(_ s: CMAuthorizationStatus) -> String {
    switch s {
    case .notDetermined: "notDetermined"
    case .restricted: "restricted"
    case .denied: "denied"
    case .authorized: "authorized"
    @unknown default: "unknown(\(s.rawValue))"
    }
}

final class Probe: NSObject, CMHeadphoneMotionManagerDelegate {
    let manager = CMHeadphoneMotionManager()
    var count = 0
    var connected = false
    let started = Date()
    let queue: OperationQueue = { let q = OperationQueue(); q.maxConcurrentOperationCount = 1; return q }()

    func headphoneMotionManagerDidConnect(_ m: CMHeadphoneMotionManager) { connected = true; log("status: headphones connected") }
    func headphoneMotionManagerDidDisconnect(_ m: CMHeadphoneMotionManager) { connected = false; log("status: headphones disconnected") }

    func start() {
        log("bundle: \(Bundle.main.bundleIdentifier ?? "none (not running as an app — permission prompt will not appear)")")
        log("auth: \(authName(CMHeadphoneMotionManager.authorizationStatus()))")
        log("deviceMotionAvailable: \(manager.isDeviceMotionAvailable)")
        guard manager.isDeviceMotionAvailable else { finish(4, "motion unavailable on this Mac/OS"); return }
        manager.delegate = self
        manager.startConnectionStatusUpdates()
        print(SampleCSV.header)
        // Starting device-motion updates is what triggers the permission request.
        manager.startDeviceMotionUpdates(to: queue) { [self] m, err in
            if let err { log("error: \((err as NSError).domain) \((err as NSError).code) \(err.localizedDescription)"); return }
            guard let m else { return }
            let a = m.userAcceleration, r = m.rotationRate, at = m.attitude, g = m.gravity, q = at.quaternion
            let loc = m.sensorLocation == .headphoneLeft ? "L" : m.sensorLocation == .headphoneRight ? "R" : "?"
            print(String(format: "%.4f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.6f,%.6f,%.6f,%.6f,%@",
                         m.timestamp, a.x, a.y, a.z, r.x, r.y, r.z, at.pitch, at.roll, at.yaw, g.x, g.y, g.z, q.w, q.x, q.y, q.z, loc))
            count += 1
            if count == 1 { log("status: streaming") }
        }
        var lastAuth = CMHeadphoneMotionManager.authorizationStatus()
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [self] _ in
            let auth = CMHeadphoneMotionManager.authorizationStatus()
            if auth != lastAuth { log("auth: \(authName(auth))"); lastAuth = auth }
            if let p = parentPid, kill(p, 0) != 0 { finish(0, "parent exited") }
            let elapsed = Date().timeIntervalSince(started)
            if Int(elapsed) % 3 == 0 && count == 0 { log("waiting: \(diagnosis(auth).1)") }
            if elapsed >= seconds {
                let (code, why) = count > 0 ? (0, "streaming, \(count) samples (\(String(format: "%.1f", Double(count) / elapsed)) Hz)") : diagnosis(auth)
                finish(code, why)
            }
        }
    }

    func diagnosis(_ auth: CMAuthorizationStatus) -> (Int32, String) {
        switch auth {
        case .denied, .restricted: (3, "permission \(authName(auth)) — enable TacitAirPods in System Settings → Privacy & Security → Motion & Fitness")
        case .notDetermined: (5, "permission not yet granted — answer the macOS prompt")
        default: connected
            ? (6, "authorized and connected, but the sensor is not streaming — wear both AirPods, make them the audio output")
            : (7, "authorized, but no head-tracking headphones connected")
        }
    }

    func finish(_ code: Int32, _ why: String) {
        log("result: \(code) \(why)")
        manager.stopDeviceMotionUpdates()
        exit(code)
    }
}

signal(SIGINT) { _ in exit(0) }
signal(SIGTERM) { _ in exit(0) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory) // no Dock icon; still a LaunchServices app for TCC
let probe = Probe()
probe.start()
app.run()
