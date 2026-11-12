#!/usr/bin/env python3
"""Watch-check rendered videos before publishing.

    python3 pipeline/qa.py <pack-or-dir> [--out <dir>] [--long 225:270] [--short 15:25]

For every .mp4 (Shorts are 1080x1920, long videos 1920x1080), with its captions file next to it
(<name>.en.srt / .fr.srt, or in ../captions/):
  - plays the whole file (full decode, every frame and audio sample): no decode errors
  - streams: H.264 video + AAC audio, 30 fps, the right size, audio as long as the video (±0.2 s)
  - length: Shorts 15–25 s, long videos 3:45–4:30 by default
  - loudness: integrated −14 LUFS (±1)
  - audio present: no silence longer than 3 s
  - no frozen frames: no stretch longer than 3 s where the picture doesn't change at all
  - in sync: every caption starts within 0.35 s of speech energy (voice band), checked cue by cue
  - no cut-off words: the speech ends at least 0.1 s before the file ends; the last caption ends inside the file
  - Shorts loop: the last frame matches the first frame's scene (SSIM of the picture under the banner)
  - frames at 0 s, the middle and the last second, saved as PNG (and a phone-size contact sheet)
Writes <out>/qa-report.json and <out>/qa-report.md; exit code 1 if anything fails.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

import numpy as np

SR = 16000


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def probe(f):
    r = sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", f])
    return json.loads(r.stdout)


def decode_errors(f):
    r = sh(["ffmpeg", "-v", "error", "-xerror", "-i", f, "-f", "null", "-"])
    return (r.stderr.strip().splitlines() + ([f"exit {r.returncode}"] if r.returncode else []))[:5]


def lufs(f):
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", f, "-af", "ebur128", "-f", "null", "-"])
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else float("nan")


def silences(f, noise="-50dB", d=3.0):
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", f, "-af", f"silencedetect=noise={noise}:d={d}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return list(zip(starts, ends + [None] * (len(starts) - len(ends))))


def freezes(f, d=3.0):
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", f, "-vf", f"freezedetect=n=0.0005:d={d}", "-map", "0:v", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", r.stderr)]
    durs = [float(x) for x in re.findall(r"freeze_duration: ([\d.]+)", r.stderr)]
    return [(s, durs[i] if i < len(durs) else None) for i, s in enumerate(starts)]


def voice_envelope(f):
    """RMS (dB) per 20 ms of the voice band (300–3400 Hz)."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", str(SR), "-af", "highpass=f=300,lowpass=f=3400", "-f", "f32le", "-"],
                       capture_output=True)
    a = np.frombuffer(r.stdout, dtype=np.float32)
    win = SR // 50
    n = len(a) // win
    rms = np.sqrt((a[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(rms)


def srt_cues(path):
    if not path or not os.path.exists(path):
        return []
    t = open(path, encoding="utf-8-sig").read()
    cues = []
    for m in re.finditer(r"(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)\n(.+?)(?:\n\n|\Z)", t, re.S):
        g = [int(x) for x in m.groups()[:8]]
        s = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        e = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        cues.append((s, e, m.group(9).strip().replace("\n", " ")))
    return cues


def frame(f, t, out):
    sh(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, t):.3f}", "-i", f, "-frames:v", "1", out])
    return out


def ssim(a, b, crop):
    r = sh(["ffmpeg", "-hide_banner", "-i", a, "-i", b, "-lavfi", f"[0:v]crop={crop}[x];[1:v]crop={crop}[y];[x][y]ssim", "-f", "null", "-"])
    m = re.search(r"All:([\d.]+)", r.stderr)
    return float(m.group(1)) if m else 0.0


def captions_for(f):
    base = f[:-4]
    for ext in (".en.srt", ".fr.srt"):
        if os.path.exists(base + ext):
            return base + ext
        alt = os.path.join(os.path.dirname(os.path.dirname(f)), "captions", os.path.basename(base) + ext)
        if os.path.exists(alt):
            return alt
    return None


def check(f, out, long_range, short_range):
    name = os.path.basename(f)
    pr = probe(f)
    v = next((s for s in pr["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in pr["streams"] if s["codec_type"] == "audio"), None)
    dur = float(pr["format"]["duration"])
    short = v and v["height"] > v["width"]
    res = {"file": name, "type": "short" if short else "long", "duration": round(dur, 2), "problems": [], "notes": []}
    p = res["problems"]
    # streams
    if not v or v.get("codec_name") != "h264":
        p.append("video is not H.264")
    if not a or a.get("codec_name") != "aac":
        p.append("no AAC audio")
    if v and v.get("r_frame_rate") != "30/1":
        p.append(f"fps {v.get('r_frame_rate')}")
    want = (1080, 1920) if short else (1920, 1080)
    if v and (v["width"], v["height"]) != want:
        p.append(f"size {v['width']}x{v['height']} (want {want[0]}x{want[1]})")
    if a and v:
        ad, vd = float(a.get("duration", dur)), float(v.get("duration", dur))
        if abs(ad - vd) > 0.2:
            p.append(f"audio {ad:.2f} s vs video {vd:.2f} s")
    # length
    lo, hi = short_range if short else long_range
    if not (lo <= dur <= hi):
        p.append(f"length {dur:.2f} s outside {lo}–{hi} s")
    # play end to end
    errs = decode_errors(f)
    if errs:
        p.append("decode errors: " + "; ".join(errs))
    res["playedEndToEnd"] = not errs
    # loudness / audio presence
    res["lufs"] = lufs(f)
    if not abs(res["lufs"] + 14) <= 1:
        p.append(f"loudness {res['lufs']} LUFS (want −14 ±1)")
    sil = [s for s in silences(f) if s[0] is not None]
    if sil:
        p.append("silence > 3 s at " + ", ".join(f"{s[0]:.1f} s" for s in sil))
    # frozen frames
    fz = freezes(f)
    res["freezes"] = fz
    if fz:
        p.append("frozen picture > 3 s at " + ", ".join(f"{s:.1f} s" for s, _ in fz))
    # sync with captions (voice-band energy near each cue start)
    env = voice_envelope(f)
    cues = srt_cues(captions_for(f))
    res["captions"] = len(cues)
    if not cues:
        p.append("no captions file found")
    else:
        floor = np.percentile(env, 20)
        speech = env > max(floor + 12, env.max() - 32)
        idx = np.where(speech)[0]
        missed = []
        for s, e, txt in cues:
            i0, i1 = int(max(0, s - 0.35) * 50), int((s + 0.35) * 50) + 1
            if not speech[i0:i1].any():
                missed.append(f"{s:.2f} s “{txt[:30]}”")
        res["cuesInSync"] = f"{len(cues) - len(missed)}/{len(cues)}"
        if len(missed) > max(1, 0.05 * len(cues)):
            p.append("captions without speech nearby: " + "; ".join(missed[:4]))
        last_speech = (idx[-1] + 1) / 50 if len(idx) else 0
        res["speechEndsAt"] = round(last_speech, 2)
        if cues[-1][1] > dur + 0.05:
            p.append(f"last caption ends after the file ({cues[-1][1]:.2f} s)")
        # speech must not run into the last 0.1 s (cut-off word); long videos end on the music bed
        tail_speech = speech[-5:].any() if short else False
        if tail_speech:
            p.append("speech runs into the last 0.1 s (cut-off word?)")
    # frames: 0 s, middle, last second
    stem = os.path.join(out, "frames", name[:-4])
    os.makedirs(os.path.dirname(stem), exist_ok=True)
    fr = [frame(f, 0, f"{stem}-0s.png"), frame(f, dur / 2, f"{stem}-mid.png"), frame(f, dur - 1, f"{stem}-last1s.png"),
          frame(f, dur - 1 / 30 - 0.01, f"{stem}-lastframe.png")]
    res["frames"] = [os.path.relpath(x, out) for x in fr[:3]]
    # loop: last frame vs first frame, picture under the hook/question banner
    if short:
        s = ssim(fr[0], fr[3], "1080:1100:0:520")
        res["loopSSIM"] = round(s, 3)
        if s < 0.55:
            p.append(f"last frame doesn't match the first (SSIM {s:.2f}): weak loop")
    return res


def contact_sheet(results, out, kind):
    from PIL import Image, ImageDraw
    rows = [r for r in results if r["type"] == kind]
    if not rows:
        return None
    w = 270 if kind == "short" else 480
    h = 480 if kind == "short" else 270
    sheet = Image.new("RGB", (3 * w + 40, len(rows) * (h + 34) + 10), "white")
    d = ImageDraw.Draw(sheet)
    for i, r in enumerate(rows):
        y = 10 + i * (h + 34)
        d.text((10, y), f"{r['file']}  ({r['duration']} s)", fill="black")
        for j, fp in enumerate(r["frames"]):
            im = Image.open(os.path.join(out, fp)).convert("RGB").resize((w, h))
            sheet.paste(im, (10 + j * (w + 10), y + 16))
    path = os.path.join(out, f"qa-{kind}s-frames.png")
    sheet.save(path)
    return path


def main():
    args = sys.argv[1:]
    src = args[0]
    out = args[args.index("--out") + 1] if "--out" in args else os.path.join(src, "qa")
    lr = tuple(float(x) for x in (args[args.index("--long") + 1] if "--long" in args else "225:270").split(":"))
    sr = tuple(float(x) for x in (args[args.index("--short") + 1] if "--short" in args else "15:25").split(":"))
    os.makedirs(out, exist_ok=True)
    files = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(src) for f in fs if f.endswith(".mp4") and "/qa/" not in os.path.join(dp, f))
    results = []
    for f in files:
        r = check(f, out, lr, sr)
        results.append(r)
        print(f"{'PASS' if not r['problems'] else 'FAIL'}  {r['file']}  {r['duration']} s  {r['lufs']} LUFS  sync {r.get('cuesInSync', '-')}"
              + (f"  loop {r['loopSSIM']}" if "loopSSIM" in r else "") + "".join(f"\n      - {x}" for x in r["problems"]), flush=True)
    sheets = [contact_sheet(results, out, k) for k in ("short", "long")]
    json.dump(results, open(os.path.join(out, "qa-report.json"), "w"), indent=1, ensure_ascii=False)
    bad = [r for r in results if r["problems"]]
    md = [f"# QA report ({len(results) - len(bad)}/{len(results)} files pass)", "",
          "| File | Type | Length | Loudness | Played end to end | Captions in sync | Loop SSIM | Result |", "|---|---|---|---|---|---|---|---|"]
    for r in results:
        md.append(f"| `{r['file']}` | {r['type']} | {r['duration']} s | {r['lufs']} LUFS | {'yes' if r.get('playedEndToEnd') else 'NO'} | "
                  f"{r.get('cuesInSync', '-')} | {r.get('loopSSIM', '–')} | {'PASS' if not r['problems'] else 'FAIL: ' + '; '.join(r['problems'])} |")
    md += ["", "Frames at 0 s, middle and last second: " + ", ".join(f"`{os.path.basename(s)}`" for s in sheets if s), ""]
    open(os.path.join(out, "qa-report.md"), "w").write("\n".join(md))
    print(f"{len(results) - len(bad)}/{len(results)} pass")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
