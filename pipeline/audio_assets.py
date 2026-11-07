#!/usr/bin/env python3
"""Procedural music + sound-effect generator for What If Bix.

Every sound the channel uses is synthesized here from math (oscillators,
filtered noise, Karplus-Strong strings). Nothing is sampled from a third
party, so the output is original work released as CC0 (see CREDITS.md).
Generation is deterministic: the same arguments always produce the same file.

Usage:
  python3 pipeline/audio_assets.py sfx  <out_dir>
  python3 pipeline/audio_assets.py music <style> <seconds> <out.wav> [--seed N]
"""
from __future__ import annotations

import argparse
import os
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000


# ---------------------------------------------------------------- helpers

def write_wav(path: str, audio: np.ndarray, sr: int = SR) -> None:
    """Write mono or stereo float audio (-1..1) as 16-bit PCM."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if audio.ndim == 1:
        audio = audio[:, None]
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(audio.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def env_adsr(n: int, a=0.005, d=0.1, s=0.0, r=0.05) -> np.ndarray:
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, max(a_n, 1)),
        np.linspace(1, s, max(d_n, 1)),
        np.full(s_n, s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def exp_decay(n: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (tau * SR))


def bandpass(x: np.ndarray, lo: float, hi: float, order=2) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x: np.ndarray, f: float, order=2) -> np.ndarray:
    sos = signal.butter(order, f, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def highpass(x: np.ndarray, f: float, order=2) -> np.ndarray:
    sos = signal.butter(order, f, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def norm(x: np.ndarray, peak=0.9) -> np.ndarray:
    m = np.max(np.abs(x))
    return x if m < 1e-9 else x / m * peak


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def fade(x: np.ndarray, fin=0.002, fout=0.01) -> np.ndarray:
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


# ---------------------------------------------------------------- sfx

def sfx_whoosh(rng, dur=0.7, lo=300, hi=3000):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # sweep a band-pass up then down by processing in short blocks
    out = np.zeros(n)
    blocks = 40
    for i in range(blocks):
        s, e = i * n // blocks, (i + 1) * n // blocks
        p = i / (blocks - 1)
        c = lo + (hi - lo) * np.sin(np.pi * p) ** 1.5
        seg = bandpass(noise[max(0, s - 2000):e], c * 0.6, min(c * 1.6, SR / 2 - 100))
        out[s:e] = seg[-(e - s):]
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    return fade(norm(out * env, 0.8))


def sfx_pop(rng):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 30) + 250
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * exp_decay(n, 0.025)
    return fade(norm(x, 0.8))


def sfx_boing(rng):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 180 + 220 * np.exp(-t * 6) + 25 * np.sin(2 * np.pi * 14 * t) * np.exp(-t * 3)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * exp_decay(n, 0.22)
    return fade(norm(x, 0.8))


def sfx_screech(rng):
    """Cartoon brake squeal: a wobbling high tone over friction noise."""
    dur = 1.1
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 2400 + 180 * np.sin(2 * np.pi * 9 * t) - 500 * t
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) + 0.4 * np.sin(1.5 * ph) + 0.2 * np.sin(2.01 * ph)
    fric = bandpass(rng.standard_normal(n), 1500, 6000) * 0.6
    env = np.minimum(1, t / 0.03) * np.clip((dur - t) / 0.35, 0, 1)
    return fade(norm((tone * 0.5 + fric) * env, 0.75))


def sfx_boom(rng):
    """Sonic boom: double low thump (N-wave) with a noisy crack."""
    n = int(1.6 * SR)
    out = np.zeros(n)
    for off in (0.0, 0.11):
        k = int(off * SR)
        m = n - k
        t = np.arange(m) / SR
        f = 70 * np.exp(-t * 4) + 32
        ph = 2 * np.pi * np.cumsum(f) / SR
        thump = np.sin(ph) * exp_decay(m, 0.35)
        crack = lowpass(rng.standard_normal(m), 2500) * exp_decay(m, 0.06)
        out[k:] += thump + 0.5 * crack
    return fade(norm(out, 0.9), 0.001, 0.2)


def sfx_ding(rng):
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * 1318.5 * r * t) * exp_decay(n, 0.5 / r)
            for a, r in ((1, 1), (0.5, 2.76), (0.25, 5.4)))
    return fade(norm(x, 0.6))


def sfx_tick(rng):
    n = int(0.05 * SR)
    x = highpass(rng.standard_normal(n), 3000) * exp_decay(n, 0.004)
    x += np.sin(2 * np.pi * 2200 * np.arange(n) / SR) * exp_decay(n, 0.006)
    return fade(norm(x, 0.6), 0.0005, 0.005)


def sfx_rumble(rng):
    n = int(2.5 * SR)
    x = lowpass(rng.standard_normal(n), 120, order=4)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.4) * np.clip((2.5 - t) / 1.0, 0, 1)
    return fade(norm(x * env * (1 + 0.3 * np.sin(2 * np.pi * 7 * t)), 0.9), 0.01, 0.3)


def sfx_wind(rng):
    n = int(2.2 * SR)
    noise = rng.standard_normal(n)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for i in range(44):
        s, e = i * n // 44, (i + 1) * n // 44
        c = 500 + 350 * np.sin(2 * np.pi * 0.7 * t[s]) + 200 * np.sin(2 * np.pi * 1.9 * t[s])
        seg = bandpass(noise[max(0, s - 2000):e], c * 0.7, c * 1.5)
        out[s:e] = seg[-(e - s):]
    env = np.minimum(1, t / 0.3) * np.clip((2.2 - t) / 0.6, 0, 1)
    return fade(norm(out * env, 0.7))


def sfx_splash(rng):
    n = int(1.3 * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n), 300, 5000) * (np.minimum(1, t / 0.02) * exp_decay(n, 0.3))
    bubbles = np.zeros(n)
    for _ in range(14):
        k = int(rng.uniform(0.05, 0.9) * SR)
        m = int(0.06 * SR)
        f0 = rng.uniform(500, 1400)
        tt = np.arange(m) / SR
        bubbles[k:k + m] += np.sin(2 * np.pi * (f0 + 3000 * tt) * tt) * exp_decay(m, 0.015)
    return fade(norm(x + 0.3 * bubbles, 0.8))


def sfx_thud(rng):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-t * 12) + 45
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_decay(n, 0.09)
    x += 0.3 * lowpass(rng.standard_normal(n), 800) * exp_decay(n, 0.03)
    return fade(norm(x, 0.9))


def sfx_sparkle(rng):
    n = int(1.0 * SR)
    out = np.zeros(n)
    notes = [84, 88, 91, 96, 100]
    for i, m in enumerate(notes):
        k = int(i * 0.07 * SR)
        mm = n - k
        tt = np.arange(mm) / SR
        out[k:] += np.sin(2 * np.pi * midi_hz(m) * tt) * exp_decay(mm, 0.18) * 0.5
    return fade(norm(out, 0.5))


def sfx_swish(rng):
    return sfx_whoosh(rng, dur=0.3, lo=1200, hi=6000)


def sfx_zip(rng):
    """Quick rising 'zip' used for chips / text pops."""
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    f = 400 + 2200 * (t / t[-1]) ** 2
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / t[-1])
    return fade(norm(lowpass(x, 5000), 0.35))


def sfx_sting(rng):
    """2-second channel sting: rising marimba arpeggio, a thump and a sparkle tail."""
    n = int(2.0 * SR)
    out = np.zeros(n)
    notes = [60, 64, 67, 72, 76, 79]
    for i, m in enumerate(notes):
        k = int((0.05 + i * 0.075) * SR)
        x = marimba(midi_hz(m), 0.9)
        out[k:k + len(x)] += x[: n - k] * (0.5 + i * 0.08)
    k = int(0.5 * SR)
    th = sfx_thud(rng)
    out[k:k + len(th)] += th[: n - k] * 0.6
    sp = sfx_sparkle(rng)
    k = int(0.62 * SR)
    out[k:k + len(sp)] += sp[: n - k] * 0.8
    chord = sum(np.sin(2 * np.pi * midi_hz(m) * np.arange(n - int(0.5 * SR)) / SR) for m in (72, 76, 79))
    out[int(0.5 * SR):] += chord * exp_decay(len(chord), 0.5) * 0.15
    return fade(norm(out, 0.85), 0.002, 0.3)


SFX = {
    "whoosh": sfx_whoosh, "pop": sfx_pop, "boing": sfx_boing, "screech": sfx_screech,
    "boom": sfx_boom, "ding": sfx_ding, "tick": sfx_tick, "rumble": sfx_rumble,
    "wind": sfx_wind, "splash": sfx_splash, "thud": sfx_thud, "sparkle": sfx_sparkle,
    "swish": sfx_swish, "zip": sfx_zip, "sting": sfx_sting,
}


def build_sfx(out_dir: str) -> None:
    for i, (name, fn) in enumerate(sorted(SFX.items())):
        rng = np.random.default_rng(1000 + i)
        write_wav(os.path.join(out_dir, f"{name}.wav"), fn(rng).astype(np.float32))
        print(f"sfx {name}")


# ---------------------------------------------------------------- music

STYLES = {
    # bpm, root midi, scale degrees used for melody, chord progressions (A, B sections)
    "curious": dict(bpm=100, root=60, minor=False,
                    A=[(0, "maj"), (9, "min"), (5, "maj"), (7, "maj")],
                    B=[(5, "maj"), (7, "maj"), (4, "min"), (9, "min")]),
    "tense": dict(bpm=118, root=57, minor=True,
                  A=[(0, "min"), (8, "maj"), (3, "maj"), (10, "maj")],
                  B=[(5, "min"), (0, "min"), (8, "maj"), (7, "maj")]),
    "dreamy": dict(bpm=84, root=62, minor=False,
                   A=[(0, "maj7"), (5, "maj7"), (9, "min7"), (7, "sus")],
                   B=[(2, "min7"), (7, "sus"), (0, "maj7"), (5, "maj7")]),
}
CHORDS = {"maj": [0, 4, 7], "min": [0, 3, 7], "maj7": [0, 4, 7, 11], "min7": [0, 3, 7, 10], "sus": [0, 5, 7]}


def karplus(freq: float, dur: float, rng, bright=0.5) -> np.ndarray:
    n = int(dur * SR)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    buf = lowpass(buf, 2000 + 6000 * bright) if p > 20 else buf
    out = np.empty(n)
    idx = 0
    decay = 0.996
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx + 1) % p
        buf[idx] = decay * 0.5 * (buf[idx] + buf[nxt])
        idx = nxt
    return out * exp_decay(n, dur * 0.5)


def marimba(freq: float, dur: float) -> np.ndarray:
    t = t_axis(dur)
    n = len(t)
    x = np.sin(2 * np.pi * freq * t) * exp_decay(n, 0.35)
    x += 0.35 * np.sin(2 * np.pi * freq * 3.93 * t) * exp_decay(n, 0.05)
    x += 0.1 * np.sin(2 * np.pi * freq * 9.2 * t) * exp_decay(n, 0.015)
    return fade(x, 0.001, 0.02)


def bass(freq: float, dur: float) -> np.ndarray:
    t = t_axis(dur)
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t)
    return x * env_adsr(len(t), 0.006, 0.18, 0.55, 0.06)


def pad(freqs, dur: float, rng) -> np.ndarray:
    t = t_axis(dur)
    x = np.zeros(len(t))
    for f in freqs:
        for det in (-0.08, 0.0, 0.08):
            ph = rng.uniform(0, 2 * np.pi)
            x += signal.sawtooth(2 * np.pi * f * 2 ** (det / 12) * t + ph)
    x = lowpass(x, 1400)
    return x * env_adsr(len(t), 0.4, 0.3, 0.8, 0.6) / (3 * len(freqs))


def kick() -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_decay(n, 0.12)


def snare(rng) -> np.ndarray:
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n), 900, 7000) * exp_decay(n, 0.05)
    x += 0.4 * np.sin(2 * np.pi * 190 * t) * exp_decay(n, 0.03)
    return x


def hat(rng, open_=False) -> np.ndarray:
    n = int((0.25 if open_ else 0.06) * SR)
    return highpass(rng.standard_normal(n), 7000) * exp_decay(n, 0.08 if open_ else 0.012)


def add(buf: np.ndarray, x: np.ndarray, at: float, gain: float = 1.0) -> None:
    k = int(at * SR)
    if k >= len(buf):
        return
    m = min(len(x), len(buf) - k)
    buf[k:k + m] += x[:m] * gain


def build_music(style: str, seconds: float, out: str, seed: int = 7) -> None:
    cfg = STYLES[style]
    rng = np.random.default_rng(seed)
    beat = 60.0 / cfg["bpm"]
    bar = 4 * beat
    total = seconds + 2.0
    n = int(total * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    root = cfg["root"]
    scale = [0, 3, 5, 7, 10] if cfg["minor"] else [0, 2, 4, 7, 9]  # pentatonic

    # simple melodic motifs, chosen per section so the track evolves
    motifs = []
    for _ in range(4):
        steps = []
        pos = rng.integers(0, 5)
        for _ in range(8):
            pos = int(np.clip(pos + rng.choice([-2, -1, 1, 1, 2]), 0, 9))
            steps.append(pos)
        rhythms = [[0, 1, 1.5, 2, 3, 3.5], [0, 0.5, 1, 2, 2.5, 3], [0, 1.5, 2, 3]]
        motifs.append((steps, rhythms[int(rng.integers(0, len(rhythms)))]))

    cache_pluck = {}
    n_bars = int(np.ceil(total / bar))
    for b in range(n_bars):
        t0 = b * bar
        section = (b // 8) % 4  # A A' B A''
        prog = cfg["B"] if section == 2 else cfg["A"]
        deg, kind = prog[b % 4]
        chord = [root + deg + iv for iv in CHORDS[kind]]
        intro = b < 2
        # pad
        p = pad([midi_hz(m - 12) for m in chord], bar + 0.6, rng)
        add(L, p, t0, 0.5)
        add(R, p, t0, 0.5)
        # bass on beats 1 & 3 (+ pickup)
        if not intro:
            for bt, iv in ((0, 0), (2, 7 if kind != "sus" else 5), (3.5, 12)):
                x = bass(midi_hz(root + deg - 24 + iv), beat * (0.45 if bt == 3.5 else 0.9))
                add(L, x, t0 + bt * beat, 0.42)
                add(R, x, t0 + bt * beat, 0.42)
        # plucked arpeggio, 8ths, panned
        for i in range(8):
            m = chord[[0, 1, 2, 1, 0, 2, 1, 2][i] % len(chord)] + (12 if i in (5, 7) else 0)
            key = (m, round(beat * 0.9, 3))
            if key not in cache_pluck:
                cache_pluck[key] = karplus(midi_hz(m), beat * 0.9, np.random.default_rng(m), 0.6)
            pan = 0.5 + 0.3 * np.sin(i * 0.9)
            add(L, cache_pluck[key], t0 + i * beat / 2, 0.30 * (1 - pan) * 2)
            add(R, cache_pluck[key], t0 + i * beat / 2, 0.30 * pan * 2)
        # drums
        if not intro:
            for bt in (0, 2.5) if section != 2 else (0, 1.5, 2.5):
                add(L, kick(), t0 + bt * beat, 0.55)
                add(R, kick(), t0 + bt * beat, 0.55)
            for bt in (1, 3):
                s = snare(rng)
                add(L, s, t0 + bt * beat, 0.22)
                add(R, s, t0 + bt * beat, 0.22)
            for i in range(8):
                h = hat(rng, open_=(i == 7))
                add(L, h, t0 + i * beat / 2 + 0.006, 0.07 if i % 2 else 0.11)
                add(R, h, t0 + i * beat / 2, 0.09 if i % 2 else 0.06)
        # marimba melody on sections B and A''
        if section in (1, 2, 3) and b % 2 == 0:
            steps, rhythm = motifs[(b // 2) % 4]
            for j, r in enumerate(rhythm):
                deg_i = steps[j % len(steps)]
                m = root + 12 + scale[deg_i % 5] + 12 * (deg_i // 5)
                x = marimba(midi_hz(m), beat * 1.2)
                add(L, x, t0 + r * beat, 0.16)
                add(R, x, t0 + r * beat + 0.012, 0.13)

    st = np.stack([L, R], axis=1)
    # gentle glue: soft clip + simple stereo reverb-ish smear
    rev = np.zeros_like(st)
    for d, g in ((0.031, 0.25), (0.047, 0.2), (0.089, 0.12)):
        k = int(d * SR)
        rev[k:, 0] += st[:-k, 1] * g
        rev[k:, 1] += st[:-k, 0] * g
    st = np.tanh((st + rev) * 1.1)
    st = st[: int(seconds * SR)]
    fo = int(1.5 * SR)
    st[-fo:] *= np.linspace(1, 0, fo)[:, None]
    write_wav(out, norm(st, 0.85).astype(np.float32))
    print(f"music {style} {seconds:.1f}s -> {out}")


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("sfx")
    a.add_argument("out_dir")
    m = sub.add_parser("music")
    m.add_argument("style", choices=sorted(STYLES))
    m.add_argument("seconds", type=float)
    m.add_argument("out")
    m.add_argument("--seed", type=int, default=7)
    args = ap.parse_args(argv)
    if args.cmd == "sfx":
        build_sfx(args.out_dir)
    else:
        build_music(args.style, args.seconds, args.out, args.seed)


if __name__ == "__main__":
    sys.exit(main())
