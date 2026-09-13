#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[0/9] Bootstrap (bun install, port/cargo cleanup)"
bash scripts/dev.sh --no-launch
echo "[1/9] Unit tests (vitest)"
bunx vitest run
echo "[2/9] ESLint (0 error; warning = tech-debt terdaftar)"
bun run lint
echo "[3/9] Crypto harness (watermark signing)"
bun run test:harness
echo "[4/9] Perf gate (regresi performa nyata >15% = gagal)"
bun run perf
echo "[5/9] AbelinkBench 1.0 gate (kualitas arsitektur 6 dimensi ABELINK-Eval)"
bun run bench:quick
echo "[6/9] Frontend build (vite + tailwind)"
bun run build
echo "[7/9] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "[8/9] Rust clippy (warning diperlakukan sebagai error)"
(cd src-tauri && cargo clippy --all-targets -- -D warnings)
echo "OK VERIFY LOLOS"
