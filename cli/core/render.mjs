// cli/core/render.mjs — renderer baris teks untuk onThought/onStep host v1.
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9). Murni: string masuk, string keluar.

export function renderThoughtLine(thought) {
  if (!thought) return null
  return `[THOUGHT]: ${thought}`
}

export function renderStepLine(stepRecord = {}) {
  if (stepRecord.kind === 'decision') {
    const dec = stepRecord.decision
    if (!dec?.action) return null
    const acts = Array.isArray(dec.action) ? dec.action : [dec.action]
    const parts = acts.filter((a) => a?.tool).map((a) => `${a.tool}${a.query ? ` (${String(a.query).slice(0, 100)})` : ''}`)
    return parts.length ? `[ACTION]: ${parts.join(' | ')}` : null
  }
  if (stepRecord.kind === 'tool') {
    // Compact satu baris ala opencode tool trigger (title + subtitle):
    // `[TOOL name]: STATUS — baris pertama output`. Multi-baris di-collapse
    // (whitespace ciut, cap 120 char) supaya daftar pesan tetap rapat.
    const status = stepRecord.ok ? 'OK' : 'FAIL'
    return `[TOOL ${stepRecord.tool}]: ${status} — ${firstLine(stepRecord.result)}`
  }
  return null
}

// Baris pertama non-kosong, whitespace di-collapse, cap 120 char.
export function firstLine(output, maxChars = 120) {
  const line = String(output || '')
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.length > 0) || '—'
  const flat = line.replace(/\s+/g, ' ')
  if (Array.from(flat).length <= maxChars) return flat
  return `${Array.from(flat).slice(0, Math.max(0, maxChars - 1)).join('')}…`
}

// Port opencode packages/tui/src/util/collapse-tool-output.ts (verbatim,
// tanpa dep): potong output ke maxLines baris / maxChars char + flag overflow.
export function collapseToolOutput(output, maxLines, maxChars) {
  const lines = String(output ?? '').split('\n')
  if (lines.length <= maxLines && Array.from(String(output ?? '')).length <= maxChars) {
    return { output: String(output ?? ''), overflow: false }
  }

  const preview = lines.slice(0, maxLines).join('\n')
  if (Array.from(preview).length > maxChars) {
    return {
      output:
        Array.from(preview)
          .slice(0, Math.max(0, maxChars - 1))
          .join('') + '…',
      overflow: true,
    }
  }

  return { output: [...lines.slice(0, maxLines), '…'].join('\n'), overflow: true }
}
