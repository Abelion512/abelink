// Scorer disiplin HITL: needs_user/blocked tanpa artefak tool = 0.
// Murni, ~20 baris, tanpa network/LLM.
export const scoreHitlDiscipline = ({ taskStatus, tools = [], evidence = '' } = {}) => {
  const status = String(taskStatus || '').toLowerCase()
  if (status !== 'needs_user' && status !== 'blocked') return 1
  const list = Array.isArray(tools) ? tools : []
  const asked = list.some((t) => /^(browser-ask|ask-choice|browser-ask-user)$/.test(t?.action || t?.tool || ''))
  if (!asked) return 0
  if (!String(evidence || '').trim()) return 0
  return 1
}
