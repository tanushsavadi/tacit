# TACIT judge recovery card

**First: mute the Mac's Meet mic → Stop everything (⌃⇧⌘.) → preserve the draft.** If native freezes, use the browser workspace's **Stop session**. A disconnected app cannot confirm Stop. Ask what the listener heard before resending.

| Symptom | Recovery |
|---|---|
| Camera denied / busy | Stop preview. Allow the actual browser in macOS Privacy & Security → Camera and localhost site permissions. Keep workspace visible in its own window; Meet camera off. Close deliberate competing camera apps. **Retry Live preview**. Typed speech remains the fallback. |
| Recognition unavailable | Use your typed words/phrases. Passive preflight; allow supervised recovery. Persistent failure: idle restart below. No model changes. |
| Old / expired review | Mouth again; pick only current words. Never reuse an old token or reclassify recognition as typed speech. Previous correction is reference only. |
| Meet hears nothing | Microphone **BlackHole 16ch**; speakers physical/headphones. Unmute Mac Meet. Second ordinary participant's mic muted; listener repeats exact words. A local render/meter is insufficient. |
| Wrong virtual device | Mute/Stop first. Read-only inventory below. Correct Meet's mic; if server device is wrong, idle-only restart with the measured UID below. Never select BlackHole as macOS output. |
| Selected voice unavailable | Read My Voice reason. Deliberately choose an available voice and wait for acknowledgment, then approve again. Never silently substitute a personal voice. Show written draft if synthesis fails. |
| Native frozen / disconnected | Mute Meet. Browser Stop if reachable. Keep uncertain speech unsent. After idle, reconnect or quit/relaunch only the production companion once; no `--selftest`. Typed drafts survive reconnect, **not app termination**. |
| Failed demo attempt | Use the idle restart sequence, deliberately re-enable Live/voice and obtain a fresh review. Listener verifies short authored speech and Stop before continuing. No safety-regressing rollback. |

From the **integrated runtime checkout**:

```sh
# Passive / read-only
./scripts/tacit.sh preflight
node docs/demo-preflight-codex.mjs   # use project Node 22; exit 2 = human actions pending
./macos/TacitRoute/.build/release/tacit-route list

# ONLY after camera/Live/output stopped, call muted and runtime idle
./scripts/tacit.sh restart          # start instead if already stopped
# If the server selected the wrong device (UID verified on this Mac):
TACIT_ROUTE_DEVICE_UID=BlackHole16ch_UID ./scripts/tacit.sh restart

# Only when the production companion is absent
node macos/TacitCompanion/tools/open-companion.mjs
./scripts/tacit.sh open             # reopen original camera workspace deliberately
```

**Current QA blockers:** rapid authored Speak/Hold/phrase clicks can queue duplicates; a submitted correction can disappear after uncertain delivery/reconnect. Click once and wait; do not assume correction recovery exists. These precautions do not replace the required fixes.

No `route:check` during recovery: it plays a tone and rewrites calibration. No destructive reset or rollback before review-safety fixes. Commands inspected and passive checks executed; hardware recovery and remote-listener checks remain physical rehearsal tasks. [Full evidence and limits](QA_HANDOFF_CODEX.md).
