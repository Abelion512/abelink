// cli/core/paths.mjs — lokasi runtime yang dipakai seluruh cli/core + host.
// Dipisah supaya modul core tidak perlu tahu bahwa dulu ia hidup di bin/:
// ROOT dihitung dari lokasi modul ini, bukan dari pemanggil.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Root repo (dua level di atas: cli/core -> cli -> akar). */
export const ROOT = path.resolve(__dirname, '..', '..')
/** Entry sidecar engine (JSON-over-stdio). */
export const SIDECAR_ENTRY = path.join(ROOT, 'sidecar', 'engine.mjs')
/** Runtime sidecar; boleh di-override lewat BUN_BIN (E2E/CI). */
export const BUN_BIN = process.env.BUN_BIN || 'bun'
