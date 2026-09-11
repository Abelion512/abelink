#!/usr/bin/env bash
set -e

KEY="${CUSTOM_API_KEY:-bench-token}"
URL="${CUSTOM_ENDPOINT:-http://127.0.0.1:20128/v1}"
MODEL="${BENCH_MODEL:-claude-work}"

mkdir -p reports

echo "=== [1/3] Memulai Benchmark Sumbu 1: VANILLA ==="
CUSTOM_API_KEY="$KEY" CUSTOM_ENDPOINT="$URL" bun evaluation/run.mjs \
  --arch vanilla \
  --model "$MODEL" \
  --provider custom \
  --runs 3 \
  --out reports/bench-vanilla.json

echo "=== [2/3] Memulai Benchmark Sumbu 2: BASIC ==="
CUSTOM_API_KEY="$KEY" CUSTOM_ENDPOINT="$URL" bun evaluation/run.mjs \
  --arch basic \
  --model "$MODEL" \
  --provider custom \
  --runs 3 \
  --out reports/bench-basic.json

echo "=== [3/3] Memulai Benchmark Sumbu 3: AVO ==="
CUSTOM_API_KEY="$KEY" CUSTOM_ENDPOINT="$URL" bun evaluation/run.mjs \
  --arch avo \
  --model "$MODEL" \
  --provider custom \
  --runs 3 \
  --out reports/bench-avo.json

echo "=== Seluruh Sumbu Benchmark Selesai Dijalankan ==="
