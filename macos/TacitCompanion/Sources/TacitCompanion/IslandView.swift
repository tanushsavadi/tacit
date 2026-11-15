import SwiftUI

/// Original TACIT silhouette: shallow shoulders meet the menu-bar edge, rounded lower corners stay soft.
struct IslandSilhouette: Shape {
    func path(in r: CGRect) -> Path {
        let shoulder: CGFloat = 10
        let radius = min(24, r.height / 2)
        var p = Path()
        p.move(to: .zero)
        p.addQuadCurve(to: CGPoint(x: shoulder, y: shoulder), control: CGPoint(x: shoulder, y: 0))
        p.addLine(to: CGPoint(x: shoulder, y: r.height - radius))
        p.addQuadCurve(to: CGPoint(x: shoulder + radius, y: r.height), control: CGPoint(x: shoulder, y: r.height))
        p.addLine(to: CGPoint(x: r.width - shoulder - radius, y: r.height))
        p.addQuadCurve(to: CGPoint(x: r.width - shoulder, y: r.height - radius), control: CGPoint(x: r.width - shoulder, y: r.height))
        p.addLine(to: CGPoint(x: r.width - shoulder, y: shoulder))
        p.addQuadCurve(to: CGPoint(x: r.width, y: 0), control: CGPoint(x: r.width - shoulder, y: 0))
        p.closeSubpath()
        return p
    }
}

struct IslandView: View {
    @ObservedObject var client: TacitClient
    @ObservedObject var island: IslandController
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorSchemeContrast) private var contrast
    private var activity: ActivityPresentation { ActivityPresentation.current(client) }

    var body: some View {
        VStack(spacing: 0) {
            crown
            if island.expanded {
                Group {
                    if island.reviewing {
                        RecognitionReview(client: client, onEdit: { island.showUtility(.review) })
                    } else {
                        ConversationView(client: client, island: island)
                    }
                }
                .padding(.horizontal, 28).padding(.top, 8).padding(.bottom, 22)
                .transition(.opacity)
            } else if island.reveal, let h = client.lastHypothesis {
                Button { island.expand() } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(client.canReviewCurrent ? "Review your words" : "Display only").tracking(0.2)
                            Spacer()
                            Image(systemName: "arrow.down.right")
                        }.font(.system(size: 9, weight: .medium)).foregroundStyle(.mint)
                        Text(h.decision == "shown" ? h.text : "No words shown · \(h.reason ?? "model abstained")")
                            .font(.system(size: 17, weight: .medium)).lineLimit(2).multilineTextAlignment(.leading)
                    }.padding(.horizontal, 28).padding(.top, 4).padding(.bottom, 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }.buttonStyle(.plain).accessibilityLabel("Raw recognition, display only. \(h.text). Open TACIT controls")
                .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(IslandSilhouette().fill(.black))
        .overlay(IslandSilhouette().strokeBorderCompat(.white.opacity(contrast == .increased ? 0.6 : 0.035)))
        .clipShape(IslandSilhouette())
        .contentShape(IslandSilhouette())
        .foregroundStyle(.white).preferredColorScheme(.dark)
        .onHover { island.hover($0) }
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.9), value: island.expanded)
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.9), value: island.reveal)
    }

    private var crown: some View {
        HStack(spacing: 0) {
            Button { island.expanded ? island.collapse() : island.expand() } label: {
                Circle().fill(activity.color).frame(width: 5, height: 5).frame(width: 22, height: 22)
            }.buttonStyle(.plain).accessibilityLabel("\(activity.title). \(island.expanded ? "Collapse" : "Open") TACIT island")
            Spacer(minLength: island.geometry.cutoutWidth)
            if client.live?.state == "active" || client.output?.state == "ready" {
                Button { client.pauseEverything() } label: {
                    Image(systemName: "pause.fill").font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.white.opacity(0.65)).frame(width: 22, height: 22)
                }.buttonStyle(.plain).accessibilityLabel("Pause Live and voice output")
            } else {
                Button { island.expanded ? island.collapse() : island.expand() } label: {
                    Image(systemName: island.expanded ? "chevron.up" : "minus").font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.white.opacity(0.35)).frame(width: 22, height: 22)
                }.buttonStyle(.plain).accessibilityLabel(island.expanded ? "Collapse island" : "Open TACIT")
            }
        }
        .padding(.horizontal, 15)
        .frame(height: island.geometry.compactSize.height)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("TACIT · \(activity.title)")
    }
}

private extension Shape {
    func strokeBorderCompat(_ color: Color) -> some View { stroke(color, lineWidth: 1) }
}
