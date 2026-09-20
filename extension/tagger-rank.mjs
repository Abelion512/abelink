// Kontrak ranking tagger, dipakai test + dokumentasi.
// taggerFn di background.js menyalin rankTaggerElements ke dalam bodinya
// (duplikasi disengaja ~15 baris) karena fungsi itu di-serialisasi ke
// konteks halaman dan wajib self-contained.
export const TAGGER_MAX = 200

export function rankTaggerElements(els) {
  const main = []
  const rest = []
  for (const el of els) {
    if (el?.inMain) main.push(el)
    else rest.push(el)
  }
  return [...main, ...rest].slice(0, TAGGER_MAX)
}
