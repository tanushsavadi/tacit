import AppKit
import Carbon.HIToolbox
import Combine
import SwiftUI

/// Panel configuration and inactive-app edit dispatch adapted from Cyclop's NotchPanel.swift (MIT),
/// revision 8d1b9b2, Copyright (c) 2026 akalikbergenov. See companion THIRD_PARTY_NOTICES.md.
final class IslandPanel: NSPanel {
    var keyboardEnabled = false
    var onPress: (() -> Void)?
    var onEscape: (() -> Void)?
    override var canBecomeKey: Bool { keyboardEnabled }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .leftMouseDown { onPress?() }
        if event.type == .keyDown {
            if event.keyCode == 53 { onEscape?(); return }
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            if flags.subtracting(.shift) == .command {
                let actions: [UInt16: Selector] = [0: #selector(NSText.selectAll(_:)), 7: #selector(NSText.cut(_:)),
                    8: #selector(NSText.copy(_:)), 9: #selector(NSText.paste(_:)),
                    6: flags.contains(.shift) ? Selector(("redo:")) : Selector(("undo:"))]
                if let action = actions[event.keyCode], firstResponder?.tryToPerform(action, with: self) == true { return }
            }
        }
        super.sendEvent(event)
    }
}

@MainActor
final class IslandController: ObservableObject {
    @Published private(set) var expanded = false
    @Published private(set) var reviewing = false
    @Published private(set) var pinned = false
    @Published private(set) var enabled = true
    @Published private(set) var geometry: IslandGeometry
    @Published private(set) var displayName = ""
    @Published private(set) var reveal = false
    private let client: TacitClient
    private var panel: IslandPanel?
    private var utilityPanel: IslandPanel?
    enum Utility { case typed, diagnostics, transcript, review }
    private var subscriptions = Set<AnyCancellable>()
    private var hoverWork: DispatchWorkItem?
    private var closeWork: DispatchWorkItem?
    private var revealWork: DispatchWorkItem?
    private var screenObserver: NSObjectProtocol?
    private var wakeObserver: NSObjectProtocol?
    private var resignObserver: NSObjectProtocol?
    private var displayID: UInt32?
    private var showKey: HotKey?
    @Published private(set) var showKeyRegistered = false

    init(client: TacitClient) {
        self.client = client
        let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main ?? NSScreen.screens[0]
        geometry = IslandGeometry(screen: screen)
        enabled = UserDefaults.standard.object(forKey: "TACITIslandEnabled") as? Bool ?? true
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.placeOnDisplay() } }
        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification,
            object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.placeOnDisplay() } }
        client.$lastHypothesis.dropFirst().sink { [weak self] hypothesis in
            guard let self else { return }
            self.reviewing = false
            self.revealWork?.cancel()
            self.reveal = hypothesis != nil
            if hypothesis != nil {
                let work = DispatchWorkItem { [weak self] in
                    self?.reveal = false; self?.updateFrame()
                }
                self.revealWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
            }
            self.updateFrame()
        }.store(in: &subscriptions)
        showKey = HotKey(keyCode: 17, modifiers: UInt32(controlKey | shiftKey | cmdKey)) { [weak self] in
            Task { @MainActor in self?.showForKeyboard() }
        }
        showKeyRegistered = showKey?.registered ?? false
    }

    func start() {
        let p = IslandPanel(contentRect: geometry.frame(size: geometry.compactSize),
                            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.appearance = NSAppearance(named: .darkAqua)
        p.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        p.isOpaque = false; p.backgroundColor = .clear; p.hasShadow = false
        p.hidesOnDeactivate = false; p.isReleasedWhenClosed = false
        p.isMovable = false; p.acceptsMouseMovedEvents = true; p.animationBehavior = .none
        p.title = "TACIT conversation island"
        p.onPress = nil // Hover and ordinary control clicks never take the calling app’s keyboard.
        p.onEscape = { [weak self] in self?.collapse() }
        p.contentView = IslandHostingView(rootView: IslandView(client: client, island: self))
        panel = p
        resignObserver = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification,
            object: p, queue: .main) { [weak self] _ in
                Task { @MainActor in
                    guard let self, self.expanded, !self.pinned else { return }
                    self.hover(false)
                }
            }
        placeOnDisplay()
        if enabled { p.orderFrontRegardless() }
    }

    func setEnabled(_ value: Bool) {
        enabled = value; UserDefaults.standard.set(value, forKey: "TACITIslandEnabled")
        if value { placeOnDisplay(); panel?.orderFrontRegardless() } else { collapse(); panel?.orderOut(nil) }
    }

    func selectDisplay(_ screen: NSScreen) {
        displayID = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
        collapse(); placeOnDisplay()
    }

    private func placeOnDisplay() {
        let selected = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID }
        guard let screen = selected ?? NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main ?? NSScreen.screens.first else { return }
        geometry = IslandGeometry(screen: screen); displayName = screen.localizedName
        updateFrame(animated: false)
    }

    func hover(_ inside: Bool) {
        hoverWork?.cancel(); closeWork?.cancel()
        if inside && !expanded {
            let work = DispatchWorkItem { [weak self] in self?.expand() }
            hoverWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: work)
        } else if !inside && !pinned && panel?.isKeyWindow != true {
            let work = DispatchWorkItem { [weak self] in self?.collapse() }
            closeWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.55, execute: work)
        }
    }

    func beginReview() { reviewing = true; expand() }
    func expand() { closeWork?.cancel(); expanded = true; updateFrame() }
    func showForKeyboard() { if !enabled { setEnabled(true) }; expand(); takeKeyboard() }
    func togglePin() { pinned.toggle(); if pinned { expand() } }
    private func takeKeyboard() { expand(); panel?.keyboardEnabled = true; panel?.makeKey() }
    func collapse() {
        hoverWork?.cancel(); closeWork?.cancel(); pinned = false; expanded = false; reviewing = false
        if let panel, panel.isKeyWindow {
            panel.keyboardEnabled = false; panel.orderOut(nil)
            if enabled { panel.orderFrontRegardless() }
        }
        panel?.keyboardEnabled = false
        updateFrame()
    }

    func showUtility(_ surface: Utility) {
        collapse()
        utilityPanel?.close()
        let size: CGSize
        let title: String
        switch surface {
        case .typed: size = CGSize(width: 440, height: 285); title = "TACIT · Type to speak"
        case .diagnostics: size = CGSize(width: 460, height: 520); title = "TACIT · Settings & diagnostics"
        case .transcript: size = CGSize(width: 440, height: 310); title = "TACIT · Recognized words"
        case .review: size = CGSize(width: 440, height: 285); title = "TACIT · Review"
        }
        let p = IslandPanel(contentRect: CGRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .utilityWindow, .nonactivatingPanel], backing: .buffered, defer: false)
        p.title = title; p.keyboardEnabled = true; p.hidesOnDeactivate = false; p.isReleasedWhenClosed = false
        p.appearance = NSAppearance(named: .darkAqua); p.level = .floating
        p.onEscape = { [weak p] in p?.close() }
        p.contentView = IslandHostingView(rootView: UtilitySurface(client: client, island: self, surface: surface))
        p.center(); utilityPanel = p; p.orderFrontRegardless(); p.makeKey()
    }

    private func updateFrame(animated: Bool = true) {
        let size = expanded ? geometry.expandedSize : CGSize(width: reveal ? min(380, geometry.expandedSize.width) : geometry.compactSize.width,
            height: geometry.compactSize.height + (reveal ? 68 : 0))
        guard let panel else { return }
        let target = geometry.frame(size: size)
        guard panel.frame != target else { return }
        if animated && enabled && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.28
                panel.animator().setFrame(target, display: true)
            }
        } else { panel.setFrame(target, display: true) }
    }
}

/// First-click controls work without activating the app or taking key status on hover.
private final class IslandHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
