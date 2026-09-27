# Session Log: guardian 3-tier ala Hermes

Tanggal: 2026-09-19 | Branch: `feat/hermes-guardian` | Status: selesai, siap merge

## Masalah
- `isDangerousCommand` substring datar: false positive (`grep 'farm'` kena `rm `),
  tanpa auto-deny, tanpa self-protection. Agen bisa `rm -rf` dirinya sendiri
  (skills, token, workspace) hanya dengan 1 approval.

## Referensi ( diverifikasi dari file, bukan ingatan)
- `approval_detection.py:88-121` HARDLINE_PATTERNS; `:17-42` sensitive targets;
  `:133-150` quote-masking; `:363-390` self-dir (config.yaml/.env/launchd).
- `tool_guardrails.py`: loop guard saja, BUKAN destructive filter (koreksi
  asumsi awal).
- `approval.py:45` HERMES_YOLO_MODE frozen; `:58-111` denial breaker.

## Keputusan
- 3-tier: hardline (auto-deny, approval tak berlaku) / dangerous (approval) /
  safe. Quote-masking + shell-carrier mentah. Self-dir markers.
- Handler run-shell menolak hardline TANPA eksekusi (defense in depth di
  samping gate approval).
- Kompatibel: DANGEROUS_KEYWORDS + isDangerousCommand signature utuh;
  perluasan hanya menambah true-positive.

## Berkas berubah
- `sidecar/main/tools/_shared.mjs`: HARDLINE_PATTERNS + SELF_DIR_MARKERS +
  maskQuoted + isHardlineCommand + classifyCommand.
- `sidecar/main/tools/shellTools.mjs`: gate hardline di handler + pesan per tier.
- `sidecar/main/node-tools.js`: re-ekspor 2 helper baru.
- Tests: hermes-guardian (11).

## Hasil verifikasi
- Baru: 11/11 hijau. Regresi capabilities: 32/32 (1 flaky berlalu, hijau 2x ulang).
- ESLint: 0 error 0 warning pada 4 file.

## Batasan dikenal
- Rust gate (APPROVAL_ACTIONS) belum kenal hardline — approval dialog masih
  muncul sebelum handler menolak. Iterasi berikut: teruskan klasifikasi agar
  hardline ditolak di Rust tanpa dialog.
- Sensitive-write ala Hermes (~/.ssh, .env, rc files) belum diadopsi —
  hanya self-dir Abelink. Iterasi berikut bila dibutuhkan.
