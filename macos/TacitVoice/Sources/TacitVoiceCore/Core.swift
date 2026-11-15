import Foundation

/// One synthesis request from the server. Validation is strict: an out-of-range control is rejected, never clamped,
/// so the audio always matches the settings the user approved.
public struct SynthRequest: Equatable {
    public let id: String
    public let voice: String
    public let text: String
    public let path: String
    public let rate: Float
    public let pitch: Float

    public static let maxTextChars = 1000
    /// AVSpeechUtteranceMinimumSpeechRate…AVSpeechUtteranceMaximumSpeechRate; default 0.5.
    public static let rateRange: ClosedRange<Float> = 0.0...1.0
    /// AVSpeechUtterance.pitchMultiplier documented range.
    public static let pitchRange: ClosedRange<Float> = 0.5...2.0

    public static func parse(_ m: [String: Any]) -> Result<SynthRequest, ParseError> {
        guard let id = m["id"] as? String, !id.isEmpty, id.count <= 100 else { return .failure(.init("synth needs an id (1–100 chars)")) }
        guard let voice = m["voice"] as? String, !voice.isEmpty else { return .failure(.init("synth needs a voice identifier", id: id)) }
        guard let text = m["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .failure(.init("nothing to say", id: id))
        }
        guard text.count <= maxTextChars else { return .failure(.init("text longer than \(maxTextChars) characters", id: id)) }
        guard let path = m["path"] as? String, path.hasPrefix("/"), path.hasSuffix(".wav") else {
            return .failure(.init("synth needs an absolute .wav path", id: id))
        }
        let rate = (m["rate"] as? NSNumber)?.floatValue ?? 0.5
        let pitch = (m["pitch"] as? NSNumber)?.floatValue ?? 1.0
        guard rate.isFinite, rateRange.contains(rate) else { return .failure(.init("rate outside \(rateRange)", id: id)) }
        guard pitch.isFinite, pitchRange.contains(pitch) else { return .failure(.init("pitch outside \(pitchRange)", id: id)) }
        return .success(SynthRequest(id: id, voice: voice, text: text, path: path, rate: rate, pitch: pitch))
    }
}

public struct ParseError: Error, Equatable {
    public let message: String
    public let id: String?
    public init(_ message: String, id: String? = nil) { self.message = message; self.id = id }
}

/// Strict FIFO with cancellation. One request renders at a time; `token` changes on every start so callbacks that
/// arrive for a cancelled render are recognisable and ignored.
public struct SynthQueue {
    public private(set) var current: SynthRequest?
    public private(set) var token = 0
    public private(set) var waiting: [SynthRequest] = []

    public init() {}

    public enum Effect: Equatable {
        case start(SynthRequest, token: Int)
        case cancelled(id: String)
        /// The running render must be stopped (AVSpeechSynthesizer.stopSpeaking) before `cancelled` is reported.
        case stopCurrent(id: String)
        case rejected(id: String, reason: String)
    }

    public mutating func enqueue(_ r: SynthRequest) -> [Effect] {
        if current?.id == r.id || waiting.contains(where: { $0.id == r.id }) { return [.rejected(id: r.id, reason: "duplicate id")] }
        waiting.append(r)
        return advance()
    }

    /// The current render ended (done or failed). Returns the next start, if any. Stale tokens are ignored.
    public mutating func finished(token t: Int) -> [Effect] {
        guard t == token, current != nil else { return [] }
        current = nil
        return advance()
    }

    public mutating func cancel(id: String) -> [Effect] {
        if let i = waiting.firstIndex(where: { $0.id == id }) {
            waiting.remove(at: i)
            return [.cancelled(id: id)]
        }
        guard current?.id == id else { return [] }
        current = nil
        token += 1 // anything still arriving for the old render is now stale
        return [.stopCurrent(id: id), .cancelled(id: id)] + advance()
    }

    private mutating func advance() -> [Effect] {
        guard current == nil, !waiting.isEmpty else { return [] }
        let next = waiting.removeFirst()
        current = next
        token += 1
        return [.start(next, token: token)]
    }
}

public enum Wav {
    /// Float samples (−1…1) → 16-bit signed little-endian, clipped.
    public static func int16(_ samples: [Float]) -> [Int16] {
        samples.map { s in
            let c = max(-1, min(1, s.isFinite ? s : 0))
            return Int16((c * 32767).rounded())
        }
    }

    /// Canonical 44-byte RIFF/WAVE header + mono PCM16 data.
    public static func encodeMonoPCM16(_ samples: [Int16], sampleRate: Int) -> Data {
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        let dataBytes = UInt32(samples.count * 2)
        d.append(contentsOf: Array("RIFF".utf8)); u32(36 + dataBytes); d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(UInt32(sampleRate)); u32(UInt32(sampleRate * 2)); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(dataBytes)
        samples.withUnsafeBufferPointer { p in
            for s in p { var x = s.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        }
        return d
    }

    public static func peak(_ samples: [Int16]) -> Double {
        Double(samples.map { $0 == Int16.min ? Int(Int16.max) : abs(Int($0)) }.max() ?? 0) / 32767
    }
}

/// AVSpeechSynthesisVoice.quality raw values → stable strings.
public func qualityName(_ raw: Int) -> String {
    switch raw { case 2: return "enhanced"; case 3: return "premium"; default: return "default" }
}

/// AVSpeechSynthesizer.PersonalVoiceAuthorizationStatus raw values → stable strings.
public func personalVoiceAuthorizationName(_ raw: Int) -> String {
    switch raw { case 0: return "notDetermined"; case 1: return "denied"; case 2: return "unsupported"; case 3: return "authorized"; default: return "unknown" }
}
