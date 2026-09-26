#!/usr/bin/env bash
# install-cron-daemon.sh — pasang unit systemd USER untuk daemon cron Abelink.
#
# Kenapa installer, bukan `systemctl --user link`:
# ExecStart wajib absolut (bun + root repo), sedangkan path tiap mesin berbeda.
# Skrip ini mengisi placeholder pada scripts/systemd/abelink-cron.service.
#
# Idempoten: jalankan ulang untuk memperbarui unit. `enable --now` hanya
# dijalankan bila dipanggil dengan --enable (agar pemasangan tidak diam-diam
# menyalakan daemon saat user hanya ingin memasang).
#
# Usage:
#   bash scripts/install-cron-daemon.sh            # pasang / perbarui
#   bash scripts/install-cron-daemon.sh --enable   # pasang lalu enable --now
#   bash scripts/install-cron-daemon.sh --uninstall
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/systemd/abelink-cron.service"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_PATH="$UNIT_DIR/abelink-cron.service"

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user disable --now abelink-cron.service 2>/dev/null || true
  rm -f "$UNIT_PATH"
  systemctl --user daemon-reload 2>/dev/null || true
  echo "[cron] unit dihapus: $UNIT_PATH"
  exit 0
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "[cron] ERROR: systemctl tak ditemukan. Skrip ini khusus systemd Linux." >&2
  exit 1
fi

BUN_BIN="$(command -v bun || true)"
if [[ -z "$BUN_BIN" ]]; then
  echo "[cron] ERROR: bun tak ada di PATH. Pasang bun dulu (kurikulum: Bun adalah runner resmi proyek)." >&2
  exit 1
fi
BUN_DIR="$(dirname "$BUN_BIN")"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "[cron] ERROR: template tak ada: $TEMPLATE" >&2
  exit 1
fi
if [[ ! -f "$ROOT/bin/abelink-cron.mjs" ]]; then
  echo "[cron] ERROR: bin/abelink-cron.mjs tak ada di $ROOT" >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"
# Ganti placeholder. Pakai '|' sebagai delimiter agar path berbasis '/' aman.
sed -e "s|__ABELINK_ROOT__|$ROOT|g" \
    -e "s|__ABELINK_BUN__|$BUN_BIN|g" \
    -e "s|__ABELINK_BUN_DIR__|$BUN_DIR|g" \
    "$TEMPLATE" > "$UNIT_PATH"

systemctl --user daemon-reload
echo "[cron] unit terpasang: $UNIT_PATH"
echo "[cron]   root : $ROOT"
echo "[cron]   bun  : $BUN_BIN"

if [[ "${1:-}" == "--enable" ]]; then
  systemctl --user enable --now abelink-cron.service
  echo "[cron] daemon aktif. Cek: systemctl --user status abelink-cron.service"
else
  echo "[cron] belum diaktifkan. Jalankan:"
  echo "       systemctl --user enable --now abelink-cron.service"
fi
