#!/usr/bin/env bash
# Verifikasi penuh sebelum push / rilis — WAJIB hijau.
set -e
cd "$(dirname "$0")/.."
echo "[0/9] Bootstrap (bun install, port/cargo cleanup)"
bash scripts/dev.sh --no-launch
echo "[1/9] Unit tests (vitest)"
bunx vitest run
echo "[1b/9] Extension build (transpile .ts->.js, service worker ESM)"
bun run build:extension
node --check extension/background.js
node --check extension/popup.js
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8')); if(m.manifest_version!==3){console.error('manifest_version harus 3');process.exit(1)} if(m.background.type!=='module'){console.error('background.type harus \"module\" (Chrome >= 91) — service worker ESM');process.exit(1)} for(const f of [m.background.service_worker,m.action.default_popup]){if(!fs.existsSync('extension/'+f)){console.error('artefak hilang: '+f);process.exit(1)}}"
echo "[2/9] ESLint (0 error; warning = tech-debt terdaftar)"
bun run lint
echo "[2a/9] Any-ratchet (W9: debt warisan boleh, tambahan any tidak)"
bash scripts/ci/any-ratchet.sh
echo "[2b/9] Typecheck (tsc: gate payung + sub-gate node + tests + extension) — W0 spec js-to-ts-spec.md"
bun run typecheck
bun run typecheck:node
bun run typecheck:tests
bun run typecheck:extension
echo "[3/9] Crypto harness (watermark signing)"
bun run test:harness
echo "[4/9] Perf gate (regresi performa nyata >15% = gagal)"
bun run perf
echo "[5/9] AbelinkBench 1.0 gate (kualitas arsitektur 6 dimensi ABELINK-Eval)"
bun run bench:quick
echo "[6/9] Frontend build (vite + tailwind)"
bun run build
echo "[6b/9] Sidecar smoke (binary compile + ping stdio, cwd netral)"
bun run build:sidecar
printf '%s\n' '{"id":1,"action":"ping","payload":[]}' | ( cd dist-sidecar && timeout 20 ./abelink-engine ) | grep engine:ready > /dev/null
echo "[6c/9] Sidecar smoke jalur HOT (bun engine.ts: jalur dev/GUI via SIDECAR_ENTRY)"
printf '%s\n' '{"id":1,"action":"ping","payload":[]}' | timeout 20 bun sidecar/engine.ts | grep engine:ready > /dev/null
echo "[7/9] Rust check (src-tauri)"
(cd src-tauri && cargo check)
echo "[8/9] Rust clippy (warning diperlakukan sebagai error)"
(cd src-tauri && cargo clippy --all-targets -- -D warnings)
echo "OK VERIFY LOLOS"
