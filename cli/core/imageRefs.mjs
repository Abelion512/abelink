// cli/core/imageRefs.mjs — deteksi + resolve path gambar di input TUI.
//
// Drop/drag dari file manager atau paste path menghasilkan teks path biasa
// (bisa ber-quote). Tanpa modul ini path terkirim mentah sebagai prompt dan
// model hanya melihat string path (laporan user 2026-09-28).
// Pola: extractFileRefs (files.mjs) + readLocalAttachment (opencode
// prompt/local-attachment.ts, mime map). Murni + testable (inject fsMod).
// Batas: dalam workspace, maks file + bytes ikut TUI_FILE_REF_* (import,
// bukan copy — cegah drift).
import { TUI_FILE_REF_MAX_FILES, TUI_FILE_REF_MAX_BYTES } from './constants.mjs'

export const IMAGE_EXTS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp'])

export const IMAGE_MIMES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
})

export function isImagePath(p = '') {
  const s = String(p ?? '').toLowerCase().replace(/['"]+$/g, '')
  return IMAGE_EXTS.some((e) => s.endsWith(e))
}

function stripQuotes(s = '') {
  let t = String(s ?? '').trim()
  if (t.length >= 2 && ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')))) {
    t = t.slice(1, -1)
  }
  return t
}

// Kumpulkan kandidat path gambar mentah dari teks: token ber-quote atau
// ber-ekstensi gambar. Return unik, urutan kemunculan.
export function extractImagePaths(text = '') {
  const out = []
  const seen = new Set()
  const re = /'([^']+)'|"([^"]+)"|(\/[^\s'"]+|\.\/[^\s'"]+|[A-Za-z0-9_][^\s'"]*\.[A-Za-z0-9]+)/g
  let m
  while ((m = re.exec(String(text ?? '')))) {
    const raw = stripQuotes(m[1] ?? m[2] ?? m[3] ?? '')
    if (!raw || seen.has(raw)) continue
    if (!isImagePath(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out
}

// Resolve kandidat ke attachment; gambar dibaca base64 (bukan utf8 seperti
// @file teks). Non-gambar/hilang/kebesaran = dilewati dengan catatan,
// bukan error fatal (input utama tetap jalan).
export function resolveImageRefs(text = '', { workspace = process.cwd(), fsMod = null, pathMod = null, maxFiles = TUI_FILE_REF_MAX_FILES, maxBytes = TUI_FILE_REF_MAX_BYTES } = {}) {
  const fs = fsMod || defaultFs()
  const path = pathMod || defaultPath()
  const cands = extractImagePaths(text)
  const attached = []
  const skipped = []
  let out = String(text ?? '')
  for (const ref of cands.slice(0, maxFiles)) {
    const abs = path.resolve(workspace, ref)
    const root = path.resolve(workspace)
    if (abs !== root && !abs.startsWith(root + path.sep)) { skipped.push({ ref, reason: 'di luar workspace' }); continue }
    let stat
    try { stat = fs.statSync(abs) } catch { skipped.push({ ref, reason: 'tak terbaca' }); continue }
    if (!stat.isFile()) { skipped.push({ ref, reason: 'bukan file' }); continue }
    if (stat.size > maxBytes) { skipped.push({ ref, reason: `terlalu besar (${stat.size}B)` }); continue }
    const ext = '.' + String(ref).toLowerCase().split('.').pop()
    const mime = IMAGE_MIMES[ext] || 'application/octet-stream'
    let buf
    try { buf = fs.readFileSync(abs) } catch { skipped.push({ ref, reason: 'tak terbaca' }); continue }
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(String(buf ?? ''), 'utf8').toString('base64')
    attached.push({ ref, mime, bytes: stat.size, base64: b64 })
    out = out.split(ref).join(`[GAMBAR ${ref} terlampir]`)
  }
  if (cands.length > maxFiles) skipped.push({ ref: `+${cands.length - maxFiles} gambar lain`, reason: `maks ${maxFiles}` })
  return { ok: true, text: out, attached, skipped }
}

function defaultFs() {
  return { statSync: () => { throw new Error('no fs') }, readFileSync: () => { throw new Error('no fs') } }
}

function defaultPath() {
  return { resolve: (...a) => a.join('/').replace(/\/+/g, '/'), sep: '/' }
}
