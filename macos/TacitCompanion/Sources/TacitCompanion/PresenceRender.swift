import AppKit
import SwiftUI

/// `TacitCompanion --render-presence DIR`: renders every Help Me Respond step from offline fixtures (no socket, no
/// model, no audio) into PNGs at the current notch content size and a smaller "subtle" size, using real AppKit-backed
/// controls in an off-screen window. Fixture wording is labelled "OFFLINE FIXTURE" in the provenance line.
@MainActor
enum PresenceRender {
    static func run(_ dir: String) {
        Task { @MainActor in
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            for size in [CGSize(width: 404, height: 196), CGSize(width: 360, height: 176)] {
                for name in ["intent-empty", "intent-sample", "point", "working", "draft", "draft-edited", "failed", "no-ai"] {
                    await render(name, size: size, dir: dir)
                }
            }
            print("PRESENCE RENDER done → \(dir)")
            exit(0)
        }
    }

    private static func emit(_ c: TacitClient, _ type: String, _ key: String, _ v: [String: Any]) {
        c.handle(String(data: try! JSONSerialization.data(withJSONObject: ["type": type, key: v]), encoding: .utf8)!)
    }

    private static func render(_ name: String, size: CGSize, dir: String) async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        emit(c, "output_status", "status", ["state": "ready", "authorizationId": "fixture", "generation": 1, "voice": "Samantha", "route": ["state": "ready"]])
        let ai = name != "no-ai"
        emit(c, "respond_status", "status", ["available": ai, "provider": ai ? "Google Gemini" : NSNull(), "models": [], "dataNotice": "", "reason": NSNull()])
        let s = CommunicationSession(defaults: nil); s.attach(c); s.surface = .assistance
        let p = s.presence
        func answer(_ drafts: [String], state: String = "ready", reason: String? = nil) {
            guard let id = c.pendingSuggestionID else { return }
            emit(c, "respond_suggestion", "suggestion", ["requestId": id, "state": state, "drafts": drafts.map { ["text": $0] },
                "focus": PresenceModel.sampleQuestion, "model": "OFFLINE FIXTURE", "reason": reason ?? NSNull(), "generationMs": 900, "removed": 0])
        }
        switch name {
        case "intent-empty": break
        case "intent-sample", "no-ai": p.useSample(); if name == "no-ai" { p.choose(.buyTime, client: c) }
        case "point": p.useSample(); p.choose(.shareView, client: c); p.point = "yes, but only if QA signs off"
        case "working": p.useSample(); p.choose(.clarify, client: c)
        case "draft", "draft-edited":
            p.useSample(); p.choose(.shareView, client: c); p.point = "yes, but only if QA signs off"; p.request(c)
            answer(["Yes, we can launch next week, but only if QA signs off.", "Yes, provided that QA signs off first.", "We can launch next week if QA approves."])
            if name == "draft-edited" { p.draft = "Yes — next week works, but only once QA signs off." }
        case "failed":
            p.useSample(); p.choose(.clarify, client: c)
            answer([], state: "failed", reason: "The AI took too long.")
        default: break
        }
        let root = PresenceView(client: c, session: s)
            .padding(0).frame(width: size.width, height: size.height, alignment: .topLeading)
            .foregroundStyle(.white).tint(.mint).preferredColorScheme(.dark)
            .padding(20).background(Color.black)
        let host = NSHostingView(rootView: root)
        let frame = CGRect(x: -20000, y: -20000, width: size.width + 40, height: size.height + 40)
        let w = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        w.appearance = NSAppearance(named: .darkAqua); w.contentView = host; w.orderFrontRegardless()
        try? await Task.sleep(nanoseconds: 400_000_000)
        host.layoutSubtreeIfNeeded()
        guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
        host.cacheDisplay(in: host.bounds, to: rep)
        let path = "\(dir)/\(Int(size.width))x\(Int(size.height))-\(name).png"
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
        w.orderOut(nil)
    }
}
