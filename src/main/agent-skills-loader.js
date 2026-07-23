import fs from 'fs'
import path from 'path'
import os from 'os'
import { ipcMain } from 'electron'

/**
 * Agent Skills Loader
 *
 * Scans ~/.agents/skills/ for SKILL.md files, parses YAML frontmatter
 * (name + description), and makes them available as AI-accessible knowledge.
 *
 * Skills differ from Plugins:
 *   - Plugins execute JS code (index.js)
 *   - Skills provide markdown instructions for the AI to follow
 *
 * When a skill is vector-matched to the user query, the full SKILL.md content
 * is injected into the AI system prompt, teaching the AI how to handle the task.
 */

let loadedSkills = []

/** Resolve the user's .agents/skills directory */
export function getSkillsDir() {
  return path.join(os.homedir(), '.agents', 'skills')
}

/**
 * Parse YAML frontmatter from SKILL.md.
 * Returns { name, description, content }
 */
function parseSkillFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split('\n')

  if (!lines[0]?.trim()?.startsWith('---')) return null

  // Find closing ---
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) return null

  const frontmatter = lines.slice(1, endIdx).join('\n')
  const content = lines.slice(endIdx + 1).join('\n').trim()

  // Parse YAML-like frontmatter (simple key-value only)
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim()

  if (!name) return null

  return {
    name,
    description: description || `${name} skill`,
    content: text // full SKILL.md content
  }
}

/** Scan skills directory and load all SKILL.md files */
export function loadSkills() {
  loadedSkills = []
  const skillsDir = getSkillsDir()

  if (!fs.existsSync(skillsDir)) {
    console.log('[Agent Skills] Directory not found:', skillsDir)
    return []
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillPath)) continue

    try {
      const skill = parseSkillFile(skillPath)
      if (skill) {
        loadedSkills.push(skill)
        console.log(`[Agent Skills] Loaded: ${skill.name}`)
      }
    } catch (err) {
      console.error(`[Agent Skills] Failed to parse ${entry.name}/SKILL.md:`, err.message)
    }
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
}
