# Incoming audio capture

`web/flow-capture/` is a real unpacked MV3 extension: activeTab/tabCapture/offscreen, no microphone/video capture, content scripts, caption DOM, externally-connectable channel, Gemini key or external network host. Worker verifies HTTPS `meet.google.com/xxx-xxxx-xxx`; offscreen consumes the user-invoked stream ID, reconnects source to `AudioContext.destination`, and sends 16 kHz mono PCM16LE through an AudioWorklet. Browser resampling is requested through a 16 kHz AudioContext; an unsupported actual rate fails closed. Device change stops capture; it never changes macOS default devices or Meet's BlackHole input.

Important: Chrome tab capture suppresses ordinary playback. The reconnection is implemented, but **a running graph is not proof the user hears it**. Human playback continuity is a release gate. [Chrome API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture/), [official offscreen capture pattern](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture).

Native alternative: unmuted Core Audio process tap/private aggregate or app-filtered SCK; source would be selected application/process, not a Meet tab. Neither alternative was activated or granted system audio permissions in this work. No default device/BlackHole change was made. [Apple taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps), [ScreenCaptureKit](https://developer.apple.com/documentation/ScreenCaptureKit).

## Wire contract

Loopback IPv4 :18892 `/flow`, exact Host, no query tokens, max payload 10,000 bytes. Native: Bearer header; absent Origin. Extension: `chrome-extension://[a-p]{32}` Origin plus random 192-bit one-use code from the native owner, 60-second expiry, current epoch. First packet JSON declares 16,000 Hz, one channel, pcm16le. Server replies `ready {epoch}`.

Every PCM binary packet is exactly 3,208 bytes: little-endian uint32 consent epoch, uint32 sequence starting zero, then 1,600 signed PCM16 samples (100 ms). Wrong epoch/sequence/format stops immediately. Average pacing cap = 32,000 B/s plus one second burst tolerance. Extension stops at >32 KB queued; server disconnects at >128 KB outgoing state backlog. No reconnect or replay. Heartbeat every three seconds, six sockets maximum, one owner, one source, unauthenticated pairing timeout three seconds. No PCM enters the existing JPEG channel.

## Observed evidence

Unpacked extension loaded in a separate Chromium 159 test profile; automated popup setup did not obtain a real activeTab toolbar grant. The laboratory was therefore BLOCKED before capture. It correctly did not demonstrate live Meet capture, playback or PCM source isolation. Actual worklet unit tests exercise stereo averaging, clipping, sample count and byte layout; these are not hardware tests.

## Actual verification procedure

Use consenting, nonsensitive Meet participants and two devices. Start local-only candidate, pair from notch, click the extension on the Meet tab, verify LIVE badge. Other tab plays a distinct sound; it must be absent from captured input. User must still hear Meet. Then check Stop, reload/close, navigation to another meeting, denied permission, browser crash/relaunch, wired/Bluetooth output and switch, incoming/outgoing overlap. Never redirect to system-wide audio or room microphone as fallback. Stop capture if source isolation/playback cannot be verified.
