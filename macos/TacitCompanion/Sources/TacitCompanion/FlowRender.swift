import AppKit
import SwiftUI

/// Explicit synthetic UI fixtures only: no socket, key, model, capture, camera or audio output.
@MainActor enum FlowRender {
    static func run(_ dir: String) {
        Task { @MainActor in
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            for name in ["consent", "question", "change", "saved"] { await render(name, dir: dir) }
            print("Flow synthetic UI fixtures rendered."); exit(0)
        }
    }
    private static func render(_ name: String, dir: String) async {
        let c = TacitClient(registerHotKey: false, connectOnInit: false, isolatedTransport: .init(send: { _ in }))
        c.handle("{\"type\":\"output_status\",\"status\":{\"state\":\"ready\",\"authorizationId\":\"fixture\",\"generation\":1,\"voice\":\"Samantha\",\"route\":{\"state\":\"ready\"}}}")
        let session = CommunicationSession(defaults: nil); session.attach(c); session.surface = .flow
        let f = c.flow; f.testSend = { _ in }
        let before = FlowCitation(turnId: "synthetic-t1", revision: 1, start: 0, end: 31, quote: "Could we meet Thursday at four?")
        let after = FlowCitation(turnId: "synthetic-t2", revision: 1, start: 0, end: 25, quote: "Actually Thursday at five.")
        let draft = FlowDraft(id: "synthetic-d1", text: "Thursday at four works for me.", version: 1, anchor: before, startedAtRevision: 1, saved: name == "saved", authorship: "typed", acknowledged: [])
        let snap = FlowSnapshot(epoch: 1, revision: 2, state: name == "consent" ? "off" : "capturing", source: "Selected synthetic tab", textConsent: true,
            turns: [FlowTurn(id: before.turnId, revision: 1, order: 1, text: before.quote, final: true, at: 0)],
            anchors: [FlowAnchor(id: "synthetic-q1", source: before, selected: name != "question")],
            changes: name == "change" ? [FlowChange(id: "synthetic-c1", relation: "correction", before: before, after: after, detailBefore: "Thursday at four", detailAfter: "Thursday at five")] : [],
            drafts: ["change", "saved"].contains(name) ? [draft] : [], status: "SYNTHETIC UI FIXTURE · NOT LIVE · No capture", semantic: "FIXTURE · no Gemini request")
        let value = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(snap))
        let msg = try! JSONSerialization.data(withJSONObject: ["type": "state", "snapshot": value, "providerPolicyVerified": true])
        f.handle(String(data: msg, encoding: .utf8)!)
        let root = VStack(alignment: .leading, spacing: 8) {
            Text("SYNTHETIC UI FIXTURE · NOT LIVE").font(.system(size: 11, weight: .bold)).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true).layoutPriority(10)
            FlowView(flow: f, client: c, session: session)
        }.padding(20).frame(width: 460, height: 490).foregroundStyle(.white).tint(.mint).preferredColorScheme(.dark).background(.black)
        let host = NSHostingView(rootView: root)
        let visible = ProcessInfo.processInfo.environment["TACIT_FLOW_RENDER_VISIBLE"] == "1"
        let panel = NSPanel(contentRect: CGRect(x: visible ? 80 : -20000, y: visible ? 80 : -20000, width: 460, height: 490), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.appearance = NSAppearance(named: .darkAqua); panel.contentView = host; panel.orderFrontRegardless()
        try? await Task.sleep(nanoseconds: 1_000_000_000); host.layoutSubtreeIfNeeded(); host.displayIfNeeded()
        if let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) {
            host.cacheDisplay(in: host.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: dir + "/" + name + ".png"))
        }
        panel.orderOut(nil)
    }
}
