// tacit-voice — the macOS speech voices for TACIT's "My Voice".
//
//   tacit-voice list       one JSON line: installed voices + Apple Personal Voice authorization status
//   tacit-voice serve      JSON-lines control on stdin, JSON-lines events on stdout (one warm synthesizer)
//
// serve stdin:  {"op":"synth","id":"…","voice":"<AVSpeechSynthesisVoice.identifier>","text":"…","rate":0.5,"pitch":1,"path":"/…/x.wav"}
//               {"op":"cancel","id":"…"} | {"op":"list"} | {"op":"quit"}
// serve stdout: ready(voices) / voices / done / cancelled / error
//
// Rules: the text is rendered exactly as given (AVSpeechSynthesizer does not execute embedded "[[…]]" commands); an
// unknown voice identifier is an error (AVSpeechSynthesizer would otherwise silently use the default voice); Apple
// Personal Voice is never rendered — Apple does not allow apps to capture Personal Voice audio. This process writes
// WAV files only; it never plays or routes audio.
import AVFoundation
import Foundation
import TacitVoiceCore

let stdoutLock = NSLock()
func emit(_ event: String, _ fields: [String: Any] = [:]) {
    var obj = fields
    obj["event"] = event
    guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]) else { return }
    stdoutLock.lock(); defer { stdoutLock.unlock() }
    FileHandle.standardOutput.write(data + Data([0x0A]))
}

func voicesJSON() -> [String: Any] {
    let voices: [[String: Any]] = AVSpeechSynthesisVoice.speechVoices().map { v in
        ["identifier": v.identifier, "name": v.name, "language": v.language, "quality": qualityName(v.quality.rawValue),
         "novelty": v.voiceTraits.contains(.isNoveltyVoice), "personal": v.voiceTraits.contains(.isPersonalVoice)]
    }
    return ["voices": voices,
            "defaultVoice": AVSpeechSynthesisVoice(language: nil)?.identifier ?? NSNull(),
            "personalVoiceAuthorization": personalVoiceAuthorizationName(Int(AVSpeechSynthesizer.personalVoiceAuthorizationStatus.rawValue))]
}

final class Renderer {
    let synth = AVSpeechSynthesizer()
    var queue = SynthQueue()
    var samples: [Float] = []
    var sampleRate = 0.0
    var startedAt = Date()
    var firstBufferAt: Date?
    var watchdog: DispatchWorkItem?
    static let timeout: TimeInterval = 20

    func apply(_ effects: [SynthQueue.Effect]) {
        for e in effects {
            switch e {
            case .start(let r, let token): start(r, token: token)
            case .stopCurrent: watchdog?.cancel(); synth.stopSpeaking(at: .immediate)
            case .cancelled(let id): emit("cancelled", ["id": id])
            case .rejected(let id, let reason): emit("error", ["id": id, "message": reason])
            }
        }
    }

    private func fail(_ id: String, token: Int, _ message: String) {
        watchdog?.cancel()
        emit("error", ["id": id, "message": message])
        apply(queue.finished(token: token))
    }

    private func start(_ r: SynthRequest, token: Int) {
        guard let voice = AVSpeechSynthesisVoice(identifier: r.voice) else {
            return fail(r.id, token: token, "voice not installed: \(r.voice)")
        }
        if voice.voiceTraits.contains(.isPersonalVoice) {
            return fail(r.id, token: token, "Apple Personal Voice audio cannot be captured or routed by apps; TACIT does not render it")
        }
        let u = AVSpeechUtterance(string: r.text)
        u.voice = voice
        u.rate = r.rate
        u.pitchMultiplier = r.pitch
        samples = []; sampleRate = 0; startedAt = Date(); firstBufferAt = nil
        let w = DispatchWorkItem { [weak self] in
            guard let self, self.queue.token == token else { return }
            self.synth.stopSpeaking(at: .immediate)
            self.fail(r.id, token: token, "synthesis timed out after \(Int(Renderer.timeout)) s")
        }
        watchdog = w
        DispatchQueue.main.asyncAfter(deadline: .now() + Renderer.timeout, execute: w)
        synth.write(u) { [weak self] buffer in
            guard let pcm = buffer as? AVAudioPCMBuffer else { return }
            let n = Int(pcm.frameLength)
            var chunk: [Float] = []
            if n > 0 {
                if let f = pcm.floatChannelData { chunk = Array(UnsafeBufferPointer(start: f[0], count: n)) }
                else if let i = pcm.int16ChannelData { chunk = UnsafeBufferPointer(start: i[0], count: n).map { Float($0) / 32768 } }
                else if let i = pcm.int32ChannelData { chunk = UnsafeBufferPointer(start: i[0], count: n).map { Float($0) / 2147483648 } }
            }
            let rate = pcm.format.sampleRate
            DispatchQueue.main.async {
                guard let self, self.queue.token == token, self.queue.current?.id == r.id else { return } // cancelled/stale
                if n > 0 {
                    if self.firstBufferAt == nil { self.firstBufferAt = Date() }
                    self.sampleRate = rate
                    self.samples += chunk
                } else {
                    self.complete(r, token: token)
                }
            }
        }
    }

    private func complete(_ r: SynthRequest, token: Int) {
        watchdog?.cancel()
        guard !samples.isEmpty, sampleRate > 0 else { return fail(r.id, token: token, "the voice rendered no audio") }
        let pcm = Wav.int16(samples)
        let data = Wav.encodeMonoPCM16(pcm, sampleRate: Int(sampleRate))
        guard FileManager.default.createFile(atPath: r.path, contents: data, attributes: [.posixPermissions: 0o600]) else {
            return fail(r.id, token: token, "could not write audio file")
        }
        let ms = { (d: Date) in (d.timeIntervalSince(self.startedAt) * 1000).rounded() }
        emit("done", ["id": r.id, "frames": pcm.count, "sampleRate": sampleRate, "peak": Wav.peak(pcm),
                      "durationMs": (Double(pcm.count) / sampleRate * 1000).rounded(),
                      "firstBufferMs": firstBufferAt.map(ms) ?? NSNull(), "totalMs": ms(Date())])
        samples = []
        apply(queue.finished(token: token))
    }
}

func serve() -> Never {
    let renderer = Renderer()
    emit("ready", voicesJSON())
    Thread.detachNewThread {
        while let line = readLine(strippingNewline: true) {
            guard let data = line.data(using: .utf8), let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let op = msg["op"] as? String else { emit("error", ["message": "bad command"]); continue }
            DispatchQueue.main.async {
                switch op {
                case "synth":
                    switch SynthRequest.parse(msg) {
                    case .success(let r): renderer.apply(renderer.queue.enqueue(r))
                    case .failure(let e): emit("error", ["id": e.id ?? NSNull(), "message": e.message])
                    }
                case "cancel":
                    guard let id = msg["id"] as? String else { emit("error", ["message": "cancel needs id"]); return }
                    renderer.apply(renderer.queue.cancel(id: id))
                case "list": emit("voices", voicesJSON())
                case "quit": renderer.synth.stopSpeaking(at: .immediate); exit(0)
                default: emit("error", ["message": "unknown op \(op)"])
                }
            }
        }
        DispatchQueue.main.async { exit(0) } // stdin closed: the supervising server is gone
    }
    dispatchMain()
}

switch CommandLine.arguments.dropFirst().first {
case "list":
    emit("voices", voicesJSON())
case "serve":
    serve()
default:
    FileHandle.standardError.write("usage: tacit-voice list | serve\n".data(using: .utf8)!)
    exit(64)
}
