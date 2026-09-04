#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[1/4] Unit tests (vitest)"
bunx vitest run
echo "[2/5] Crypto harness (watermark signing)"
bun run test:harness
echo "[3/5] Perf gate (regresi performa nyata >15% = gagal)"
bun run perf
echo "[4/5] Frontend build (vite + tailwind)"
bun run build
echo "[5/5] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "OK VERIFY LOLOS"
