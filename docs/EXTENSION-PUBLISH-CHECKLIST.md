# Extension Publish Checklist (CWS + deb)

Ringkas, untuk rilis extension Abelink Browser Bridge + bundel .deb.
Detail protokol: `extension/README.md`. Gate otomatis: step "Extension gate"
di `.github/workflows/tauri.yml` (`tests/browser-e2e.test.mjs`,
`tests/native-host.test.mjs`, `tests/browser-flavor.test.mjs`).

## 1. CWS — justifikasi tiap permission (`extension/manifest.json`)

| Permission | Dipakai untuk | Bukti |
| --- | --- | --- |
| `scripting` | Injeksi tagger `data-abelink-id` + aksi click/type di tab sesi | `extension/background.js` (`taggerFn`, executeScript) |
| `tabs` | Buka tab sesi, query tab aktif, tutup tab task | handler `start` / `close-task-tabs` |
| `storage` | `chrome.storage.session` (token per-port, hilang saat browser mati) + `storage.local` (peta token per-port) | `getPortToken` / `setPortToken` |
| `tabGroups` | Grup sesi `⏳/✅/❌` per task | `groupSession` di background |
| `nativeMessaging` | Baca token lokal via host `id.abelink.bridge` (tanpa copas) | `requestNativeToken` |
| `alarms` | Keepalive service worker agar long-poll tidak mati | alarm keepalive background |
| Host `http://127.0.0.1/*` | Satu-satunya network: bridge lokal sidecar (handshake/poll/result) | `base(cfg)` selalu `http://127.0.0.1:<port>` |

Host `http://*/*`, `https://*/*` = tab yang user minta agent buka (navigasi
user-initiated via `browser:navigate`), bukan telemetry.

## 2. CWS — pernyataan privasi

- Tanpa network luar: ekstensi hanya bicara ke `127.0.0.1` (bridge sidecar).
  Tidak ada analytics, telemetri, atau server pihak ketiga.
- Token bridge: acak per proses sidecar, file mode `0600`
  (prod `~/.local/share/abelink/browser-bridge-token`,
  dev `~/.local/share/abelink-dev/browser-bridge-token`; kanonik:
  `tokenPathFor` di `bridge-core.mjs`),
  disimpan browser di `chrome.storage.session` (hilang saat browser mati).
- Dua native host terpisah (`id.abelink.bridge` prod, `id.abelink.bridge.dev`
  dev); wrapper STRICT per-flavor, request namespace silang → `ok:false`
  eksplisit (bukan token flavor lain).
- Origin server di-pin ke ID extension (`chrome-extension://kdcfgmlamndkapaiakhlplckfhmjieml`,
  turunan field `key` manifest); halaman web asing ditolak 403, token salah
  401, host non-loopback 400 (DNS-rebinding protection).
- Fallback manual: user tempel token sekali via popup (details "Opsi Manual"),
  field langsung dikosongkan setelah dipakai (`popup.js`).

## 3. deb — bundling

- `src-tauri/tauri.conf.json` `bundle.resources` sudah memuat `../extension`
  (terbundel ke dalam .deb) + sidecar engine + `pc-agent-scripts`.
- Verifikasi: `bun run build:deb`, install .deb, pastikan folder extension
  ikut terbundel; `browser:status` menulis token + `ensureNativeHost`
  memasang manifest host.

## 4. Pra-rilis (jalankan berurutan)

1. `bunx vitest run tests/browser-e2e.test.mjs tests/native-host.test.mjs tests/browser-flavor.test.mjs`
   (401/403/400/404, rotasi token, path kanonik, isolasi flavor, pin ID,
   anti-drift pairing terpin).
2. `bun evaluation/smoke.mjs` (smoke tanpa network).
3. E2E manual `extension/README.md` § E2E manual (navigate → read-dom → close
   di browser sungguhan, ±10 mnt).
