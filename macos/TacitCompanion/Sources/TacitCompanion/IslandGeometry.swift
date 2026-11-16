import AppKit

/// Geometry adapted from NotchDrop Ext+NSScreen.swift (MIT), revision e70b3d7.
/// Copyright (c) 2024 Lakr Aream. Full license in THIRD_PARTY_NOTICES.md.
/// All coordinates remain in AppKit's global (bottom-left) coordinate system.
struct IslandGeometry: Equatable {
    let screenFrame: CGRect
    let cutoutWidth: CGFloat
    let cutoutHeight: CGFloat
    let hasNotch: Bool

    init(frame: CGRect, safeTop: CGFloat, leftArea: CGRect?, rightArea: CGRect?) {
        screenFrame = frame
        let gap = (rightArea?.minX ?? 0) - (leftArea?.maxX ?? 0)
        hasNotch = safeTop > 0 && gap > 0 && gap < frame.width
        cutoutWidth = hasNotch ? gap : 0
        cutoutHeight = hasNotch ? safeTop : 0
    }

    init(screen: NSScreen) {
        self.init(frame: screen.frame, safeTop: screen.safeAreaInsets.top,
                  leftArea: screen.auxiliaryTopLeftArea, rightArea: screen.auxiliaryTopRightArea)
    }

    var compactSize: CGSize {
        CGSize(width: hasNotch ? cutoutWidth + 76 : 116, height: hasNotch ? cutoutHeight + 3 : 26)
    }
    var expandedSize: CGSize { CGSize(width: min(460, screenFrame.width - 32), height: min(350, screenFrame.height - 70)) }
    var topInset: CGFloat { hasNotch ? 0 : 6 }
    func frame(size: CGSize) -> CGRect {
        CGRect(x: screenFrame.midX - size.width / 2, y: screenFrame.maxY - topInset - size.height,
               width: size.width, height: size.height)
    }
}
