# Session 2026-09-18 — Capability Tahap 4 (keamanan berlapis, Agent D)

## Keputusan
- Validator standalone `validation.mjs`, never-throws, fail-open untuk skema asing/legacy.
- Validasi SEBELUM policy/run di 3 rute (connector, MCP, plugin); skill dilewati (tanpa args).
- `listConnections()` jadi async + sanitasi; kontrak lama `.url`/mentah dihapus dari renderer.
- Rust: `plugin:execute` + `plugin:install-git` masuk APPROVAL_ACTIONS + family
  `plugin-write`; `("skill", _)` read-only sunyi, plugin pairs tetap dialog.
- Dispatcher fallback pakai `executeCapability('plugin', ...)`; bentuk return sama.

## Berkas berubah (Agent D saja)
- NEW `sidecar/main/capabilities/validation.mjs` — `validateArgs(schema, args)`.
- `sidecar/main/capabilities/manager.mjs` — wiring validasi 3 rute + `listConnections` sanitasi (async).
- `src/hooks/agent/plan/toolDispatcher.js` — fallback plugin via executeCapability.
- `src-tauri/src/cmd_node_bridge.rs` — gate + family + readonly arm.
- NEW `tests/capability-validation.test.mjs` (10 tes).
- `tests/capabilities.test.mjs` — 1 asersi MCP `url` -> kontrak sanitasi (urlHost/toolCount/no-headers).

## Hasil verifikasi
- `bunx vitest run tests/capability-validation.test.mjs tests/capabilities.test.mjs tests/capability-unified-execute.test.mjs` — 3 file, 42 tes, hijau.
- `cargo check` (src-tauri) hijau; `cargo clippy --all-targets -- -D warnings` hijau.
- ESLint file Agent D bersih (0 error); 1 warning pre-existing di toolDispatcher.js:261 (blok choice, bukan kode Tahap 4).

## Batasan dikenal
- Validator nested object hanya 1 level; array items 1 level — cukup untuk katalog/MCP/deskriptor saat ini.
- `authorizeConnector` return tidak mengandung headers (diverifikasi baca kode, tanpa perubahan).
- Renderer lama `window.api.executePlugin` -> `plugin:execute` tetap ada tapi kini kena dialog native.
- Koordinasi: registry.mjs/bundles.mjs/planning.js/tauri-bridge.js/skills.mjs/plugin-loader.js/channels/capabilities.mjs milik Agent C — tidak disentuh.
