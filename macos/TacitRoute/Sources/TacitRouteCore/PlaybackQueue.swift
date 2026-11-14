// Deterministic FIFO playback bookkeeping for tacit-route. No audio, no clocks: the CoreAudio layer reports what
// actually happened (scheduled / played back / stopped / device lost) and this decides which events to emit.
// Every stop bumps `epoch`; completions carrying an older epoch are ignored, so an id is reported exactly once.

public enum RouteEvent: Equatable {
    case started(id: String)
    case finished(id: String)
    case interrupted(id: String, reason: String)
    case rejected(id: String, reason: String)
}

public struct PlaybackQueue {
    public let capacity: Int
    public private(set) var epoch = 0
    /// ids scheduled on the player, in order; the head is the one currently audible.
    public private(set) var scheduled: [String] = []
    private var seen: [String] = []  // bounded duplicate-id memory
    public private(set) var available = true
    private var unavailableReason = ""

    public init(capacity: Int = 8) { self.capacity = capacity }

    /// Ask to enqueue `id`. Returns the epoch to tag the CoreAudio completion with, or nil plus events if rejected.
    public mutating func enqueue(_ id: String) -> (epoch: Int?, events: [RouteEvent]) {
        if !available { return (nil, [.rejected(id: id, reason: unavailableReason)]) }
        if seen.contains(id) { return (nil, [.rejected(id: id, reason: "duplicate id")]) }
        if scheduled.count >= capacity { return (nil, [.rejected(id: id, reason: "queue full (\(capacity))")]) }
        seen.append(id); if seen.count > 256 { seen.removeFirst() }
        scheduled.append(id)
        return (epoch, scheduled.count == 1 ? [.started(id: id)] : [])
    }

    /// The player finished playing back the buffer for `id` (tagged with the epoch it was scheduled in).
    public mutating func playedBack(_ id: String, epoch e: Int) -> [RouteEvent] {
        guard e == epoch, let i = scheduled.firstIndex(of: id) else { return [] }
        // Buffers play strictly in order; anything before `id` must also be done.
        let done = Array(scheduled[...i])
        scheduled.removeFirst(i + 1)
        var ev = done.map { RouteEvent.finished(id: $0) }
        if let next = scheduled.first { ev.append(.started(id: next)) }
        return ev
    }

    /// Cut everything (user stop/pause, session revoked). Late completions from before are ignored.
    public mutating func stopAll(reason: String) -> [RouteEvent] {
        epoch += 1
        let ev = scheduled.map { RouteEvent.interrupted(id: $0, reason: reason) }
        scheduled.removeAll()
        return ev
    }

    /// Device gone / engine reset: interrupt and refuse new work until `setAvailable(true)`.
    public mutating func setAvailable(_ ok: Bool, reason: String = "") -> [RouteEvent] {
        available = ok
        unavailableReason = reason.isEmpty ? "output device unavailable" : reason
        return ok ? [] : stopAll(reason: unavailableReason)
    }
}
