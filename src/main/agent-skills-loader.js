import fs from 'fs'
import path from 'path'
import os from 'os'
import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import { buildCanonical, hashBody, verifyContent } from './agent-keyring.js'

/**
 * Agent Skills Loader
 *
 * Scans ~/.agents/skills/ (and cwd fallback) for SKILL.md files, parses YAML frontmatter,
 * and verifies skill origin via manifest (core) or Ed25519 signature (AI-generated).
 *
 * Skills differ from Plugins:
 *   - Plugins execute JS code (index.js)
 *   - Skills provide markdown instructions for the AI to follow
 *
 * When a skill is vector-matched to the user query, the full SKILL.md content
 * is injected into the AI system prompt, teaching the AI how to handle the task.
 */

let loadedSkills = []

/** Resolve candidate skills directories (homedir primary, cwd fallback) */
export function getSkillsDirs() {
  const dirs = [path.join(os.homedir(), '.agents', 'skills')]
  const cwdSkills = path.join(process.cwd(), '.agents', 'skills')
  if (cwdSkills !== dirs[0] && fs.existsSync(cwdSkills)) dirs.push(cwdSkills)
  return dirs
}

/** Legacy single-dir accessor — kept for backward compat */
export function getSkillsDir() {
  return getSkillsDirs()[0]
}

/**
 * Parse YAML frontmatter from SKILL.md.
 * Returns { name, description, watermark, origin, provider, signature, platforms, filePath, body, content }
 */
function parseSkillFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split('\n')
  if (!lines[0]?.trim()?.startsWith('---')) return null
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') { endIdx = i; break }
  }
  if (endIdx === -1) return null
  const frontmatter = lines.slice(1, endIdx).join('\n')
  const body = lines.slice(endIdx + 1).join('\n')

  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  const watermark = frontmatter.match(/^watermark:\s*(.+)$/m)?.[1]?.trim()
  const rawOrigin = frontmatter.match(/^origin:\s*(.+)$/m)?.[1]?.trim()
  const provider = frontmatter.match(/^provider:\s*(.+)$/m)?.[1]?.trim()
  const signature = frontmatter.match(/^mark-signature:\s*(.+)$/m)?.[1]?.trim()
  const platformsMatch = frontmatter.match(/^platforms:\s*\[([^\]]*)\]$/m)
  const platforms = platformsMatch
    ? platformsMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    : []

  if (!name) return null

  return {
    name,
    description: description || `${name} skill`,
    watermark: watermark || null,
    origin: rawOrigin || 'unknown',
    provider: provider || null,
    signature,
    platforms,
    filePath,
    body,        // raw body (after frontmatter)
    content: text
  }
}

// ponytail: simple in-process cache; reload() invalidates by setting null
let manifestCache = null

function getManifest() {
  if (manifestCache) return manifestCache
  try {
    const mPath = path.join(process.cwd(), '.agents', 'manifest.json')
    if (fs.existsSync(mPath)) {
      manifestCache = JSON.parse(fs.readFileSync(mPath, 'utf8'))
    }
  } catch (e) {
    console.error('[Skills] Manifest load failed:', e.message)
  }
  return manifestCache
}

/**
 * Derive TRUE origin from verification. The declared `origin` field is a label;
 * this function decides whether the label is backed by proof.
 *
 * Policy matrix (WATERMARK v2):
 *   mark-agent-fork  → sha256 in manifest           → manifest-verified
 *   mark-agent-fork  → hash mismatch / not in manifest → manifest-mismatch → origin=unknown
 *   mark-generated   → Ed25519 sig valid             → signed-verified
 *   mark-generated   → no sig / sig invalid          → signature-invalid → origin=unknown
 *   user             → no proof needed               → unsigned
 *   anything else    → unrecognized-origin           → origin=unknown
 */
function verifySkillOrigin(skill) {
  const bodyHash = hashBody(skill.body)

  // 1. Core skills → verified against committed manifest (content-addressed)
  if (skill.origin === 'mark-agent-fork') {
    const manifest = getManifest()
    const entry = manifest?.skills?.[skill.name]
    if (entry && entry.sha256 === bodyHash) {
      return { origin: 'mark-agent-fork', signatureStatus: 'manifest-verified' }
    }
    return { origin: 'unknown', signatureStatus: 'manifest-mismatch' }
  }

  // 2. AI-created skills → Ed25519 signature (device-bound)
  if (skill.origin === 'mark-generated') {
    const canonical = buildCanonical({
      name: skill.name, watermark: skill.watermark || '',
      origin: 'mark-generated', provider: skill.provider || '', bodyHash
    })
    const valid = verifyContent(canonical, skill.signature)
    return valid
      ? { origin: 'mark-generated', signatureStatus: 'signed-verified' }
      : { origin: 'unknown', signatureStatus: 'signature-invalid' }
  }

  // 3. User skills → no privileged behavior, unsigned OK
  if (skill.origin === 'user') {
    return { origin: 'user', signatureStatus: 'unsigned' }
  }

  // 4. Anything else → not recognized
  return { origin: 'unknown', signatureStatus: 'unrecognized-origin' }
}

/** Scan one skills directory and append verified skills to loadedSkills */
function scanDir(skillsDir) {
  if (!fs.existsSync(skillsDir)) return
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillPath)) continue
    try {
      const skill = parseSkillFile(skillPath)
      if (skill) {
        const verified = verifySkillOrigin(skill)
        loadedSkills.push({ ...skill, origin: verified.origin, signatureStatus: verified.signatureStatus })
        console.log(`[Agent Skills] Loaded: ${skill.name} [${verified.signatureStatus}]`)
      }
    } catch (err) {
      console.error(`[Agent Skills] Failed to parse ${entry.name}/SKILL.md:`, err.message)
    }
  }
}

/** Scan all skills directories and load all SKILL.md files */
export function loadSkills() {
  loadedSkills = []
  manifestCache = null  // bust manifest cache on reload
  const dirs = getSkillsDirs()

  for (const skillsDir of dirs) {
    if (!fs.existsSync(skillsDir)) {
      console.log('[Agent Skills] Directory not found:', skillsDir)
      continue
    }
    scanDir(skillsDir)
  }

  console.log(`[Agent Skills] Total: ${loadedSkills.length} skills loaded`)
  return loadedSkills
}

export function getLoadedSkills() {
  return loadedSkills
}

/** Register IPC handlers for skills */
export function initSkillsIPC() {
  ipcMain.handle('agent-skills:get-list', () => {
    return loadedSkills.map(s => ({
      name: s.name,
      description: s.description
    }))
  })

  ipcMain.handle('agent-skills:get-content', (event, skillName) => {
    const skill = loadedSkills.find(s => s.name === skillName)
    return skill ? skill.content : null
  })

  ipcMain.handle('agent-skills:reload', async () => {
    loadSkills()
    return getLoadedSkills().map(s => ({
      name: s.name,
      description: s.description
    }))
  })

  ipcMain.handle('agent-skills:get-by-origin', (_event, originFilter) => {
    return loadedSkills
      .filter(s => !originFilter || s.origin === originFilter)
      .map(s => ({ name: s.name, description: s.description, watermark: s.watermark, origin: s.origin, signatureStatus: s.signatureStatus }))
  })

  ipcMain.handle('agent-skills:get-by-class', (_event, classFilter) => {
    const FILTERS = {
      core: s => s.origin === 'mark-agent-fork',
      ai: s => s.origin === 'mark-generated',
      user: s => s.origin === 'user',
      trusted: s => s.origin !== 'unknown',
      all: () => true
    }
    const filterFn = FILTERS[classFilter] || FILTERS.all
    return loadedSkills.filter(filterFn).map(s => ({ name: s.name, description: s.description, origin: s.origin, signatureStatus: s.signatureStatus }))
  })
}
