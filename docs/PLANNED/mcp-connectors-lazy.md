# Desain Connector MCP (Lazy Load-When-Needed) — MARK Linux

Status: DESAIN — belum diimplementasi (fitur berikutnya) · Tanggal: 2026-08-26
Prasyarat arsitektur: `@modelcontextprotocol/sdk` sudah ada di `package.json`.

## Prinsip

Connector MCP mengikuti kontrak **load-when-needed** yang sama dengan pola lazy
di `sidecar/engine.mjs` (lazy getter per modul): tidak ada server MCP yang
dihubungi saat boot aplikasi. Boot tetap instan apa pun jumlah connector yang
dikonfigurasi user.

## Kontrak Wajib

| Aturan | Detail |
| --- | --- |
| Koneksi malas | `connect(serverId)` hanya dipanggil saat tool/resource milik server itu pertama kali dipakai oleh agen |
| Enumerasi ditunda | Daftar capability (tools/resources) baru diambil saat koneksi pertama berhasil, lalu di-cache |
| Idle disconnect | Setelah N menit tanpa pemakaian (default 10), koneksi ditutup; state capability tetap di-cache agar reconnect murah |
| Cache capability | Per-server, invalid saat connector dinonaktifkan/dikonfigurasi ulang lewat UI |
| Kegagalan terisolasi | Server mati/timeout tidak boleh menggagalkan channel lain; error frame ala node_invoke (`{success:false,error}`) |
| Konfigurasi user | Daftar server (command/args/env atau URL) disimpan di config Dexie + sinkron ke sidecar via `sync-config` |

## Peta Implementasi Nanti

1. Sidecar: modul baru `sidecar/main/mcp/mcp-manager.js` berisi pool koneksi lazy
   (pola `lazy()` getter dari `engine.mjs`); channel `mcp:list`, `mcp:call`,
   `mcp:connect-now` didaftarkan deny-by-default di `ALLOWED_ACTIONS`
   (`src-tauri/src/cmd_node_bridge.rs`), aksi eksekusi tool masuk daftar approval
   bila berbahaya.
2. Renderer: `src/api/mcpCache.js` meniru pola `skillsCache.js` (TTL +
   invalidation event `mcp-updated`); planning menyuntikkan tool MCP ke prompt
   hanya dari server yang sudah pernah tersambung ATAU metadata ringkas hasil
   enumerasi terakhir.
3. UI: halaman Configuration section baru (`cfg-mcp`) — tambah/hapus/toggle
   server, uji koneksi manual.

## Catatan Migrasi Terkait

- Channel `plugins:*` saat ini **dorman** di garis Tauri (tidak terdaftar di
  `engine.mjs` maupun `ALLOWED_ACTIONS`). Saat plugin runtime dihidupkan kembali
  (rencana C4: Web Worker sandbox), wiring wajib memakai pola lazy yang sama:
  listing = metadata saja, import kode plugin hanya saat eksekusi.
