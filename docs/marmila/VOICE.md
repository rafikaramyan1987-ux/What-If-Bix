# MarMila — choice of the French voice

All candidates are free Piper voices from `rhasspy/piper-voices`. They were compared by
`pipeline/voice_compare.py` (workflow **French voice comparison**, `.github/workflows/voices.yml`), which
synthesizes the same French passage with each voice (nasal vowels, liaisons, numbers, questions) and
scores it. The audio samples are attached to that workflow run as the `french-voices` artifact.

| Voice | Nasal vowels | Whisper WER | Words/s | Pitch range (st) | License |
|---|---|---|---|---|---|
| **fr_FR-siwis-medium** | yes | 4.8 % | 2.92 | 2.86 | **CC BY 4.0** |
| fr_FR-upmc-medium (jessica) | yes | 4.8 % | 2.97 | 2.35 | CC BY-SA 4.0 |
| fr_FR-upmc-medium (pierre) | yes | 3.2 % | 2.97 | 4.62 | CC BY-SA 4.0 |
| fr_FR-tom-medium | yes | 6.5 % | 2.65 | 1.92 | AGPL-3.0 |

Whisper heard *maréais* (pierre) and *lompon* (jessica) for upmc, and *marais* for tom; siwis had no
real misreading (its only "error", *Dansant* for *Dans cent ans*, is a true homophone that every voice got).

**Chosen: `fr_FR-siwis-medium` (lengthScale 1.0).**
- Clear and natural female voice, among the lowest error rates, the second most lively melody.
- tom is the flattest (pitch range 1.9 semitones, only 37 % voiced frames: breathy) and AGPL-licensed.
- upmc-pierre is the most melodic, but it is CC BY-SA (share-alike) and mispronounced *marées*;
  jessica is flatter. For a monetized channel CC BY 4.0 (attribution only) is the safest license.
- Credit (in every description): *Voix off : Piper TTS, voix fr_FR « siwis » (SIWIS, CC BY 4.0).*

Important: use the **Hugging Face export** (`fr_FR-siwis-medium`, fetched by `pipeline/fetch_voice.sh`).
The older `fr-siwis-medium` from Piper's GitHub release v0.0.2 lacks the nasal-vowel marker (U+0303), so
*vin*, *vent* and *va* sound alike. It is only accepted for local previews with
`BIX_VOICE_FALLBACK=fr-siwis-medium` and must never be published.

Timing: the validator estimates French speech at 0.0636 s per letter + 0.11 s per sentence (fitted on 109
synthesized sentences, rmse 0.31 s), so Short lengths are checked before any render.
