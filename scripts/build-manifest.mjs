// scripts/build-manifest.mjs
// Builds .agents/manifest.json — SHA-256 of every core skill body.
// Run: node scripts/build-manifest.mjs  (must run from repo root)
import { createHash } from 'crypto'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = path.join(root, '.agents', 'skills')
const manifestPath = path.join(root, '.agents', 'manifest.json')

// Must match loader's body extraction: content after the closing '---' line
function getSkillBody(content) {
  const parts = content.split(/\n---\s*\n/)
  return parts[1] ?? content
}

function getFrontmatter(content) {
  return content.split(/\n---\s*\n/)[0].replace(/^---\s*\n/, '')
}

const manifest = { version: 1, skills: {} }
for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const skillPath = path.join(skillsDir, entry.name, 'SKILL.md')
  if (!existsSync(skillPath)) continue
  const content = readFileSync(skillPath, 'utf8')
  // Only core (mark-agent-fork) skills go into the manifest
  if (!/^origin:\s*mark-agent-fork\s*$/m.test(getFrontmatter(content))) continue
  const body = getSkillBody(content)
  manifest.skills[entry.name] = { sha256: createHash('sha256').update(body).digest('hex') }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`[manifest] hashed ${Object.keys(manifest.skills).length} core skill(s)`)
