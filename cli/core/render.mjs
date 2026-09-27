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
    const status = stepRecord.ok ? 'OK' : 'FAIL'
    return `[TOOL RESULT ${stepRecord.tool}]: [${status}] ${String(stepRecord.result || '').slice(0, 150)}...`
  }
  return null
}
