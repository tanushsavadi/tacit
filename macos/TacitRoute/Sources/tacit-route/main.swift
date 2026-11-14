// tacit-route — play TACIT speech into ONE explicitly selected output device (normally BlackHole, which the calling
// app uses as its microphone). It never changes the system default input/output and never falls back to another
// device: if the target is missing, nothing plays.
//
//   tacit-route list                                   JSON array of devices
//   tacit-route serve --device-uid UID                 JSON-lines control on stdin, JSON-lines events on stdout
//   tacit-route verify --device-uid UID FILE           play FILE into UID while capturing UID's input (loopback proof)
//
// serve stdin:  {"op":"play","id":"…","path":"/tmp/…wav"} | {"op":"stop","reason":"…"} | {"op":"status"} | {"op":"quit"}
// serve stdout: ready / started / finished / interrupted / rejected / error / device_lost / device_restored / status
// "finished" means the buffer was rendered to the device by this process — NOT that any remote person heard it.
import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation
import TacitRouteCore

// MARK: - output

let stdoutLock = NSLock()
func emit(_ event: String, _ fields: [String: Any] = [:]) {
    var obj = fields
    obj["event"] = event
    obj["t"] = Date().timeIntervalSince1970 * 1000
    guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]) else { return }
    stdoutLock.lock(); defer { stdoutLock.unlock() }
    FileHandle.standardOutput.write(data + Data([0x0A]))
}
func fail(_ msg: String) -> Never {
    emit("error", ["message": msg, "fatal": true])
    exit(1)
}

// MARK: - devices

struct Device {
    let id: AudioDeviceID, uid: String, name: String, inputs: Int, outputs: Int, sampleRate: Double, transport: String
    var json: [String: Any] {
        ["id": Int(id), "uid": uid, "name": name, "inputChannels": inputs, "outputChannels": outputs,
         "sampleRate": sampleRate, "transport": transport]
    }
}

func addr(_ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func deviceIDs() -> [AudioDeviceID] {
    var a = addr(kAudioHardwarePropertyDevices)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &ids) == noErr else { return [] }
    return ids
}

func stringProp(_ id: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String? {
    var a = addr(sel)
    var s: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &s) == noErr, let v = s?.takeRetainedValue() else { return nil }
    return v as String
}

func channelCount(_ id: AudioObjectID, _ scope: AudioObjectPropertyScope) -> Int {
    var a = addr(kAudioDevicePropertyStreamConfiguration, scope)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(id, &a, 0, nil, &size) == noErr, size > 0 else { return 0 }
    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, raw) == noErr else { return 0 }
    let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
    return list.reduce(0) { $0 + Int($1.mNumberChannels) }
}

func device(_ id: AudioDeviceID) -> Device? {
    guard let uid = stringProp(id, kAudioDevicePropertyDeviceUID) else { return nil }
    var a = addr(kAudioDevicePropertyNominalSampleRate)
    var rate: Float64 = 0
    var size = UInt32(MemoryLayout<Float64>.size)
    AudioObjectGetPropertyData(id, &a, 0, nil, &size, &rate)
    var t = addr(kAudioDevicePropertyTransportType)
    var transport: UInt32 = 0
    size = UInt32(MemoryLayout<UInt32>.size)
    AudioObjectGetPropertyData(id, &t, 0, nil, &size, &transport)
    let tname: String = {
        switch transport {
        case kAudioDeviceTransportTypeVirtual: return "virtual"
        case kAudioDeviceTransportTypeBuiltIn: return "built-in"
        case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE: return "bluetooth"
        case kAudioDeviceTransportTypeUSB: return "usb"
        case kAudioDeviceTransportTypeHDMI, kAudioDeviceTransportTypeDisplayPort: return "display"
        case kAudioDeviceTransportTypeAggregate: return "aggregate"
        case kAudioDeviceTransportTypeContinuityCaptureWired, kAudioDeviceTransportTypeContinuityCaptureWireless: return "continuity"
        default: return "other"
        }
    }()
    return Device(id: id, uid: uid, name: stringProp(id, kAudioObjectPropertyName) ?? "?",
                  inputs: channelCount(id, kAudioObjectPropertyScopeInput), outputs: channelCount(id, kAudioObjectPropertyScopeOutput),
                  sampleRate: rate, transport: tname)
}

func allDevices() -> [Device] { deviceIDs().compactMap(device) }
func findDevice(uid: String) -> Device? { allDevices().first { $0.uid == uid } }

func defaultDeviceUID(_ sel: AudioObjectPropertySelector) -> String? {
    var a = addr(sel)
    var id = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &id) == noErr else { return nil }
    return stringProp(id, kAudioDevicePropertyDeviceUID)
}


// MARK: - route diagnostics (read-only)

/// Volume/mute of a device scope (element main, else channel 1). nil when the device does not expose it.
func scalarProp(_ id: AudioObjectID, _ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope) -> Double? {
    for el in [kAudioObjectPropertyElementMain, 1] {
        var a = AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: el)
        guard AudioObjectHasProperty(id, &a) else { continue }
        if sel == kAudioDevicePropertyMute {
            var v: UInt32 = 0; var size = UInt32(MemoryLayout<UInt32>.size)
            if AudioObjectGetPropertyData(id, &a, 0, nil, &size, &v) == noErr { return Double(v) }
        } else {
            var v: Float32 = 0; var size = UInt32(MemoryLayout<Float32>.size)
            if AudioObjectGetPropertyData(id, &a, 0, nil, &size, &v) == noErr { return Double(v) }
        }
    }
    return nil
}

/// Processes currently reading this device as an input (macOS 14.2+): tells us whether a calling app has it open.
func inputReaders(of dev: AudioDeviceID) -> [[String: Any]]? {
    guard #available(macOS 14.2, *) else { return nil }
    var a = addr(kAudioHardwarePropertyProcessObjectList)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size) == noErr else { return nil }
    var procs = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &procs) == noErr else { return nil }
    var out: [[String: Any]] = []
    for p in procs {
        var ra = addr(kAudioProcessPropertyIsRunningInput)
        var running: UInt32 = 0; var rs = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(p, &ra, 0, nil, &rs, &running) == noErr, running != 0 else { continue }
        var da = addr(kAudioProcessPropertyDevices, kAudioObjectPropertyScopeInput)
        var ds: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(p, &da, 0, nil, &ds) == noErr, ds > 0 else { continue }
        var devs = [AudioDeviceID](repeating: 0, count: Int(ds) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(p, &da, 0, nil, &ds, &devs) == noErr, devs.contains(dev) else { continue }
        var pa = addr(kAudioProcessPropertyPID)
        var pid: pid_t = 0; var ps = UInt32(MemoryLayout<pid_t>.size)
        AudioObjectGetPropertyData(p, &pa, 0, nil, &ps, &pid)
        out.append(["pid": Int(pid), "bundleID": stringProp(p, kAudioProcessPropertyBundleID) ?? "?"])
    }
    return out
}

/// Aggregate / multi-output devices that contain `uid`: if one is the system output, call audio could reach the
/// virtual mic and the remote party would hear themselves.
func aggregatesContaining(uid: String) -> [String] {
    allDevices().filter { $0.transport == "aggregate" }.compactMap { agg in
        var a = addr(kAudioAggregateDevicePropertyFullSubDeviceList)
        var list: Unmanaged<CFArray>?
        var size = UInt32(MemoryLayout<Unmanaged<CFArray>?>.size)
        guard AudioObjectGetPropertyData(agg.id, &a, 0, nil, &size, &list) == noErr,
              let arr = list?.takeRetainedValue() as? [String], arr.contains(uid) else { return nil }
        return agg.uid
    }
}

func routeDiagnostics(_ dev: Device) -> [String: Any] {
    let defOut = defaultDeviceUID(kAudioHardwarePropertyDefaultOutputDevice)
    let defSys = defaultDeviceUID(kAudioHardwarePropertyDefaultSystemOutputDevice)
    let aggs = aggregatesContaining(uid: dev.uid)
    var warnings: [String] = []
    if defOut == dev.uid { warnings.append("system default OUTPUT is the virtual mic: call audio and other sounds would be sent to the remote party") }
    if defSys == dev.uid { warnings.append("system alert/notification output is the virtual mic") }
    if let d = defOut, aggs.contains(d) { warnings.append("system default output is an aggregate/multi-output device containing the virtual mic (echo risk)") }
    let vol = scalarProp(dev.id, kAudioDevicePropertyVolumeScalar, kAudioObjectPropertyScopeOutput)
    let mute = scalarProp(dev.id, kAudioDevicePropertyMute, kAudioObjectPropertyScopeOutput)
    if let v = vol, v < 0.5 { warnings.append("virtual device output volume is \(Int(v * 100))%") }
    if mute == 1 { warnings.append("virtual device output is muted") }
    var d: [String: Any] = ["device": dev.json, "warnings": warnings, "aggregatesContaining": aggs,
                            "systemDefaultOutput": defOut ?? NSNull(), "systemDefaultInput": defaultDeviceUID(kAudioHardwarePropertyDefaultInputDevice) ?? NSNull()]
    d["outputVolume"] = vol ?? NSNull(); d["outputMuted"] = mute.map { $0 == 1 } ?? NSNull()
    d["inputReaders"] = inputReaders(of: dev.id) ?? NSNull()
    return d
}

// MARK: - audio helpers

func loadConverted(path: String, to fmt: AVAudioFormat) throws -> AVAudioPCMBuffer {
    let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
    // AVAudioFile.length is only an estimate for compressed files: read until no more frames arrive.
    let cap = AVAudioFrameCount(max(file.length, 4096)) + 8192
    guard let src = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: cap),
          let chunk = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 8192) else { throw NSError(domain: "tacit-route", code: 1) }
    while src.frameLength < src.frameCapacity {
        do { try file.read(into: chunk, frameCount: min(8192, src.frameCapacity - src.frameLength)) } catch {
            if src.frameLength > 0 && file.framePosition >= file.length { break } // past the (estimated) end
            throw error
        }
        if chunk.frameLength == 0 { break }
        for c in 0..<Int(src.format.channelCount) {
            if let d = src.floatChannelData, let s = chunk.floatChannelData {
                (d[c] + Int(src.frameLength)).update(from: s[c], count: Int(chunk.frameLength))
            }
        }
        src.frameLength += chunk.frameLength
    }
    guard src.frameLength > 0 else { throw NSError(domain: "tacit-route", code: 1, userInfo: [NSLocalizedDescriptionKey: "empty audio file"]) }
    if src.format == fmt { return src }
    guard let conv = AVAudioConverter(from: src.format, to: fmt) else {
        throw NSError(domain: "tacit-route", code: 2, userInfo: [NSLocalizedDescriptionKey: "no converter \(src.format) → \(fmt)"])
    }
    conv.downmix = true
    let outCap = AVAudioFrameCount(Double(src.frameLength) * fmt.sampleRate / src.format.sampleRate) + 4096
    guard let out = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: outCap) else { throw NSError(domain: "tacit-route", code: 3) }
    var fed = false
    var err: NSError?
    let status = conv.convert(to: out, error: &err) { _, st in
        if fed { st.pointee = .endOfStream; return nil }
        fed = true; st.pointee = .haveData; return src
    }
    if status == .error { throw err ?? NSError(domain: "tacit-route", code: 4) }
    guard out.frameLength > 0 else { throw NSError(domain: "tacit-route", code: 5, userInfo: [NSLocalizedDescriptionKey: "conversion produced no audio"]) }
    return out
}

/// Linear gain from --gain-db (default 0 dB). Float samples > 1.0 are passed to the device unclipped.
let gainLinear: Float = { Float(pow(10.0, (Double(arg("--gain-db") ?? "0") ?? 0) / 20)) }()
func applyGain(_ b: AVAudioPCMBuffer) {
    guard gainLinear != 1, let ch = b.floatChannelData else { return }
    for c in 0..<Int(b.format.channelCount) { for i in 0..<Int(b.frameLength) { ch[c][i] *= gainLinear } }
}

func peak(_ b: AVAudioPCMBuffer) -> Float {
    guard let ch = b.floatChannelData else { return 0 }
    var m: Float = 0
    for c in 0..<Int(b.format.channelCount) { for i in 0..<Int(b.frameLength) { m = max(m, abs(ch[c][i])) } }
    return m
}

func hostMs(_ dt: UInt64) -> Double {
    var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
    return Double(dt) * Double(tb.numer) / Double(tb.denom) / 1_000_000
}
func hostTicks(ms: Double) -> UInt64 {
    var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
    return UInt64(ms * 1_000_000 * Double(tb.denom) / Double(tb.numer))
}

// MARK: - router (all state touched only on the main queue)

final class Router {
    let uid: String
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private(set) var format: AVAudioFormat?
    private(set) var deviceName = ""
    private var boundID = AudioDeviceID(0)
    private var builtHw: (rate: Double, channels: Int) = (0, 0)
    private var watchdogs: [String: DispatchWorkItem] = [:]
    var queue = PlaybackQueue(capacity: 8)
    private var configObserver: NSObjectProtocol?
    private let renderLock = NSLock()
    private var renderedFrames = 0, renderedPeak: Float = 0
    var onEvents: ([RouteEvent]) -> Void = { _ in }

    init(uid: String) { self.uid = uid }

    var isRunning: Bool { engine?.isRunning ?? false }

    /// The output unit is still bound to our device (never to a fallback default) and the UID still resolves to it.
    var boundToTarget: Bool {
        guard let unit = engine?.outputNode.audioUnit else { return false }
        var cur = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &cur, &size) == noErr else { return false }
        return cur == boundID && stringProp(cur, kAudioDevicePropertyDeviceUID) == uid
    }

    /// Build an engine bound to the target device. Throws (and leaves nothing running) if it cannot be bound.
    func start() throws {
        guard let dev = findDevice(uid: uid) else { throw NSError(domain: "tacit-route", code: 10, userInfo: [NSLocalizedDescriptionKey: "output device \(uid) not present"]) }
        guard dev.outputs > 0 else { throw NSError(domain: "tacit-route", code: 11, userInfo: [NSLocalizedDescriptionKey: "\(dev.name) has no output channels"]) }
        let e = AVAudioEngine()
        // Bind the output unit to the device BEFORE anything else touches the graph. The input node is never accessed,
        // so the engine never opens the user's microphone.
        guard let unit = e.outputNode.audioUnit else { throw NSError(domain: "tacit-route", code: 12) }
        var id = dev.id
        var st = AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &id, UInt32(MemoryLayout<AudioDeviceID>.size))
        guard st == noErr else { throw NSError(domain: "tacit-route", code: 13, userInfo: [NSLocalizedDescriptionKey: "cannot bind output to \(dev.name) (OSStatus \(st))"]) }
        var bound = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        st = AudioUnitGetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &bound, &size)
        guard st == noErr, bound == dev.id else { throw NSError(domain: "tacit-route", code: 14, userInfo: [NSLocalizedDescriptionKey: "output unit did not bind to \(dev.name)"]) }

        let hw = e.outputNode.outputFormat(forBus: 0)
        let rate = hw.sampleRate > 0 ? hw.sampleRate : dev.sampleRate
        guard rate > 0, let mono = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
              let stereo = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2) else {
            throw NSError(domain: "tacit-route", code: 15, userInfo: [NSLocalizedDescriptionKey: "unusable device format \(hw)"])
        }
        let p = AVAudioPlayerNode()
        e.attach(p)
        e.connect(p, to: e.mainMixerNode, format: mono)
        // Stereo into the device: the output unit's default channel map puts L/R on device channels 1–2, which is
        // what calling apps read from a multichannel virtual device.
        e.connect(e.mainMixerNode, to: e.outputNode, format: stereo)
        if dev.outputs > 2 { // explicit map: client L/R → device channels 1–2, every other device channel silent
            var map = [Int32](repeating: -1, count: dev.outputs); map[0] = 0; map[1] = 1
            let ms = AudioUnitSetProperty(unit, kAudioOutputUnitProperty_ChannelMap, kAudioUnitScope_Output, 0, &map, UInt32(map.count * MemoryLayout<Int32>.size))
            if ms != noErr { emit("warning", ["message": "channel map not applied (OSStatus \(ms)); relying on default L/R → ch 1–2"]) }
        }
        e.mainMixerNode.installTap(onBus: 0, bufferSize: 1024, format: stereo) { [weak self] buf, _ in
            let pk = peak(buf)
            guard let self else { return }
            self.renderLock.lock(); self.renderedFrames += Int(buf.frameLength); self.renderedPeak = max(self.renderedPeak, pk); self.renderLock.unlock()
        }
        e.prepare()
        try e.start()
        p.play()
        engine = e; player = p; format = mono; deviceName = dev.name; boundID = dev.id
        builtHw = (hw.sampleRate, Int(hw.channelCount))
        configObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: e, queue: .main) { [weak self] _ in
            self?.resetAfterConfigurationChange()
        }
    }

    func teardown() {
        if let o = configObserver { NotificationCenter.default.removeObserver(o) }
        configObserver = nil
        player?.stop()
        engine?.mainMixerNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil; player = nil
    }

    func takeRendered() -> (frames: Int, peak: Float) {
        renderLock.lock(); defer { renderLock.unlock() }
        let r = (renderedFrames, renderedPeak); renderedFrames = 0; renderedPeak = 0
        return r
    }

    func play(id: String, path: String, at when: AVAudioTime? = nil) {
        guard let p = player, let fmt = format, isRunning else {
            onEvents([.rejected(id: id, reason: "output route not running")]); return
        }
        guard boundToTarget else {
            teardown(); onEvents(queue.setAvailable(false, reason: "output unit no longer bound to the selected device"))
            onEvents([.rejected(id: id, reason: "output unit no longer bound to the selected device")])
            restart(event: "route_reset"); return
        }
        let buf: AVAudioPCMBuffer
        do { buf = try loadConverted(path: path, to: fmt) } catch {
            onEvents([.rejected(id: id, reason: "audio decode failed: \(error.localizedDescription)")]); return
        }
        applyGain(buf)
        let (epoch, ev) = queue.enqueue(id)
        guard let epoch else { onEvents(ev); return }
        if ev.contains(.started(id: id)) { _ = takeRendered() }
        if when != nil { p.stop() }
        p.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async { guard let self else { return }; self.completed(id, epoch: epoch) }
        }
        if let when { p.play(at: when) }
        // Watchdog: if the engine silently stops (configuration change) the completion may never fire.
        let ms = Double(buf.frameLength) / fmt.sampleRate * 1000 * Double(queue.scheduled.count) + 3000
        let w = DispatchWorkItem { [weak self] in
            guard let self, self.queue.scheduled.contains(id), self.queue.epoch == epoch else { return }
            self.stop(reason: "playback did not complete (watchdog)")
        }
        watchdogs[id] = w
        DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000, execute: w)
        onEvents(ev)
    }

    private func completed(_ id: String, epoch: Int) {
        watchdogs.removeValue(forKey: id)?.cancel()
        onEvents(queue.playedBack(id, epoch: epoch))
    }

    /// Cut current + queued audio immediately.
    func stop(reason: String) {
        for w in watchdogs.values { w.cancel() }
        watchdogs.removeAll()
        let ev = queue.stopAll(reason: reason)
        player?.stop()   // completions fire with the old epoch and are ignored
        player?.play()
        onEvents(ev)
    }

    func deviceListChanged() {
        let present = findDevice(uid: uid) != nil
        if !present, queue.available {
            teardown()
            onEvents(queue.setAvailable(false, reason: "output device removed"))
            emit("device_lost", ["uid": uid])
        } else if present, !queue.available || !isRunning {
            restart(event: "device_restored")
        }
    }

    private func resetAfterConfigurationChange() {
        // macOS posts this notification spuriously (observed right after binding a non-default device, with the
        // engine still running, still bound and unchanged). Only rebuild when something really changed.
        let hw = engine?.outputNode.outputFormat(forBus: 0)
        if isRunning, boundToTarget, let hw, hw.sampleRate == builtHw.rate, Int(hw.channelCount) == builtHw.channels { return }
        // The engine stops itself on a configuration change; anything scheduled is gone.
        teardown()
        onEvents(queue.setAvailable(false, reason: "audio route reset"))
        restart(event: "route_reset")
    }

    private func restart(event: String) {
        do {
            try start()
            _ = queue.setAvailable(true)
            emit(event, ["uid": uid, "device": deviceName, "sampleRate": format?.sampleRate ?? 0])
        } catch {
            emit("device_lost", ["uid": uid, "message": error.localizedDescription])
        }
    }
}

func emitRouteEvents(_ router: Router, _ evs: [RouteEvent]) {
    for e in evs {
        switch e {
        case .started(let id): emit("started", ["id": id])
        case .finished(let id):
            let r = router.queue.scheduled.isEmpty ? router.takeRendered() : (frames: -1, peak: Float(-1))
            var f: [String: Any] = ["id": id]
            if r.frames >= 0 { f["renderedFrames"] = r.frames; f["renderedPeak"] = Double(r.peak) }
            emit("finished", f)
        case .interrupted(let id, let reason): emit("interrupted", ["id": id, "reason": reason])
        case .rejected(let id, let reason): emit("rejected", ["id": id, "reason": reason])
        }
    }
}

// MARK: - commands

func arg(_ name: String) -> String? {
    let a = CommandLine.arguments
    guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
    return a[i + 1]
}

func watchDevices(_ handler: @escaping () -> Void) {
    var a = addr(kAudioHardwarePropertyDevices)
    AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &a, DispatchQueue.main) { _, _ in handler() }
}

func serve(uid: String) -> Never {
    let router = Router(uid: uid)
    router.onEvents = { emitRouteEvents(router, $0) }
    do { try router.start() } catch {
        // Fail closed but stay alive so the supervisor sees device_restored when the device appears.
        _ = router.queue.setAvailable(false, reason: error.localizedDescription)
        emit("device_lost", ["uid": uid, "message": error.localizedDescription])
    }
    if router.isRunning {
        var f: [String: Any] = ["uid": uid, "device": router.deviceName, "sampleRate": router.format?.sampleRate ?? 0]
        if let d = findDevice(uid: uid) { f["diagnostics"] = routeDiagnostics(d) }
        emit("ready", f)
    }
    watchDevices { router.deviceListChanged() }
    Thread.detachNewThread {
        while let line = readLine(strippingNewline: true) {
            guard let data = line.data(using: .utf8), let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let op = msg["op"] as? String else { emit("error", ["message": "bad command"]); continue }
            DispatchQueue.main.async {
                switch op {
                case "play":
                    guard let id = msg["id"] as? String, let path = msg["path"] as? String else { emit("error", ["message": "play needs id and path"]); return }
                    router.play(id: id, path: path)
                case "stop": router.stop(reason: (msg["reason"] as? String) ?? "stopped")
                case "status":
                    var f: [String: Any] = ["uid": uid, "running": router.isRunning, "available": router.queue.available,
                                            "bound": router.boundToTarget, "queued": router.queue.scheduled, "device": router.deviceName]
                    if let d = findDevice(uid: uid) { f["diagnostics"] = routeDiagnostics(d) }
                    emit("status", f)
                case "quit": router.stop(reason: "route helper quit"); router.teardown(); exit(0)
                default: emit("error", ["message": "unknown op \(op)"])
                }
            }
        }
        // stdin closed: the supervising server is gone — stop audio and exit.
        DispatchQueue.main.async { router.stop(reason: "supervisor gone"); router.teardown(); exit(0) }
    }
    dispatchMain()
}

/// Loopback proof: play FILE into the device's output while reading the SAME device's input with a raw IOProc.
/// BlackHole passes output → input, so captured audio proves samples reach what a calling app would read. It does NOT
/// prove a calling app has the device selected, is unmuted, or that anyone heard it.
func verify(uid: String, path: String) -> Never {
    guard let dev = findDevice(uid: uid) else { fail("device \(uid) not present") }
    guard dev.inputs > 0 else { fail("\(dev.name) has no input side; a calling app could not use it as a microphone") }
    let micAuth: String = {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "not-determined"
        @unknown default: return "unknown"
        }
    }()
    final class Cap { var stopHost: UInt64 = .max, loudAfterStop = 0, frames = 0, loud = 0, callbacks = 0, onsetHost: UInt64 = 0, prePeak: Float = 0, peak12: Float = 0, peakRest: Float = 0, channels = 0 }
    let cap = Cap(), lock = NSLock()
    let threshold: Float = 0.005
    let preRollMs = 300.0
    var scheduledHost: UInt64 = .max
    var procID: AudioDeviceIOProcID?
    let st = AudioDeviceCreateIOProcIDWithBlock(&procID, dev.id, DispatchQueue(label: "capture")) { _, inData, inTime, _, _ in
        let list = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
        lock.lock(); defer { lock.unlock() }
        cap.callbacks += 1
        let t0 = inTime.pointee.mHostTime
        // BlackHole delivers one interleaved float32 buffer; handle non-interleaved buffers too.
        var chBase = 0
        for b in list {
            guard let raw = b.mData else { continue }
            let ch = max(1, Int(b.mNumberChannels)), frames = Int(b.mDataByteSize) / (4 * ch)
            let smp = raw.assumingMemoryBound(to: Float.self)
            for i in 0..<frames {
                let host = t0 + hostTicks(ms: Double(i) / dev.sampleRate * 1000)
                for c in 0..<ch {
                    let v = abs(smp[i * ch + c]), g = chBase + c
                    if host < scheduledHost { if g < 2 { cap.prePeak = max(cap.prePeak, v) }; continue }
                    if g < 2 { cap.peak12 = max(cap.peak12, v) } else { cap.peakRest = max(cap.peakRest, v) }
                }
                if host >= scheduledHost {
                    let v = max(abs(smp[i * ch]), (chBase == 0 && ch > 1) ? abs(smp[i * ch + 1]) : 0)
                    if chBase == 0 && v > threshold {
                        cap.loud += 1; if cap.onsetHost == 0 { cap.onsetHost = host }
                        if host > cap.stopHost { cap.loudAfterStop += 1 }
                    }
                }
            }
            if chBase == 0 { cap.frames += frames }
            chBase += ch
        }
        cap.channels = chBase
    }
    guard st == noErr, let procID else { fail("cannot open capture on \(dev.name) (OSStatus \(st))") }
    guard AudioDeviceStart(dev.id, procID) == noErr else { fail("cannot start capture on \(dev.name)") }

    let router = Router(uid: uid)
    var finished = false
    router.onEvents = { evs in
        emitRouteEvents(router, evs)
        if evs.contains(where: { if case .finished = $0 { return true }; if case .rejected = $0 { return true }; if case .interrupted = $0 { return true }; return false }) { finished = true }
    }
    do { try router.start() } catch { fail(error.localizedDescription) }
    let fileFrames: Double, sentPeak: Float
    do { let b = try loadConverted(path: path, to: router.format!); fileFrames = Double(b.frameLength); sentPeak = peak(b) * gainLinear * Float(0.5).squareRoot() } catch { fail("cannot decode \(path): \(error.localizedDescription)") }
    let sched = mach_absolute_time() + hostTicks(ms: preRollMs)
    lock.lock(); scheduledHost = sched; lock.unlock()
    router.play(id: "verify", path: path, at: AVAudioTime(hostTime: sched))
    let stopAfterMs = arg("--stop-after-ms").flatMap(Double.init)
    if let stopAfterMs {
        DispatchQueue.main.asyncAfter(deadline: .now() + (preRollMs + stopAfterMs) / 1000) {
            let h = mach_absolute_time()
            router.stop(reason: "verify: stop requested")
            lock.lock(); cap.stopHost = h; lock.unlock()
        }
    }
    let fileMs = fileFrames / router.format!.sampleRate * 1000
    let deadline = Date().addingTimeInterval((preRollMs + fileMs) / 1000 + 3)
    while !finished && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    RunLoop.main.run(until: Date().addingTimeInterval(0.4)) // let the tail drain through the loopback
    AudioDeviceStop(dev.id, procID)
    AudioDeviceDestroyIOProcID(dev.id, procID)
    router.teardown()
    lock.lock(); defer { lock.unlock() }
    let loudMs = Double(cap.loud) / dev.sampleRate * 1000
    let baselineQuiet = cap.prePeak < threshold
    let otherChannelsQuiet = cap.peakRest < threshold
    let expectMs = min(fileMs, stopAfterMs ?? fileMs)
    let ok = baselineQuiet && cap.loud > 0 && loudMs > expectMs * 0.3 && otherChannelsQuiet
    var out: [String: Any] = ["loopbackVerified": ok, "device": dev.name, "uid": uid, "fileMs": round(fileMs),
                              "capturedMs": round(Double(cap.frames) / dev.sampleRate * 1000), "loudMs": round(loudMs),
                              "preRollPeak": Double(cap.prePeak), "peakCh12": Double(cap.peak12), "peakOtherChannels": Double(cap.peakRest),
                              "capturedChannels": cap.channels, "callbacks": cap.callbacks, "microphonePermission": micAuth,
                              "diagnostics": routeDiagnostics(dev),
                              "meaning": "samples written by tacit-route reached the device's input side (what a calling app reads); not proof that a call app selected it or that anyone heard it"]
    if ok, sentPeak > 0 { // mixer output (mono panned centre, −3 dB) → captured: the route's own gain
        let routeDb = 20 * log10(Double(cap.peak12) / Double(sentPeak))
        out["routeGainDb"] = round(routeDb * 10) / 10
        out["gainDbApplied"] = round(20 * log10(Double(gainLinear)) * 10) / 10
    }
    if stopAfterMs != nil, cap.stopHost != .max {
        // Audio captured after stop() returned: the cutoff tail that already left the engine.
        out["loudAfterStopMs"] = round(Double(cap.loudAfterStop) / dev.sampleRate * 1000 * 10) / 10
    }
    if cap.onsetHost > 0 { out["scheduleToCaptureOnsetMs"] = round(hostMs(cap.onsetHost &- sched) * 10) / 10 }
    if !ok {
        out["hint"] = cap.callbacks == 0 ? "no capture callbacks: the input side never ran"
            : !baselineQuiet ? "input already carried sound before playback (another app is writing to this device); cannot attribute the signal"
            : !otherChannelsQuiet ? "audio appeared on channels beyond 1–2: channel map is wrong"
            : micAuth != "authorized" ? "captured only silence; microphone permission is \(micAuth) for this process, so input is zeroed"
            : "captured only silence: audio did not reach the device input"
    }
    emit("loopback", out)
    exit(ok ? 0 : 2)
}

/// Capture the device's input side for N seconds (no playback) and report when sound first appeared, as epoch ms.
/// Used by the server's end-to-end check to time request → audio at the virtual microphone.
func listen(uid: String, seconds: Double) -> Never {
    guard let dev = findDevice(uid: uid) else { fail("device \(uid) not present") }
    final class L { var loud = 0, frames = 0, firstLoudHost: UInt64 = 0, lastLoudHost: UInt64 = 0, peak: Float = 0 }
    let l = L(), lock = NSLock(), threshold: Float = 0.005
    var procID: AudioDeviceIOProcID?
    let st = AudioDeviceCreateIOProcIDWithBlock(&procID, dev.id, DispatchQueue(label: "listen")) { _, inData, inTime, _, _ in
        let list = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
        guard let b = list.first, let raw = b.mData else { return }
        let ch = max(1, Int(b.mNumberChannels)), frames = Int(b.mDataByteSize) / (4 * ch)
        let smp = raw.assumingMemoryBound(to: Float.self)
        lock.lock(); defer { lock.unlock() }
        for i in 0..<frames {
            let v = max(abs(smp[i * ch]), ch > 1 ? abs(smp[i * ch + 1]) : 0)
            l.peak = max(l.peak, v)
            if v > threshold {
                let h = inTime.pointee.mHostTime + hostTicks(ms: Double(i) / dev.sampleRate * 1000)
                l.loud += 1; if l.firstLoudHost == 0 { l.firstLoudHost = h }; l.lastLoudHost = h
            }
        }
        l.frames += frames
    }
    guard st == noErr, let procID, AudioDeviceStart(dev.id, procID) == noErr else { fail("cannot capture \(dev.name)") }
    let hostNow = mach_absolute_time(), epochNow = Date().timeIntervalSince1970 * 1000
    emit("listening", ["device": dev.name, "seconds": seconds])
    RunLoop.main.run(until: Date().addingTimeInterval(seconds))
    AudioDeviceStop(dev.id, procID); AudioDeviceDestroyIOProcID(dev.id, procID)
    lock.lock(); defer { lock.unlock() }
    func epoch(_ h: UInt64) -> Double { epochNow + (h >= hostNow ? hostMs(h - hostNow) : -hostMs(hostNow - h)) }
    var o: [String: Any] = ["device": dev.name, "loudMs": round(Double(l.loud) / dev.sampleRate * 1000), "peak": Double(l.peak),
                            "capturedMs": round(Double(l.frames) / dev.sampleRate * 1000)]
    if l.firstLoudHost > 0 { o["firstLoudAt"] = epoch(l.firstLoudHost); o["lastLoudAt"] = epoch(l.lastLoudHost) }
    emit("listened", o)
    exit(0)
}

signal(SIGPIPE, SIG_IGN)
let cmd = CommandLine.arguments.dropFirst().first ?? "help"
switch cmd {
case "list":
    let devs = allDevices().map(\.json)
    let o: [String: Any] = ["devices": devs, "defaultOutput": defaultDeviceUID(kAudioHardwarePropertyDefaultOutputDevice) ?? NSNull(),
                            "defaultInput": defaultDeviceUID(kAudioHardwarePropertyDefaultInputDevice) ?? NSNull(),
                            "defaultSystemOutput": defaultDeviceUID(kAudioHardwarePropertyDefaultSystemOutputDevice) ?? NSNull()]
    FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]) + Data([0x0A]))
case "diagnose":
    guard let uid = arg("--device-uid") else { fail("diagnose needs --device-uid") }
    guard let d = findDevice(uid: uid) else { emit("diagnose", ["present": false, "uid": uid]); exit(3) }
    var o = routeDiagnostics(d); o["present"] = true
    emit("diagnose", o)
case "serve":
    guard let uid = arg("--device-uid") else { fail("serve needs --device-uid") }
    serve(uid: uid)
case "listen":
    guard let uid = arg("--device-uid") else { fail("listen needs --device-uid") }
    listen(uid: uid, seconds: Double(arg("--seconds") ?? "5") ?? 5)
case "verify":
    guard let uid = arg("--device-uid"), let path = CommandLine.arguments.last, path != uid else { fail("verify needs --device-uid UID FILE") }
    verify(uid: uid, path: path)
default:
    FileHandle.standardError.write("usage: tacit-route list | diagnose --device-uid UID | listen --device-uid UID [--seconds N] | serve --device-uid UID | verify --device-uid UID FILE\n".data(using: .utf8)!)
    exit(64)
}
