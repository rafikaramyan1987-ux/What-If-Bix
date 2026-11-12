#!/usr/bin/env bash
# Download a Piper voice into models/piper/.
#   bash pipeline/fetch_voice.sh                      # default: en-us-libritts-high (CC BY 4.0, commercial use OK with credit)
#   bash pipeline/fetch_voice.sh fr_FR-tom-medium     # any voice of rhasspy/piper-voices (lang_REGION-name-quality)
# Old-style names (en-us-libritts-high, fr-siwis-medium) come from Piper's GitHub release v0.0.2,
# new-style names (fr_FR-siwis-medium, fr_FR-upmc-medium, fr_FR-tom-medium) from Hugging Face
# (rhasspy/piper-voices), together with the voice's MODEL_CARD (license).
set -euo pipefail
NAME="${1:-en-us-libritts-high}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/models/piper"
mkdir -p "$DIR"
if [[ -f "$DIR/$NAME.onnx" && -f "$DIR/$NAME.onnx.json" ]]; then echo "voice $NAME already present"; exit 0; fi
TMP="$(mktemp -d)"
if [[ "$NAME" =~ ^([a-z]{2,3})_([A-Z]{2})-([a-z0-9_]+)-(x_low|low|medium|high)$ ]]; then
  LANG_FAMILY="${BASH_REMATCH[1]}"; LOCALE="${BASH_REMATCH[1]}_${BASH_REMATCH[2]}"; VOICE="${BASH_REMATCH[3]}"; QUALITY="${BASH_REMATCH[4]}"
  BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/$LANG_FAMILY/$LOCALE/$VOICE/$QUALITY"
  curl -fsSL --retry 4 -o "$TMP/$NAME.onnx" "$BASE/$NAME.onnx"
  curl -fsSL --retry 4 -o "$TMP/$NAME.onnx.json" "$BASE/$NAME.onnx.json"
  curl -fsSL --retry 4 -o "$DIR/$NAME.MODEL_CARD" "$BASE/MODEL_CARD" || true
else
  # Piper's GitHub release (same models as rhasspy/piper-voices on Hugging Face, older exports)
  curl -fsSL -o "$TMP/v.tar.gz" "https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-$NAME.tar.gz"
  tar xzf "$TMP/v.tar.gz" -C "$TMP"
fi
cp "$TMP/$NAME.onnx" "$TMP/$NAME.onnx.json" "$DIR/"
rm -rf "$TMP"
echo "voice $NAME -> $DIR"
