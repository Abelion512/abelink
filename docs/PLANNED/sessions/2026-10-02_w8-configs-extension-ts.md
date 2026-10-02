# Session Log — W8: config root + extension ke TypeScript (PR #118)

Tanggal: 2026-10-02 | Branch: `refactor/ts-w8-configs-extension` | Merge squash: `698aef2d`

## Koreksi yang paling penting di wave ini

Awalnya wave ini dirancang dari `js-to-ts-spec.md` §W8 yang_isyu saya susun
sendiri: `extension/src/**.ts` + bundel esbuild + output folder baru
`dist-extension/`. Itu **bukan standar Abelink** — dokumen itu artefak migrasi,
bukan keputusan owner.

 dippingrowth|. Yang dipakai sebagai gantinya:

1. `docs/REFERENCE-LIBRARY.md` — peta referensi yang benar-benar ditetapkan
   (entri #15 `ChromeDevTools/chrome-devtools-mcp`).
2. Dokumentasi resmi Chrome untuk extension service worker.

Hasilnya membatalkan desain bundel. Chrome mendokumentasikan bahwa extension
service worker boleh berupa **modul ES**:

    "background": { "service_worker": "...", "type": "module" }

(https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics,
Chrome >= 91.)

Artinya aturan lama di `scripts/verify.sh` — "background.js wajib klasik tanpa
top-level import/export" — adalah **pembatasan warisan kita sendiri**, bukan
aturan Chrome. Setelah dibongkar, tidak ada alasan untuk bundler sama sekali.
Rencana: bundel + `dist-extension/` dibuang, diganti transpile `.ts` -> `.js`
dengan struktur modul dipertahankan, output ke dalam `extension/` itu sendiri.

**Dampak ke alur kerja owner: nol.** Folder "Load unpacked" tetap `extension/`.
Yang bertambah satu langkah: `bun run build:extension` sebelum reload.

## Keputusan

1. **Sub-gate `typecheck:extension` (BARU) strict penuh**, bukan longgar seperti
   `tsconfig.tests.json`. Kode extension adalah kode produk yang jalan di browser
   milik user. `types: []` memastikan `fs`/`child_process` tidak bisa bocor ke
   sana — boundary Tauri dijaga di kedua arah (renderer juga `types: []`).
2. **299 error tsc `background.ts` ditutup semua**, bukan diturunkan lewat flag.
   Kelas yang ditemukan dan cara menutupnya:
   - TS7006/7031/7005/7034 (79) — anotasi parameter/binding. Codemod positional
     menyuntik `: any` per laporan tsc. Dua kelas damage yang harus dipulihkan:
     pattern destruktur (`{ mode: any }` = rename, bukan anotasi) dan TS7034 yang
     dilaporkan di call-site, bukan di deklarasi.
   - TS7053 (76) — object map module (`overlayStopped`, `inflight`, ...) ditulis
     `{}`; diberi `Record<string, any>`.
   - TS18047/18048 (71) — 40 dari antaranya muncul karena ambient `chrome.*` yang
     saya sendiri tulis terlalu rendah: `chrome.storage.session`,
     `chrome.tabGroups`, `chrome.windows`, dan `chrome.tabs.group` saya tandai
     opsional padahal permission-nya sudah ada di `manifest.json`. Diperbaiki di
     ambient, bukan dengan `!` di setiap call-site.
   - `useUnknownInCatchVariables: false` menutup 19 titik `catch (e)` yang
     membaca `e?.name`/`e?.message`. Opt-out satu flag, dicatat di config.

Tanggal: 2026-10-02 | Branch: `refactor/ts-w8-configs-extension` | Merge squash: `698aef2d`

## Koreksi standar di wave ini

Awalnya wave ini dirancang dari `js-to-ts-spec.md` §W8 yang disusun saya sendiri:
`extension/src/**.ts` + bundel esbuild + folder output baru `dist-extension/`.
Itu **bukan standar Abelink** — dokumen itu artefak migrasi, bukan keputusan owner.

Yang dipakai sebagai gantinya:

1. `docs/REFERENCE-LIBRARY.md` — peta referensi yang benar-benar ditetapkan
   (entri #15 `ChromeDevTools/chrome-devtools-mcp`).
2. Dokumentasi resmi Chrome untuk extension service worker.

Hasilnya membatalkan desain bundel. Chrome mendokumentasikan bahwa extension
service worker boleh **modul ES**:

    "background": { "service_worker": "...", "type": "module" }

(https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics,
Chrome >= 91.)

Artinya aturan lama di `scripts/verify.sh` — "background.js wajib klasik tanpa
top-level import/export" — adalah **pembatasan warisan kita sendiri**, bukan
aturan Chrome. Setelah dibongkar, tidak ada alasan untuk bundler. Rencana bundel
dan folder `dist-extension/` dibuang, diganti transpile `.ts` -> `.js` dengan
struktur modul dipertahankan, output ke dalam `extension/` itu sendiri.

**Dampak ke alur kerja owner: nol.** Folder "Load unpacked" tetap `extension/`.
Yang bertambah satu langkah: `bun run build:extension` sebelum reload.

## Keputusan

1. **Sub-gate `typecheck:extension` (BARU) strict penuh**, bukan longgar seperti
   `tsconfig.tests.json`. Kode extension adalah kode produk yang jalan di browser
   milik user. `types: []` memastikan `fs`/`child_process` tidak bisa bocor ke
   sana — boundary Tauri dijaga di kedua arah (renderer juga `types: []`).
2. **299 error tsc `background.ts` ditutup semua.** Kelas error dan cara menutupnya:
   - TS7006/7031/7005/7034 (79) — anotasi parameter/binding. Codemod positional
     menyuntik `: any` per laporan tsc. Dua pola damage yang harus dipulihkan
     manual: pattern destruktur (`{ mode: any }` itu rename, bukan anotasi) dan
     TS7034 yang dilaporkan di call-site, bukan di deklarasi.
   - TS7053 (76) — object map module (`overlayStopped`, `inflight`, ...) ditulis
     `{}`; diberi `Record<string, any>`.
   - TS18047/18048 (71) — 40 di antaranya muncul karena ambient `chrome.*` yang
     saya tulis sendiri terlalu lengkap/sempit: `chrome.storage.session`,
     `chrome.tabGroups`, `chrome.windows`, `chrome.tabs.group` saya tandai opsional
     padahal permission-nya ada di `manifest.json`. Diperbaiki di ambient, bukan
     dengan `!` di call-site.
   - `useUnknownInCatchVariables: false` — opt-out **satu** flag untuk 19 titik
     `catch (e)` yang membaca `e?.name` / `e?.message`. Sisa strict tetap aktif.
3. **`useUnknownInCatchVariables: false` dicatat eksplisit** di
   `tsconfig.extension.json` dengan alasannya, bukan diam-diam.
4. **Ambient `chrome.*` ditulis manual** (`extension/src/types/chrome.d.ts`),
   bukan menambah `@types/chrome`. Tidak ada dependensi baru hanya untuk typing.
   Berkas `.d.ts` itu **tidak boleh** punya `import`/`export` level atas — sekali
   punya, `declare const chrome` jadi scope module dan seluruh `extension/src/**`
   mati dengan "Cannot find name 'chrome'".
5. **Skrip native-messaging host dipindah ke program node**, bukan program
   extension: `extension/native-host/*.ts` berjalan di luar browser (Chrome
   memanggilnya lewat wrapper shell) dan memakai `fs`/`os`/`process`. Menaruhnya
   di program browser akan memaksa mematikan batas Node di satu-satunya tempat
   yang memang butuh Node.
6. **Import di dalam extension wajib ekstensi eksplisit** (`./lib/x.js`). Resolver
   modul browser tidak menebak ekstensi seperti bundler. Penjaga di
   `build-extension.ts` menangkap satu specifier tanpa ekstensi saat build — jadi
   kesalahan ini ketahuan di build, bukan saat Chrome gagal memuat extension.
7. **Wrapper native host kehilangan cabang `node`.** Sumbernya kini `.ts`; hanya
   bun yang bisa menjalankannya. Jalur python3 tetap jalur utama sehingga mesin
   tanpa bun tidak kehilangan helper token.

## Bukti perilaku tagging tidak berubah

`taggerFn` diserialisasi ke konteks halaman lewat `executeScript({func})`,
jadi ia harus tetap self-contained. Dibuktikan dua cara:

- **Differensial**: `taggerFn` versi lama (`HEAD:extension/background.js`) dan
  versi hasil build dijalankan pada DOM palsu yang sama. Output JSON identik
  (678 byte). `actionFn` dan `overlayFn` utuh ada di bundle/artefak.
- **Mirror check**: 23 nama binding modul (port, pairing, session map, helper)
  diperiksa tidak bocor ke dalam badan `taggerFn`. Tidak ada yang bocor.

## Test yang hanya berubah path, bukan ekspektasi (K9)

Tiga test membaca teks sumber extension. Ekspektasi, regex, dan ambangnya tidak
disentuh — hanya lokasi file:

- `tests/browser-flavor.test.ts` — `extension/background.js` -> `extension/src/background.ts`
- `tests/resumeSelfHeal.test.ts` — sama
- `tests/native-host.test.ts`, `tests/browser-e2e.test.ts` — path skrip host

## Hasil verifikasi

| Gate | Hasil |
| --- | --- |
| `tsc --noEmit` (payung) | exit 0 |
| `tsc -p tsconfig.node.json` | exit 0 |
| `tsc -p tsconfig.renderer.json` | exit 0 |
| `tsc -p tsconfig.tests.json` | exit 0 |
| `tsc -p tsconfig.extension.json` (BARU) | exit 0 |
| `bun run lint` | 0 error / 2478 warning (recorded debt) |
| `bunx vitest run` | **1836 pass / 16 skip** (baseline utuh) |
| `bun run build` | OK (hash artefak identik sebelum/sesudah) |
| `bun evaluation/smoke.ts` | LOLOS |
| `bun run build:extension` | exit 0 + 2 penjaga kontrak aktif |
| CI PR #118 | hijau |

## Batasan diketahui

1. **Artefak `extension/*.js` tidak ter-commit.** Kalau `chrome://extensions`
   gagal muat service worker, kemungkinan besar `build:extension` belum dijalankan
   setelah checkout/pull. Ini konsekuensi langsung dari mempertahankan folder
   `extension/` sebagai target load.
2. **`background.ts` banyak `: any`.** Diterima sebagai debt pada masa
   transisi: file ini 2045 baris JS warisan. Yang dijaga adalah `taggerFn`
   self-contained dan output identik, bukan kerapian kode.
3. **Warning `no-explicit-any` naik ke 2478** (dari 2342 pasca-W7) karena file
   `.ts` baru ikut di-lint. Semua masih warning.
4. **Skrip native host kehilangan fallback node.** Tidak ada cara lain
   menjalankan `.ts` tanpa transpile. Jalur ini hanya dipakai di test dan di alur
   `browserAuditVerify`; produksi memakai jalur python3.
