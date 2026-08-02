/**
 * Skill Library — renderer-side access to SKILL.md skills.
 *
 * Thin wrapper over IPC (main process owns scanning + verification).
 * Skills loaded on-demand: only name+description cached, body fetched via getSkill().
 */

let _skillsCache = null
let _skillsCacheTime = 0
const CACHE_TTL = 60_000 // 60s

/**
 * Fetch skills list from main process, cache briefly.
 * @returns {Promise<Array<{name: string, description: string, origin: string, signatureStatus: string}>>}
 */
export async function loadSkills() {
  const now = Date.now()
  if (_skillsCache && now - _skillsCacheTime < CACHE_TTL) return _skillsCache
  try {
    if (typeof window.api?.getAgentSkills !== 'function') return []
    const skills = await window.api.getAgentSkills()
    _skillsCache = Array.isArray(skills) ? skills : []
    _skillsCacheTime = now
    return _skillsCache
  } catch (e) {
    console.error('[SkillLibrary] loadSkills failed:', e.message)
    return []
  }
}

/** Cached skills list (empty if never loaded). */
export function listSkills() {
  return (_skillsCache || []).map(s => ({
    name: s.name,
    description: s.description,
    origin: s.origin,
    signatureStatus: s.signatureStatus,
  }))
}

/**
 * Lazy-load full skill body on demand.
 * @param {string} name
 * @returns {Promise<string|null>}
 */
export async function getSkill(name) {
  try {
    return await window.api.getAgentSkillContent(name)
  } catch {
    return null
  }
}

/**
 * Inject skill name+description hints into the LAST user message.
 * Does NOT inline full bodies — progressive disclosure (loaded when vector-matched).
 * Indonesian labels, compact format.
 */
export async function injectSkillHints(messages) {
  const skills = await loadSkills()
  if (!skills.length) return messages

  const hint = skills
    .map(s => `• ${s.name}: ${s.description}`)
    .join('\n')
  const block = `\n\n[Tersedia ${skills.length} skill:\n${hint}]`

  const msgs = [...messages]
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      msgs[i] = { ...msgs[i], content: msgs[i].content + block }
      break
    }
  }
  return msgs
}

// Bust cache on IPC notification
if (typeof window !== 'undefined' && window.api?.onSkillsUpdated) {
  window.api.onSkillsUpdated(() => {
    _skillsCache = null
    _skillsCacheTime = 0
  })
}
