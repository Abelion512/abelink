# Browser Autonomy Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kembalikan agen dari chatbot ke agentic: observasi tab beridentitas, handshake jujur, HITL co-pilot tanpa rebut tab, dan eval anti-menyerah.

**Architecture:** Extension tetap pemilik tab (`primaryTabs`/`activeGroups` per sessionId); sidecar tambah fokus-tab per sesi dan hapus drain lintas-sesi; HITL jadi pause-state (bukan terminal) dengan pill non-blocking + tombol Lanjutkan; prompt + eval menutup jalan pintas needs_user.

**Tech Stack:** Bun, Vitest, Tauri v2 + Rust shell, React 19 renderer, sidecar ESM (`sidecar/main/browser/*`, `sidecar/main/tools/browserTools.mjs`), MV3 extension (`extension/background.js`, `extension/popup.js`).

**Spec:** Trajectory harness dev `2026-09-20` (`reasoning.jsonl` 112 baris / `tool-calls.jsonl` 89 baris: insiden gmail `parsePagination`, warning `.md` palsu, loop `browser-extract` kosong→403→klaim halu, `no-handshake` padahal popup hijau) + screenshot popup ABELINK BRIDGE + 8 poin user + referensi Anthropic browser-use/computer-use + OpenAI computer-use/HITL/guardrails/improvement-loop + Hermes guardian (diadopsi, tidak diubah).

## Global Constraints

- Bun only: `bun install`, `bun run`, `bunx vitest`. Dilarang `npm`/`npx`.
- Semua perubahan non-trivial via branch + PR ke `main`, bukan commit langsung. SELAMA `apple-design` TERBUKA: semua worker branch merge ke `apple-design`, DILARANG sentuh `origin/main` maupun branch `main` lokal.
- `bash scripts/verify.sh` hijau sebelum push (vitest + eslint 0 error + watermark + perf + AbelinkBench quick + vite build + cargo check + clippy `-D warnings`).
- Bump versi hanya di `src-tauri/tauri.conf.json` lalu `bun run sync-version`.
- Renderer `src/` tidak sentuh Node API; OS via `window.api` → Tauri IPC / `node_invoke`.
- Channel destruktif baru wajib masuk `APPROVAL_ACTIONS` (`src-tauri/src/cmd_node_bridge.rs`).
- CSP `tauri.conf.json` + `index.html` selalu sinkron.
- Tutup sesi dengan log `docs/PLANNED/sessions/YYYY-MM-DD_<topik>.md`; perubahan arsitektur update `docs/ARCHITECTURE.md` di PR yang sama.
- Tanpa emoji di output/dialog/UI.

## File Map

| File | Tanggung jawab di plan ini |
|---|---|
| `extension/background.js` | Tagger akurat, identitas tab, pill co-pilot, skip veil saat await-user |
| `extension/popup.js` | Status = loop aktif, bukan probe |
| `sidecar/main/browser/bridge-core.mjs` | Fokus-tab per sesi, stop drain lintas-sesi |
| `sidecar/main/tools/browserTools.mjs` | Observasi `{tabId,url,title,reused}`, flag `adoptUserTab`, kontrak extract-kosong, `browser-ask` pause-state |
| `sidecar/main/syntax-validator.js` | Bypass prosa `.md/.txt` |
| `src/api/tools/toolCatalog.js` | Dokumentasi query jujur (extract-kosong, adoptUserTab) |
| `src/api/ai/planning.js` | Aturan: klaim sebut URL, no-navigate-duplikat, co-pilot, snapshot-jalur |
| `src/hooks/agent/plan/toolDispatcher.js` | Satukan `browser-ask` → pause-state + observasi resume |
| `src/hooks/agent/useAbelinkPlan.js` | Pause bukan terminal; resume via `browser-read` tab sama |
| `evaluation/abelink-eval.mjs` | Dimensi anti-chatbot |
| `tests/` | 1 file test baru per task di bawah |

---

### Task 1: Tagger akurat (akurasi > token)

**Files:**
- Modify: `extension/background.js:905-960` (`taggerFn`, `MAX`, `MAX_TEXT`, urutan scan)
- Test: `tests/browser-tagger-accuracy.test.mjs` (baru, pure `pickAdoptableTab`-style: uji helper murni ekstraksi urutan)

**Interfaces:**
- Consumes: DOM `document` (di page-context, self-contained).
- Produces: `taggerFn()` → `{title, url, elements[{abelinkId,tag,type,text,placeholder,ariaLabel,href,inViewport,x,y}]}` maks 200 elemen, teks maks 120 char, elemen dalam `main/article/[role=main]` diutamakan.

- [ ] **Step 1: Write the failing test**

```js
// tests/browser-tagger-accuracy.test.mjs
import { describe, it, expect } from 'vitest'
// Helper murni yang diekstrak dari taggerFn: diberi daftar elemen semu,
// harus mengembalikan yang di dalam <main> lebih dulu, maks 200.
import { rankTaggerElements } from '../extension/tagger-rank.mjs'
describe('rankTaggerElements', () => {
  it('main-first, cap 200', () => {
    const els = [
      { text: 'nav-link', inMain: false },
      { text: 'isi artikel', inMain: true },
    ]
    expect(rankTaggerElements(els)[0].text).toBe('isi artikel')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/browser-tagger-accuracy.test.mjs`
Expected: FAIL `Cannot find module '../extension/tagger-rank.mjs'`

- [ ] **Step 3: Write minimal implementation**
  - Ekstrak logika ranking dari `taggerFn` ke `extension/tagger-rank.mjs` (`rankTaggerElements(els)` = main-first + cap 200), `taggerFn` impor hasilnya; `MAX 80→200`, `MAX_TEXT 80→120`; scan `main, [role=main], article` dulu lalu fallback `document`.
  - `taggerFn` tetap self-contained untuk injeksi: salin fungsi ranking ke dalam body `taggerFn` (duplikasi disengaja, 15 baris) karena service-worker serialization; `tagger-rank.mjs` dipakai test + dokumentasi kontrak.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/browser-tagger-accuracy.test.mjs tests/browser-snapshot.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/background.js extension/tagger-rank.mjs tests/browser-tagger-accuracy.test.mjs
git commit -m "feat(browser): main-first tagger, cap 200, text 120"
```

---

### Task 2: Identitas tab + no-duplikat + adopt eksplisit

**Files:**
- Modify: `extension/background.js:360-365` (`primaryTabs`), `:428-447` (`targetTabForSession`), `:699-754` (`navigate`), `:777-785` (`readDom`), `:1278-1449` (`act`)
- Modify: `sidecar/main/browser/bridge-core.mjs:146-159` (tambah `focusedTab` per sesi), `:288-332` (`takeNext`: hapus drain lintas-sesi default)
- Modify: `sidecar/main/tools/browserTools.mjs:401-451` (`browser-navigate`), `:453-486` (`browser-read`)
- Modify: `src/api/tools/toolCatalog.js:441-449` (dok `browser-navigate`/`browser-extract`)
- Test: `tests/browser-tab-identity.test.mjs` (baru)

**Interfaces:**
- Consumes: `targetTabForSession(sessionId)` → tab + `getPrimaryTab(sessionId)`.
- Produces: tiap hasil `navigate`/`read-dom`/`act` sertakan `_tab = {tabId, url, title, reused}`; `browser-navigate` terima flag `adoptUserTab:true` (default false, hanya itu yang boleh pakai tab user); `takeNext(sessionId)` hanya layani antrean sesi itu (kecuali tandai `executedBySession` bila lintas-sesi dipertahankan — plan ini: hapus drain).

- [ ] **Step 1: Write the failing test**

```js
// tests/browser-tab-identity.test.mjs
import { describe, it, expect } from 'vitest'
import { parseNavigateQuery } from '../sidecar/main/browser/nav-query.mjs'
describe('parseNavigateQuery', () => {
  it('default tidak adopt tab user', () => {
    expect(parseNavigateQuery('https://chatgpt.com')).toMatchObject({ url: 'https://chatgpt.com', adoptUserTab: false })
  })
  it('flag eksplisit mengizinkan', () => {
    expect(parseNavigateQuery('https://chatgpt.com||adoptUserTab').adoptUserTab).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/browser-tab-identity.test.mjs`
Expected: FAIL `Cannot find module '../sidecar/main/browser/nav-query.mjs'`

- [ ] **Step 3: Write minimal implementation**
  - `sidecar/main/browser/nav-query.mjs`: `parseNavigateQuery(q)` → `{url, adoptUserTab}` (pakai `extractUrl` existing + deteksi token `adoptUserTab`).
  - `extension/background.js`: `targetTabForSession` tolak tab yang URL-nya berubah dari `focusedUrl` sesi tanpa navigate tercatat (kembalikan null → caller recovery jujur); `navigate` kembalikan `_group = {tabId: effectiveTabId, reused, ...}` (sudah ada, pertahankan + tambah `url,title`); `getPrimaryTab` hapus primer bila `tab.url` tidak http.
  - `bridge-core.mjs`: `setLastUrl/getLastUrl` sudah ada — tambah `setFocusedTab/getFocusedTab(sessionId, {tabId,url})`, panggil tiap `resolveCommand` bertipe navigate; `takeNext`: hapus blok drain sesi-lain (baris 299-308 + 317-326).
  - `browserTools.mjs` `browser-navigate`: parse flag; tanpa `adoptUserTab`, `adoptOrphanTab` tetap hanya tab tak-bergrup milik sendiri (tidak berubah, hanya ditegaskan + error jujur bila satu-satunya kandidat = tab user: `"tab milik user — butuh flag adoptUserTab"`).
  - `toolCatalog.js`: update summary `browser-navigate` (`...||adoptUserTab`) + `browser-extract` (query kosong = tab sesi via extension; tanpa sesi = error eksplisit, bukan fetch buta).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/browser-tab-identity.test.mjs tests/browser-bridge.test.mjs tests/browserReadRecovery.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/background.js sidecar/main/browser/bridge-core.mjs sidecar/main/browser/nav-query.mjs sidecar/main/tools/browserTools.mjs src/api/tools/toolCatalog.js tests/browser-tab-identity.test.mjs
git commit -m "feat(browser): tab identity in observations, explicit adoptUserTab, no cross-session drain"
```

---

### Task 3: Kontrak extract-kosong + validator prosa + regresi gmail

**Files:**
- Modify: `sidecar/main/tools/browserTools.mjs:619-631` (`browser-extract`)
- Modify: `sidecar/main/syntax-validator.js:290-292` (early-return prosa), `:445-449` (default branch)
- Test: `tests/browser-extract-contract.test.mjs` (baru), `tests/syntax-prose.test.mjs` (baru); tambah kasus di pola `tests/browser-ask.test.mjs` untuk gmail via `getNativeToolsDefinition`

**Interfaces:**
- Consumes: `tryExtensionAct`, `browserReadFetch`, `getLastUrl(sessionId)`, `validateFileSyntax(filePath, content)`.
- Produces: `browser-extract ""` tanpa sesi → `{success:false, error:'browser-extract butuh URL penuh atau sesi extension aktif...'}`; dengan `lastUrl` → fetch lastUrl; `validateFileSyntax('x.md', "it's ok")` → `{valid:true}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/browser-extract-contract.test.mjs
import { describe, it, expect } from 'vitest'
import { resolveExtractQuery } from '../sidecar/main/tools/extract-query.mjs'
describe('resolveExtractQuery', () => {
  it('query kosong tanpa sesi/lastUrl = error eksplisit', () => {
    const r = resolveExtractQuery('', { hasSession: false, lastUrl: null })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/URL penuh atau sesi extension/)
  })
  it('query kosong + lastUrl = pakai lastUrl', () => {
    const r = resolveExtractQuery('', { hasSession: false, lastUrl: 'https://chatgpt.com' })
    expect(r).toMatchObject({ ok: true, url: 'https://chatgpt.com' })
  })
})
```

```js
// tests/syntax-prose.test.mjs
import { describe, it, expect } from 'vitest'
import { validateFileSyntax } from '../sidecar/main/syntax-validator.js'
describe('prose bypass', () => {
  it('.md dengan apostrof = valid', async () => {
    expect(await validateFileSyntax('doc.md', "it's user's file")).toMatchObject({ valid: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/browser-extract-contract.test.mjs tests/syntax-prose.test.mjs`
Expected: FAIL (modul `extract-query.mjs` belum ada; `.md` masih `Unclosed single quote`)

- [ ] **Step 3: Write minimal implementation**
  - `sidecar/main/tools/extract-query.mjs`: `resolveExtractQuery(query, {hasSession, lastUrl})` murni; handler `browser-extract` pakai: sesi ada → extension seperti dulu; tidak ada → `extractUrl(query)` atau `lastUrl`, keduanya kosong → error eksplisit.
  - `syntax-validator.js` baris ~291: `if (['.md','.markdown','.txt','.rst','.log'].includes(ext)) return {valid:true}` sebelum branch lain.
  - Gmail: tanpa ubah kode (fix `c91e6bb` sudah ada) — tambah test regresi: handler `gmail-list`/`gmail-search` via `getNativeToolsDefinition()` dengan mock `searchEmails`? Jika mock berat, test minimal: panggil handler `gmail-list` dengan query `'0-10'` dan assert error BUKAN `parsePagination is not defined` (mock config + stub modul google di level test via `vi.mock`). Tulis sesuai pola mock yang sudah ada di repo; bila tidak ada pola, test cukup assert `parsePagination` terimpor di `googleTools.mjs` (static import check via `await import` tidak throw).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/browser-extract-contract.test.mjs tests/syntax-prose.test.mjs tests/browser-ask.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/main/tools/browserTools.mjs sidecar/main/tools/extract-query.mjs sidecar/main/syntax-validator.js tests/browser-extract-contract.test.mjs tests/syntax-prose.test.mjs
git commit -m "fix(browser): explicit empty-extract contract, prose validator bypass, gmail regression test"
```

---

### Task 4: Handshake jujur

**Files:**
- Modify: `extension/popup.js:19-44` (`refresh`), `:63-80` (`autoConnect`)
- Modify: `extension/background.js:156-221` (`loop` 401-recovery), `:1645-1707` (`tryAutoResume` tanpa pairing)
- Test: `tests/browser-handshake-honest.test.mjs` (baru, uji reducer status popup murni)

**Interfaces:**
- Consumes: `chrome.runtime.sendMessage({type:'status'|'probe'|'start'})`.
- Produces: `popupStatus({running, lastError, pairing})` → `{pill:'tersambung'|'terputus'|'menunggu', text}`; pill hijau hanya bila `running===true`.

- [ ] **Step 1: Write the failing test**

```js
// tests/browser-handshake-honest.test.mjs
import { describe, it, expect } from 'vitest'
import { popupStatus } from '../extension/popup-status.mjs'
describe('popupStatus', () => {
  it('probe ok tapi loop mati = bukan tersambung', () => {
    expect(popupStatus({ running: false, lastError: null }).pill).not.toBe('tersambung')
  })
  it('loop jalan = tersambung', () => {
    expect(popupStatus({ running: true, lastError: null }).pill).toBe('tersambung')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/browser-handshake-honest.test.mjs`
Expected: FAIL `Cannot find module '../extension/popup-status.mjs'`

- [ ] **Step 3: Write minimal implementation**
  - `extension/popup-status.mjs`: `popupStatus()` murni; `popup.js refresh()` pakai (hijau hanya `running`, teks tampilkan `pairing flavor:port` + `lastError` bila ada).
  - `background.js`: `tryAutoResume` tanpa pairing tetap jadwalkan ulang (tidak diam), tapi set `lastError:'Pilih flavor sekali di popup (Prod/Dev)'` agar jujur; 401 `token-stale` tetap refresh via native host sekali (existing, pertahankan).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/browser-handshake-honest.test.mjs tests/browser-flavor.test.mjs tests/browser-bridge.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/popup.js extension/popup-status.mjs extension/background.js tests/browser-handshake-honest.test.mjs
git commit -m "fix(browser): honest handshake status, loop-based pill"
```

---

### Task 5: HITL co-pilot (tanpa rebut tab, tanpa deadline, resume same-tab)

**Files:**
- Modify: `extension/background.js:310-342` (`runCommand`), `:877-888` (`ensureOverlay`), `:367-375` (`overlayStopped` + tambah `awaitingUser`)
- Modify: `sidecar/main/tools/browserTools.mjs:488-499` (`browser-ask` → pause-state payload)
- Modify: `src/hooks/agent/plan/toolDispatcher.js:202-232` (satukan jalur: modal `requestUserInput` + observasi `[MENUNGGU USER]`/`[LAPORAN USER]`)
- Modify: `src/hooks/agent/useAbelinkPlan.js:1211-1220` (pause-state bukan terminal; resume kirim `browser-read` tab sama)
- Modify: `src/api/ai/planning.js:191` (aturan co-pilot: veil mati saat await, poll 15 dtk tanpa deadline, tombol Lanjutkan)
- Test: `tests/browser-copilot.test.mjs` (baru)

**Interfaces:**
- Consumes: `requestUserInput({title,message,placeholder})` → `{confirmed, comment}`; `overlayStopped[session]`, baru `awaitingUser[session] = {reason, tabId, url, goal, since}`.
- Produces: `browser-ask` → `{success:true, paused:true, awaitUser:{sessionId,tabId,url,reason}}`; `runCommand` skip `ensureOverlay` bila `awaitingUser[session]`; `overlay-stop` tetap jalan; resume = `browser-read` (bukan navigate).

- [ ] **Step 1: Write the failing test**

```js
// tests/browser-copilot.test.mjs
import { describe, it, expect } from 'vitest'
import { shouldOverlay } from '../extension/overlay-policy.mjs'
describe('shouldOverlay', () => {
  it('tidak pasang veil saat await-user', () => {
    expect(shouldOverlay({ awaitingUser: true, overlayStopped: false })).toBe(false)
  })
  it('pasang veil saat kerja normal', () => {
    expect(shouldOverlay({ awaitingUser: false, overlayStopped: false })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/browser-copilot.test.mjs`
Expected: FAIL `Cannot find module '../extension/overlay-policy.mjs'`

- [ ] **Step 3: Write minimal implementation**
  - `extension/overlay-policy.mjs`: `shouldOverlay({awaitingUser, overlayStopped})` murni; `runCommand`/`ensureOverlay` pakai (skip veil + tampilkan pill kecil non-blocking `"Abelink menunggu — klik Lanjutkan bila selesai"` via `overlayFn` mode baru `passive`, tanpa keydown-guard).
  - `browserTools.mjs browser-ask`: kembalikan `{success:true, paused:true, waiting_for_user:true, awaitUser:{reason, sessionId: config?.sessionId||'default'}}` (pertahankan string `[BROWSER HUMAN-IN-THE-LOOP]` di `data` untuk kompatibilitas observasi lama).
  - `toolDispatcher.js`: `browser-ask` dan `browser-ask-user` satu jalur modal; confirm → `[LAPORAN USER]: <comment>`; cancel → `[DIBATALKAN]`; poll DOM 15 dtk tanpa deadline hanya sebagai sinyal (bukan auto-terminal): implementasi minimal = catat `awaitingUser` di extension via perintah `act overlay-passive`; TIDAK ada `setTimeout` deadline di v1.
  - `useAbelinkPlan.js`: `browser-ask` + pause-state → `INTENT.NEEDS_USER` tapi simpan `pausedBrowser={sessionId,tabId,url,goal}`; pesan user berikutnya `"lanjutkan"` → inject observasi `[RESUME]` + `browser-read` tab sama (jangan navigate ulang).
  - `planning.js:191`: tambah 3 baris aturan co-pilot (tanpa ubah aturan lain).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/browser-copilot.test.mjs tests/browser-ask.test.mjs tests/browserAskGate.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/background.js extension/overlay-policy.mjs sidecar/main/tools/browserTools.mjs src/hooks/agent/plan/toolDispatcher.js src/hooks/agent/useAbelinkPlan.js src/api/ai/planning.js tests/browser-copilot.test.mjs
git commit -m "feat(browser): co-pilot HITL pause-resume, no veil steal, same-tab resume"
```

---

### Task 6: Anti-chatbot (prompt + eval + batch-halt + checklist)

**Files:**
- Modify: `src/api/ai/planning.js:180-200` (tambah: klaim wajib URL observasi; dilarang navigate baru bila `_tab.reused` tersedia; needs_user non-fisik = replan)
- Modify: `evaluation/abelink-eval.mjs` (dimensi `hitl_discipline`: `needs_user`/`blocked` tanpa artefak tool = skor 0)
- Modify: `src/hooks/agent/useAbelinkPlan.js` (batch: gagal pertama → sisa `not-executed`, pola Anthropic/OpenAI halt-text)
- Test: `tests/hitl-discipline.test.mjs` (baru, pure scorer)

**Interfaces:**
- Consumes: `executedToolsList`, `decision.{answer,task_status}`.
- Produces: `scoreHitlDiscipline({taskStatus, tools})` → `0|1`; batch executor menandai sisa batch `is_error:true, halt:true`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hitl-discipline.test.mjs
import { describe, it, expect } from 'vitest'
import { scoreHitlDiscipline } from '../evaluation/hitl-discipline.mjs'
describe('scoreHitlDiscipline', () => {
  it('needs_user tanpa tool = 0', () => {
    expect(scoreHitlDiscipline({ taskStatus: 'needs_user', tools: [] })).toBe(0)
  })
  it('needs_user + browser-ask + observasi login = 1', () => {
    expect(scoreHitlDiscipline({ taskStatus: 'needs_user', tools: [{ action: 'browser-ask' }], evidence: 'login' })).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/hitl-discipline.test.mjs`
Expected: FAIL `Cannot find module '../evaluation/hitl-discipline.mjs'`

- [ ] **Step 3: Write minimal implementation**
  - `evaluation/hitl-discipline.mjs`: scorer murni 20 baris; `abelink-eval.mjs` impor + pakai sebagai dimensi baru (tanpa ubah dimensi lama).
  - `planning.js`: 3 aturan baru (lihat Produces Task 6); batch-halt di `useAbelinkPlan.js` loop eksekusi batch: `failed` pertama → sisa batch hasil `{is_error:true, content:'Not executed: an earlier action failed.'}`.
  - Checklist sesi: minimal — prompt tambah "sebelum klaim done, sebutkan 1 item belum selesai atau tulis TIDAK ADA" (tanpa file checklist baru, YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/hitl-discipline.test.mjs tests/abelinkeval.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/ai/planning.js src/hooks/agent/useAbelinkPlan.js evaluation/abelink-eval.mjs evaluation/hitl-discipline.mjs tests/hitl-discipline.test.mjs
git commit -m "feat(eval): hitl_discipline dimension, batch halt, no-surrender prompts"
```

---

### Task 7: Gate akhir + dokumen sesi

**Files:**
- Create: `docs/PLANNED/sessions/2026-09-20_browser-autonomy.md`
- Modify: `docs/ARCHITECTURE.md` (bagian browser bridge: identitas tab, co-pilot HITL, handshake jujur)

**Interfaces:**
- Consumes: semua task 1–6 hijau.
- Produces: merge ke `apple-design` + session log + ARCHITECTURE update. DILARANG sentuh `main`/`origin/main` selama `apple-design` terbuka.

- [ ] **Step 1: Full vitest**

Run: `bunx vitest run`
Expected: PASS semua (tidak ada fail baru; bila ada fail lama, catat di session log sebagai known-limitation, jangan perbaiki di PR ini)

- [ ] **Step 2: Verify gate**

Run: `bash scripts/verify.sh`
Expected: exit 0 (bila clippy/cargo berat di mesin ini, catat hasil + jalankan minimal `bun run lint` + `bunx vitest run`)

- [ ] **Step 3: Session log + ARCHITECTURE**
  - Tulis `docs/PLANNED/sessions/2026-09-20_browser-autonomy.md`: keputusan, file berubah, hasil verifikasi, batasan (poll tanpa deadline v1; drain lintas-sesi dihapus — subagent tanpa sesi default perlu sesi sendiri).
  - Update `docs/ARCHITECTURE.md` di branch yang sama.

- [ ] **Step 4: Merge ke apple-design (BUKAN main)**

```bash
git checkout apple-design
git merge --no-ff feat/browser-p0a-tagger feat/browser-p0b-tab-handshake feat/browser-p0c-extract-validator feat/browser-p1-handshake feat/browser-p2-copilot feat/browser-p3-antichatbot
```

## Self-Review

1. **Spec coverage:** Poin 1→Task 2; 2→diagnosis + Task 4; 3→Task 4; 4→Task 6; 5→tabel adopsi + tiap task; 6→Task 1 (+snapshot-first dipertahankan di prompt); 7→Task 5 (tanpa deadline, pill pasif, resume same-tab); 8→plan gabungan ini. Insiden trajectory: gmail→Task 3 regresi; `.md`→Task 3; extract-kosong→Task 2+3; no-handshake→Task 4.
2. **Placeholder scan:** tidak ada TBD/TODO; tiap langkah ada file, kode, perintah, ekspektasi persis.
3. **Type consistency:** `_tab={tabId,url,title,reused}` dipakai Task 2 (produce) dan Task 5/6 (consume); `awaitingUser[session]` didefinisikan Task 5; `scoreHitlDiscipline({taskStatus,tools,evidence})` konsisten di test + implementasi; `parseNavigateQuery→{url,adoptUserTab}` dan `resolveExtractQuery→{ok,url?,error?}` signature terkunci di test masing-masing.
