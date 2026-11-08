#!/usr/bin/env bash
# Download a Piper voice into models/piper/. Default: LibriTTS (CC BY 4.0, commercial use OK with credit).
set -euo pipefail
NAME="${1:-en-us-libritts-high}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/models/piper"
mkdir -p "$DIR"
if [[ -f "$DIR/$NAME.onnx" && -f "$DIR/$NAME.onnx.json" ]]; then echo "voice $NAME already present"; exit 0; fi
TMP="$(mktemp -d)"
# Piper's GitHub release (same model as rhasspy/piper-voices on Hugging Face)
curl -fsSL -o "$TMP/v.tar.gz" "https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-$NAME.tar.gz"
tar xzf "$TMP/v.tar.gz" -C "$TMP"
cp "$TMP/$NAME.onnx" "$TMP/$NAME.onnx.json" "$DIR/"
rm -rf "$TMP"
echo "voice $NAME -> $DIR"
