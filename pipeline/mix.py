#!/usr/bin/env python3
"""Mix narration, sound effects and music into one stereo track.

Job JSON (written by pipeline/build.mjs):
  {"duration": 30.0, "out": "build/x/mix.wav", "workDir": "build/x",
   "narration": [{"file": "...wav", "at": 1.2}],
   "sfx": [{"file": "...wav", "at": 3.4, "gain": 0.6}],
   "music": {"file": "...wav", "gain": 0.25, "duck": 0.6}}

The music is ducked under the voice with a smooth side-chain envelope, the
voice gets a light broadcast chain (high-pass, compression, presence) and the
result is loudness-normalised to -14 LUFS, YouTube's reference level.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import wave

import numpy as np

SR = 48000


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        data = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float64) / 32768
    data = data.reshape(-1, ch)
    if ch == 1:
        data = np.repeat(data, 2, axis=1)
    if sr != SR:
        from scipy.signal import resample_poly
        g = np.gcd(sr, SR)
        data = resample_poly(data, SR // g, sr // g, axis=0)
    return data


def write_wav(path: str, data: np.ndarray) -> None:
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def place(buf: np.ndarray, clip: np.ndarray, at: float, gain: float = 1.0) -> None:
    k = int(round(at * SR))
    if k < 0:
        clip, k = clip[-k:], 0
    if k >= len(buf):
        return
    m = min(len(clip), len(buf) - k)
    buf[k:k + m] += clip[:m] * gain


def duck_envelope(voice: np.ndarray, depth: float) -> np.ndarray:
    """1.0 where silent, (1-depth) where the narrator speaks; smoothed."""
    hop = int(SR * 0.01)
    mono = np.abs(voice).mean(axis=1)
    n = len(mono) // hop + 1
    act = np.zeros(n)
    for i in range(n):
        seg = mono[i * hop:(i + 1) * hop]
        act[i] = 1.0 if len(seg) and seg.mean() > 0.01 else 0.0
    # attack 60 ms, release 400 ms (one-pole smoothing, forward)
    out = np.zeros(n)
    a_att, a_rel = 1 - np.exp(-1 / 6), 1 - np.exp(-1 / 40)
    v = 0.0
    for i in range(n):
        a = a_att if act[i] > v else a_rel
        v += (act[i] - v) * a
        out[i] = v
    # look-ahead: start ducking 120 ms before speech begins
    out = np.maximum(out, np.concatenate([out[12:], np.zeros(12)]))
    env = 1 - depth * out
    return np.repeat(env, hop)[: len(voice)][:, None]


def ffmpeg(args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def integrated_lufs(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    import re
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else None


def two_pass_loudnorm(src, out, work, target=-14.0):
    """Exact loudness: measure, normalise linearly (no pumping), then trim the last few tenths of a dB.

    The single-pass loudnorm filter (used by episodes 1–5 and MarMila) can land ~0.5–1 dB away from the
    target on short or dynamic mixes. Episodes opt in with music.loudnorm: two-pass."""
    import re
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(re.search(r"\{[^{}]*\}\s*$", r.stderr.strip()).group(0))
    stage = os.path.join(work, "mix_norm.wav")
    ffmpeg(["-i", src, "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
            f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}", "-ar", str(SR), stage])
    got = integrated_lufs(stage)
    gain = 0.0 if got is None else target - got
    if abs(gain) > 0.1:
        # small trim; a true-peak limiter keeps the peaks under -1.5 dBTP
        ffmpeg(["-i", stage, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.84:level=false", "-ar", str(SR), out])
    else:
        shutil.copyfile(stage, out)


def run(job):
    n = int(job["duration"] * SR)
    work = job["workDir"]
    os.makedirs(work, exist_ok=True)
    voice = np.zeros((n, 2))
    for item in job["narration"]:
        place(voice, read_wav(item["file"]), item["at"], item.get("gain", 1.0))
    raw_voice = os.path.join(work, "voice_raw.wav")
    proc_voice = os.path.join(work, "voice.wav")
    write_wav(raw_voice, voice * 0.9)
    ffmpeg(["-i", raw_voice, "-af",
            "highpass=f=75,equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.5:g=3,"
            "acompressor=threshold=-20dB:ratio=3:attack=4:release=90:makeup=2,alimiter=limit=0.95",
            "-ar", str(SR), proc_voice])
    voice = read_wav(proc_voice)[:n]
    if len(voice) < n:
        voice = np.pad(voice, ((0, n - len(voice)), (0, 0)))

    sfx = np.zeros((n, 2))
    cache = {}
    for item in job.get("sfx", []):
        f = item["file"]
        if f not in cache:
            cache[f] = read_wav(f)
        clip = cache[f]
        pan = float(item.get("pan", 0.0))
        g = np.array([min(1, 1 - pan), min(1, 1 + pan)])
        place(sfx, clip * g, item["at"], item.get("gain", 0.6))

    music = np.zeros((n, 2))
    mj = job.get("music")
    if mj:
        m = read_wav(mj["file"])
        off = int(mj.get("offset", 0) * SR)  # start partway into the track (Shorts)
        if 0 < off < len(m):
            m = m[off:]
        reps = int(np.ceil(n / len(m)))
        m = np.tile(m, (reps, 1))[:n]
        fo = int(SR * mj.get("fadeOut", 1.5))
        if fo > 0:
            m[-fo:] *= np.linspace(1, 0, fo)[:, None]
        music = m * mj.get("gain", 0.25) * duck_envelope(voice, mj.get("duck", 0.6))

    mix = voice + sfx + music
    pre = os.path.join(work, "mix_pre.wav")
    write_wav(pre, mix / max(1.0, np.max(np.abs(mix))))
    if job.get("loudnorm") == "two-pass":
        two_pass_loudnorm(pre, job["out"], work)
    else:
        ffmpeg(["-i", pre, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), job["out"]])
    for stem, data in (("stem_voice.wav", voice), ("stem_sfx.wav", sfx), ("stem_music.wav", music)):
        write_wav(os.path.join(work, stem), data)
    return {"out": job["out"]}


if __name__ == "__main__":
    print(json.dumps(run(json.load(open(sys.argv[1])))))
