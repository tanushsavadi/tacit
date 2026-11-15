import Carbon.HIToolbox
import Foundation

/// System-wide shortcut via Carbon RegisterEventHotKey: works from any app and needs no Accessibility permission.
final class HotKey {
    private var ref: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private let action: () -> Void
    private let eventID: UInt32
    private(set) var registered = false

    init(keyCode: UInt32, modifiers: UInt32, action: @escaping () -> Void) {
        self.action = action
        self.eventID = keyCode + 1
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, event, ctx in
            guard let ctx else { return noErr }
            let hk = Unmanaged<HotKey>.fromOpaque(ctx).takeUnretainedValue()
            var eventID = EventHotKeyID()
            guard let event, GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &eventID) == noErr,
                HotKey.matches(signature: eventID.signature, id: eventID.id, expectedID: hk.eventID) else { return OSStatus(eventNotHandledErr) }
            DispatchQueue.main.async { hk.action() }
            return noErr
        }, 1, &spec, me, &handler)
        let id = EventHotKeyID(signature: OSType(0x5441_4354), id: eventID) // 'TACT'
        registered = RegisterEventHotKey(keyCode, modifiers, id, GetApplicationEventTarget(), 0, &ref) == noErr
    }

    static func matches(signature: OSType, id: UInt32, expectedID: UInt32) -> Bool {
        signature == OSType(0x5441_4354) && id == expectedID
    }

    deinit {
        if let ref { UnregisterEventHotKey(ref) }
        if let handler { RemoveEventHandler(handler) }
    }
}
