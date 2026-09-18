# Session Log: Tahap 1 — Kartu Identitas Standar (CapabilityDescriptor)

Tanggal: 2026-09-18 | Branch: `feat/capability-descriptor` | Status: selesai, menunggu review/merge

## Keputusan
- Unifikasi penuh via kontrak kanonis CapabilityDescriptor {id, kind, description, inputSchema, scopes, guide, enabled, source}.
- Adapters additive-only: perilaku loadPlugins/pluginExecute + channels skills.* tidak berubah.
- Namespacing id: `plugin:<plugin>:<action>`, `skill:<name>`.

## Berkas berubah
- BARU `sidecar/main/capabilities/descriptor.mjs` — validateDescriptor / normalizeDescriptor / toPromptLine / toGuide.
- `sidecar/main/plugins/plugin-loader.js` +37 baris — pluginToDescriptors (parameters→schema, default {query}, enabled=isEnabled!==false, invalid→[]).
- `sidecar/engine/channels/skills.mjs` +28 baris — skillToDescriptor (inputSchema kosong, enabled true, invalid→null).
- BARU `tests/capability-descriptor.test.mjs` (8), `tests/plugin-descriptor.test.mjs` (4), `tests/skill-descriptor.test.mjs` (3).

## Hasil verifikasi
- 3 file test baru: 15/15 hijau.
- Interop: output kedua adapter lolos validateDescriptor (OK semua).
- Lint: 0 error; 1 warning pre-existing (no-useless-escape plugin-loader.js:39, ada sebelum patch — terverifikasi via stash).
- Regresi: capabilities.test.mjs + configCapabilities.test.js + builtinPlugins.test.js = 42/42 hijau.

## Batasan dikenal
- Descriptor belum dipakai di registry/prompt/exec — itu Tahap 2 (satu pintu) dan Tahap 3 (registry prompt).
- Skill belum punya toggle/version; enabled default true, version default '1'.
- Plugin scopes default [] — penentuan scope berbahaya di Tahap 2/4.

## Berikutnya
- Tahap 2: executeCapability satu pintu + timer penunggu resmi + plugin:execute jadi alias.
- Tahap 3: registry prompt seragam + kemasan paket + install-git ikut pintu baru.
- Tahap 4: token isolation + enkripsi + refresh otomatis + validasi input ketat.
