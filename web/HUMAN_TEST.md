# Human test · when you are back at the machine

This is the web setup surface beside a normal call. It is not the everyday product. The Mac companion and virtual microphone are the call path. Do not store faces or the other person’s audio. Write results in your own notes.

Open both sides with `cd web && npm run open:local`. The workspace is http://localhost:5173/ and the caller page is http://localhost:5173/#caller. The launcher supplies the private link. If the page says the server is unavailable, the frontend is not proxied to 127.0.0.1:8790.

Before you start, read Demonstration readiness:

- **Ready** means that item is actually true right now.
- **Needs setup** means you still have to do something.
- **Experimental** means we do not have a measurement, including silent-speech reliability.
- **Unavailable** means it cannot be used. Automatic transmission stays here.
- **Unknown** means the backend did not report it. Remote audibility stays here until a person says what they heard.

BlackHole showing as ready on this Mac, with no calling app reading it, is **Needs setup**. It is not a FaceTime connection.

## Test A · Silent recognition

1. In the workspace, choose Start Live preview and allow the camera. Confirm the readiness row Camera becomes Ready and one face is tracked.
2. Leave the call apps closed. Mouth a short phrase you have not practiced on a recording, silently, then pause your mouth.
3. Read the words exactly as shown. If the line stays “Your words will appear here” or says the model abstained, write that down. Do not correct the text.
4. Mouth a second phrase without touching the page.
5. Note the time you finished mouthing and when the words appeared, if you can. Presenter shows the server’s recognition milliseconds. That number is model time, not your whole wait.
6. Label the result **silent, live camera**. Do not mix it with the voiced actor clip used by `npm run test:live`.

## Test B · Speech delivery

1. In FaceTime, set the microphone to the device named in Virtual microphone. Readiness should change from Needs setup to Ready only after FaceTime, or another app, is actually reading it.
2. Open Typed speech. Enable typed voice output. Type a short sentence you compose yourself. Send it. Do not paste recognized words.
3. Ask the other person what they heard and whether it was late. Write their words and yes or no. The page will not decide this. It can only say audio was written on this Mac.

## Test C · Recovery

1. While a phrase is on screen, choose Pause. The words clear and the page says nothing is being transmitted.
2. Choose Resume Live preview, then Stop session while the camera is on. Capture stops.
3. Quit and reopen the workspace tab. Old words should not return, and Live should not start by itself.
4. Confirm the other person heard nothing from those steps.
