# TUI Parity opencode + Migrasi Fitur Pluggable GUI -> TUI/CLI

Tanggal: 2026-09-26
Status: PLAN (sebagian sudah diimplementasi; lihat bagian C)
Bukti: codebase + `~/.config/abelink/cli-sessions/*.json` + harness dir kosong 2026-09-26

## A. Jawaban pertanyaan trajectory: TIDAK, CLI/TUI belum masuk trajectory

Fakta terverifikasi hari ini:

| Host | Sumber persistensi | Isi |
| --- | --- | --- |
| GUI | `src/api/harness.js` + `src/api/trajectory.js` -> Rust `harness_append` (JSONL per kind/hari) | turn-start/end, tool, thought, outcome; dipakai `harness:diagnose` + `/usage` |
| CLI (`bin/abelink.mjs`) | `~/.config/abelink/cli-sessions/*.json` | prompt, outcome, terminalReason, max 50 pesan user/assistant |
| TUI v2 | idem (via `saveTuiSession`) | idem |

Bukti: `~/.local/share/abelink/harness/2026-09-26` dan
`~/.local/share/abelink-dev/abelink/harness/2026-09-26` **tidak ada**, padahal TUI
dipakai hari ini. `cli/tui/usageStats.mjs` hanya MEMBACA harness (untuk `/usage`),
tidak pernah menulis. Artinya: chat TUI/CLI hari ini hanya tersisa sebagai
messages sesi — **tanpa step, tool call, trace, atau outcome detail**, dan `/usage`
di TUI selalu kosong untuk sesi yang dijalankan dari TUI.

Konsekuensi nyata: bug "kadang input kosong" sulit di-root-cause karena tidak ada
rekaman prompt efektif/step yang benar-benar dikirim ke provider.

### Rencana (PLAN-T1) — trajectory headless
- Ekstrak writer JSONL framework-agnostik dari `src/api/harness.js` menjadi
  `src/api/harnessCore.js` (murni: `makeEnvelope(kind, payload, {sessionId, seq, ts})`),
  lalu:
  - GUI tetap lewat Rust (`harness_append`).
  - CLI/TUI memakai writer fs langsung ke root yang SAMA
    (`ABELINK_DATA_HOME|XDG_DATA_HOME` + `abelink/harness/<date>/<kind>.jsonl`),
    pola append yang sudah dipakai `usageStats.mjs` saat membaca.
- Catat minimal: `turn-start` (prompt efektif + provider/model/effort),
  `tool` (nama + ok + durasi), `turn-end` (outcome/terminalReason/stepCount).
- Gate: `harness:diagnose --session <tui-session-id>` harus menampilkan digest
  hasil sesi TUI. Tanpa ini, klaim "tidak bisa direproduksi" tetap tidak teruji.

## B. Kenapa "kadang input kosong" (diagnosa, bukan tebakan)

Sesi nyata (7 jam terakhir):

| Waktu | Prompt | Jawaban | Catatan |
| --- | --- | --- | --- |
| 07:35 | `jawab singkat: 1+1 berapa?` | `Ya? Perlu apa.` | seolah tak menerima pesan user |
| 07:44 | prompt SAMA | `2` | benar |
| 06:32 | `halo, who are you?` | `Maksud?` | retry berikutnya baru benar |

Pesan user TERKIRIM (`loopMessages.push({role:'user',content})` sudah ada di
`agentRunner.js`) dan tersimpan di sesi — jadi ini **bukan** bug "userInput tidak
pernah masuk" (itu bug 2026-09-26 pagi yang sudah diperbaiki).

Hipotesis terkuat (belum terbukti, butuh instrumentasi PLAN-T1):
1. `oc/muse-spark-1.3-contributor-free` adalah model **combo async** 9Router yang
   pernah terukur membalas `finish_reason: in_progress`. Guard di `ai-bridge.js`
   hanya menolak `in_progress` bila teks KOSONG; bila provider mengirim teks
   parsial/placeholder, teks itu diterima sebagai jawaban final.
2. Variasi model untuk system prompt panjang + pesan user sangat pendek
   ("Ya? Perlu apa." konsisten dengan model yang melihat konteks tanpa pertanyaan).

Langkah (jangan patch buta):
- PLAN-T2: catat `finish_reason` + panjang konten per respons ke trajectory.
- PLAN-T3: bila `in_progress` terkonfirmasi memuat teks parsial, tambahkan
  **retry 1x** pada `in_progress` (bukan fallback model — keputusan owner tetap
  "tanpa fallback"), lalu error jujur bila tetap parsial.
- PLAN-T4: di TUI, tandai jawaban yang datang dari `in_progress`/tanpa teks
  sebagai "kemungkinan tidak final" agar user tidak menyimpulkan TUI rusak.

## C. Paritas TUI vs opencode (status + sisa)

| Item opencode | Sebelumnya | Kini |
| --- | --- | --- |
| Layar awal (home, bukan langsung sesi) | tidak ada | **ADA** — hero + versi + tips + arahan `/sessions`/ctrl+p |
| Command palette `ctrl+p` | tombol mati (onCommands tak dioper) | **ADA** — daftar perintah + deskripsi, ↑↓, Enter, filter |
| Dialog sesi (`/sessions`) | hanya daftar teks | **ADA** — dialog pilih + Enter = lanjut |
| Slash popup `/` | ada | tetap (TUI_COMMANDS + desc) |
| Bottom cap prompt `▀` | tidak ada | **ADA** |
| Sidebar title/meta/branding | ada (restyle sesi lalu) | tetap |
| Footer status | ada | tetap |
| **Dialog effort (slider ala claude-code)** | teks `/effort` | **BELUM** (lihat D) |
| **Dialog model (deskripsi/harga, section)** | picker dasar | **SEBAGIAN** (Aktif/Recent/Favorit/Alias/Katalog) |
| Dialog agent (`tab`), MCP, provider | tidak ada | BELUM (butuh konsep agent/MCP di runtime headless) |
| Pesan: streaming token | tidak ada (`TUI_STREAM_ENABLED=false`) | BELUM |

## D. Katalog & metadata dinamis (permintaan #4)

Keputusan user: effort & model **diisi sendiri** (bukan contekan claude-code),
tapi hasilnya di-cache dan di-refresh berkala supaya tetap dinamis.

Rencana (PLAN-D1..D3):
- D1: perluas `models-cache.json` -> simpan juga `capabilities` (sudah) +
  `fetchedAt` per entri; tambah `refreshInBackground()` saat cache stale
  (`stale-while-revalidate` yang sudah ada dipertahankan) dan TTL per-kategori
  (katalog 5 mnt; metadata effort 15 mnt).
- D2: simpan metadata effort yang benar-benar berhasil dipakai per model
  (`effortMetadata[modelId] = { wire, maxTokens, verifiedAt, source }`) setelah
  turn sukses, lalu pakai itu sebagai default cepat; refresh berkala.
- D3: dialog effort menampilkan pilihan dari `thinkingPolicy.effortsFor(model)`
  (sudah ada) + label `xhigh + workflows` untuk `ultra` — tanpa menyalin UI
  claude-code.

## E. Migrasi fitur pluggable GUI -> TUI/CLI (ala Hermes)

Masalah inti: fitur GUI hidup di renderer (`src/hooks/agent/*`, Dexie, Monaco,
Tauri IPC) sehingga TUI harus meniru ulang dan inti ikut berubah tiap fitur baru.
Pola Hermes: **satu inti + capability registry + gateway**, host hanya me-mount.

Target arsitektur:
1. **Capability registry sebagai satu sumber** (`sidecar/engine/channels/*` sudah
   jadi tempatnya). Tiap kemampuan (tool, plugin, skill, memory, google, music,
   telegram) mendaftarkan: `id`, `kind` (tool/command/pane), `schema`, `exec`,
   `surface` (gui|tui|cli|all). GUI/TUI/CLI membaca daftar yang sama.
2. **Surface-aware**: channel/aksi menandai `surface` yang didukung. TUI/CLI
   hanya me-mount yang `tui|cli|all`; yang `gui`-only (gemini-web, camera,
   windowOpacity) ditandai jujur, bukan gagal senyap.
3. **Command/tool dari registry, bukan hardcode**: `TUI_COMMANDS` +
   `filterCompletions` diganti pembacaan registry (slash command = `kind:command`),
   sehingga fitur baru muncul di TUI tanpa edit `theme.mjs`.
4. **Config & session lewat jembatan yang sudah ada**: `shared.json` (GUI->CLI)
   diperluas menjadi kontrak `AppConfig` bertipe (lihat rencana TS), plus
   trajectory headless (PLAN-T1) supaya observability setara.
5. **TUI/CLI delegate_coding**: saat ini `delegate_coding` HANYA ada di renderer
   (`agentTools.js`). TUI/CLI belum punya. Rencana: pindahkan eksekusi
   `delegate_coding` ke channel sidecar (`coding:delegate`) yang memakai
   `codingAgentBridge` (opencode/hermes), lalu GUI + TUI/CLI memanggil channel yang
   sama. Dengan begitu aturan "kunci ke opencode/hermes" berlaku di semua host.

Urutan PR:
1. PLAN-T1 (trajectory headless) — prasyarat observabilitas.
2. Registry surface-aware (E1/E2) + tool/à command dari registry (E3).
3. `coding:delegate` channel (E5) -> paritas GUI/TUI/CLI.
4. PLAN-D1..D3 (cache/refresh metadata).
5. PLAN-T2..T4 (finish_reason + retry 1x).

## F. Terkait
- Adopsi Hermes per konsep (H1..H12) + urutan wave: lihat
  `docs/PLANNED/2026-09-26_hermes-cli-engine-adoption.md`. Dokumen itu yang
  memuat status terverifikasi (termasuk temuan `gateway.mjs` kode-ada-unwired
  dan GUI yang masih punya loop sendiri).

## G. Aturan tetap
- Tanpa fallback model (keputusan owner). `delegate_coding` terkunci ke
  opencode/hermes. Tanpa emoji/Sparkles. Boundary coding-agent: delegasi, bukan
  duplikasi.
