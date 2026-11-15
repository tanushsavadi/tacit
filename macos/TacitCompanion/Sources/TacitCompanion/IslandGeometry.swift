import AppKit

/// Geometry adapted from NotchDrop Ext+NSScreen.swift (MIT), revision e70b3d7.
/// Copyright (c) 2024 Lakr Aream. Full license in THIRD_PARTY_NOTICES.md.
/// All coordinates remain in AppKit's global (bottom-left) coordinate system.
struct IslandGeometry: Equatable {
    let screenFrame: CGRect
    let cutoutWidth: CGFloat
    let cutoutHeight: CGFloat
    let hasNotch: Bool
    let menuBarHeight: CGFloat

    init(frame: CGRect, safeTop: CGFloat, leftArea: CGRect?, rightArea: CGRect?, menuBarHeight: CGFloat = 24) {
        screenFrame = frame
        self.menuBarHeight = max(24, menuBarHeight)
        let gap = (rightArea?.minX ?? 0) - (leftArea?.maxX ?? 0)
        hasNotch = safeTop > 0 && gap > 0 && gap < frame.width
        cutoutWidth = hasNotch ? gap : 0
        cutoutHeight = hasNotch ? safeTop : 0
    }

    init(screen: NSScreen) {
        self.init(frame: screen.frame, safeTop: screen.safeAreaInsets.top,
                  leftArea: screen.auxiliaryTopLeftArea, rightArea: screen.auxiliaryTopRightArea, menuBarHeight: screen.frame.maxY - screen.visibleFrame.maxY)
    }

    /// Width of each dark "wing" beside the camera cutout in the compact notch (branding left, status right).
    static let notchWing: CGFloat = 66
    static let discreetNotchWing: CGFloat = 26

    // Notched display: the window is flush with the top of the screen and the compact bar IS the notch band — the
    // hardware cutout sits in the middle, branding and status in the wings beside it. Peek and the workspace drop
    // down from it. Non-notch display: a floating pill below the measured menu bar.
    var compactSize: CGSize { compactSize(discreet: false) }
    func compactSize(discreet: Bool) -> CGSize {
        if hasNotch {
            let wing = discreet ? Self.discreetNotchWing : Self.notchWing
            return CGSize(width: min(cutoutWidth + 2 * wing, max(1, screenFrame.width - 32)), height: cutoutHeight)
        }
        return CGSize(width: min(discreet ? 224 : 264, max(1, screenFrame.width - 32)), height: discreet ? 28 : 38)
    }
    /// Height of the top row that shares the band with the hardware cutout.
    var crownHeight: CGFloat { hasNotch ? cutoutHeight : 38 }
    var peekSize: CGSize { CGSize(width: min(360, max(1, screenFrame.width - 32)), height: min(190, max(1, screenFrame.height - topInset - 24))) }
    var expandedSize: CGSize { CGSize(width: min(460, max(1, screenFrame.width - 32)), height: min(350, max(1, screenFrame.height - topInset - 24))) }
    var topInset: CGFloat { hasNotch ? 0 : menuBarHeight + 6 }
    func frame(size: CGSize) -> CGRect {
        CGRect(x: screenFrame.midX - size.width / 2, y: screenFrame.maxY - topInset - size.height,
               width: size.width, height: size.height)
    }
}
