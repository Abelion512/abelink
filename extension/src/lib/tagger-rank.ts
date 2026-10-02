// Kontrak ranking tagger, dipakai test + dokumentasi.
// taggerFn di background.ts menyalin rankTaggerElements ke dalam bodnya
// (duplikasi disengaja ~15 baris) karena fungsi itu di-serialisasi ke
// konteks halaman dan wajib self-contained.
export const TAGGER_MAX = 200

export interface RankableElement {
  inMain?: boolean
  [key: string]: unknown
}

export function rankTaggerElements<T extends RankableElement>(els: Iterable<T>): T[] {
  const main: T[] = []
  const rest: T[] = []
  for (const el of els) {
    if (el?.inMain) main.push(el)
    else rest.push(el)
  }
  return [...main, ...rest].slice(0, TAGGER_MAX)
}
