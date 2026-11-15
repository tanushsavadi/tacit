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
    @Published private(set) var hovered = false
    @Published private(set) var discreet = false
    var presentation: LivingNotchPresentation { .current(client, live: live) }
    var peeking: Bool { LivingNotchVisibility.peek(expanded: expanded, hovered: hovered,
        review: client.canReviewCurrent, busy: presentation.busy, problem: false, transient: reveal) }
    var targetSize: CGSize { expanded ? geometry.expandedSize : peeking ? geometry.peekSize : geometry.compactSize(discreet: discreet) }
    let communication: CommunicationSession
    /// Native camera + Live for "Start communicating".
    let live: LiveCoordinator
    private let client: TacitClient
    private var panel: IslandPanel?
    private let frameAnimator = IslandFrameAnimator()
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
    private var holdKey: HotKey?
    @Published private(set) var holdKeyRegistered = false
    @Published private(set) var showKeyRegistered = false

    init(client: TacitClient, communication: CommunicationSession? = nil, registerHotKey: Bool = true) {
        self.client = client
        self.live = LiveCoordinator(client: client)
        self.communication = communication ?? CommunicationSession()
        let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main ?? NSScreen.screens[0]
        geometry = IslandGeometry(screen: screen)
        discreet = client.isIsolated ? false : UserDefaults.standard.bool(forKey: "TACITIslandDiscreet")
        enabled = UserDefaults.standard.object(forKey: "TACITIslandEnabled") as? Bool ?? true
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.placeOnDisplay() } }
        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification,
            object: nil, queue: .main) { [weak self] _ in Task { @MainActor in self?.placeOnDisplay() } }
        // Published values are read after storage. These subscriptions only present accepted client state.
        client.$lastHypothesis.dropFirst().receive(on: RunLoop.main).sink { [weak self] hypothesis in
            guard let self else { return }
            self.reviewing = false
            if hypothesis != nil { self.showTransientPeek(seconds: 6) }
            else { self.revealWork?.cancel(); self.reveal = false; self.updateFrame() }
        }.store(in: &subscriptions)
        client.$lastDelivery.dropFirst().receive(on: RunLoop.main).sink { [weak self] delivery in
            guard let self else { return }
            if delivery != nil { self.showTransientPeek(seconds: 4) }
            else { self.updateFrame() }
        }.store(in: &subscriptions)
        client.objectWillChange.merge(with: live.objectWillChange).receive(on: RunLoop.main).sink { [weak self] _ in
            self?.updateFrame()
        }.store(in: &subscriptions)
        if registerHotKey { showKey = HotKey(keyCode: 17, modifiers: UInt32(controlKey | shiftKey | cmdKey)) { [weak self] in
            Task { @MainActor in self?.showForKeyboard() }
        }
        holdKey = HotKey(keyCode: UInt32(kVK_ANSI_H), modifiers: UInt32(controlKey | shiftKey | cmdKey)) { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.communication.holdTurn(using: self.client)
            }
        }
        }
        holdKeyRegistered = holdKey?.registered ?? false
        showKeyRegistered = showKey?.registered ?? false
    }

    func start() {
        let p = IslandPanel(contentRect: geometry.frame(size: geometry.compactSize),
                            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.appearance = NSAppearance(named: .darkAqua)
        p.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        p.isOpaque = false; p.backgroundColor = .clear; p.hasShadow = true
        p.hidesOnDeactivate = false; p.isReleasedWhenClosed = false
        p.isMovable = false; p.acceptsMouseMovedEvents = true; p.animationBehavior = .none
        p.title = "TACIT conversation island"
        p.onPress = { [weak self] in
            guard let self else { return }
            if [.compose, .customize, .assistance].contains(self.communication.surface) || self.client.reviewDraft.editing {
                self.takeKeyboard()
            }
        } // Only an explicit click in an editor takes the keyboard; hover never does.
        p.onEscape = { [weak self] in
            guard let self else { return }
            if self.communication.escape() == .collapse { self.collapse() }
        }
        let content = IslandHostingView(rootView: IslandView(client: client, island: self))
        content.sizingOptions = [] // The controller alone owns the bounded native window dimensions.
        p.contentView = content
        content.layer?.masksToBounds = false
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
        if value { placeOnDisplay(); panel?.orderFrontRegardless() } else { collapse(); frameAnimator.cancel(); panel?.orderOut(nil) }
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
            // Intentional short dwell reveals a small Peek. Full controls require a click/shortcut.
            let work = DispatchWorkItem { [weak self] in self?.hovered = true; self?.updateFrame() }
            hoverWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.16, execute: work)
        } else if !inside && !pinned && panel?.isKeyWindow != true {
            let work = DispatchWorkItem { [weak self] in self?.collapse() }
            closeWork = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.38, execute: work)
        }
    }

    private func showTransientPeek(seconds: Double) {
        revealWork?.cancel(); reveal = true
        let work = DispatchWorkItem { [weak self] in self?.reveal = false; self?.updateFrame() }
        revealWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
        updateFrame()
    }

    func setDiscreet(_ value: Bool) {
        discreet = value
        if !client.isIsolated { UserDefaults.standard.set(value, forKey: "TACITIslandDiscreet") }
        updateFrame()
    }

    func beginReview() { reviewing = true; communication.surface = .conversation; expand() }
    func showCommunication(_ surface: CommunicationSession.Surface) {
        communication.surface = surface; reviewing = false; expand()
        if surface == .compose || surface == .customize || surface == .assistance { takeKeyboard() }
    }
    func focusEditor() { pinned = true; takeKeyboard() }
    func expand() { closeWork?.cancel(); expanded = true; updateFrame() }
    func showForKeyboard() { if !enabled { setEnabled(true) }; expand(); takeKeyboard() }
    func togglePin() { pinned.toggle(); if pinned { expand() } }
    private func takeKeyboard() { expand(); panel?.keyboardEnabled = true; panel?.makeKey() }
    func collapse() {
        hoverWork?.cancel(); closeWork?.cancel(); pinned = false; expanded = false; reviewing = false; hovered = false
        if let panel, panel.isKeyWindow {
            panel.keyboardEnabled = false; panel.orderOut(nil)
            if enabled { panel.orderFrontRegardless() }
        }
        panel?.keyboardEnabled = false
        updateFrame()
    }

    func showUtility(_ surface: Utility) {
        if surface == .typed { showCommunication(.compose); return }
        if surface == .review { beginReview(); focusEditor(); return }
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

    func focusForOfflineInspection() {
        guard client.isIsolated else { return }
        panel?.keyboardEnabled = true; panel?.makeKey()
    }

    var renderedSize: CGSize? { panel?.frame.size }
    var displayMaximumFPS: Int { panel?.screen?.maximumFramesPerSecond ?? 60 }

    /// Snapshot only this app's rendered view; never captures desktop pixels or another application.
    func saveRenderedIsland(to path: String) throws {
        guard let view = panel?.contentView else { return }
        view.layoutSubtreeIfNeeded()
        view.needsDisplay = true
        view.display()
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        guard let png = bitmap.representation(using: .png, properties: [:]) else { return }
        try png.write(to: URL(fileURLWithPath: path))
    }

    private func updateFrame(animated: Bool = true) {
        let size = targetSize
        guard let panel else { return }
        let target = geometry.frame(size: size)
        // Always retarget, even when the current frame equals the new destination: an earlier
        // expansion may still be in flight. The animator deduplicates repeated destinations.
        frameAnimator.setFrame(target, on: panel, animated: animated && enabled
            && !(client.isIsolated && CommandLine.arguments.contains("--lab-reduce-motion")))
    }
}

/// First-click controls work without activating the app or taking key status on hover.
private final class IslandHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
