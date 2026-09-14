# Session Log 2026-09-14 — Isolasi Prod/Dev Browser Bridge + Pairing Zero-Click (PR #11)

## Ringkasan

**Keywords:** browser bridge isolation, isolasi prod dev, flavor token path, native host dev, id.abelink.bridge.dev, pinned pairing, pairing terpin, zero-click resume, silent auto-switch, token path drift, browser-bridge-token, extension publish checklist, PR main.

- Tanggal: 2026-09-14. Branch: `feat/browser-flavor-isolation` → PR #11 ke `main` (OPEN, MERGEABLE).
- Latar: popup extension gagal connect prod:49712 ("Sidecar tidak terjangkau") sementara dev:49713 hidup. Bukan VPN (dev tembus = loopback lolos).
- Apa: (1) kanonikalisasi path token per-flavor + strict reader, (2) dua native host berdampingan tanpa overwrite, (3) pairing pinned-flavor + zero-click resume, silent auto-switch dihapus.
- Kenapa: dev tidak boleh sentuh prod (.deb); pairing sekali lalu resume tanpa klik; fallback tempel-token manual dipertahankan (air-gap, tanpa network modern).

## Audit Trail

`grep -rln -i "browser.bridge|browser-bridge|native.host|token.*flavor|pairing.*flavor|flavor.*isolation|prod.*dev.*isolation" docs/PLANNED/ docs/` → hanya kena `2026-09-11_pr1-supervisor-ci-ux-telegram.md` (makna beda: auto-launch browser OS via xdg-open, bukan isolasi/pairing) + `docs/EXTENSION-PUBLISH-CHECKLIST.md` (file milik sesi ini sendiri). Semantic check ringkasan 5 session log → tidak ada makna "flavor isolation / native host dev / pinned pairing". Commit terkait lama (`6c7cd7b` dual-port, `9a4f804`/`b166360` auto-launch) = fondasi, bukan patch serupa. → File baru sah, bukan duplikat.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---|---|---|---|---|
| Token path drift (P0): writer `<base>/abelink/token`, reader `<base>/token` | `sidecar/main/browser/bridge-core.mjs`, `native-host.mjs` (wrapper py), `extension/native-host/abelink-bridge-host.mjs` | Segmen `/abelink` hilang di reader; test lama meng-encode path salah | `tokenPathFor({base,flavor,env})` kanonik (prod `<xdg>/abelink/token`, dev `<over>/token`); reader strict + tolak namespace silang | ✅ |
| Single native host overwrite (dev hancurkan pairing prod) | `sidecar/main/browser/native-host.mjs`, `server.mjs` | `ensureNativeHost()` tulis manifest sama utk prod+dev | `NATIVE_HOST_NAME_DEV='id.abelink.bridge.dev'`; `ensureNativeHost({flavor})` hanya tulis file flavor-nya; `server.mjs` teruskan flavor dari port | ✅ |
| Installer double-brand dev (`abelink-dev/abelink/native-host`) | `native-host.mjs` `hostDirFor()` | `join(dataHome,'abelink',...)` padahal dataHome dev sudah branded | `hostDirFor()` flavor-aware | ✅ |
| Silent auto-switch prod↔dev | `extension/popup.js` `autoConnect`, `background.js` | `alive.find/alive[0]` pilih port hidup diam-diam | Pairing `chrome.storage.local['abelink.pairing']` dibuat sekali saat klik Pakai/Connect; resume hanya flavor terpin; switch eksplisit | ✅ |
| Duplikasi flavor.mjs vs inline background.js (ponytail) | `extension/flavor.mjs` → dihapus | Modul 15 baris + salinan inline + test anti-drift | Test baca literal background.js langsung; hapus modul+file | ✅ |
| tokenPathFor 39 baris, 4 cabang regex overlap (ponytail) | `bridge-core.mjs` | Branching per-bentuk base | Normalisasi base dulu (strip brand), satu cabang prod/dev → 17 baris, perilaku sama (test hijau) | ✅ |
| Wrapper python inline ~60 baris (ponytail, DITOLAK) | `native-host.mjs` | Tampak bloat | DIPERTAHANKAN: fallback user .deb tanpa bun/node = load-bearing | ⏭️ skip beralasan |

## Files Modified

| File | Perubahan |
|---|---|
| `sidecar/main/browser/bridge-core.mjs` | `tokenPathFor` + `flavorFromPort`; writer/reader kanonik |
| `sidecar/main/browser/native-host.mjs` | Dua host, installer per-flavor, wrapper strict per-flavor |
| `sidecar/main/browser/server.mjs` | Flavor dari port; `xdgDataDir(flavor)` tanpa `dataHome.mjs` (tak ada di main) |
| `extension/native-host/abelink-bridge-host.mjs` | `--flavor=` + strict path + tolak mismatch |
| `extension/background.js` | Mapping inline kanonik, `getPairing/setPairing`, host-per-port, resume terpagar |
| `extension/popup.js` | Tanpa auto-pilih-hidup; hint pilih-sekali; status pin |
| `extension/README.md` | Path token benar per-flavor |
| `tests/browser-flavor.test.mjs` (baru) | Kanonik literal + anti-drift resume/popup |
| `tests/browser-bridge/e2e/native-host.test.mjs` | Kasus isolasi, no-overwrite, strict, 401/403 |
| `.github/workflows/tauri.yml` | Step "Extension gate" di job frontend |
| `docs/EXTENSION-PUBLISH-CHECKLIST.md` (baru) | Justifikasi permission, privasi, deb, pra-rilis |

## Agent Learnings

1. **Worktree diperebutkan sesi paralel = wipe berulang.** Perubahan extension hilang 2x (stash sesi lain + reset sendiri). Pola selamat: backup patch ke `/tmp/*.patch` SEBELUM operasi git berisiko; verifikasi `grep -c` + checksum (`md5sum`) segera setelah apply.
2. **`git apply` atomic: satu file gagal = semua gagal.** Split per-file (`python3` split `diff --git` — hati-hati `IndexError` bila part kosong; filter `p.strip()`) lalu `apply --check` per file.
3. **Jangan pin ke modul sesi lain yang belum di main.** `server.mjs` pertama import `dataHome.mjs` (milik sesi VAD, tak ada di main) → patch gagal di branch baru. Tulis ulang dengan primitif `main` (`process.env` langsung).
4. **Dokumen kontribusi bisa konflik: `AGENTS.md` menang.** `CONTRIBUTING.md` bilang mainline=`linux`, `AGENTS.md` bilang `main` aktif + `linux` pelacak publik. Verifikasi by data: `git branch -r` — origin/abelink tak punya `linux`. PR ini → `main` (benar).
5. **Aturan PR repo ini: branch + PR ke `main`, jangan commit langsung ke `main`.** Patch kecil (typo 1-2 baris) boleh langsung; ini bukan patch kecil.
6. **Koreksi klaim referensi dengan jujur.** KeePassXC pakai unique-name association, bukan token/ID; file mereka tak klaim auto-resume tanpa klik. Pola kita = adaptasi, bukan tiruan 1:1. Tulis koreksi di PR body.
7. **Chrome Native Messaging (by data, developer.chrome.com):** manifest wajib name/path-absolut/type:stdio/allowed_origins (tanpa wildcard); lokasi user `~/.config/google-chrome/NativeMessagingHosts/`; protokol stdio JSON UTF-8 + prefix 32-bit; batas 1MB host→Chrome; `sendNativeMessage`=spawn per pesan; permission `nativeMessaging` wajib; debug via stderr.
8. **`docs/eval/` untracked bukan milik sesi ini** — jangan bawa ke commit/PR.

## File Invariants

| File | Invariant |
|---|---|
| `extension/manifest.json` `key` ↔ `native-host.mjs` `EXTENSION_ID` | Pin anti-drift (test `native-host.test.mjs`); jangan ubah satu tanpa satunya |
| `sidecar/main/browser/bridge-core.mjs` `tokenPathFor` | Kanonik tunggal path token; writer/reader/wrapper/host mjs wajib mirror rumus ini |
| `chrome.storage.local['abelink.pairing']` | Satu-satunya sumber flavor terpin; resume tanpa pairing = diam |
| `~/.config/*/NativeMessagingHosts/id.abelink.bridge{,.dev}.json` | Dua file berdampingan; installer tak boleh sentuh file flavor lain |
| Branch `fix/ri-verification-gate` + 8 stash `WIP sesi lain` | Milik sesi lain — JANGAN hapus/apply/push |

## Verification Checklist

- [ ] `bunx vitest run tests/browser-bridge.test.mjs tests/browser-e2e.test.mjs tests/native-host.test.mjs tests/browser-flavor.test.mjs` → 66/66 (terakhir hijau 11:46 di branch baru)
- [ ] `bun run lint` → 0 errors
- [ ] `bun evaluation/smoke.mjs` → LOLOS
- [ ] Reload extension → pilih flavor sekali → tutup browser → buka → hijau tanpa klik (E2E manual, pending di user)
- [ ] Bukti isolasi: diff manifest prod sebelum/sesudah run dev = nol; `ss -ltnp` port sesuai instansi
- [ ] Gate repo lain masih RED di luar scope PR ini (perf 2 regresi, bench latency, vitest flaky) → jangan tag rilis dari PR ini

## Callback

PR #11 sudah OPEN + MERGEABLE ke `main` — mau saya merge sekarang, atau tunggu E2E manual pilih-flavor-sekali + resume-tanpa-klik di mesin Anda lolos dulu?
