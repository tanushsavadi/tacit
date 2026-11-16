# Setup and operation

Run `./check.command`, then double-click `start.command`. It checks fixtures and both ports, starts a private unchanged TACIT speech backend on 19890 and the demo Flow adapter on 19892, opens the distinct `edu.hackumass.tacit-flow-demo` native app, and verifies its Flow owner connection. The stable app and services are neither killed nor restarted. No capture process starts. Scenario A loads in manual mode; a question is emitted only by Next.

Dependencies: macOS 14+, full Xcode/Swift, Node with the existing candidate's local dependencies and built route/voice helpers. The supplied app is ad-hoc signed for local development. If Documents access is requested, the human grants it. No camera or microphone permission is needed for the seeded Flow demo. Rebuild: `candidate/macos/TacitCompanion/tools/build-flow.sh`.

The Control Center is for presenters, separate from the normal communication interface. Choose A/B/C, Start, Next. Keyboard: Option-Command-Right advances; Option-Command-S starts; Command-period stops when the demo is focused. Stable global hotkeys are deliberately not registered by this build. Always-visible Stop remains in the notch. Reopen presenter controls through the notch More menu → Demo Control Center. Existing manual speech and My Voice remain ordinary TACIT controls.

Manual advancement is the judging default. Timed playback uses a monotonic clock and fixture-relative timestamps. Pause cancels pending interpretation and revokes voice output but preserves authored drafts. Resume continues events; speech needs deliberate re-enabling. Restart clears the scenario and begins it again, ready for Next. Reset clears turns, drafts, outgoing-message reference, timers and old inference. Switching scenario does the same. Repeated Start is idempotent; double Next with the same expected step does not skip an event. Clear context preserves authored drafts as old source snapshots. Disable simulated context clears the demo session and leaves normal typed speech available.

## A — changing question

1. Start A → Next. The real notch shows the full Thursday-at-four question, with a SIMULATED source badge.
2. Respond → type “Thursday at four works for me.” User text is not supplied by the fixture.
3. Next. Wait for Gemini's bounded live interpretation, or the labelled deterministic fallback. Inspect evidence if desired. The context card shows Four → Five. The draft remains exact.
4. Keep, Edit, Review source evidence or Dismiss are deliberate choices. Edit the actual field to “Five works better for me.”
5. My Voice if needed → Enable voice → Speak. Exact user wording follows the existing generation/voice/authorization/deduplication guards. Stop cuts pending/playing output.

## B — don't lose my turn

1. Select B → Start → Next → Respond. Type “I think we should wait until testing is done.”
2. Next adds the budget question. The original answer remains bound to the launch question.
3. Keep writing, or Save & view new question. Use Resume on the saved draft to return. “Your answer is saved” appears with the original question. Nothing is rewritten or spoken.
4. Recover my turn → Bring this back inserts a separate deterministic template for explicit editing in Type a message. It preserves the original response and still requires Speak. No Gemini advantage is claimed for this template.

## C — correct or clarify

1. Select C → Start → Next → Respond. Type “I can send the report on Monday.” Enable voice and Speak.
2. Only after that message actually reaches rendered state does Correct last message become available. With audio disabled, this action remains unavailable; there is no invented log entry.
3. Expand Correct last message → type “Tuesday instead.” → Review correction.
4. The deterministic day-replacement template offers “Sorry, I meant Tuesday, not Monday.” Review or edit the full wording, then Speak correction.
5. The template is used only when exactly one weekday occurs in each input. Ambiguous corrections retain the user's supplied text in a generic editable correction. No generated meaning or automatic approval.

## Mouse and keyboard

Focus no longer implicitly pins the notch. Leaving the expanded interface retracts after 300 ms; returning restores the same workspace after 140 ms. Drafts, selected question and correction review state stay in their model. Explicit Keep island open still pins; explicit Collapse returns to the small Peek interaction. Hover never takes keyboard focus or approves speech. The existing frame spring retargets smoothly and respects Reduce Motion. Click an editor to resume typing.

## Meet checklist — only for remote audio

A bot does not join. Demo context is seeded. The earlier capture candidate can separately capture a Chrome tab with an explicit grant, but that path is not used or claimed here.

- Arrange a consenting listener on a second device, both using headphones.
- Stop the demo. Close the stable audio runtime yourself; the launcher never stops it.
- Start `./start.command --with-output`. No competing router may exist.
- Meet Settings → Audio → Microphone = BlackHole 16ch; unmute. Output = your normal headphones. Do not change macOS global input/output defaults.
- Select intended voice, explicitly enable output, press Speak on a harmless test. Listener repeats what they heard. Record PASS only after this testimony; rendered alone is insufficient.
- Approve a longer harmless message and press Stop during playback. Listener confirms cutoff and no replay.
- Disclose: “For this demonstration, meeting context is simulated. The native response workflow and outgoing voice are real.”

## Recovery / exit

| Failure | Action |
|---|---|
| Gemini timeout/network/429 | Wait at most five seconds; deterministic fallback is labelled. Keep editing and speaking manually. Do not hammer Analyse or restart to bypass quotas. |
| Wrong/ambiguous interpretation | Inspect exact sources; Keep/Dismiss; use local analysis or manual text. Source validation is not semantic certainty. |
| Too early/late or double advancement | Start is repeat-safe; Next is step-guarded. Reset/restart from the presenter without restarting the backend. |
| Saved answer not visible | Resume the saved draft; inspect original source. No timeout discards it. |
| Output unavailable | In local mode verify a physical output existed at startup. In Meet mode check exclusive router, selected mic, unmute and chosen voice. Nothing is retried automatically. |
| Draft/speech mistaken | Edit or Stop. Model output cannot send speech. |
| Native/server disconnect | Output is revoked; Flow context clears. Kept local text can be recovered explicitly in Type a message. Reconnect through Check connection. No replay. |
| Malformed fixture | Setup refuses it before starting anything. Restore versioned scenarios.json; rerun check. |
| Occupied port / competing instance | Setup refuses; close only the relevant demo yourself. Never kill a production PID. |
| Want to stop events but retain draft | Pause. Voice is revoked; Resume events, then re-enable voice deliberately. |
| Want a clean session | Reset in presenter. Stop everything cancels output and clears the demo. |
| App window closed | Reopen the separately named app. Notch More → Demo Control Center. |
| Want to exit | stop.command terminates only verified demo-owned processes and clears RAM state. Stable app remains recoverable in place. |

Rollback: stop.command, confirm 19890/19892 are closed and the demo-owned route helper is gone. Stable bundle, stable server, recognition sidecar and audio defaults were not replaced, so no Git checkout or stable rebuild is needed. Any later restart of the stable installation is the user's explicit choice. Never run the older candidate's destructive stable rollback commands just to exit this package.
