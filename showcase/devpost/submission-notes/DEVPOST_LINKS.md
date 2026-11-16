# TACIT — Devpost links

Checked 2026-11-15 ~10:56 UTC. No link below is invented. Anything not verified is marked MISSING.

| Field | Value | Status |
|---|---|---|
| GitHub repository ("Try it out", required by HackUMass) | https://github.com/tanushsavadi/tacit | **PUBLIC** — made public by Claude at the user's explicit request (2026-11-15 ~11:05 UTC). Verified signed out: page HTTP 200; API `visibility: public`. |
| Video demo link (top of the Devpost page) | https://youtu.be/GeV55H-ozqw | **VERIFIED** — supplied by the user. YouTube oEmbed answers (so it is embeddable, not Private), title "tacit", author Tanush Savadi; public page reports `lengthSeconds: 168` = the 2:48 Devpost cut. |
| Project / demo website | — | None. TACIT is a native macOS app; there is no public hosted demo. Leave this blank. |

## Repository visibility — DONE (public since 2026-11-15 ~11:05 UTC); pre-publish notes kept for the record

AGENTS.md forbids making the repo public unless the user authorizes it, the user gave that authorization on 2026-11-15 and Claude made it public at ~11:05 UTC.
What the agent checked at HEAD (`main` @ `c383ae0`):
- No tracked files matched common secret patterns: AWS `AKIA…`, `sk-…`, Google `AIza…`, Slack `xox…`, GitHub `ghp_…`, or private-key headers.
- No tracked `.env`, `secrets.json`, `.mp4`, `.mov`, `.wav` or `.m4a` files.
- Earlier, HANDOFF recorded that the exposed AWS key was **not** found anywhere in Git history (all refs).

Review these before flipping the switch:
1. `docs/HANDOFF.md` and the `docs/qa/` notes are internal. They describe the AWS-key incident, mention a partial key ID
   (`AKIA…GZGD`), and include local paths and process notes. Decide whether to keep them public, or trim them in a
   normal commit first. Old versions stay in history either way.
2. Unpushed branches and worktrees aren't affected. Only what's on GitHub becomes visible, including **all pushed
   branches** (e.g. `feat/brand-orb`, `feat/presence`) and their history.
3. Then: GitHub → Settings → General → Danger Zone → Change visibility → Public
   (or `gh repo edit tanushsavadi/tacit --visibility public --accept-visibility-change-consequences`).
4. Check it in a private browser window: https://github.com/tanushsavadi/tacit should load without signing in.

If you'd rather not expose the dev repo, the alternative is a clean public mirror (fresh repo, one squashed commit of
the current tree minus internal docs). That's a separate decision and the agent hasn't done it.
