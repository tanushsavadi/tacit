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

    // The entire interactive window starts BELOW the menu bar / camera cutout.
    // Its narrow neck touches the physical notch without covering adjacent macOS controls.
    var compactSize: CGSize { compactSize(discreet: false) }
    func compactSize(discreet: Bool) -> CGSize {
        CGSize(width: min(discreet ? 224 : 264, max(1, screenFrame.width - 32)), height: discreet ? 28 : 38)
    }
    var peekSize: CGSize { CGSize(width: min(360, max(1, screenFrame.width - 32)), height: min(190, max(1, screenFrame.height - topInset - 24))) }
    var expandedSize: CGSize { CGSize(width: min(460, max(1, screenFrame.width - 32)), height: min(350, max(1, screenFrame.height - topInset - 24))) }
    var topInset: CGFloat { max(hasNotch ? cutoutHeight : 0, menuBarHeight) + (hasNotch ? 0 : 6) }
    func frame(size: CGSize) -> CGRect {
        CGRect(x: screenFrame.midX - size.width / 2, y: screenFrame.maxY - topInset - size.height,
               width: size.width, height: size.height)
    }
}
