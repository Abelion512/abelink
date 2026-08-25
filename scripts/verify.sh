#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[1/3] Unit tests (vitest)"
bunx vitest run
echo "[2/3] Frontend build (vite + tailwind)"
bun run build
echo "[3/3] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "✓ VERIFY LOLOS"
