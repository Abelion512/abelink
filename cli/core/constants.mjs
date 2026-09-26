// cli/core/constants.mjs — konstanta TUI (v1 readline + v2 OpenTUI) satu sumber.
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9) supaya cli/tui tidak mengimpor bin/.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './paths.mjs'

// Versi TIDAK hardcoded: dari package.json (di-sync sync-version.mjs dari
// src-tauri/tauri.conf.json) agar bump alpha ikut otomatis.
export const TUI_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'dev'
  } catch {
    return 'dev'
  }
})()
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'auto'])
export const DEFAULT_TUI_MODEL = 'oc/muse-spark-1.3-contributor-free'
export const SESSION_MESSAGE_CAP = 50

// GAP-STREAM: sidecar ai:fetch streaming frames are unconfirmed. Flip to true
// once the sidecar honors `stream` + emits token frames; buildAiFetchBody is
// the single place that threads the flag into the RPC payload.
export const TUI_STREAM_ENABLED = false

// @file reference (ala opencode): batas jujur — max 5 file, 50KB per file,
// dalam workspace. Di luar itu ditolak dengan pesan, bukan diam.
export const TUI_FILE_REF_MAX_FILES = 5
export const TUI_FILE_REF_MAX_BYTES = 50 * 1024

export const TUI_HELP = `Perintah slash (tak dikirim sebagai prompt):
  /models [filter]   Picker model interaktif (tanpa arg) — default HANYA model yang pernah kamu pakai + alias;
                     /models --all = muat katalog penuh (1300+); /models <filter> = cari di katalog
  /model [alias|id]  Ganti model; TANPA arg = picker interaktif (↑↓ pilih, Enter pakai, ketik untuk filter)
                     Alias: zen, zen-free, spark, qwen, mimo, nara, xkiro, tokenrouter, free, free-mimo
  /effort [level]    Lihat/ganti effort: low | medium | high | xhigh | max | ultra | auto
  /sessions          Dialog sesi tersimpan, Enter = lanjut (alias: /resume)
  /commands          Command palette (alias ctrl+p)
  /continue <id>     Lanjut sesi tersimpan
  /new               Mulai sesi baru (alias: /clear)
  /compact           Ringkas histori sesi berjalan (alias: /summarize)
  /thinking          Tampilkan/sembunyikan blok thinking
  /details           Tampilkan/sembunyikan detail eksekusi tool
  /editor            Tulis prompt panjang di $EDITOR
  /init              Buat/perbarui AGENTS.md dari struktur workspace
  /help              Tampilkan bantuan ini
  /exit              Keluar (alias: /quit, /q; Ctrl-D juga bisa)
File: @path/ke/file = lampirkan isi file ke prompt. !perintah = shell cepat (tak masuk histori).
Catatan: /undo ditunda (tanpa primitif). Ctrl-C membatalkan turn saja, sesi tetap jalan.`
