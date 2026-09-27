#!/usr/bin/env bash
# scripts/apply-brand-assets.sh — pasang aset merek Abelink dari SATU sumber PNG.
#
# Kenapa skrip ini ada: chat/agen tidak bisa menyimpan biner, jadi penggantian
# ikon mustahil dilakukan tanpa berkas nyata di repo. Simpan PNG master
# (persegi, >= 1024x1024) lalu jalankan:
#
#   bash scripts/apply-brand-assets.sh assets/mark-source.png
#
# Skrip menulis ULANG semua target dari sumber yang sama supaya tidak ada
# target yang tertinggal (extension, Tauri, resources) dan tidak ada campuran
# ikon lama/baru. Bila ada gambar banner (lebar) terpisah:
#
#   bash scripts/apply-brand-assets.sh assets/mark-source.png --banner assets/banner.png
#
# Exit code: 0 sukses, 1 sumber tidak valid, 2 prasyarat tool hilang.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SRC=""
BANNER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --banner)
      BANNER="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [[ -n "$SRC" ]]; then
        echo "[ERROR]: argumen tak dikenal: $1" >&2
        exit 1
      fi
      SRC="$1"
      shift
      ;;
  esac
done

if [[ -z "$SRC" ]]; then
  echo "Pakai: bash scripts/apply-brand-assets.sh <sumber.png> [--banner <banner.png>]" >&2
  exit 1
fi
if [[ ! -f "$SRC" ]]; then
  echo "[ERROR]: sumber tidak ada: $SRC" >&2
  echo "        Simpan dulu PNG master ke repo (mis. assets/mark-source.png)." >&2
  exit 1
fi

if ! command -v identify >/dev/null 2>&1 || ! command -v convert >/dev/null 2>&1; then
  echo "[ERROR]: butuh ImageMagick (identify + convert). Debian/Ubuntu: sudo apt install imagemagick" >&2
  exit 2
fi

read -r SRC_W SRC_H <<<"$(identify -format '%w %h' "$SRC" | tr '\n' ' ')"
if [[ "$SRC_W" -ne "$SRC_H" ]]; then
  echo "[ERROR]: sumber harus persegi (${SRC_W}x${SRC_H}). Ikon persegi wajib; crop dulu." >&2
  exit 1
fi
if [[ "$SRC_W" -lt 512 ]]; then
  echo "[ERROR]: sumber ${SRC_W}x${SRC_W} terlalu kecil; minimal 512, disarankan 1024." >&2
  exit 1
fi

echo "[brand] sumber: $SRC (${SRC_W}x${SRC_H})"

echo "[1/4] src-tauri/icons  <- tauri icon"
bunx tauri icon "$SRC" >/dev/null
for f in 32x32.png 128x128.png 128x128@2x.png icon.png icon.icns icon.ico; do
  if [[ ! -f "src-tauri/icons/$f" ]]; then
    echo "[ERROR]: tauri icon tidak menghasilkan src-tauri/icons/$f" >&2
    exit 1
  fi
done

echo "[2/4] extension/icons   <- 16/32/48/128"
mkdir -p extension/icons
for size in 16 32 48 128; do
  convert "$SRC" -resize "${size}x${size}" -strip "extension/icons/icon${size}.png"
done

echo "[3/4] resources/        <- icon.png + icon.ico"
convert "$SRC" -resize 512x512 -strip resources/icon.png
cp src-tauri/icons/icon.ico resources/icon.ico

if [[ -n "$BANNER" ]]; then
  if [[ ! -f "$BANNER" ]]; then
    echo "[ERROR]: banner tidak ada: $BANNER" >&2
    exit 1
  fi
  read -r B_W B_H <<<"$(identify -format '%w %h' "$BANNER" | tr '\n' ' ')"
  if [[ "$B_W" -lt $((B_H * 2)) ]]; then
    echo "[WARN]: banner ${B_W}x${B_H} kurang lebar (rasio < 2:1); README memakai banner lebar."
  fi
  echo "[4/4] assets/banner-repo.png <- $BANNER"
  cp "$BANNER" assets/banner-repo.png
else
  echo "[4/4] assets/banner-repo.png DILEWATI (butuh gambar lebar terpisah)"
  echo "      Sediakan banner lalu ulangi dengan: --banner <file.png>"
fi

echo
echo "[brand] hasil:"
for f in src-tauri/icons/icon.png extension/icons/icon16.png extension/icons/icon32.png \
         extension/icons/icon48.png extension/icons/icon128.png resources/icon.png; do
  printf '  %-34s %s\n' "$f" "$(identify -format '%wx%h' "$f")"
done
echo
echo "[brand] langkah lanjut: tinjau 'git status --short', cek icon16 legible, lalu commit."
