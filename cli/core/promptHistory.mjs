// cli/core/promptHistory.mjs — histori prompt Up/Down untuk TUI.
//
// Port opencode packages/tui/src/prompt/history.tsx (usePromptHistory):
// append dedup-berurutan + cap, move(index, draft) dengan guard draft
// (ketikan manual tak ditimpa recall). Disederhanakan jujur: string-only
// (tanpa parts/extmarks — TUI tak punya konsep itu), tanpa persistensi file
// (sesi TUI sudah persisten via session-store; histori prompt = memori sesi).
// Semua fungsi murni + testable (mutasi objek hist yang dioper eksplisit).

export const MAX_PROMPT_HISTORY = 50

export function createPromptHistory() {
  return { entries: [], index: 0 }
}

// Append: teks kosong diabaikan; duplikat berurutan reset index saja;
// cap 50 dari belakang (pola history.tsx append).
export function appendPromptHistory(hist, text) {
  const input = String(text ?? '')
  if (!input.trim() || !hist) return hist
  if (hist.entries[hist.entries.length - 1] === input) {
    hist.index = 0
    return hist
  }
  hist.entries.push(input)
  if (hist.entries.length > MAX_PROMPT_HISTORY) hist.entries = hist.entries.slice(-MAX_PROMPT_HISTORY)
  hist.index = 0
  return hist
}

// Move: -1 = lebih lama, +1 = lebih baru. Index 0 = draft segar ('').
// Guard pola move(): draft yang diubah manual tak ditimpa (return null).
// Return string (bisa '') atau null bila tak ada pergerakan.
export function movePromptHistory(hist, direction, draftText = '') {
  if (!hist || !hist.entries.length) return null
  const draft = String(draftText ?? '')
  const current = hist.index === 0 ? '' : hist.entries[hist.entries.length + hist.index]
  if (current === undefined) return null
  if (current !== draft && draft.length) return null
  const next = hist.index + direction
  if (Math.abs(next) > hist.entries.length) return null
  if (next > 0) return null
  hist.index = next
  if (hist.index === 0) return ''
  return hist.entries[hist.entries.length + hist.index] ?? null
}
