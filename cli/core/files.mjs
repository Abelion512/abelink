// cli/core/files.mjs — @file reference (ala opencode) + generator /init.
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9). Batas jujur: hanya di dalam
// workspace, maks TUI_FILE_REF_MAX_FILES file, TUI_FILE_REF_MAX_BYTES per file.
import path from 'node:path'
import fs from 'node:fs'
import { TUI_FILE_REF_MAX_BYTES, TUI_FILE_REF_MAX_FILES } from './constants.mjs'

export function extractFileRefs(text = '') {
  const refs = []
  const re = /(^|\s)@([^\s]+)/g
  let m
  while ((m = re.exec(String(text ?? '')))) refs.push(m[2])
  return refs
}

export function resolveFileRefs(text = '', { workspace = process.cwd(), fsMod = null } = {}) {
  const fsUse = fsMod || fsSyncShim()
  const refs = extractFileRefs(text)
  if (!refs.length) return { ok: true, text, attached: [] }
  if (refs.length > TUI_FILE_REF_MAX_FILES) {
    return { ok: false, error: `Terlalu banyak @file (${refs.length}, maks ${TUI_FILE_REF_MAX_FILES}).` }
  }
  const root = path.resolve(workspace)
  const attached = []
  let out = String(text)
  for (const ref of refs) {
    const abs = path.resolve(root, ref)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      return { ok: false, error: `@${ref} di luar workspace — tolak.` }
    }
    let content
    try {
      const stat = fsUse.statSync(abs)
      if (!stat.isFile()) return { ok: false, error: `@${ref} bukan file.` }
      if (stat.size > TUI_FILE_REF_MAX_BYTES) {
        return { ok: false, error: `@${ref} terlalu besar (${stat.size}B, maks ${TUI_FILE_REF_MAX_BYTES}B).` }
      }
      content = fsUse.readFileSync(abs, 'utf8')
    } catch {
      return { ok: false, error: `@${ref} tak terbaca.` }
    }
    attached.push({ ref, bytes: content.length })
    out = out.replaceAll(`@${ref}`, `\n[FILE @${ref}]\n${content}\n[/FILE]\n`)
  }
  return { ok: true, text: out, attached }
}

// fs shim agar testable tanpa I/O nyata (inject fsMod).
function fsSyncShim() {
  return {
    statSync: (p) => {
      const st = fs.statSync(p)
      return st
    },
    readFileSync: (p, enc) => fs.readFileSync(p, enc)
  }
}

// /init generator (ala opencode /init): hasilkan draf AGENTS.md dari
// struktur workspace. Pure + testable (inject listDir). Tidak menulis file
// sendiri — handler yang menulis setelah konfirmasi implisit via perintah.
export function buildAgentsMd({ workspace = '', entries = [] } = {}) {
  const names = entries.map((e) => String(e?.name || e)).filter(Boolean).slice(0, 40)
  const has = (...keys) => names.filter((n) => keys.some((k) => n.toLowerCase().includes(k)))
  const lines = [
    '# AGENTS.md',
    '',
    `Workspace: ${workspace || '.'}`,
    '',
    '## Build & Test',
  ]
  const pkg = has('package.json')
  if (pkg.length) lines.push('- Bun/Node project (`package.json` terdeteksi). Tambahkan perintah build/test/lint yang benar di sini.')
  else lines.push('- Tambahkan perintah build/test/lint proyek ini di sini.')
  lines.push('', '## Struktur')
  if (names.length) {
    for (const n of names.slice(0, 20)) lines.push(`- \`${n}\``)
  } else {
    lines.push('- (workspace kosong atau tak terbaca — isi manual)')
  }
  lines.push('', '## Konvensi', '- Tambahkan konvensi kode proyek ini di sini.', '')
  return lines.join('\n')
}
