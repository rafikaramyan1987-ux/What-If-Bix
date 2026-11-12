# MarMila — the French channel

Same factory, same Bix, French everything: narration, on-screen text, captions (`.fr.srt`), metadata and branding.

| | |
|---|---|
| Episodes | `episodes/fr01-…` to `fr04-…` (`language: fr`, `channel: marmila`) |
| Voice | Piper `fr_FR-siwis-medium`, see [VOICE.md](VOICE.md) |
| Branding | intro "ET SI… MARMILA", end screen "Abonne-toi à MarMila" with an animated **ABONNE-TOI** button and bell, banner (`node pipeline/channel.mjs --lang fr`) |
| Long video | 4–6 min, 1920×1080, −14 LUFS, one every 3 days |
| Shorts | 6 per episode (`tiktokShorts:`), 2 per day, TikTok rules (below) |
| Posting pack | `posting/marmila-2weeks/` (`node pipeline/posting.mjs`) |

## The four episodes

| # | Title | Structure | Shorts (cut / standalone) |
|---|---|---|---|
| 1 | Et si la Lune disparaissait demain ? | list of changes, from the visible to the hidden; twist: the Moon is already leaving | tides ×3, nights ×100, 3.8 cm a year / eclipse ×400, 18-hour days, Earth's waltz |
| 2 | Et si le génie le plus intelligent du monde devenait méchant ? | the fictional Docteur Méga's plans, each stopped by a real rule of the world | 9-month toaster, 10 million geniuses, two-key rule / 20-watt brain, 400,000 for Apollo, paid hackers |
| 3 | Et si un génie s'évadait de la prison la plus sûre du monde ? | sequel: the cell is empty; how prisons and searches work (the "how" of the escape is never told) | empty cell, dog's nose, thermal camera / Alcatraz numbers, 23 h a day, red notice |
| 4 | Et si tu tombais dans un trou qui traverse la Terre ? | an ideal fall, then 4 "in reality" floors (air, heat, pressure, rotation), the real record | 38 minutes, core as hot as the Sun, Kola 12 km / human yo-yo, antipodes, stuck in the middle |

Rules followed: no real living person as a villain (Docteur Méga is invented and says so on screen), no gore, no
method for any crime or weapon, every number sourced in the episode's `sources:` (printed in the description).
Episode 4 replaces "the Earth stops spinning for one second": What If Bix episode 1 already tells that story, and
no video appears on two channels.

## Shorts (TikTok rules, checked by `validate.mjs` and `build.mjs`)

- The strongest line is the first one, the hook title is on frame 0 (no intro), captions are on screen from frame 0
  in the safe zone (x 60–900, y 140–1450).
- 15–25 s (estimate checked with a 1 s margin before rendering; real length checked on the timeline and on the files).
- The last scene reuses the first scene's set-up and the last line runs into the first one (loop).
- A question replaces the hook banner for the last 2 s (it is also the pinned comment).
- 6 per episode, all different: at least 2 cut from the episode (`kind: cut`), at least 2 standalone mini-stories
  (`kind: standalone`), no two sharing more than 35 % of their narration, distinct hooks, titles and questions.

## Render and pack (GitHub Actions → Render episode)

| Input | Value |
|---|---|
| Episode script(s) | `marmila` (the four episodes, one job each) |
| What to build | `long,shorts,thumb,meta` |
| posting_pack / commit_pack | tick both to rebuild `posting/marmila-2weeks/` and commit it to the branch |

Locally: `node pipeline/build.mjs episodes/fr01-lune-disparait.yaml` then `node pipeline/posting.mjs --renders out`.
