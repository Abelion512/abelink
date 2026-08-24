#!/usr/bin/env bash
# ocr-region.sh — fallback OCR layar (Linux-native)
# Primary OCR tetap lewat linux-daemon.py (mss + pytesseract).
# Fallback ini: screenshot layar penuh -> tesseract CLI -> teks JSON minimal.
OUT="${1:-/tmp/mark-ocr.png}"
import -window root "$OUT" 2>/dev/null || gnome-screenshot -f "$OUT" 2>/dev/null || scrot "$OUT" 2>/dev/null
if [ ! -s "$OUT" ]; then
  echo "{\"error\":\"tidak bisa mengambil screenshot\"}"
  exit 1
fi
TEXT=$(tesseract "$OUT" stdout 2>/dev/null | sed 's/"/\\"/g')
echo "{\"text\":\"$TEXT\"}"
