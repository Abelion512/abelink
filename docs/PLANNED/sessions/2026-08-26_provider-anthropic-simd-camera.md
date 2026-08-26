# Session Log — 2026-08-26: Provider Trio + Anthropic Custom + Fallback SIMD & Kamera

## Ringkasan

**Keywords:** provider AI tiga, custom endpoint anthropic, openai compatible /v1, gagal save endpoint, WASM SIMD tidak didukung, no available backend, whisper STT error, embedding fallback hash, kamera izin ditolak NotAllowedError, OverconstrainedError webview, graceful degradation

- **Tanggal:** 2026-08-26 | **Branch:** 5.5.0 | **Pemicu:** laporan owner hasil uji jalan lokal (`bun run app`): (1) provider harus tinggal LM Studio/Gemini Web/Custom dgn dukungan OpenAI maupun Anthropic dan pasti bisa di-save; (2) log konsol penuh error WASM SIMD + izin kamera/mic.
- Audit trail: grep docs/PLANNED "anthropic|SIMD|getUserMedia|provider custom" -> tidak ada patch serupa sebelumnya (log terdekat: version-reset & rust-hardening 2026-08-26, scope beda). Scope BARU.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Save custom ditolak kecuali URL berakhir /chat/completions; user cukup menulis /v1 | Configuration.jsx (validasi save) | validasi terlalu sempit era OpenAI-only | validasi baru: http(s) + akhiran /v1 atau /chat/completions, ATAU memuat "anthropic", ATAU protokol dipaksa anthropic | DONE |
| Endpoint Anthropic-compatible tak bisa dipakai sama sekali | sidecar/main/ai-bridge.js | hanya protokol OpenAI; URL dipakai mentah | resolusi protokol (auto: deteksi kata "anthropic" di URL; bisa dipaksa via config.customApiProtocol), URL -> /v1/messages, header x-api-key + anthropic-version, konversi payload (system terpisah, tanpa role system, max_tokens wajib, role bergantian dgn merge dobel, prepend user bila dibuka assistant), parsing respons content blocks (+thinking) | DONE |
| UI tidak punya cara memilih protokol | Configuration.jsx | - | select Protokol API (Auto/OpenAI/Anthropic) tersimpan di config.customApiProtocol, default 'auto'; hint & pesan warning disesuaikan | DONE |
| Log spam "WASM SIMD is not supported" + STT mati total | src/api/embedding.worker.js, whisperWorker.js | transformers.js butuh backend SIMD; WebKitGTK lingkungan owner tak menyediakan | rantai fallback: wasm-SIMD -> env.backends.onnx.wasm.simd=false + retry non-SIMD (embedding); webgpu -> wasm -> non-SIMD (whisper) | DONE |
| Error load STT muncul sebagai console.error menakutkan | App.jsx | catch hanya log error | diganti console.warn satu baris berisi panduan (lokal mati, Groq tetap bisa) | DONE |
| Spam "Preview camera error"/"Mic/Cam permission denied" berulang | Configuration.jsx | WebKitGTK/wry menolak getUserMedia tanpa dialog; tiap mount komponen mencoba lagi | ConfigCameraPreview punya state camError + render pesan ramah in-place; efek enumerasi perangkat guard mediaDevices undefined + warn sekali dengan penjelasan bukan fatal | DONE |

Catatan batas platform: izin kamera/mic pada wry(WebKitGTK) memang belum ada mekanisme prompt-nya; perilaku sekarang = degradasi sopan. Dukungan penuh butuh port native (Fase B/C backlog).

Verifikasi konversi Anthropic dilakukan lewat replikasi logika di node: system ganda merge, assistant pembaka -> prepend user "(lanjutkan)", user berturut-turut digabung, konten array vision diratakan teks.

## Files Modified

| File | Perubahan |
|---|---|
| sidecar/main/ai-bridge.js | protokol custom openai/anthropic: URL+headers, konversi body, parsing respons |
| src/pages/Configuration.jsx | validasi save longgar-but-benar, select protokol, preview kamera ramah-gagal, enumerasi perangkat guard |
| src/api/embedding.worker.js | fallback non-SIMD sebelum menyerah |
| src/api/whisperWorker.js | rantai fallback webgpu->wasm->non-SIMD |
| src/App.jsx | warning pandu pengganti console.error STT |

## Agent Learnings

- Validasi input yang "benar" harus mengikuti mental model user ("/v1 itu lengkap"), bukan format internal pipeline ("butuh URL penuh"); normalisasi URL adalah tugas pipeline.
- Anthropic Messages vs OpenAI Chat: system param terpisah, max_tokens WAJIB, role harus alternating mulai user — selalu merge pesan berurutan sebelum kirim.
- `no available backend ... SIMD` dari onnxruntime-web bisa diatasi `env.backends.onnx.wasm.simd = false`; cek juga jalur webgpu yang gagal inisialisasi meski navigator.gpu ada.

## File Invariants

| File | Invariant |
|---|---|
| sidecar/main/ai-bridge.js | Jalur custom TIDAK boleh mengirim response_format ke Anthropic (tidak didukung); skema JSON tetap lewat instruksi system. |
| Configuration.jsx | Pesan error lingkungan (izin/webview) wajib in-place & ramah; larang console.error berulang. |

## Verification Checklist

- [x] node --check ai-bridge.js OK
- [x] eslint 0 error file yang diubah
- [x] vitest 10/10
- [x] verify.sh exit 0
- [x] Sanity konversi anthropic (merge/alternating/prepend) benar

## Callback

Untuk uji nyata Anthropic: mau saya tambahkan tombol "Test Koneksi" di section Custom API yang mengirim ping mini (1 token) dan menampilkan status protokol yang terdeteksi?
