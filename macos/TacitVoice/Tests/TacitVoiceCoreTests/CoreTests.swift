import XCTest
@testable import TacitVoiceCore

final class CoreTests: XCTestCase {
    private func req(_ id: String) -> SynthRequest {
        try! SynthRequest.parse(["id": id, "voice": "v", "text": "hi", "path": "/tmp/\(id).wav"]).get()
    }

    func testParseRejectsOutOfRangeInsteadOfClamping() {
        let base: [String: Any] = ["id": "a", "voice": "com.apple.voice.compact.en-US.Samantha", "text": "Hello", "path": "/tmp/a.wav"]
        XCTAssertEqual(try SynthRequest.parse(base).get().rate, 0.5)
        XCTAssertEqual(try SynthRequest.parse(base).get().pitch, 1.0)
        var m = base; m["rate"] = 1.5
        XCTAssertEqual(SynthRequest.parse(m), .failure(ParseError("rate outside 0.0...1.0", id: "a")))
        m = base; m["pitch"] = 0.2
        if case .success = SynthRequest.parse(m) { XCTFail("pitch 0.2 must be rejected") }
        m = base; m["text"] = "   "
        if case .success = SynthRequest.parse(m) { XCTFail("blank text must be rejected") }
        m = base; m["path"] = "relative.wav"
        if case .success = SynthRequest.parse(m) { XCTFail("relative path must be rejected") }
        m = base; m["voice"] = ""
        if case .success = SynthRequest.parse(m) { XCTFail("missing voice must be rejected (no silent default voice)") }
    }

    func testParseKeepsTextExactly() {
        let text = "  I'd like [[slnc 3000]] tea, please.\n"
        let r = try! SynthRequest.parse(["id": "a", "voice": "v", "text": text, "path": "/tmp/a.wav"]).get()
        XCTAssertEqual(r.text, text)
    }

    func testFifoAndCancel() {
        var q = SynthQueue()
        XCTAssertEqual(q.enqueue(req("a")), [.start(req("a"), token: 1)])
        XCTAssertEqual(q.enqueue(req("b")), [])
        XCTAssertEqual(q.enqueue(req("c")), [])
        XCTAssertEqual(q.enqueue(req("b")), [.rejected(id: "b", reason: "duplicate id")])
        XCTAssertEqual(q.cancel(id: "b"), [.cancelled(id: "b")])           // waiting: removed, never rendered
        XCTAssertEqual(q.cancel(id: "a"), [.stopCurrent(id: "a"), .cancelled(id: "a"), .start(req("c"), token: 3)])
        XCTAssertEqual(q.finished(token: 1), [])                            // late callback for cancelled render ignored
        XCTAssertEqual(q.current?.id, "c")
        XCTAssertEqual(q.finished(token: 3), [])
        XCTAssertNil(q.current)
        XCTAssertEqual(q.cancel(id: "zzz"), [])
    }

    func testWavHeaderAndSamples() {
        let s = Wav.int16([0, 1, -1, 0.5, 2, .nan])
        XCTAssertEqual(s, [0, 32767, -32767, 16384, 32767, 0])
        let d = Wav.encodeMonoPCM16(s, sampleRate: 22050)
        XCTAssertEqual(d.count, 44 + s.count * 2)
        XCTAssertEqual(String(data: d[0..<4], encoding: .ascii), "RIFF")
        XCTAssertEqual(String(data: d[8..<12], encoding: .ascii), "WAVE")
        XCTAssertEqual(d[24..<28].withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }, 22050)
        XCTAssertEqual(d[28..<32].withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }, 44100) // byte rate
        XCTAssertEqual(d[40..<44].withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }, UInt32(s.count * 2))
        XCTAssertEqual(Wav.peak(s), 1.0, accuracy: 1e-6)
        XCTAssertEqual(Wav.peak([]), 0)
    }

    func testNames() {
        XCTAssertEqual(qualityName(1), "default"); XCTAssertEqual(qualityName(2), "enhanced"); XCTAssertEqual(qualityName(3), "premium")
        XCTAssertEqual(personalVoiceAuthorizationName(1), "denied"); XCTAssertEqual(personalVoiceAuthorizationName(3), "authorized")
        XCTAssertEqual(personalVoiceAuthorizationName(9), "unknown")
    }
}
