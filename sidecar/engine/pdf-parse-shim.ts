// Shim pdf-parse v1/v2 — SATU-SATUNYA tempat yang tahu bentuk export dep.
// v1: default export = fungsi (buffer) -> { text }.
// v2: ESM, default BUKAN fungsi; parser via class PDFParse ({ data }) -> getText().
// Murni (tanpa side effect) agar bisa di-unit-test; dipakai channel parse-document.
//
// PDF rusak/terpotong melempar InvalidPDFException mentah dari pdfjs
// ("Invalid PDF structure.") — diterjemahkan ke pesan ramah di sini agar
// Knowledge.jsx menampilkan sebab yang bisa ditindaklanjuti user.
//
// W1-1 (js-to-ts-spec.md): rename + tipe. Bentuk runtime dep tidak diverifikasi
// tipenya di tepi import (v1/v2 union) — satu cast lokal per cabang, pola M2a.

type PdfParseV1Fn = (buffer: Buffer) => Promise<{ text: string }>
type PdfParseV2 = { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> } }
type PdfParseLike = PdfParseV1Fn | PdfParseV2

const CORRUPT_PATTERNS = [/invalid pdf structure/i, /size is zero bytes/i, /unexpected /i]

export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('File PDF kosong atau tidak terbaca — pastikan file tidak korup.')
  }
  try {
    const ns = (await import('pdf-parse')) as { default?: unknown }
    const mod = (ns?.default ?? ns) as PdfParseLike
    if (typeof mod === 'function') {
      const res = await mod(buffer)
      return res.text
    }
    const parser = new mod.PDFParse({ data: buffer })
    const res = await parser.getText()
    return res.text
  } catch (err) {
    const e = err as { name?: string; message?: string }
    const msg = String(e?.message || err || '')
    if (e?.name === 'PasswordException') {
      throw new Error('PDF ini diproteksi kata sandi — hapus proteksinya lalu unggah ulang.')
    }
    if (e?.name === 'InvalidPDFException' || CORRUPT_PATTERNS.some((re) => re.test(msg))) {
      throw new Error(
        'File rusak atau bukan PDF yang valid — unduh ulang/export ulang sebagai PDF lalu coba lagi.'
      )
    }
    throw err
  }
}
