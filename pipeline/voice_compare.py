#!/usr/bin/env python3
"""Compare free French Piper voices for MarMila (run by .github/workflows/voices.yml).

  python pipeline/voice_compare.py out/voices

For every candidate it synthesizes the same French test passage (lots of nasal vowels,
liaisons, numbers and questions) and measures:
  - nasal vowels: does the model know the nasal marker (U+0303)? Without it "vin", "vent"
    and "va" sound alike, which is a hard fail for French narration.
  - intelligibility: word error rate of Whisper (small, French) against the script.
  - pace: spoken words per second at lengthScale 1.0 (used to calibrate the validator).
  - melody: pitch range (std of F0 in semitones) and voiced ratio, a rough proxy for
    expressive vs. flat delivery.
  - license: from the voice's MODEL_CARD.
Writes <out>/<voice>.wav, <out>/results.json and <out>/results.md.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unicodedata
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATES = [
    {"label": "fr_FR-siwis-medium", "model": "fr_FR-siwis-medium", "speaker": None},
    {"label": "fr_FR-upmc-medium (jessica)", "model": "fr_FR-upmc-medium", "speaker": 0},
    {"label": "fr_FR-upmc-medium (pierre)", "model": "fr_FR-upmc-medium", "speaker": 1},
    {"label": "fr_FR-tom-medium", "model": "fr_FR-tom-medium", "speaker": None},
]
PASSAGE = (
    "Et si la Lune disparaissait demain ? Les marées deviendraient bien plus faibles, "
    "environ trois fois moins fortes. Les nuits seraient sombres, vraiment sombres. "
    "Un bon vin blanc, un grand vent, un long pont : on entend la différence. "
    "Dans cent ans, l'inclinaison de la Terre pourrait encore tenir. Mais dans des millions d'années ? "
    "Personne ne le sait vraiment. Alors, tu restes avec nous ?"
)


def norm_words(s: str) -> list[str]:
    s = unicodedata.normalize("NFC", s.lower()).replace("’", "'")
    s = re.sub(r"[^\w' -]", " ", s)
    return [w for w in re.split(r"[\s-]+", s) if w]


def wer(ref: list[str], hyp: list[str]) -> float:
    d = np.zeros((len(ref) + 1, len(hyp) + 1), dtype=int)
    d[:, 0] = np.arange(len(ref) + 1)
    d[0, :] = np.arange(len(hyp) + 1)
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]))
    return d[len(ref), len(hyp)] / max(1, len(ref))


def license_of(model: str) -> str:
    card = os.path.join(ROOT, "models", "piper", f"{model}.MODEL_CARD")
    if not os.path.exists(card):
        return "?"
    text = open(card, encoding="utf8").read()
    m = re.search(r"[Ll]icen[cs]e[^\n]*\n?[^\n]*", text)
    lines = [ln.strip("*-# ") for ln in text.splitlines() if re.search(r"licen[cs]e|cc[- ]by|mit|public domain|attribution", ln, re.I)]
    return " / ".join(lines)[:200] or (m.group(0) if m else "?")


def main(out: str):
    from piper import PiperVoice, SynthesisConfig
    from faster_whisper import WhisperModel
    import librosa

    os.makedirs(out, exist_ok=True)
    asr = WhisperModel("small", device="cpu", compute_type="int8")
    ref = norm_words(PASSAGE)
    results = []
    for c in CANDIDATES:
        subprocess.run(["bash", os.path.join(ROOT, "pipeline", "fetch_voice.sh"), c["model"]], check=True)
        path = os.path.join(ROOT, "models", "piper", f"{c['model']}.onnx")
        cfg = json.load(open(path + ".json"))
        nasal = "̃" in cfg.get("phoneme_id_map", {})
        voice = PiperVoice.load(path)
        syn = SynthesisConfig(speaker_id=c["speaker"], length_scale=1.0)
        audio = np.concatenate([ch.audio_float_array for ch in voice.synthesize(PASSAGE, syn)])
        sr = voice.config.sample_rate
        wav = os.path.join(out, re.sub(r"[^a-z0-9]+", "-", c["label"].lower()).strip("-") + ".wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        a16 = librosa.resample(audio.astype(np.float32), orig_sr=sr, target_sr=16000)
        segs, _ = asr.transcribe(a16, language="fr", beam_size=5)
        hyp_text = " ".join(s.text for s in segs).strip()
        f0, voiced, _ = librosa.pyin(audio.astype(np.float64), fmin=60, fmax=400, sr=sr)
        f0 = f0[~np.isnan(f0)]
        semis = 12 * np.log2(f0 / np.median(f0)) if len(f0) else np.array([0.0])
        dur = len(audio) / sr
        r = {
            "voice": c["label"], "model": c["model"], "speaker": c["speaker"], "nasalMarker": nasal,
            "wer": round(wer(ref, norm_words(hyp_text)), 3), "seconds": round(dur, 2),
            "wordsPerSec": round(len(ref) / dur, 2), "pitchStdSemitones": round(float(np.std(semis)), 2),
            "voicedRatio": round(float(np.mean(voiced)), 2), "license": license_of(c["model"]), "asr": hyp_text, "file": os.path.basename(wav),
        }
        results.append(r)
        print(json.dumps(r, ensure_ascii=False), flush=True)
    json.dump(results, open(os.path.join(out, "results.json"), "w"), ensure_ascii=False, indent=1)
    md = ["| Voice | Nasal vowels | Whisper WER | Words/s | Pitch std (st) | Voiced | License |", "|---|---|---|---|---|---|---|"]
    for r in results:
        md.append(f"| {r['voice']} | {'yes' if r['nasalMarker'] else 'NO'} | {r['wer']:.1%} | {r['wordsPerSec']} | {r['pitchStdSemitones']} | {r['voicedRatio']} | {r['license']} |")
    md += ["", "Test passage:", "", f"> {PASSAGE}", ""] + [f"- **{r['voice']}** heard as: {r['asr']}" for r in results]
    open(os.path.join(out, "results.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "voices"))
