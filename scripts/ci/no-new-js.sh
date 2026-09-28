#!/usr/bin/env bash
# Ratchet no-new-JS (spec js-to-ts-spec.md W0; blocker B-13 master program):
# zona migrasi dilarang menerima file .js/.jsx/.mjs BARU. Rename .js -> .ts
# aman: path baru yang terdeteksi --diff-filter=A bertipe .ts, tidak match.
#
# Menjalankan hanya pada event pull_request. Push ke main lolos karena
# HEAD == base sehingga diff kosong; push ke branch lain tetap dijaga
# lewat PR-nya masing-masing.
set -euo pipefail

if [ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]; then
  echo "no-new-js: dilewati (bukan event pull_request)"
  exit 0
fi

BASE_REF="${GITHUB_BASE_REF:-main}"
BASE="origin/${BASE_REF}"
git fetch origin "${BASE_REF}" --quiet 2>/dev/null || true

ADDED=$(git diff --diff-filter=A --name-only "${BASE}...HEAD" \
  | grep -E '^(src|sidecar|cli|bin|scripts|evaluation|tests)/.*\.(js|jsx|mjs)$' || true)

if [ -n "$ADDED" ]; then
  echo "::error title=No-new-JS ratchet::File JS baru di zona migrasi dilarang (spec js-to-ts-spec.md W0). Konversi ke .ts atau hapus:"
  echo "$ADDED"
  exit 1
fi

echo "no-new-js: bersih (zona migrasi tidak menerima JS baru)"
