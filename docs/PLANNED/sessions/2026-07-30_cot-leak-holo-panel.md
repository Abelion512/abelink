# Session: Fix CoT Leak + Dedicated Holo Reasoning Panel

## Ringkasan

**Tanggal:** 2026-07-30  
**Branch:** `feat/performance-and-readibility`  
**Files touched:** `src/renderer/src/api/ai/planning.js`, `src/renderer/src/pages/MarkHome.jsx`, `src/renderer/src/components/core/ResponseArea.jsx`  
**Ringkasan:** Chain-of-Thought (reasoning/thought) dari AI bocor ke area jawaban karena dua masalah: (1) fallback parser di `planning.js` saat AI balik plain text langsung lempar semua konten ke `answer` tanpa pisah CoT, (2) `reasoning` field di `chatData` sudah tersimpan tapi nol komponen membacanya — tidak ada panel CoT dedicated. Fix: split heuristic pada double-newline pertama (bagian pendek = thought, panjang = answer) + render HoloCard "Proses Pemikiran" di `ResponseArea`. Boot greeting diverifikasi berfungsi.

## Temuan dan Fix

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| CoT bocor ke jawaban | `planning.js:623` | Fallback parsing untuk plain text assign seluruh konten ke `answer`, `thought: ''` | Split pada double-newline pertama — bagian pendek jadi thought, panjang jadi answer | ✅ Fixed (`102ca3d`) |
| Tidak ada panel CoT | `ResponseArea.jsx`, `MarkHome.jsx` | `reasoning` field tidak pernah di-forward ke `currentResponse`, dan ResponseArea tidak punya rendering | Forward `lastItem.reasoning` + render HoloCard "Proses Pemikiran" | ✅ Fixed (`102ca3d`) |
| Parsing gagal tool-call path | `planning.js:596-612` | Saat AI cuma balik `thought` + `action` (tanpa `answer`), thought dipakai sebagai answer | Butuh fix lanjutan — saat action ada tapi answer null, set answer ke status singkat | ⚠️ Belum commit |

## Files Modified

| File | Perubahan |
|------|-----------|
| `src/renderer/src/api/ai/planning.js` | Fallback parser: split CoT/answer di double-newline. +21 baris |
| `src/renderer/src/pages/MarkHome.jsx` | Forward `reasoning` dari `lastItem`. +1 baris |
| `src/renderer/src/components/core/ResponseArea.jsx` | Render HoloCard "Proses Pemikiran" jika reasoning ada. +43/-33 baris |

## Agent Learnings

### Pattern Konkret

1. **Worktree branch mismatch** — EnterWorktree default dari `master`, bukan branch kerja (`feat/performance-and-readibility`). 3× worktree gagal. Lesson: cek `git log -1` di worktree dulu.
2. **Copy lintas worktree bisa timpa branch** — `cp` dari worktree (HEAD `master`) ke parent (`feat`) mengakibatkan file 522 baris nimpa 646 baris, prompt compressor hilang.
3. **Split heuristic terbatas** — Regex `^([\s\S]*?)\n\n([\s\S]+)$` cuma kerja kalau ada blank line antara thought dan answer.

### File Invariants

| File | Invariant |
|------|-----------|
| `planning.js` | `getNextAction` HARUS return `{ thought, action, answer, mood, memory, active_topic }`. `thought` ≠ `answer`. |
| `ResponseArea.jsx` | Wajib render reasoning via HoloCard, konsisten dengan "Detail Informasi" |

### Verification Checklist

- [ ] Commit `102ca3d` ada di `feat/performance-and-readibility`, 3 files, +67/-33
- [ ] Boot greeting: JSON parsed clean → thought masuk panel, answer bersih ✅
- [ ] Tool call path: parsing null → fallback → CoT masih ikut jawaban ⚠️
- [ ] Panel "Proses Pemikiran" muncul di DOM ✅
- [ ] `FaLightbulb` import cleaned ✅

## Callback

Tool-call path masih bocor — AI balik `thought` + `action` tanpa `answer`, dan kode saat ini lempar thought ke answer. Mau di-fix juga? Approach: jika `action` ada, set answer ke "Proses..." dan simpan thought murni.

## Update 2026-07-30 21:58 — Fix retry path

### Temuan & Fix (Sesi 2)

| Finding | File | Root Cause | Fix | Status |
|---------|------|------------|-----|--------|
| JSON path: thought djadikan answer tanpa retry | `planning.js:597-609` | Saat AI return thought tanpa action/answer, langsung dump thought sebagai answer, skip retry | Retry dulu, fallback display hanya jika max retries tercapai | ✅ Fixed (`1d38a2c`) |
| Fallback plain text: return langsung tanpa retry | `planning.js:643-651` | Split gagal → langsung return sebagai answer, skip retry | `continue` ke retry berikutnya. Display hanya jika attempts >= MAX_RETRIES | ✅ Fixed (`1d38a2c`) |

### Files Modified (Sesi 2)

| File | Perubahan |
|------|-----------|
| `src/renderer/src/api/ai/planning.js` | 2 blocks: JSON path + fallback plain text path, keduanya retry dulu sebelum display. +19/-10 |

### Verification

- [ ] Commit `1d38a2c` ada di `feat/performance-and-readibility`, +19/-10
- [ ] JSON path: thought-only → retry (continue), bukan return
- [ ] Fallback plain text: split gagal → retry (continue), bukan return
- [ ] Safety: max retries tercapai → display sebagai answer (tidak silent fail)
