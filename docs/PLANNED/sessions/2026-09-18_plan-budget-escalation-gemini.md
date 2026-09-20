# Session Log: Budget Tangga + Eskalasi + Gemini Fallback

Tanggal: 2026-09-18 | Branch: `feat/plan-budget-escalation` | Status: selesai, siap merge

## Masalah
- Pesan "batas langkah keamanan" sering muncul di tugas panjang (refactor capability).
- Gemini Web 4x GEMINI_WEB_LIMITED beruntun (blokir /sorry Google).

## Keputusan
- Paket A: medium 16->24, high 32->48 (tool-call ikut 8->12, 16->24); auto boleh xhigh (64) via threshold skor >=5.
- Paket B: eskalasi satu-kali +16 langkah bila ada progres tool sukses 5 langkah terakhir; dicatat trajectory `budget-extended`.
- Paket Gemini: cooldown persisten file XDG (selamat restart) + pesan sisa menit + fallback rantai ke server lokal bila custom kosong.
- Batas TIDAK dihapus: rem anti-spiral tetap perlu.

## Berkas berubah
- `src/api/ai/effortSystem.js`: budget medium/high + AUTO_SCALE.max xhigh + AUTO_MAX xhigh.
- `src/api/ai/effortEstimator.js`: threshold >=5 xhigh; komentar AUTO_SCALE.
- `src/api/ai/planStepBudget.js`: docstring angka baru.
- `src/hooks/agent/useAbelinkPlan.js`: BUDGET_EXTENSION_STEPS=16 + cabang eskalasi (cek resultString 5 terakhir, trajectory log, pesan konvergen).
- `sidecar/main/services/gemini-web.js`: cooldown file XDG 0600 + retryAfterMs + pesan menit + load saat import/call.
- `sidecar/main/ai-bridge.js`: fallback rantai gemini-web -> local (9Router/LM Studio) bila custom kosong.
- `docs/effort-system-spec.md`: angka §9/§10/§18/§19 disinkronkan.
- Tests: planStepBudget (24/48/64), effortEstimator (xhigh, 12, AUTO_SCALE), geminiWebSorry (retryAfter + persistensi, env-first dynamic import).

## Hasil verifikasi
- 7 file effort/budget: 106/106 hijau. 6 file gemini+effort: 73/73.
- limit-ladder.mjs ikut angka baru otomatis (tanpa patch).
- ESLint: 0 error; warning tersisa = pre-existing (verifikasi baris).
- evaluation smoke tidak dijalankan (perlu network); vitest + eslint + cargo tidak tersentuh Rust.

## Batasan dikenal
- Estimator auto masih buta konteks sesi panjang (hanya teks perintah pertama).
- Fallback lokal butuh 9Router/LM Studio hidup; bila mati -> error lokal provider-aware.
- File UI tak terkait sudah kotor di tree sebelum sesi — TIDAK ikut commit ini.

## Berikutnya
- Merge ke feat/apple-design. Wiring UI CapabilitiesHub registry/bundle masih antre.
