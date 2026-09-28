// cli/core/paste.mjs — normalisasi paste di boundary input.
//
// Port opencode packages/tui/src/component/prompt/index.tsx (pasteInputText
// + onPaste ~1396): CRLF/CR -> LF, trim untuk deteksi path/ringkasan.
// Tanpa extmarks: paste panjang TIDAK disembunyikan (full text masuk apa
// adanya — jujur, bukan placeholder tanpa isi); shouldSummarizePaste +
// summarizePaste diekspos murni agar caller masa depan bisa pakai.
// Semua fungsi murni + testable.

// Normalisasi line-ending di boundary input (paste lintas OS / $EDITOR).
export function normalizePaste(text = '') {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// Ambang ringkasan ikut opencode pasteInputText: >=3 baris ATAU >150 char.
export const PASTE_SUMMARY_MIN_LINES = 3
export const PASTE_SUMMARY_MIN_CHARS = 150

export function pasteLineCount(text = '') {
  const t = String(text ?? '')
  if (!t) return 0
  return (t.match(/\n/g)?.length ?? 0) + 1
}

export function shouldSummarizePaste(text = '') {
  const t = normalizePaste(text).trim()
  return pasteLineCount(t) >= PASTE_SUMMARY_MIN_LINES || t.length > PASTE_SUMMARY_MIN_CHARS
}

// Marker ringkas pola `[Pasted ~N lines]` (opencode pasteText virtual).
export function summarizePaste(text = '') {
  return `[Pasted ~${pasteLineCount(normalizePaste(text).trim())} lines]`
}
