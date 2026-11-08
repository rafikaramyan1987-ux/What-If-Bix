# Episode script format

One YAML file per episode in `episodes/` (Markdown with a ```yaml block also works).
Run `node pipeline/validate.mjs <file>` after every edit: it checks names, `@word` references,
chapters, sources and estimated lengths without rendering.

## Stage and timing basics

- Bix 2.0 stands about 378 px tall at scale 1 (big head ≈ 55% of that); use `bixScale` 0.85–1.0 for most scenes.
- The stage is **1920 × 1080**. `x` grows to the right, `y` grows **down**. The ground line in
  `land`, `lab`, `city`, `night-city` and `bedroom` is at **y = 820**. Bix's position is the point
  between his feet. At scale 1 he is about 330 px tall.
- Shorts are cropped from the same stage (a ~610 px wide vertical window that follows Bix), so
  keep the important action within ~300 px of Bix.
- Captions are drawn at the bottom (y ≈ 985). Keep key art above y ≈ 900.
- **Times**: a number is seconds from the scene start, and `"@word"` means the moment the narrator
  says *word* in this scene's narration. Variants: `"@word#2"` (2nd occurrence), `"@word.end"`,
  `"@word+0.4"`, `"@word-0.2"`, `"@start"`, `"@end"`. Matching ignores case and surrounding
  punctuation (`"@don't"` matches `*don't*.`). Numbers match as written (`"@1,670"`).
- Pauses: sentences get a pause from their punctuation, plus an automatic **beat** (~0.35 s) after a
  sentence with a number, after short punchy sentences (≤ 4 words, usually the joke), and after `!`.
  Scenes start with a 0.5 s breath. Add `[beat]` (0.4 s) or `[beat 0.6]` after any word to hold for a
  laugh; it also splits the sentence there.
- Narration markup: `{shown|spoken}` (captions show *shown*, the voice says *spoken*, e.g.
  `{465 m/s|four hundred sixty-five meters per second}`) and `*word*` (emphasis colour in captions).
  Write numbers the voice must say in words with this markup.
- Each sentence (`.`, `?`, `!`, `...`) becomes one TTS segment. Short punchy sentences = better timing.
- Pace: about **3.5 spoken words per second** while talking (voice 92, lengthScale 1.05), ≈ 2.7
  words/s overall once pauses are included. A long video is 4–6 min including the 2 s intro and the
  20 s end screen (≈ 650–950 narration words; aim for ~800). A Short is 30–55 s (≈ 80–140 words).

## Top level

```yaml
id: ep02-no-sleep-30-days          # lowercase-dashes, also the output folder name
number: 2
title: "What if you never slept for 30 days?"   # YouTube title, ≤ 100 chars
description: |                     # first lines of the YouTube description (chapters/sources/credits are appended)
  ...
tags: [science, what if, ...]      # ≥ 5
character: bix2                    # bix2 = Bix 2.0 "Chibi" (default since episode 2); bix1 = original thin Bix
voice: { provider: piper, model: en-us-libritts-high, speaker: 92, lengthScale: 1.05 }
music: { style: curious, gain: 0.2, duck: 0.55, seed: 7 }   # styles: curious | tense | dreamy; change seed per episode
introAfter: cold-open              # scene id after which the 2 s intro sting plays (default: first scene)
outro:                             # spoken over the 20 s end screen; must be unique per episode
  narration: "..."
  background: { type: space }      # optional
scenes: [...]
shorts: [...]                      # 2–3
thumbnail: {...}
sources: [...]                     # ≥ 3, one per fact group, with URLs
```

## Scenes

```yaml
- id: brakes                       # unique
  chapter: "The stop"              # optional; the first scene MUST have one; ≥ 3 per episode
  transition: whip                 # cut (default) | whip | iris | fade | pop
  background: { type: land, seaEnd: 520 }
  bixStart: [820, 800]             # where Bix stands when the scene opens
  bixScale: 0.9
  bixFacing: 1                     # 1 right, -1 left
  props: [ ... ]                   # drawn in order; add layer: front to draw in front of Bix
  bix:                             # Bix cues
    - { at: 0, action: idle, hold: sandwich }
    - { at: "@brakes", action: shock }
    - { at: "@don't", action: fly, from: [820, 800], to: [2600, 420], dur: 0.55, params: { panic: 1 } }
  texts:
    - { at: "@brakes", until: "@brakes+1.1", text: "SCREEEECH!", style: shout, y: 230, rotate: -6 }
  chips:
    - { at: 0.2, label: "1 second later", icon: clock }   # icon: clock | calendar | globe | bolt
  camera: { zoom: [1.0, 1.08], focus: [960, 540], shake: ["@brakes"], shakeAmp: 20 }   # pan: [[x,y],[x,y]] also works
  sfx:
    - { name: screech, at: "@brakes", gain: 0.55 }
  narration: "If the planet suddenly hits the brakes... you *don't*."
  hold: 0.5                        # extra seconds after the narration (optional)
```

Many SFX are added automatically: pops for texts, a zip for chips, whooshes for whip transitions,
and sounds for boom, wave, wind, arrow and jump. Set `autoSfx: false` on a scene to turn that off.

### Bix actions

`idle walk run jump fly point shock laugh think shrug wave tumble facepalm sleepy cheer float sit present`

Cue fields: `at`, `action`, `from: [x,y]`, `to: [x,y]`, `dur` (travel seconds), `arc` (px of
upward arc while travelling), `facing`, `scale`, `hold` (item in hand), `params: { panic: 0..1 }`
(fly), `hidden: true`. Walk/run become idle when they arrive. Jump lasts 0.95 s.

Items (`hold`, `item`, `flyer`): `sandwich mug phone clipboard pillow laptop book coin`.

### On-screen text styles

`title` (yellow headline), `big` (huge white number), `label` (pill callout; `color` sets the pill),
`note` (small), `shout` (red comic shout). Fields: `at until text style x y color rotate`, and
`count: { from, to, dur, decimals, prefix, suffix }` for counting numbers. `\n` makes a new line.

### Backgrounds

| type | options |
|---|---|
| `space` | `tint: purple\|blue`, `drift` (star speed), `planet: true` (small ringed planet, top right), `seed` |
| `sky` | `mood: day\|sunset\|night`, `speed` (cloud px/s; 2000+ = flying fast), `sun: false`, `clouds`, `seed` |
| `land` | sky + hills + grass; `seaEnd` (px of sea on the left), `mood` |
| `lab` | tiled lab, flasks; `board: false` hides the whiteboard (it occupies x 560–1360, y 120–550) |
| `city` / `night-city` | skyline + street; `mood`, `lightsOffAt` (time, windows go dark) |
| `bedroom` | `mood: night\|day`, `clock: "3:00"`, `clockSpeed` (hours/s), `bed: false` (bed at x 920–1440) |
| `ocean` | horizon at `horizon` (default 560), `beach: true` |
| `moon` | lunar surface + black sky (add an `earth` prop to show Earth) |
| `plain` | `color` |

### Props (all fields optional unless noted; `at` = appear time with a pop)

| type | fields |
|---|---|
| `earth` | `x y r spin` (rev/s visual) `stopAt tilt equator: true caps: false band` (-1..1 shifts continents) `face: shock\|smile` |
| `moon` | `x y r face` · `grow: [r0, r1]` with `at dur` animates size |
| `sun` | `x y r face: false` |
| `orbit` | `x y rx ry period phase body: moon\|dot\|satellite r color` |
| `satellite` | `x y s kind: satellite\|station rot spin from to at dur` |
| `arrow` | **`from to`** `at grow bend color width label labelX labelY labelSize` |
| `tree` | `x y s windAt` |
| `house` | `x y s roofAt` (roof flies away) |
| `building` | `x y w h color shakeAt` |
| `wave` | `at dur h x0 x1 y` (wall of water crossing the screen) |
| `tide` | `x0 x1 from to at dur marker: true` (water level, y values) |
| `wind` | `at until count band speed seed` |
| `speedlines` | `at until y spread count color` |
| `hurricane` | `x y r speed at` |
| `boom` | `at x y` (rings + "BOOM!") |
| `burst` | `x y text r color rot at until s` (comic starburst) |
| `puff` | `at x y` (dust cloud) |
| `ring` | `at x y r color` (dashed highlight circle) |
| `skid` | `x y r at` (motion arcs around a planet) |
| `flyer` | `item at hoverUntil from to dur arc spin s wobble persist: true` |
| `item` | **`item`** `x y s rot float: true at` |
| `pal` | generic extra person (not Bix): `x y s facing action actions: [{at, action}] color hair seed hold panic from to moveAt dur emote: false` |
| `crowd` | `x y w count rows s seed jumpAt cheerAt panicAt sync: true` |
| `bars` | **`values`** `labels display colors x y w h max unit decimals at` (bar chart grows; `display` = text per bar for huge numbers) |
| `clock` | `x y r time: "hh:mm" speed` (hours per second) `at` |
| `calendar` | `x y s from to at dur label color rot` (page counter) |
| `gauge` | `x y r from to max at dur label` |
| `board` | **`lines`** `title x y w h size step color rot at` (lines appear one by one) |
| `timeline` | **`marks: [{pos: 0..1, label}]`** `x y w at dur` |
| `seismo` | `x y w h spikeAt amp` |
| `phone` | `x y s rot screen: wifi\|nosignal\|loading\|chat\|map\|error\|video switchAt screen2` |
| `wifi` | `x y s bars crossAt` |
| `server` | `x y s count failAt` |
| `cable` | **`points`** `at grow color cutAt gapColor` |
| `brain` | `x y s state: ok\|tired\|fried stateAt state2` |
| `icon` | `icon: warning\|check\|cross\|heart\|bulb\|coin\|globe\|question x y s at` |
| `badge` | `x y r text sub color rot at` |
| `vehicle` | `kind: car\|bus\|plane from to at dur s color` |
| `confetti` | `at dur count` |
| `cactus` | **Newton**, Bix's lab cactus (recurring): `x y s mood: happy\|shock\|sleepy\|wink float: true floatAt label: false at` |
| `bird` | `kind: falcon\|vulture\|pigeon from to at dur s` |
| `frost` | `x y r count at seed` (ice crystals) |
| `crack` | `x y w at` |

### SFX names

`whoosh pop boing screech boom ding tick rumble wind splash thud sparkle swish zip sting`

## Shorts

Each Short is built as a **standalone mini-episode**: a run of consecutive scenes, with per-Short
overrides so it opens on a hook that needs no context, followed by an automatic **SUBSCRIBE
call-to-action** (~2 s: button pops in, bell rings, Bix points and presses it, voice line
"Subscribe for more what ifs!"). Sentences that are unchanged reuse the long episode's audio; only new
lines are voiced.

```yaml
shorts:
  - id: short-supersonic
    title: "Earth stops for ONE second and you go supersonic"   # ≤ 100 chars, #Shorts is added
    from: brakes            # first scene id (inclusive)
    to: landing             # last scene id (inclusive); total 35–59 s including the CTA
    hook: "EARTH STOPS FOR 1 SECOND"   # big banner, fully visible from frame 0
    description: "..."      # optional
    cta: "Subscribe for more what ifs!"   # optional, this is the default
    scenes:                 # optional overrides, merged over the episode's scenes for this Short only
      brakes:
        narration: "Earth stops for *one* second. You *don't*. ..."   # standalone hook line first
        bix: [ { at: 0, action: shock }, ... ]   # motion on frame 0
        texts: [ { at: "@stops", text: "SCREEEECH!", style: shout } ]   # first payoff within ~3 s
```

Rules of thumb (the validator checks length and @word cues, and flags hook lines over ~3.5 s):
- First sentence = a hook that works with zero context; start it immediately (the first scene's lead is 0.1 s).
- Something moves on frame 0 (Bix reacting, Earth spinning) and the first visual payoff lands within 3 s.
- Cut lines that depend on earlier context ("Now the twist…", "As we saw…").
- The vertical crop follows Bix or zooms out to keep the action. Add `focus: [x]` on a scene to pin it.
- Vertical safe zone: the hook banner, captions, chips and CTA stay inside x 60–900 and y 140–1450,
  clear of the TikTok / Shorts buttons on the right and the description UI at the bottom.

## Thumbnail

```yaml
thumbnail:
  title: ["EARTH", "STOPS"]   # 1–3 short lines, huge
  accent: 1                   # which line is yellow
  subtitle: "for 1 second"    # red pill (optional)
  background: { type: space, tint: blue }
  props: [ { type: earth, x: 1120, y: 640, r: 300, face: shock } ]
  bix: { action: shock, x: 1600, y: 1210, scale: 2.45, facing: -1, t: 0.45 }
```

## Sources

List every fact's source, ideally with a URL: NASA, NOAA, peer-reviewed papers,
university pages, encyclopedias. They are printed in the video description.

## Keeping episodes unique

YouTube demonetizes "mass-produced or repetitive" content. Every episode must have its own
structure, gags, scene list and outro. `validate.mjs --all` fails if two episodes share more than 8%
of their narration word-trigrams, use the same background sequence, or reuse an outro.
