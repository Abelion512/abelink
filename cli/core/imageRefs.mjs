// cli/core/imageRefs.mjs — deteksi + resolve lampiran file di input TUI.
//
// Drop/drag dari file manager atau paste path menghasilkan teks path biasa
// (bisa ber-quote). Tanpa modul ini path terkirim mentah sebagai prompt dan
// model hanya melihat string path (laporan user 2026-09-28).
// Port opencode packages/tui/src/component/prompt/local-attachment.ts:
// mime gate (image/* + application/pdf), SVG dibaca sebagai TEKS (bukan
// base64 — model baca markup langsung), binary dibaca bytes.
// Pola: extractFileRefs (files.mjs). Murni + testable (inject fsMod).
// Batas: dalam workspace, maks file + bytes ikut TUI_FILE_REF_* (import,
// bukan copy — cegah drift).
import { TUI_FILE_REF_MAX_FILES, TUI_FILE_REF_MAX_BYTES } from './constants.mjs'

// Mime gate ikut local-attachment.ts (tanpa .bmp: upstream tak kenal).
export const IMAGE_EXTS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'])
export const PDF_EXTS = Object.freeze(['.pdf'])

export const ATTACH_MIMES = Object.freeze({
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
})

export const IMAGE_MIMES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
})

function extOf(ref = '') {
  return '.' + String(ref ?? '').toLowerCase().split('.').pop()
}

export function isImagePath(p = '') {
  const s = String(p ?? '').toLowerCase().replace(/['"]+$/g, '')
  return IMAGE_EXTS.some((e) => s.endsWith(e))
}

export function isPdfPath(p = '') {
  return extOf(String(p ?? '').replace(/['"]+$/g, '')) === '.pdf'
}

export function isAttachablePath(p = '') {
  return isImagePath(p) || isPdfPath(p)
}

function stripQuotes(s = '') {
  let t = String(s ?? '').trim()
  if (t.length >= 2 && ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')))) {
    t = t.slice(1, -1)
  }
  return t
}

// Kumpulkan kandidat path lampiran mentah dari teks: token ber-quote atau
// ber-ekstensi attachable (gambar + PDF). Return unik, urutan kemunculan.
export function extractImagePaths(text = '') {
  const out = []
  const seen = new Set()
  const re = /'([^']+)'|"([^"]+)"|(\/[^\s'"]+|\.\/[^\s'"]+|[A-Za-z0-9_][^\s'"]*\.[A-Za-z0-9]+)/g
  let m
  while ((m = re.exec(String(text ?? '')))) {
    const raw = stripQuotes(m[1] ?? m[2] ?? m[3] ?? '')
    if (!raw || seen.has(raw)) continue
    if (!isAttachablePath(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out
}

// Resolve kandidat ke attachment; pola local-attachment.ts:
// - SVG = teks (markup dibaca model langsung, bukan base64),
// - image/* lain + PDF = binary bytes,
// - mime di luar gate = tolak jujur (bukan error fatal).
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
    const ext = extOf(ref)
    const mime = ATTACH_MIMES[ext]
    if (!mime) { skipped.push({ ref, reason: 'tipe tak didukung' }); continue }
    // SVG sebagai teks (local-attachment.ts: readText untuk image/svg+xml).
    if (mime === 'image/svg+xml') {
      let content
      try { content = fs.readFileSync(abs, 'utf8') } catch { skipped.push({ ref, reason: 'tak terbaca' }); continue }
      if (!content) { skipped.push({ ref, reason: 'kosong' }); continue }
      attached.push({ ref, mime, bytes: stat.size, kind: 'text', text: String(content) })
      out = out.split(ref).join(`[SVG ${ref} terlampir]`)
      continue
    }
    let buf
    try { buf = fs.readFileSync(abs) } catch { skipped.push({ ref, reason: 'tak terbaca' }); continue }
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(String(buf ?? ''), 'utf8').toString('base64')
    attached.push({ ref, mime, bytes: stat.size, kind: 'binary', base64: b64 })
    out = out.split(ref).join(mime === 'application/pdf' ? `[PDF ${ref} terlampir]` : `[GAMBAR ${ref} terlampir]`)
  }
  if (cands.length > maxFiles) skipped.push({ ref: `+${cands.length - maxFiles} lampiran lain`, reason: `maks ${maxFiles}` })
  return { ok: true, text: out, attached, skipped }
}

function defaultFs() {
  return { statSync: () => { throw new Error('no fs') }, readFileSync: () => { throw new Error('no fs') } }
}

function defaultPath() {
  return { resolve: (...a) => a.join('/').replace(/\/+/g, '/'), sep: '/' }
}
