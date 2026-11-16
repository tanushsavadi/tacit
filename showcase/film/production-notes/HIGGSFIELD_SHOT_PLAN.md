# Higgsfield founder shots — ready-to-run plan (blocked on credits)

Status: **not generated.** Balance 10 credits; free-trial unlimited not available through MCP. Do not top up without the
user's approval. When credits exist:

1. Upload only `face-references/ref1_denim_front.png`, `ref2_white_tee_bright.png`, `ref3_white_tee_bright_b.png`
   (media_upload → PUT → media_confirm). No clips, no datasets, no other people.
2. Generate 2–3 reference stills (image model, image_references = the 3 uploads). Reject any that change facial structure,
   skin tone, glasses, hair. Wardrobe: dark smart-casual overshirt, plain dark tee, tailored dark trousers, minimal shoes.
3. One 5 s motion test (Seedance 2.0, std, 1080p, `generate_audio:false`, start_image = approved still). Inspect frame by frame.
4. Only if the test passes, generate the shots below. Never let the model draw readable UI, logos or text.

| # | Shot | Prompt core | Lands in |
|---|---|---|---|
| 1 | Entrance, 5 s | Same man walks naturally into a modern, believable studio workspace carrying a closed silver laptop; gentle lateral tracking, 35 mm, shallow depth of field, soft daylight, real-time speed | Director's Cut 0:25 |
| 2 | Desk, 5 s | He sits at a light-oak desk and opens the laptop; natural hand motion; warm window light; screen content not visible | Director's Cut 0:30 |
| 3 | Hero, 5 s | Laptop on desk, slow push toward the top-centre camera notch, dark screen, no readable content; ends framed for a match cut | Devpost 0:38 (before the notch reveal) |
| 4 | Intro, 5 s | Medium shot, warm confident posture, subtle hand gesture, mouth mostly closed (narration is voiceover, no lip-sync) | Director's Cut 0:58 |
| 5 | Over-shoulder, 5 s | Over-the-shoulder at the laptop, screen softly out of focus (real UI composited in edit) | Director's Cut 1:10 |
| 6 | Closing, 5 s | Beside the laptop, slow pull-back, negative space on the right for the lockup | all cuts, before end card |

Estimated cost: query `models_explore get seedance_2_0` / the generation quote before submitting; record prompts, job IDs and
credits here. Every generated shot must be labelled "AI-GENERATED · founder likeness" in the film.
