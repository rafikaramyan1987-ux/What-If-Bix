#!/usr/bin/env python3
"""Narration synthesis with word timings.

Reads a JSON job (written by pipeline/build.mjs):
  {
    "voice": {"provider": "piper", "model": "...onnx", "speaker": 92, "lengthScale": 1.05},
    "outDir": "build/ep/tts",
    "segments": [{"id": "s0", "units": [{"display": "What", "spoken": "What"}, ...]}, ...]
  }
and writes, for every segment, <outDir>/<id>.wav (48 kHz mono) plus a result
JSON on stdout:
  {"segments": [{"id": "s0", "file": "...", "duration": 1.93,
                 "units": [{"start": 0.0, "end": 0.21}, ...]}]}

Piper does not expose word alignments for these models, so word times are
estimated: phoneme counts give proportional weights, and pauses the voice
actually produced (silent gaps in the waveform) are snapped to punctuation.
This keeps captions within a few frames of the speech.

Providers: "piper" (default, free, offline). "elevenlabs" and "openai" are
optional and read ELEVENLABS_API_KEY / OPENAI_API_KEY from the environment.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
import wave

import numpy as np
from scipy.signal import resample_poly

OUT_SR = 48000
WORD_EDGE = 1.5  # phoneme-equivalents added to every word's weight
PUNCT_BREAK = re.compile(r"[,;:—–)\]]$|\.\.\.$|…$")


# ------------------------------------------------------------ alignment

def find_gaps(audio: np.ndarray, sr: int, min_gap=0.07, rel_db=-32.0):
    """Return [(start, end)] seconds of silent stretches inside the audio."""
    win = int(sr * 0.01)
    n = len(audio) // win
    if n == 0:
        return []
    frames = audio[: n * win].reshape(n, win)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    thr = rms.max() * 10 ** (rel_db / 20)
    silent = rms < thr
    gaps, i = [], 0
    while i < n:
        if silent[i]:
            j = i
            while j < n and silent[j]:
                j += 1
            if (j - i) * 0.01 >= min_gap and i > 0 and j < n:
                gaps.append((i * 0.01, j * 0.01))
            i = j
        else:
            i += 1
    return gaps


def trim(audio: np.ndarray, sr: int, rel_db=-40.0, pad=0.03):
    win = int(sr * 0.005)
    n = len(audio) // win
    if n == 0:
        return audio, 0.0
    rms = np.sqrt((audio[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    loud = np.where(rms > rms.max() * 10 ** (rel_db / 20))[0]
    if len(loud) == 0:
        return audio, 0.0
    s = max(0, loud[0] * win - int(pad * sr))
    e = min(len(audio), (loud[-1] + 1) * win + int(pad * sr))
    return audio[s:e], s / sr


def align_units(weights, breaks, duration, gaps, max_snap=0.6):
    """Distribute unit times over `duration`.

    weights: relative length of each unit (phoneme count).
    breaks:  indices i where unit i is followed by punctuation (a likely pause).
    gaps:    silent stretches detected in the audio.
    Returns [(start, end)] per unit.
    """
    n = len(weights)
    if n == 0:
        return []
    # +WORD_EDGE per word: every word gets a minimum share (onsets, transitions), so short
    # words like "a" or "of" don't flash by in a few milliseconds.
    w = np.maximum(np.asarray(weights, dtype=float), 1.0) + WORD_EDGE
    cum = np.concatenate([[0.0], np.cumsum(w)])
    est = cum / cum[-1] * duration  # estimated boundary after unit i at est[i+1]
    anchors = [(0, 0.0, 0.0)]  # (unit index boundary, end time of previous, start of next)
    used = -1
    for i in breaks:
        if i >= n - 1:
            continue
        target = est[i + 1]
        best, best_d = None, max_snap
        for gi, (gs, ge) in enumerate(gaps):
            if gi <= used:
                continue
            d = abs((gs + ge) / 2 - target)
            if d < best_d:
                best, best_d = gi, d
        if best is not None and gaps[best][0] > anchors[-1][2]:
            anchors.append((i + 1, gaps[best][0], gaps[best][1]))
            used = best
    anchors.append((n, duration, duration))
    times = [None] * n
    for (a_idx, _, a_start), (b_idx, b_end, _) in zip(anchors, anchors[1:]):
        span = max(b_end - a_start, 0.01)
        ws = w[a_idx:b_idx]
        c = np.concatenate([[0.0], np.cumsum(ws)]) / ws.sum() * span + a_start
        for k in range(b_idx - a_idx):
            times[a_idx + k] = (float(c[k]), float(c[k + 1]))
    return times


# ------------------------------------------------------------ providers

class PiperProvider:
    def __init__(self, cfg):
        from piper import PiperVoice, SynthesisConfig
        self.voice = PiperVoice.load(cfg["model"])
        self.syn = SynthesisConfig(
            speaker_id=cfg.get("speaker"),
            length_scale=cfg.get("lengthScale", 1.05),
            noise_scale=cfg.get("noiseScale"),
            noise_w_scale=cfg.get("noiseW"),
        )
        self.sr = self.voice.config.sample_rate

    def weight(self, spoken: str) -> int:
        try:
            ph = self.voice.phonemize(spoken)
            return sum(len([p for p in s if p.strip()]) for s in ph)
        except Exception:  # pragma: no cover - espeak edge cases
            return len(spoken)

    def synth(self, text: str):
        chunks = [c.audio_float_array for c in self.voice.synthesize(text, self.syn)]
        gap = np.zeros(int(self.sr * 0.12), dtype=np.float32)
        parts = []
        for i, c in enumerate(chunks):
            if i:
                parts.append(gap)
            parts.append(c)
        audio = np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)
        return audio, self.sr, None


def _decode_mp3(data: bytes):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1",
                        "-ar", str(OUT_SR), "pipe:1"], input=data, capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


class ElevenLabsProvider:
    """Optional. Needs ELEVENLABS_API_KEY. Uses the timestamps endpoint for exact word times."""

    def __init__(self, cfg):
        self.key = os.environ.get("ELEVENLABS_API_KEY")
        if not self.key:
            raise SystemExit("ELEVENLABS_API_KEY is not set")
        self.voice_id = cfg.get("voiceId") or os.environ.get("ELEVENLABS_VOICE_ID")
        if not self.voice_id:
            raise SystemExit("set voice.voiceId in the script or ELEVENLABS_VOICE_ID")
        self.model = cfg.get("modelId", "eleven_multilingual_v2")
        self.sr = OUT_SR

    def weight(self, spoken):
        return len(spoken)

    def synth(self, text):
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/with-timestamps",
            data=json.dumps({"text": text, "model_id": self.model}).encode(),
            headers={"xi-api-key": self.key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            body = json.load(r)
        audio = _decode_mp3(base64.b64decode(body["audio_base64"]))
        al = body.get("alignment") or {}
        chars = list(zip(al.get("characters", []), al.get("character_start_times_seconds", []),
                         al.get("character_end_times_seconds", [])))
        return audio, OUT_SR, chars


class OpenAIProvider:
    """Optional. Needs OPENAI_API_KEY."""

    def __init__(self, cfg):
        self.key = os.environ.get("OPENAI_API_KEY")
        if not self.key:
            raise SystemExit("OPENAI_API_KEY is not set")
        self.model = cfg.get("modelId", "gpt-4o-mini-tts")
        self.voice = cfg.get("voiceId", "alloy")
        self.instructions = cfg.get("instructions", "Upbeat, curious, playful science narrator.")
        self.sr = OUT_SR

    def weight(self, spoken):
        return len(spoken)

    def synth(self, text):
        req = urllib.request.Request(
            "https://api.openai.com/v1/audio/speech",
            data=json.dumps({"model": self.model, "voice": self.voice, "input": text,
                             "instructions": self.instructions, "response_format": "mp3"}).encode(),
            headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            audio = _decode_mp3(r.read())
        return audio, OUT_SR, None


PROVIDERS = {"piper": PiperProvider, "elevenlabs": ElevenLabsProvider, "openai": OpenAIProvider}


def char_alignment_to_units(units, chars, offset):
    """Map provider character timings onto our units (sequential search)."""
    text = "".join(c for c, _, _ in chars)
    pos, out = 0, []
    for u in units:
        word = u["spoken"].strip()
        k = text.find(word, pos) if word else -1
        if k < 0:
            out.append(None)
            continue
        s = chars[k][1] - offset
        e = chars[min(k + len(word), len(chars)) - 1][2] - offset
        out.append((max(0.0, s), max(0.0, e)))
        pos = k + len(word)
    return out


def write_wav(path, audio, sr):
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def read_wav(path):
    with wave.open(path, "rb") as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
    return data


def run(job):
    os.makedirs(job["outDir"], exist_ok=True)
    prov = None
    results = []
    vkey = json.dumps(job["voice"], sort_keys=True)

    def provider():
        nonlocal prov
        if prov is None:
            prov = PROVIDERS[job["voice"].get("provider", "piper")](job["voice"])
        return prov

    for seg in job["segments"]:
        units = seg["units"]
        text = " ".join(u["spoken"] for u in units)
        # Audio is cached by spoken text + voice (reproducible rebuilds, no re-synthesis).
        # Word alignment is recomputed every run so alignment improvements apply to cached audio.
        h = hashlib.sha1((vkey + "|" + json.dumps([u["spoken"] for u in units])).encode()).hexdigest()[:16]
        path = os.path.join(job["outDir"], f"{seg['id']}-{h}.wav")
        meta = path + ".json"
        exact = None
        if os.path.exists(path) and os.path.exists(meta):
            trimmed = read_wav(path)
            exact = json.load(open(meta)).get("exact")
        else:
            audio, sr, chars = provider().synth(text)
            audio = audio.astype(np.float64)
            trimmed, offset = trim(audio, sr)
            if sr != OUT_SR:
                g = np.gcd(sr, OUT_SR)
                trimmed = resample_poly(trimmed, OUT_SR // g, sr // g)
            if chars:
                exact = char_alignment_to_units(units, chars, offset)
                if any(t is None for t in exact):
                    exact = None
            peak = np.max(np.abs(trimmed)) or 1.0
            trimmed = trimmed / peak * 0.89
            write_wav(path, trimmed, OUT_SR)
            json.dump({"exact": exact}, open(meta, "w"))
            print(f"tts {seg['id']}: {len(trimmed) / OUT_SR:.2f}s  {text[:60]}", file=sys.stderr)
        dur = len(trimmed) / OUT_SR
        if exact:
            times = exact
        else:
            weights = [provider().weight(u["spoken"]) for u in units]
            breaks = [i for i, u in enumerate(units) if PUNCT_BREAK.search(u["display"].strip())]
            times = align_units(weights, breaks, dur, find_gaps(trimmed, OUT_SR))
        results.append({"id": seg["id"], "file": path, "duration": dur,
                        "units": [{"start": round(s, 3), "end": round(e, 3)} for s, e in times]})
    return {"segments": results}


if __name__ == "__main__":
    job = json.load(open(sys.argv[1]) if len(sys.argv) > 1 else sys.stdin)
    json.dump(run(job), sys.stdout)
