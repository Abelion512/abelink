// Shim pdf-parse v1/v2 — SATU-SATUNYA tempat yang tahu bentuk export dep.
// v1: default export = fungsi (buffer) -> { text }.
// v2: ESM, default BUKAN fungsi; parser via class PDFParse ({ data }) -> getText().
// Murni (tanpa side effect) agar bisa di-unit-test; dipakai channel parse-document.
export async function extractPdfText(buffer) {
  const ns = await import('pdf-parse')
  const mod = ns.default ?? ns
  if (typeof mod === 'function') {
    const res = await mod(buffer)
    return res.text
  }
  const parser = new mod.PDFParse({ data: buffer })
  const res = await parser.getText()
  return res.text
}
