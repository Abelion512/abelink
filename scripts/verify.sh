#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[1/6] Unit tests (vitest)"
bunx vitest run
echo "[2/6] Crypto harness (watermark signing)"
bun run test:harness
echo "[3/6] Perf gate (regresi performa nyata >15% = gagal)"
bun run perf
echo "[4/6] MarkBench 1.0 gate (kualitas arsitektur 6 dimensi MARK-Eval)"
bun run bench:quick
echo "[5/6] Frontend build (vite + tailwind)"
bun run build
echo "[6/6] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "OK VERIFY LOLOS"
