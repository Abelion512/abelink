#!/usr/bin/env bash
set -e

KEY="${CUSTOM_API_KEY:-bench-token}"
URL="${CUSTOM_ENDPOINT:-http://127.0.0.1:20128/v1}"
MODEL="${BENCH_MODEL:-claude-work}"

# Architecture axis was reduced to vanilla + basic on 2026-09-12.
# `avo` (Fase 2 lineage/scoring) was removed; --arch avo now exits 2.
# Historical reports/bench-avo.json stay readable as `basic`-equivalent runs.
mkdir -p reports

echo "=== [1/2] Memulai Benchmark Sumbu 1: VANILLA ==="
CUSTOM_API_KEY="$KEY" CUSTOM_ENDPOINT="$URL" bun evaluation/run.mjs \
  --arch vanilla \
  --model "$MODEL" \
  --provider custom \
  --runs 3 \
  --out reports/bench-vanilla.json

echo "=== [2/2] Memulai Benchmark Sumbu 2: BASIC ==="
CUSTOM_API_KEY="$KEY" CUSTOM_ENDPOINT="$URL" bun evaluation/run.mjs \
  --arch basic \
  --model "$MODEL" \
  --provider custom \
  --runs 3 \
  --out reports/bench-basic.json

echo "=== Seluruh Sumbu Benchmark Selesai Dijalankan ==="
