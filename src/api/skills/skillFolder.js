/**
 * Skill Folder Bundle Helper (Adopted from Hermes Agent Skills)
 *
 * Mendukung skill folder penuh:
 * <skill_name>/
 * ├── SKILL.md
 * ├── references/ (dokumen, panduan, schema)
 * └── scripts/ (script otomasi shell/python/node)
 */

/**
 * Mem-parse query pemanggilan skill menjadi { skillName, subpath }.
 * Mendukung:
 * - "skillName" -> { skillName: "skillName", subpath: null }
 * - "skillName||references/api.md" -> { skillName: "skillName", subpath: "references/api.md" }
 * - "skillName/references/api.md" -> { skillName: "skillName", subpath: "references/api.md" }
 * - "skillName//scripts/run.sh" -> { skillName: "skillName", subpath: "scripts/run.sh" }
 */
export function parseSkillQuery(query) {
  const raw = String(query || '').trim()
  if (!raw) return { skillName: '', subpath: null }

  // 1. Cek separator pipe '||'
  if (raw.includes('||')) {
    const parts = raw.split('||')
    const skillName = parts[0]?.trim() || ''
    const subpath = parts.slice(1).join('||').trim() || null
    return { skillName, subpath }
  }

  // 2. Cek separator slash jika mengandung 'references/' atau 'scripts/'
  const slashMatch = raw.match(/^([A-Za-z0-9._-]+)[/\\]+(references|scripts)[/\\]+(.+)$/i)
  if (slashMatch) {
    const skillName = slashMatch[1]
    const subpath = `${slashMatch[2].toLowerCase()}/${slashMatch[3]}`
    return { skillName, subpath }
  }

  return { skillName: raw, subpath: null }
}

/**
 * Format string representasi ukuran file dalam format manusiawi (B, KB, MB).
 */
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Memformat bundle skill folder menjadi teks observasi lengkap untuk agen.
 * Menggabungkan isi SKILL.md dengan manifes daftar references/ dan scripts/.
 */
export function formatSkillFolderBundle({
  name,
  content = '',
  references = [],
  scripts = [],
  basePath = '',
  sourceType = 'DISK'
}) {
  const parts = []

  const header = `[PEDOMAN SKILL (${sourceType}): ${String(name || '').toUpperCase()}]`
  parts.push(header)

  if (basePath) {
    parts.push(`[BASE DIRECTORY: ${basePath}]`)
  }

  parts.push(content.trim())

  if (Array.isArray(references) && references.length > 0) {
    const refLines = references.map((ref) => {
      const p = typeof ref === 'string' ? ref : ref.path || ref.name
      const sz = typeof ref === 'object' && ref.sizeBytes != null ? ` (${formatBytes(ref.sizeBytes)})` : ''
      return `  - ${p}${sz}`
    })
    parts.push(
      `\n[BERKAS REFERENSI TERSEDIA (references/)]:\n` +
      refLines.join('\n') +
      `\n-> Untuk membaca berkas referensi: panggil read-skill dengan query: "${name}||<path_relatif>"`
    )
  }

  if (Array.isArray(scripts) && scripts.length > 0) {
    const scriptLines = scripts.map((sc) => {
      const p = typeof sc === 'string' ? sc : sc.path || sc.name
      const sz = typeof sc === 'object' && sc.sizeBytes != null ? ` (${formatBytes(sc.sizeBytes)})` : ''
      return `  - ${p}${sz}`
    })
    parts.push(
      `\n[SCRIPTS OTOMASI TERSEDIA (scripts/)]:\n` +
      scriptLines.join('\n') +
      `\n-> Untuk membaca kode script: panggil read-skill dengan query: "${name}||<path_relatif>"` +
      `\n-> Untuk menjalankan script: gunakan run-shell dengan path absolut atau relatif ke direktori skill`
    )
  }

  return parts.join('\n\n')
}

/**
 * Ekstrak konten subfile dari record in-memory / Dexie learned skill.
 * Record bisa berupa:
 * {
 *   name: 'foo',
 *   content: '...',
 *   references: { 'rules.md': '...', ... } atau [{ path: 'references/rules.md', content: '...' }],
 *   scripts: { 'test.sh': '...', ... } atau [{ path: 'scripts/test.sh', content: '...' }]
 * }
 */
export function extractSkillSubfile(record, subpath) {
  if (!record || !subpath) return null
  const normalized = String(subpath).replace(/\\/g, '/').replace(/^\/+/, '')

  // 1. Cek files map umum
  if (record.files && typeof record.files === 'object') {
    if (typeof record.files[normalized] === 'string') {
      return record.files[normalized]
    }
  }

  // 2. Cek references
  if (normalized.startsWith('references/')) {
    const filename = normalized.slice('references/'.length)
    if (record.references) {
      if (typeof record.references === 'object' && !Array.isArray(record.references)) {
        if (typeof record.references[filename] === 'string') return record.references[filename]
        if (typeof record.references[normalized] === 'string') return record.references[normalized]
      } else if (Array.isArray(record.references)) {
        const found = record.references.find((r) => r.name === filename || r.path === normalized)
        if (found && typeof found.content === 'string') return found.content
      }
    }
  }

  // 3. Cek scripts
  if (normalized.startsWith('scripts/')) {
    const filename = normalized.slice('scripts/'.length)
    if (record.scripts) {
      if (typeof record.scripts === 'object' && !Array.isArray(record.scripts)) {
        if (typeof record.scripts[filename] === 'string') return record.scripts[filename]
        if (typeof record.scripts[normalized] === 'string') return record.scripts[normalized]
      } else if (Array.isArray(record.scripts)) {
        const found = record.scripts.find((s) => s.name === filename || s.path === normalized)
        if (found && typeof found.content === 'string') return found.content
      }
    }
  }

  return null
}
