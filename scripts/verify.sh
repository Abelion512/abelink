#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[1/4] Unit tests (vitest)"
bunx vitest run
echo "[2/4] Crypto harness (watermark signing)"
bun run test:harness
echo "[3/4] Frontend build (vite + tailwind)"
bun run build
echo "[4/4] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "OK VERIFY LOLOS"
