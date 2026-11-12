# TikTok-optimised Shorts

These are re-edited vertical Shorts built to pass TikTok's first test batch. There are three per episode, each built on a different surprising fact. The classic Shorts in `docs/episodeN/shorts/` and the long episodes are unchanged.

```
shorts-tiktok/<episode-id>/shorts.yaml      the spec (hook, scenes, captions, titles, question)
shorts-tiktok/<episode-id>/<n>-<slug>.mp4   1080x1920, 30 fps, H.264 + AAC, 15–25 s
shorts-tiktok/<episode-id>/<n>-<slug>.txt   on-screen hook, TikTok caption, YouTube Shorts title, end question
shorts-tiktok/<episode-id>/<n>-<slug>.en.srt  captions (they are also burned in)
docs/shorts-tiktok.png                      contact sheet: the first frame of every Short
```

Build and check:

```bash
node pipeline/tiktok.mjs                         # check, render, contact sheet, verify (all episodes)
node pipeline/tiktok.mjs ep03-sleep-like-a-dolphin --n 2 --only check
node pipeline/tiktok.mjs --only strips [--debug-boxes]   # QA strips in out/tiktok-strips/
```

## How each rule is enforced

| Rule | How |
|---|---|
| **Hook in the first second** | The first scene opens directly on the claim. The hook text (max 6 words, checked) is on screen from frame 0, the first word is spoken within 0.3 s (checked in the timeline and in the final audio), and Bix reacts from frame 0. There's no intro or title card. |
| **15–25 s, one idea** | Each spec builds only the scenes it needs. Length is checked (15 ≤ length < 25 s) before rendering and again on the final file. |
| **Loop** | The last scene must reuse the first scene's set-up (checked), so the last frame matches the first. The zoom eases back to 1 in the last 0.45 s. The last line runs into the opening sentence (e.g. "…That's why, every single night," → "Dolphins sleep with one eye open."). |
| **End question, no outro** | The question replaces the hook banner for the last 2 s. There's no CTA scene, SUBSCRIBE screen or end card (checked). |
| **Visual change ≤ 1.5 s** | Hard cuts between scenes, snap zooms on each new sentence, and extra beats wherever a stretch would run longer than 1.2 s without a cut, caption page, text pop or Bix reaction. The longest gap is checked (≤ 1.5 s). |
| **Captions** | Burned in at 84 px, white on a dark backing pill, at most 2 lines, centred at x 480 inside the safe zone and clear of the bottom and right-hand app UI. |
| **Framing** | The whole Short (not just the first 3 s) is checked: Bix is whole inside the safe zone, and key objects are never cut by the frame edge. |
| **Sound** | Same channel voice, tighter pauses, music at gain 0.12 (long episodes: 0.2) with ducking under the voice, loudness normalised to −14 LUFS. |
| **Facts** | Every line reuses verified wording and numbers from the episode scripts and their fact lists. Episode 5's fact list is still awaiting review, so check it before publishing those three Shorts. |
