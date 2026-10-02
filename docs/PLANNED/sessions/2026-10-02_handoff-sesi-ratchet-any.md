# HANDOFF — Sesi 2026-10-02 (ratchet any + audit spec + PLAN MCP)

Ditulis untuk agent yang mengambil alih. Baca entirety sebelum menyentuh apa pun.
Semua fakta di dokumen ini sudah diverifikasi ulang; bukan ingatan.

---

## 0. STATE REPO SAAT DOKUMEN INI DITULIS

```
Branch : main (bersih, sudah sync origin/main)
HEAD   : cc99fb45  refactor(browser): browserTools.ts 87 any -> 0 (#125)
Stash  : stash@{0} = milik sesi LAIN (chore/ponytail-cleanup-p1p2, WIP
         AppSidebar+UsageHeatmap). JANGAN disentuh, JANGAN di-pop.
```

`git status --short` → kosong. `bun run typecheck` → exit 0.

### PR yang merged sesi ini

| PR | Judul | Squash |
| --- | --- | --- |
| #122 | docs(plan): MCP pluggable stdio + Streamable HTTP | `b4ab81e8` |
| #123 | docs(audit): pisahkan keputusan owner vs karangan agen | `f9ee669a` |
| #124 | refactor(eval): pr46-matrix.ts 132 any → 0 | `c35ccbb4` |
| #125 | refactor(browser): browserTools.ts 87 any → 0 | `cc99fb45` |

Semua branch sudah dihapus lokal dan remote. Tidak ada branch tersisa.

---

## 1. ATURAN BARU DARI OWNER (WAJIB DIPATUHI)

> "gunakan internet paksa untuk setiap perubahan memiliki referensi. Bukan hanya
> yang berubah semua fitur dan depedensi."

Artinya: **setiap perubahan kode harus menyertakan sitasi primary source**,
bukan hanya yang berubah saja. Untuk perubahan tipe → rujukan TypeScript
official docs. Untuk perubahan perilaku → upstream yang relevan. Lihat §6.

---

## 2. PROGRAM RATCHET ANY — 2/5 SELESAI

### Cara kerja (SOP)

```bash
git checkout -b refactor/any-ratchet-<nama-file>
# ... ubah file ...
bunx eslint <file> -f json | bun -e '...hitung no-explicit-any...'   # target 0
bun run typecheck && bun run typecheck:node && bun run typecheck:tests
bunx vitest run                                    # HARUS 1836 pass / 16 skip
bun evaluation/smoke.ts                            # HARUS LOLOS
bash scripts/ci/any-ratchet.sh                     # akan PRINT "turunkan baseline"
# edit scripts/ci/any-baseline.json di PR YANG SAMA
bash scripts/ci/any-ratchet.sh                     # harus exit 0
gh pr create ... && gh pr merge --squash --delete-branch
```

**Aturan ratchet** (`scripts/ci/any-ratchet.sh`): nyata > baseline → FAIL.
Nyata < baseline → LOLOS tapi Print pengingat. **Harus turunkan baseline di PR
yang sama** atau ratchet tidak pernah mengatup.

Zona: `contract` = semua kecuali `tests/`. `tests` terpisah supaya perbaikan
test tidak menutupi additions di zona kontrak produksi.

### Progres

| Zona | Start | Sekarang | Sisa |
| --- | --- | --- | --- |
| contract | 2161 | **1941** | 1941 |
| tests | 208 | 208 | 208 |
| max | 2369 | **2149** | |

### Antrean sisa (urut dari terpadat)

| # | File | any | Status |
| --- | --- | --- | --- |
| 3 | `sidecar/main/telegram/telegram-service.ts` | 85 | **BELUM — lihat §4, ada jebakan** |
| 4 | `extension/src/background.ts` | 84 | belum |
| 5 | `evaluation/abelink-eval.ts` | 68 | belum |

Daftar lengkap per file bisa di-regenerate:

```bash
bunx eslint . -f json > /tmp/r.json
bun -e 'const d=JSON.parse(require("fs").readFileSync("/tmp/r.json","utf8"));
const p=[];for(const f of d){const n=f.messages.filter(m=>m.ruleId==="@typescript-eslint/no-explicit-any").length;
if(n)p.push([n,f.filePath.replace(process.cwd()+"/","")])}
p.sort((a,b)=>b[0]-a[0]);p.slice(0,15).forEach(([n,x])=>console.log(n,x))'
```

---

## 3. POLA YANG TERBUKTI BERJALAN (PR #124, #125)

### PR #124 — `evaluation/pr46-matrix.ts` (132 → 0, termudah)

File registry murni. Semua `any` dari satu pola: `(workdir: any, sentinel: any)`
dan `verify: (_output: any, ctx: any)`.

Tipe baru: `ToolCallEntry`, `VerifyContext`, `VerifyFn`, `Fixture`, `Task`.
Field dinamis dari adapter (`query`, `result`, `success`) → `unknown`.

**Dua jebakan yang ditemukan:**

1. **TS2783** — `withDefaults()` menulis `requiredTools` dll SEBELUM `...fixture`,
   tsc memberi pesan "specified more than once, will be overwritten".
   Fix: spread di tengah, empat field ditulis ulang pakai `??` SESUDAH spread.
   **Hasil identik** (spread terakhir menang == `??` setelah spread).
2. **Implicit any pada object literal** — `BROWSER_PAGE = { seed: (wd, s) => ... }`
   tanpa tipe kontekstual. Fix: anotasi `{ seed: Fixture['seed'] }`.

### PR #125 — `sidecar/main/tools/browserTools.ts` (87 → 0)

21 dari 87 `any` dari satu pola identik: `handler: async (query: any, config: any)`.
Sekali `browserTools` diberi `Record<string, ToolEntry>`, **sisa handler ikut
bertipe gratis** lewat contextual typing. Ini leverage terbesar.

Kontrak diambil dari call-site nyata, bukan dikarang:

| Kontrak | Bukti |
| --- | --- |
| `handler(query: string, config: object)` | `sidecar/engine/channels/ai.ts:118`, `os.ts:40` |
| `ToolResult` = `success` + `message`/`error` + `data` | `ai.ts:118` `as { success?: unknown }` |

Tipe baru: `ToolQuery`, `ToolConfig`, `ToolResult`, `ToolHandler`, `ToolEntry`,
`DispatchResponse`, `EnsureBrowserUpResult`, `Loose`, `errMessage()`.

**Tiga jebakan:**

1. **`catch (e: any)` → `catch (e)`.** Tanpa anotasi = `unknown` di bawah strict.
   Kode lama pakai `e.message` DAN `e?.message || String(e)` — keduanya tidak
   kompatibel dengan `unknown`. Solusi: helper
   ```ts
   const errMessage = (e: unknown): string =>
     e instanceof Error ? e.message : String((e as Loose | null)?.message ?? e ?? '')
   ```
   Mempertahankan perilaku ketiganya.

2. **Discriminated union + `error?: undefined`.** `extract-query.ts` punya
   `query: any` dan `ok` yang ter-infer `boolean` → `if (!resolved.ok)` tidak
   pernah menyempit, `resolved.error` selalu error. Diubah ke union literal.
   **`error?: undefined` di cabang sukses dipilih karena zona beku K9**: test
   `tests/browser-extract-contract.test.ts:8` membaca `r.error` tanpa narrowing.
   Ekspektasi test TIDAK boleh disentuh — ini yang membuatnya tetap valid.

3. **Kurung hilang saat hapus `as any`.** `await (launcher.ensureBrowserUp as any)({`
   → `await (launcher.ensureBrowserUp({` — satu `)` hilang. Tsc TS1005. Hanya
   ketahuan oleh tsc; grep `-c ': any'` sudah 0 sebelum dicek. **Selalu tsc
   sebelum commit.**

---

## 4. JEBAKAN PR 3 (`telegram-service.ts`) — SUDAH DIANALISIS, BELUM DIJALANKAN

Saya sudah mencoba lalu **membatalkan** karena biayanya bukan ratchet tapi refactor.
Patch WIP ada di `/tmp/telegram-wip.patch` (558 baris) — **kemungkinan hilang saat
restart, jangan andalkan file itu**.

### Temuan

Menghapus `any` dengan hati-hati (85 → 4) memunculkan **77 error tsc**. Bukan
karena salah ketik, tapi karena **tipe asli Telegraf jauh lebih ketat dari
kode yang ada**:

| Kategori | Jumlah | Arti |
| --- | --- | --- |
| TS2339 property tidak ada | 22 | `ctx.message.text` tidak ada di union message Telegraf |
| TS18047 `'bot' is possibly null` | 17 | `bot` di-guard saat stop, lalu dipakai 20x tanpa guard |
| TS2345 argumen tidak cocok | 13 | `ctx.reply(...)` overload picky |
| TS18048 possibly undefined | 11 | `ctx.message` opsional di tipe Telegraf |
| TS18046 `'e' is of type 'unknown'` | 9 | catch block |

Tambahan: `uiMessageHistory.push({...})` **tidak punya field `role`** — tipe
`UiMessage` yang saya tulis salah. Bentuk sebenarnya:
`{id, chatId, sender, text, isGroup, chatTitle, time, type}`.

### Rekomendasi untuk agent berikutnya

**Jangan pakai tipe Telegraf asli untuk pass ini.** Itu refactor dengan risiko
perilaku, bukan ratchet.{Ganti dengan deklarasi permukaan yang benar-benar dipakai
— ini menghapus `any` tanpa berpura-pura memvalidasi internal Telegraf, dan
tetap menangkap salah ketik nama method:

```ts
type TelegrafSurface = {
  command(cmd: string, fn: (ctx: CtxSurface) => unknown): unknown
  on(ev: string | string[], fn: (ctx: CtxSurface) => unknown): unknown
  action(re: RegExp, fn: (ctx: CtxSurface) => unknown): unknown
  catch(fn: (err: Error, ctx: CtxSurface) => unknown): unknown
  launch(): Promise<void>
  stop(signal?: string): void
}
```

Permukaan yang benar-benar dipakai (sudah diverifikasi via grep):
`bot.{command,on,action,catch,launch,stop}`, `ctx.{answerCbQuery,chat,
editMessageReplyMarkup,from,match,message,reply,sendChatAction,telegram,update}`.

`telegraf@^4.16.3` sudah jadi dependency jadi dan **sudah punya typings** —
`import type` aman, tapiatial tidak cocok dengan cara kode ini memanggilnya.

---

## 5. ANTREAN PEKERJAAN LAIN DARI OWNER (BELUM DIGARAPKAN)

Prioritas owner sendiri, belum dikerjakan. Semuanya butuh PR terpisah.

### 5a. O4 + O5 — fakta basi di dokumen (MUDAH, tanpa keputusan)

Dari audit PR #123:

- **`AGENTS.md:24`** masih tulis `"schema version 22, 12 stores"` sementara
  `db.ts` punya `db.version(30)` dan `AGENTS.md:54` sudah benar (v30).
  Ini **janji DoD butir 7 yang belum tuntas**.
- **`js-to-ts-spec.md` angka test salah dua kali**: §2 K9 dan §3.2 tulis "169
  file", §16 tulis "173 rename". Realita `git ls-files`:
  **174 file `.ts`** = 171 `*.test.ts` + 2 `*.harness.ts` + 1 `setup-bun.ts`.

Verifikasi ulang sebelum edit:
```bash
grep -n "schema version 22" AGENTS.md
git ls-files 'tests/**' | grep -c '\.ts$'          # 174
git ls-files 'tests/**' | grep -c '\.test\.ts$'    # 171
```

### 5b. O6 — banner epistemik di `js-to-ts-spec.md`

Tambah banner di kepala file: **§5-§9, §12, §15 adalah rencana kerja agen,
bukan standar.** Alasan: owner sudah menegur sekali bahwa spec itu dipakai
sebagai standar padahal karangan agen. Praktisnya, §6 W8 mengarang
`esbuild bundle + dist-extension/` yang ternyata salah — extension MV3 boleh
modul ES (Chrome ≥ 91).

Rujukan: <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics>

### 5c. PLAN fix extension connect tanpa delay (arahkan owner §16)

Belum ada PLAN. Perlu investigasi kenapa handshake delay di
`sidecar/main/browser/` (`bridge-core.ts`, `launcher.ts`, `server.ts`).
Preseden yang harus dipakai ulang, **jangan tulis ulang**: `HOST: '127.0.0.1'`
(`bridge-core.ts:28`), `checkOrigin()` (`server.ts:95`), `redactHeaders()`.

### 5d. Sisi server MCP (P3) — MENUNGGU KEPUTUSAN OWNER

`docs/PLANNED/2026-10-02_mcp-pluggable-stdio-http.md` sudah merged (#122).
M1 (stdio) dan M2 (header `MCP-Protocol-Version` + `Mcp-Session-Id`) adalah
P0 dan **belum diimplementasikan** — hanya written di plan.

Pertanyaan yang harus dijawab owner: apakah ada agent luar konkret yang mau
mengendalikan browser Abelink? Kalau belum, jangan kerjakan P3.

### 5e. Refactor server + webui (permintaan owner, BELUM DIANALISIS)

> "refactor ke server + webui jadi aplikasi di nonaktifkan dan di pindah ke web
> biar camera dan voice lebih mudah and make more lightweight."

**Tidak boleh dikerjakan tanpa spek owner.** Ini menyentuh:
- `src-tauri/` (Rust shell) — arsitektur inti produk
- Kontrak beku `APPROVAL_ACTIONS` (`cmd_node_bridge.rs`) — dialog `rfd` native
- Token bridge 0600 + pairing per-flavor (dev 49713 / prod 49712)
- Zona beku ini **tidak boleh dilanggar** hanya demi keringanan frontend.

Klaim "camera dan voice lebih mudah di web" secara teknis masuk akal
(`getUserMedia`/`MediaRecorder` tanpa izin native), tapi konsekuensinya besar:
kehilangan approval gate native, native-host extension, dan OS-level automation
(`os:*` via `pc-agent`). Itu keputusan produk, bukan keputusan teknis.

---

## 6. REFERENSI PRIMARY SOURCE (wajib dipakai, jangan karang)

Aturan owner: setiap perubahan harus bersumber. Yang sudah dipakai sesi ini:

| Topik | Sumber |
| --- | --- |
| `unknown` + narrowing | <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html> — *"Anything is assignable to unknown, but unknown isn't assignable to anything but itself and any without a type assertion or a control flow based narrowing."* |
| Discriminated union | <https://www.typescriptlang.org/docs/handbook/2/narrowing.html> |
| `catch` = `unknown` | <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html> (`useUnknownInCatchVariables` ikut `strict` sejak 4.4) |
| Extension MV3 service worker ESM | <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics> |
| MCP transports | <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports> |
| Peta referensi owner | `docs/REFERENCE-LIBRARY.md` (**INI yang otoritatif**) |

⚠️ **Peringatan dari sesi ini.** `js-to-ts-spec.md` itu dokumen hasil kerja
agen, **BUKAN standar owner**. Audit lengkap di
`docs/PLANNED/2026-10-02_js-to-ts-spec-audit.md` (PR #123): dari 14 item
"Keputusan Interview (LOCKED)", hanya **11 yang benar-benar keputusan owner**
(K1-K7, K9-K10, K13-K14). K8/K11/K12 ditulis eksplisit "Keputusan agent" tapi
berdiri di tabel berlabel LOCKED. §6/§7/§8/§9/§12/§15 = karangan agen.

---

## 7. JANGAN LAKUKAN (zona beku + jebakan sesi ini)

**Zona beku:**
- `APPROVAL_ACTIONS` di `src-tauri/src/cmd_node_bridge.rs`
- Delimiter double-pipe `NATIVE_TOOLS`
- Port 49712 (prod) / 49713 (dev)
- Wire frame engine
- Skema Dexie (`src/api/db.ts`, upgrade path v28→v30)
- **Ekspektasi test (K9)** — test hanya boleh berubah path, tidak boleh berubah
  ekspektasi. Kalau sebuah tipe membuat test tidak bisa compile, **ubah tipenya**,
  bukan testnya. (Preseden: `error?: undefined` di PR #125.)

**Jebakan proses:**
- `stash@{0}` milik sesi lain. Jangan `git stash pop`.
- Semua skrip first-party `.ts` dijalankan `bun`, bukan `node`.
- Setelah `write_file` ke `.md`/`.ts`, **selalu** scan karakter rusak:
  ```bash
  grep -nP '[\x{4e00}-\x{9fff}\x{3000}-\x{303f}\x{ff00}-\x{ffef}\x{0370}-\x{03ff}\x{0400}-\x{04ff}]' <file>
  ```
  Sudah terjadi ~6 kali sesi ini, termasuk chars CJK, Cyrillic, danFullwidth.
- Commit message: pakai `git commit -F -` dengan heredoc, JANGAN
  `$(cat <<'EOF')` (s sempat merusak). Gunakan `printf '%s\n'` untuk argumen gh.
- `tsc` **wajib** dijalankan sebelum commit, meski `grep -c ': any'` sudah 0.
  PR #125 hampir lolos dengan kurung hilang yang hanya tsc temukan.
- Setelah `cd` di dalam command, `grep` berikutnya jalan di cwd yang salah
  (sudah kejadian sekali). Pakai path absolut atau `cd` ulang.

---

## 8. VERIFIKASI WAJIB SEBELUM MERGE

```bash
bun run typecheck && bun run typecheck:node && bun run typecheck:tests && bun run typecheck:extension
bunx eslint <file yang diubah>          # harus 0 error
bunx vitest run                          # HARUS 1836 pass / 16 skip
bun evaluation/smoke.ts                  # HARUS LOLOS
bash scripts/ci/any-ratchet.sh           # harus exit 0
```

Untuk perubahan renderer, tambah `bun run build` (vite). Untuk perubahan
extension, tambah `bun run build:extension`.

Baseline regresi saat ini: **1836 pass / 16 skip**, 168 file test.