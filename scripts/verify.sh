#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[0/8] Bootstrap (bun install, port/cargo cleanup)"
bash scripts/dev.sh --no-launch
echo "[1/8] Unit tests (vitest)"
bunx vitest run
echo "[2/8] ESLint (0 error; warning = tech-debt terdaftar)"
bun run lint
echo "[3/8] Crypto harness (watermark signing)"
bun run test:harness
echo "[4/8] Perf gate (regresi performa nyata >15% = gagal)"
bun run perf
echo "[5/8] MarkBench 1.0 gate (kualitas arsitektur 6 dimensi MARK-Eval)"
bun run bench:quick
echo "[6/8] Frontend build (vite + tailwind)"
bun run build
echo "[7/8] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "OK VERIFY LOLOS"
