// Shim pdf-parse v1/v2 — SATU-SATUNYA tempat yang tahu bentuk export dep.
// v1: default export = fungsi (buffer) -> { text }.
// v2: ESM, default BUKAN fungsi; parser via class PDFParse ({ data }) -> getText().
// Murni (tanpa side effect) agar bisa di-unit-test; dipakai channel parse-document.
//
// PDF rusak/terpotong melempar InvalidPDFException mentah dari pdfjs
// ("Invalid PDF structure.") — diterjemahkan ke pesan ramah di sini agar
// Knowledge.jsx menampilkan sebab yang bisa ditindaklanjuti user.
const CORRUPT_PATTERNS = [/invalid pdf structure/i, /size is zero bytes/i, /unexpected /i]
export async function extractPdfText(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('File PDF kosong atau tidak terbaca — pastikan file tidak korup.')
  }
  try {
    const ns = await import('pdf-parse')
    const mod = ns.default ?? ns
    if (typeof mod === 'function') {
      const res = await mod(buffer)
      return res.text
    }
    const parser = new mod.PDFParse({ data: buffer })
    const res = await parser.getText()
    return res.text
  } catch (err) {
    const msg = String(err?.message || err || '')
    if (err?.name === 'PasswordException') {
      throw new Error('PDF ini diproteksi kata sandi — hapus proteksinya lalu unggah ulang.')
    }
    if (err?.name === 'InvalidPDFException' || CORRUPT_PATTERNS.some((re) => re.test(msg))) {
      throw new Error(
        'File rusak atau bukan PDF yang valid — unduh ulang/export ulang sebagai PDF lalu coba lagi.'
      )
    }
    throw err
  }
}
