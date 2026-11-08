import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "pipeline"))

import audio_assets  # noqa: E402
import mix  # noqa: E402
import tts  # noqa: E402


def test_align_units_snaps_punctuation_to_gap():
    # 3 words, a pause after word 1 detected at 1.0-1.3 s
    times = tts.align_units([4, 4, 4], breaks=[0], duration=3.0, gaps=[(1.0, 1.3)])
    assert times[0][1] == 1.0
    assert times[1][0] == 1.3
    assert abs(times[-1][1] - 3.0) < 1e-9
    assert all(s < e for s, e in times)


def test_align_units_without_gaps_is_proportional():
    times = tts.align_units([1, 3], breaks=[], duration=4.0, gaps=[])
    e = tts.WORD_EDGE
    assert abs(times[0][1] - 4.0 * (1 + e) / (4 + 2 * e)) < 1e-9


def test_short_words_get_a_minimum_share():
    times = tts.align_units([1, 12, 1], breaks=[], duration=2.0, gaps=[])
    assert times[0][1] - times[0][0] > 0.15


def test_find_gaps_detects_silence():
    sr = 48000
    a = np.concatenate([np.sin(np.arange(sr) * 0.1), np.zeros(sr // 5), np.sin(np.arange(sr) * 0.1)])
    gaps = tts.find_gaps(a, sr)
    assert len(gaps) == 1
    assert 0.95 < gaps[0][0] < 1.05


def test_sfx_are_deterministic_and_bounded():
    a = audio_assets.sfx_pop(np.random.default_rng(1))
    b = audio_assets.sfx_pop(np.random.default_rng(1))
    assert np.array_equal(a, b)
    for name, fn in audio_assets.SFX.items():
        x = fn(np.random.default_rng(0))
        assert np.max(np.abs(x)) <= 1.0, name
        assert len(x) > 100, name
    assert abs(len(audio_assets.sfx_sting(np.random.default_rng(0))) / audio_assets.SR - 2.0) < 0.01


def test_music_has_requested_length():
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "m.wav")
        audio_assets.build_music("tense", 6.0, out, seed=1)
        data = mix.read_wav(out)
        assert abs(len(data) / mix.SR - 6.0) < 0.01


def test_duck_envelope_lowers_music_under_voice():
    voice = np.zeros((mix.SR * 2, 2))
    voice[mix.SR:, :] = 0.5
    env = mix.duck_envelope(voice, 0.6)
    assert env[int(0.3 * mix.SR)] > 0.95
    assert env[int(1.8 * mix.SR)] < 0.5
