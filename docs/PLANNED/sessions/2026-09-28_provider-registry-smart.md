# Session Log: Provider Registry Data-Driven + Smart Endpoint + STT/TTS Custom (2026-09-28)

## Tujuan
Arah owner: "bersihkan semua" hardcode provider — semua model kini bisa via custom OpenAI/Anthropic-compatible (base url + apikey + model id); normalisasi slash-after-/v1 dibuat smart system + 1 poin UX; STT/TTS bisa via 9Router/custom. Kerangka: "modular, dynamic, and more smart" — pola diambil dari konvensi repo sendiri (registry pattern ala engine/registry.mjs + NATIVE_TOOLS, modul murni shared ala semverLite.js).

## Keputusan Arsitektur
- **Satu jalur generik, nol cabang vendor**: menambah provider = menambah ENTRI di `PRESETS`, bukan if/else per vendor di runtime.
- **Smart normalizer murni & shared**: `resolveEndpointUrl()` merapikan input apa pun (trailing slash, /v1 hilang, suffix dobel, localhost->127.0.0.1, versi di tengah path) secara deterministik + idempoten, untuk chat/STT/TTS — satu aturan.
- **Legacy lewat pintu yang sama**: `normalizeLegacyProviderConfig()` memetakan aiProvider groq/cerebras lama ke jalur custom generik (endpoint legacy dari LEGACY_HOSTS + kredensial dibawa); dipanggil SEKALI di entry ai-bridge + channel sync-config, sehingga semua caller (GUI lama, CLI flag, TUI env) otomatis dinormalisasi.
- **Migrasi DB v30**: idempoten, non-destruktif (field vendor lama dipertahankan untuk downgrade aman).

## Berkas Berubah
- BARU: `src/api/ai/providerRegistry.js` (PRESETS, canonicalize/resolve/suggest/detect/normalizeLegacy), `sidecar/main/legacy-provider-shim.mjs` (re-export ala semver-lite), `tests/providerRegistry.test.mjs` (22 test).
- `sidecar/main/ai-bridge.js`: branch groq dihapus, routing custom via registry (termasuk rewrite suffix messages untuk Anthropic), pesan offline generik per endpoint, error label tanpa vendor.
- `sidecar/engine/channels/ai.mjs`: sync-config menormalisasi legacy sebelum masuk global config + shared.json.
- `sidecar/engine/channels/media.mjs`: `tts-speak` jadi router edge | custom OpenAI-compatible `/v1/audio/speech` (voice/model/key dari config) + fallback edge otomatis + timeout 30s.
- `src/api/sttRouter.js`: `normalizeSttUrl` delegasi ke registry (paritas aturan; 32 test STT tetap hijau).
- `src/api/db.js`: v30 migrasi groq->custom (idempoten) + bersihkan residual cerebras.
- `src/components/config/ModelSection.jsx`: preset dropdown gateway + preview URL final live (font-mono) di bawah input endpoint.
- `src/components/config/VoiceVideoSection.jsx`: engine selector (Edge default | Custom) + fields endpoint/model/key kondisional.
- `src/api/locale.js`: keys baru en/zh (model.preset*, voice.tts*).
- `tests/providerOffline.test.mjs`: disesuaikan kontrak generik (endpoint remote menyebut host-nya, bukan nama vendor).

## Verifikasi
- `tests/providerRegistry.test.mjs` 22/22; sttGuard+sttRouterCombo 32/32; providerOffline 4/4.
- Suite penuh: **1810 passed / 16 skipped (1826)** — naik +22 dari 1788.
- Lint 0 error (43 warnings, baseline).
- Smoke engine: `bun run build:sidecar` + ping stdio -> `engine:ready` (3x selama iterasi).
- CI PR #85: success. Run push-main `36363624827`: **success semua job termasuk Bundle AppImage/deb**.
- Merge #85 tidak memicu PR alpha otomatis (kadens manual-only sejak #72/#77) — sesuai desain.

## Batasan Dikenal
- `--provider groq` di CLI masih diterima (dinormalisasi di engine) — flag legacy tidak error, tapi tidak lagi cabang runtime.
- TTS custom belum punya tombol "Deteksi model" (model ID manual; GET /v1/models jarang ekspos daftar TTS).
- Preset STT/TTS per-gateway belum di-ekspos di UI STT (SttRouterConfig tetap endpoint-manual penuh; preset chat saja yang masuk dropdown).
- docs/PLANNED/tui-gaps-plan.md (milik sesi watcher) ikut ter-commit di PR ini — docs planning, tanpa dampak runtime.
