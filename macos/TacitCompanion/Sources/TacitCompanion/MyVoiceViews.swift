import SwiftUI

/// My Voice: choose how you are heard by listening. Every voice, control and range shown here comes from the server's
/// registry (`voice_status`); nothing is hardcoded. Previews play privately on this Mac and never reach the call.
struct MyVoicePicker: View {
    @ObservedObject var client: TacitClient
    @State private var language: String?
    @State private var showMore = false
    @State private var sample = 0
    @State private var rate: Double = 0.5
    @State private var pitch: Double = 1
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if client.conn != .connected {
                unavailable("Reconnect to choose your voice.", detail: "Your saved voice stays on this Mac.")
            } else if let state = client.myVoice {
                header(state)
                if state.engineState != "ready" {
                    Text(state.engineState == "starting" ? "Loading your Mac's voices…"
                         : "Only the macOS default voice is available: \(state.engineReason ?? "voice engine not running").")
                        .font(.system(size: 11)).foregroundStyle(.orange).lineLimit(2)
                }
                languageBar(state)
                list(state)
                adjustments(state)
                footer(state)
            } else {
                unavailable("Voice choices not reported yet.", detail: "This TACIT server does not offer My Voice, or it is still starting.")
            }
        }
        .onAppear { syncSliders() }
        .onChange(of: client.myVoice?.revision) { _, _ in syncSliders() }
    }

    // MARK: sections

    private func header(_ s: TacitClient.VoiceState) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text("My Voice").font(.system(size: 13, weight: .semibold))
                Spacer()
                if s.source != "default" {
                    Button("Use default") { client.resetVoice() }.font(.system(size: 11)).buttonStyle(.plain).foregroundStyle(.mint)
                        .help("Go back to the macOS default voice")
                }
                Image(systemName: "info.circle").font(.system(size: 10)).foregroundStyle(.white.opacity(0.6))
                    .help("Apple Personal Voice can't be routed into calls: \(s.personalVoiceReason)")
                    .accessibilityLabel("About Apple Personal Voice: \(s.personalVoiceReason)")
                Button { client.refreshVoices() } label: { Image(systemName: "arrow.clockwise").font(.system(size: 10)) }
                    .buttonStyle(.plain).foregroundStyle(.white.opacity(0.75)).accessibilityLabel("Re-read installed voices")
                    .help("Re-read installed voices (after adding one in System Settings)")
            }
            if let fallback = s.fallback {
                Text(fallback).font(.system(size: 10)).foregroundStyle(.orange).lineLimit(2)
            } else {
                Text("Speaking as \(s.effective?.name ?? s.effectiveLabel)\(s.effective.map { " · \($0.locale)" } ?? "")\(s.persisted ? " · saved on this Mac" : "")")
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.72)).lineLimit(1)
                    .accessibilityIdentifier("my-voice-current")
            }
        }
    }

    private func languages(_ s: TacitClient.VoiceState) -> [String] {
        var counts: [String: Int] = [:]
        for v in s.voices where v.offered && v.provider == "apple-speech" { counts[v.language, default: 0] += 1 }
        return counts.keys.sorted { (counts[$0]!, $1) > (counts[$1]!, $0) }
    }
    private func currentLanguage(_ s: TacitClient.VoiceState) -> String {
        language ?? (s.effective?.language).flatMap { $0 == "und" ? nil : $0 } ?? languages(s).first ?? "en"
    }

    private func languageBar(_ s: TacitClient.VoiceState) -> some View {
        HStack(spacing: 6) {
            Menu {
                ForEach(languages(s), id: \.self) { code in
                    Button(Self.languageName(code)) { language = code }
                }
            } label: {
                Label(Self.languageName(currentLanguage(s)), systemImage: "globe").font(.system(size: 11))
            }.menuStyle(.borderlessButton).fixedSize().accessibilityLabel("Voice language")
            Spacer()
            if !s.samples.isEmpty {
                Menu {
                    ForEach(s.samples.indices, id: \.self) { i in Button(s.samples[i]) { sample = i } }
                } label: { Label("Preview phrase", systemImage: "text.quote").font(.system(size: 11)) }
                    .menuStyle(.borderlessButton).fixedSize().help(s.samples[min(sample, s.samples.count - 1)])
            }
            Toggle("More voices", isOn: $showMore).toggleStyle(.checkbox).font(.system(size: 10))
                .help("Show Apple's novelty and effect voices")
        }
    }

    private func visible(_ s: TacitClient.VoiceState) -> [TacitClient.VoiceOption] {
        let lang = currentLanguage(s)
        // Order: your current voice, your cloned voice, this language's voices (effects last, only on request), macOS default.
        let current = s.voices.filter { $0.id == s.effectiveId }
        let clone = s.voices.filter { $0.kind == "personal-clone" && $0.available && $0.id != s.effectiveId }
        let apple = s.voices.filter { $0.provider == "apple-speech" && $0.language == lang && $0.available && $0.kind != "apple-personal-voice"
            && ($0.novelty ? showMore : true) && $0.id != s.effectiveId }
            .sorted { ($0.novelty ? 1 : 0, $0.name, $0.locale) < ($1.novelty ? 1 : 0, $1.name, $1.locale) }
        let system = s.voices.filter { $0.provider == "macos-say" && $0.available && $0.id != s.effectiveId }
        return current + clone + apple + system
    }

    private func list(_ s: TacitClient.VoiceState) -> some View {
        ScrollView {
            LazyVStack(spacing: 4) {
                ForEach(visible(s)) { v in row(v, s) }
            }
        }.frame(maxHeight: .infinity)
    }

    private func row(_ v: TacitClient.VoiceOption, _ s: TacitClient.VoiceState) -> some View {
        let selected = v.id == s.effectiveId
        let previewing = client.voicePreview?.voiceId == v.id && client.previewActive
        return HStack(spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(v.name).font(.system(size: 12, weight: selected ? .semibold : .regular)).lineLimit(1)
                let tags = [v.locale == "und" ? nil : v.locale, v.quality.flatMap { $0 == "default" ? nil : $0 },
                            v.local ? nil : "network", v.novelty ? "effect" : nil].compactMap { $0 }.joined(separator: " · ")
                if !tags.isEmpty { Text(tags).font(.system(size: 9)).foregroundStyle(.white.opacity(0.6)).lineLimit(1) }
            }
            Spacer(minLength: 4)
            Button {
                if previewing { client.stopVoicePreview() }
                else { client.previewVoice(v.id, rate: selected ? currentRate(v) : nil, pitch: selected ? currentPitch(v) : nil, sample: sample) }
            } label: {
                Image(systemName: previewing ? "stop.circle" : "play.circle").font(.system(size: 15)).frame(width: 26, height: 26)
            }.buttonStyle(CommunicationButtonStyle()).accessibilityLabel(previewing ? "Stop preview of \(v.name)" : "Listen privately to \(v.name)")
                .help(v.local ? "Listen privately on this Mac · never sent to your call" : "Listen privately · uses the network")
            if selected {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.mint).frame(width: 46).accessibilityLabel("\(v.name) is your voice")
            } else {
                Button("Use") { client.selectVoice(v.id) }.font(.system(size: 11, weight: .semibold))
                    .buttonStyle(CommunicationButtonStyle()).frame(width: 46, height: 22)
                    .background(.white.opacity(0.1), in: Capsule()).accessibilityLabel("Use \(v.name) as your voice")
            }
        }
        .padding(.horizontal, 9).padding(.vertical, 1)
        .background(.white.opacity(selected ? (contrast == .increased ? 0.2 : 0.12) : 0.05), in: RoundedRectangle(cornerRadius: 9))
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder private func adjustments(_ s: TacitClient.VoiceState) -> some View {
        if let v = s.effective, s.fallback == nil, v.rate != nil || v.pitch != nil {
            HStack(spacing: 10) {
                if let r = v.rate {
                    slider("Speed", value: $rate, control: r) { client.selectVoice(v.id, rate: snapped(rate, r), pitch: v.pitch.map { snapped(pitch, $0) }) }
                }
                if let p = v.pitch {
                    slider("Pitch", value: $pitch, control: p) { client.selectVoice(v.id, rate: v.rate.map { snapped(rate, $0) }, pitch: snapped(pitch, p)) }
                }
            }
        }
    }
    private func slider(_ title: String, value: Binding<Double>, control: TacitClient.VoiceControl, commit: @escaping () -> Void) -> some View {
        HStack(spacing: 4) {
            Text(title).font(.system(size: 10)).foregroundStyle(.white.opacity(0.72))
            Slider(value: value, in: control.min...control.max, step: control.step) { editing in if !editing { commit() } }
                .controlSize(.mini).accessibilityLabel("\(title) of your voice")
        }
    }

    private func footer(_ s: TacitClient.VoiceState) -> some View {
        Text(previewLine ?? client.voiceNotice ?? s.persistError ?? "Choose by listening. Your words never change — only how they sound.")
            .font(.system(size: 10)).foregroundStyle(previewIsProblem || client.voiceNotice != nil ? .orange : .white.opacity(0.7)).lineLimit(2)
            .accessibilityIdentifier("my-voice-status")
    }
    private var previewLine: String? {
        guard let p = client.voicePreview else { return nil }
        switch p.state {
        case "synthesizing": return "Preparing preview…"
        case "playing": return "Playing privately on \(p.output ?? "this Mac") · not sent to your call"
        case "refused", "failed": return p.reason ?? "Preview unavailable."
        default: return nil
        }
    }
    private var previewIsProblem: Bool { ["refused", "failed"].contains(client.voicePreview?.state ?? "") }

    private func unavailable(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("My Voice").font(.system(size: 13, weight: .semibold))
            Spacer(minLength: 0)
            Text(title).font(.system(size: 19, weight: .medium))
            Text(detail).font(.system(size: 11)).foregroundStyle(.white.opacity(0.72))
            Spacer(minLength: 0)
        }
    }

    // MARK: helpers

    private func currentRate(_ v: TacitClient.VoiceOption) -> Double? { v.rate.map { snapped(rate, $0) } }
    private func currentPitch(_ v: TacitClient.VoiceOption) -> Double? { v.pitch.map { snapped(pitch, $0) } }
    private func snapped(_ x: Double, _ c: TacitClient.VoiceControl) -> Double {
        let n = ((x - c.min) / c.step).rounded()
        let v = ((c.min + n * c.step) * 1000).rounded() / 1000
        return min(c.max, max(c.min, v))
    }
    private func syncSliders() {
        guard let s = client.myVoice, let v = s.effective else { return }
        rate = s.selectedRate ?? v.rate?.defaultValue ?? 0.5
        pitch = s.selectedPitch ?? v.pitch?.defaultValue ?? 1
    }
    static func languageName(_ code: String) -> String {
        Locale.current.localizedString(forLanguageCode: code) ?? code
    }
}
