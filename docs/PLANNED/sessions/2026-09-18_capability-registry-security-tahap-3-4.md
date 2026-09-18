# Session Log: Tahap 3+4 — Registry Seragam + Kemasan + Keamanan Berlapis

Tanggal: 2026-09-18 | Branch: `feat/capability-registry-security` | Status: selesai, siap merge

## Keputusan
- Registry terpadu satu sumber (connectors + MCP + plugins + skills) untuk blok prompt + validasi bundle.
- Bundle = paket pasang-sekali (daftar id + deniedScopes), tersimpan 0600.
- Validasi input sebelum run di 3 rute; skill dilewati (tanpa args).
- Token/kredensial tidak pernah ke renderer (listConnections sanitasi).
- plugin:execute + plugin:install-git kena dialog native; skill exec sunyi (read-only).

## Berkas berubah
- BARU `registry.mjs` (listRegistry), `bundles.mjs` (install/list/remove), `validation.mjs` (validateArgs).
- `manager.mjs`: wiring validasi + listConnections sanitasi (async).
- `shell-tool.mjs`: import node-tools jadi LAZY (lihat bug di bawah).
- `channels/capabilities.mjs`: registry/bundle-install/bundle-list/bundle-remove.
- `channels/skills.mjs`: listSkillsMeta (reuse get-all).
- `plugin-loader.js`: audit install-git; selebihnya utuh.
- `planning.js`: blok registry + Plugins + Connectors (one-liner, lazy detail).
- `tauri-bridge.js`: listCapabilityRegistry + 3 fn bundle.
- `toolDispatcher.js`: fallback plugin via executeCapability('plugin',...).
- `cmd_node_bridge.rs`: gate + family plugin-write + readonly arm skill.
- Tests: registry (5), bundle (5), validation (10); capabilities.test.mjs 1 asersi sanitasi.

## Bug ditemukan saat integrasi (diperbaiki)
- `listRegistry()` timeout 5 detik saat digabung 4 file test. Akar: rantai
  `catalog -> shell-tool -> node-tools -> googleapis` (~2 detik import) +
  pemindaian `~/Documents` asli oleh loadPlugins.
- Perbaikan: (a) shell-tool.mjs import node-tools LAZY via getRunShell()
  (katalog 2 detik -> 66ms); (b) registry+bundle test set
  XDG_DOCUMENTS_DIR ke temp (hermetik). Satu-satunya importer
  node-tools adalah shell-tool — aman.
- Kemungkinan susulan: modul berat lain (google-*) masih diimpor penuh
  saat run-shell pertama dipakai — di sisi exec, bukan registry; terima.

## Hasil verifikasi
- 10 file capability/wait: 85/85 hijau. Regresi tetangga: 80/80.
- ESLint file baru: 0 error 0 warning (23 warning di file lama = pre-existing).
- cargo check + clippy -D warnings: hijau.

## Batasan dikenal
- Validator nested 1 level; tanpa backoff polling; authorize return tak diubah.
- Storage belum disatukan (Documents vs XDG skills) — fase susulan opsional.
- CapabilitiesHub UI belum baca registry/bundle baru — wiring UI susulan.

## Berikutnya
- Merge ke feat/apple-design (di bawah). Wiring UI CapabilitiesHub opsional.
