import { describe, it, expect } from 'vitest'
import { extractPdfText } from '../sidecar/engine/pdf-parse-shim.mjs'

// PDF 1 halaman minimal bertuliskan Halo Abelink (dibangun manual, tanpa dep).
function tinyPdf(text) {
  const body = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const off = []
  let pos = pdf.length
  objs.forEach((o, i) => {
    off[i + 1] = pos
    const s = `${i + 1} 0 obj\n${o}\nendobj\n`
    pdf += s
    pos += s.length
  })
  const xref = pos
  pdf +=
    'xref\n0 6\n0000000000 65535 f \n' +
    off.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

describe('pdf-parse-shim (regresi: default v2 bukan fungsi)', () => {
  it('mengekstrak teks via bentuk export yang tersedia', async () => {
    const text = await extractPdfText(tinyPdf('Halo Abelink'))
    expect(text).toContain('Halo Abelink')
  }, 15000)

  it('PDF rusak melempar pesan ramah, bukan "Invalid PDF structure"', async () => {
    await expect(extractPdfText(Buffer.from('not a pdf at all'))).rejects.toThrow(
      /rusak atau bukan PDF yang valid/
    )
  }, 15000)
})
