// Channel: Skills (Agent Skills filesystem store).
// Layout: XDG ~/.local/share/abelink/skills ; folder skill = <nama>/SKILL.md ;
// legacy *.md standalone tetap didukung. Semua nama skill & path relatif
// disanitasi anti path-traversal.
//
// Format SKILL.md mengikuti pola Agent Skills (metadata + isi instruksi,
// progressive disclosure): daftar skill hanya butuh nama + deskripsi; isi
// SKILL.md baru dibaca saat skill dipakai.
import { on, emit } from '../registry.mjs'
import fs from 'fs'
import path from 'path'
import { brandDir } from '../../main/utils/dataHome.mjs'

import os from 'os'

export const getSkillSearchRoots = () => {
  const local = path.join(brandDir(), 'skills')
  try {
    fs.mkdirSync(local, { recursive: true })
  } catch {}
  return [
    local,
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.claude', 'skills')
  ]
}

export const SKILLS_DIR = path.join(brandDir(), 'skills')

/**
 * Cari folder atau file skill di seluruh search roots berdasarkan urutan prioritas:
 * 1. ~/.local/share/abelink/skills
 * 2. ~/.agents/skills
 * 3. ~/.claude/skills
 */
export async function resolveSkillPath(name) {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const roots = getSkillSearchRoots()
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const folderPath = path.join(root, name)
    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      const skillMd = path.join(folderPath, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        return { type: 'folder', rootPath: root, folderPath, skillMdPath: skillMd }
      }
    }
    const singleMd = path.join(root, `${name}.md`)
    if (fs.existsSync(singleMd)) {
      return { type: 'file', rootPath: root, filePath: singleMd }
    }
  }
  return null
}

async function readDescription(folderPath) {
  try {
    const raw = await fs.promises.readFile(path.join(folderPath, 'SKILL.md'), 'utf8')
    const m = raw.match(/^---[\s\S]*?description:\s*(.+)$/m)
    if (!m) return raw.split('\n').find(Boolean)?.slice(0, 120) || ''
    return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
}

// Nama skill wajib sederhana tanpa slash dan tanpa titik di depan agar tidak
// bisa dipakai untuk path traversal keluar dari folder skills.
const isValidSkillName = (name) =>
  typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)

// Handler skills terdaftar lewat on() yang membungkus hasil dengan ok(),
// jadi penolakan dilempar sebagai error agar frame-nya {success:false,error}.
const rejectInvalidSkillName = () => {
  throw new Error('Nama skill tidak valid')
}

// Sanitasi path relatif skill: TOLAK (null) bila mengandung segmen '..'
// atau path absolut — fail-closed anti path traversal. Versi lama me-strip
// '..' diam-diam (fail-open: 'a/../../x' jadi 'a/x' tanpa jejak).
export const sanitizeSkillRelPath = (relativePath) => {
  const raw = String(relativePath || '')
  if (!raw || path.isAbsolute(raw) || raw.startsWith('~')) return null
  const segs = path.normalize(raw).split(path.sep)
  if (segs.some((s) => s === '..')) return null
  return segs.filter((s) => s !== '.' && s !== '').join(path.sep)
}

const rejectTraversal = () => {
  throw new Error('Path skill di luar folder (traversal ditolak)')
}

const emitSkillsUpdated = () => emit('skills-updated', { name: null })

on('skills:get-all', async () => {
  return await listSkillsMeta()
})

// Scan subfolder (misal references/ atau scripts/) untuk daftar berkas
async function scanSubfolderFiles(dirPath, prefix) {
  if (!fs.existsSync(dirPath)) return []
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const files = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = path.join(dirPath, e.name)
      if (e.isFile()) {
        const stat = await fs.promises.stat(full).catch(() => null)
        files.push({
          name: e.name,
          path: `${prefix}/${e.name}`,
          sizeBytes: stat?.size ?? 0
        })
      }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export async function getSkillFolderManifest(name) {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const resolved = await resolveSkillPath(name)
  if (!resolved) return null

  if (resolved.type === 'folder') {
    const folderPath = resolved.folderPath
    let content = ''
    if (fs.existsSync(resolved.skillMdPath)) {
      content = await fs.promises.readFile(resolved.skillMdPath, 'utf8')
    }
    const references = await scanSubfolderFiles(path.join(folderPath, 'references'), 'references')
    const scripts = await scanSubfolderFiles(path.join(folderPath, 'scripts'), 'scripts')

    return {
      name,
      content,
      type: 'folder',
      basePath: folderPath,
      references,
      scripts
    }
  }

  if (resolved.type === 'file') {
    const content = await fs.promises.readFile(resolved.filePath, 'utf8')
    return {
      name,
      content,
      type: 'file',
      basePath: resolved.rootPath,
      references: [],
      scripts: []
    }
  }

  return null
}

on('skills:read', async (name, relativePath) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  if (relativePath) {
    const safe = sanitizeSkillRelPath(relativePath)
    if (safe == null) rejectTraversal()
    const resolved = await resolveSkillPath(name)
    if (resolved && resolved.type === 'folder') {
      const targetFile = path.join(resolved.folderPath, safe)
      if (fs.existsSync(targetFile)) {
        return await fs.promises.readFile(targetFile, 'utf8')
      }
    }
    return null
  }

  const manifest = await getSkillFolderManifest(name)
  if (!manifest) return null

  let text = manifest.content || ''
  const extraSections = []

  if (manifest.references.length > 0) {
    const refList = manifest.references
      .map((r) => `  - ${r.path} (${r.sizeBytes} bytes)`)
      .join('\n')
    extraSections.push(
      `\n[BERKAS REFERENSI TERSEDIA (references/)]:\n${refList}\n-> Baca spesifik via: read-skill query: "${name}||references/<nama_file>"`
    )
  }

  if (manifest.scripts.length > 0) {
    const scriptList = manifest.scripts
      .map((s) => `  - ${s.path} (${s.sizeBytes} bytes)`)
      .join('\n')
    extraSections.push(
      `\n[SCRIPTS OTOMASI TERSEDIA (scripts/)]:\n${scriptList}\n-> Baca kode via: read-skill query: "${name}||scripts/<nama_file>"`
    )
  }

  if (extraSections.length > 0) {
    text = `${text}\n\n${extraSections.join('\n\n')}`
  }

  return {
    content: text,
    basePath: manifest.basePath,
    references: manifest.references,
    scripts: manifest.scripts,
    type: manifest.type
  }
})

on('skills:get-manifest', async (name) => {
  return await getSkillFolderManifest(name)
})


on('skills:save', async (name, content) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const folderPath = path.join(SKILLS_DIR, name)
  const skillFilePath = path.join(folderPath, 'SKILL.md')
  fs.mkdirSync(folderPath, { recursive: true })
  await fs.promises.writeFile(skillFilePath, content, 'utf8')
  emit('skills-updated', { name })
  return true
})

on('skills:delete', async (name) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const target = path.join(SKILLS_DIR, name)
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true })
    emit('skills-updated', { name })
    return true
  }
  const single = `${target}.md`
  if (fs.existsSync(single)) {
    await fs.promises.unlink(single)
    emit('skills-updated', { name })
    return true
  }
  return false
})

on('skills:read-file', async (name, relativePath) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const safe = sanitizeSkillRelPath(relativePath)
  if (safe == null) rejectTraversal()
  const resolved = await resolveSkillPath(name)
  if (resolved && resolved.type === 'folder') {
    const targetFile = path.join(resolved.folderPath, safe)
    if (fs.existsSync(targetFile)) {
      return await fs.promises.readFile(targetFile, 'utf8')
    }
  }
  return await fs.promises.readFile(path.join(SKILLS_DIR, name, safe), 'utf8')
})

// ---- Channel file-manager skill (fase B: dulunya ipcMain di skill-manager.js) ----

on('skills:get-tree', async (name) => {
  // Renderer memanggil tanpa argumen untuk tree root; validasi hanya saat
  // nama skill eksplisit diberikan (anti path traversal, lebih ketat dari aslinya).
  if (name != null && String(name).trim() !== '' && !isValidSkillName(name)) rejectInvalidSkillName()
  const buildTree = (dirPath, basePath) => {
    const result = []
    const items = fs.readdirSync(dirPath)
    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stat = fs.statSync(itemPath)
      const relativePath = path.relative(basePath, itemPath).replace(/\\/g, '/')
      if (stat.isDirectory()) {
        result.push({ name: item, path: relativePath, type: 'folder', children: buildTree(itemPath, basePath) })
      } else {
        result.push({ name: item, path: relativePath, type: 'file' })
      }
    }
    return result.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === 'folder' ? -1 : 1
    })
  }
  try {
    if (name) {
      const resolved = await resolveSkillPath(name)
      if (resolved && resolved.type === 'folder') {
        return buildTree(resolved.folderPath, resolved.folderPath)
      }
      return [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file' }]
    }
    return buildTree(SKILLS_DIR, SKILLS_DIR)
  } catch (e) {
    console.error('Failed to get skill tree', e)
    return []
  }
})

on('skills:save-file', async (name, relativePath, content) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  try {
    const standalonePath = path.join(SKILLS_DIR, `${name}.md`)
    const safe = sanitizeSkillRelPath(relativePath)
    if (safe == null) rejectTraversal()
    if (safe === 'SKILL.md' && fs.existsSync(standalonePath) && !fs.statSync(standalonePath).isDirectory()) {
      await fs.promises.writeFile(standalonePath, content, 'utf8')
      return true
    }
    const targetPath = path.join(SKILLS_DIR, name, safe)
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.promises.writeFile(targetPath, content, 'utf8')
    emitSkillsUpdated()
    return true
  } catch (e) {
    console.error('Failed to save skill file', e)
    return false
  }
})

on('skills:create-item', async (name, relativePath, isFolder) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  try {
    const standalonePath = path.join(SKILLS_DIR, `${name}.md`)
    const folderPath = path.join(SKILLS_DIR, name)
    if (fs.existsSync(standalonePath) && !fs.existsSync(folderPath)) {
      // Force migration ke folder bila mulai bikin item di skill standalone.
      await fs.promises.mkdir(folderPath, { recursive: true })
      await fs.promises.rename(standalonePath, path.join(folderPath, 'SKILL.md'))
    }
    const safe = sanitizeSkillRelPath(relativePath)
    if (safe == null) rejectTraversal()
    const targetPath = path.join(SKILLS_DIR, name, safe)
    if (isFolder) {
      await fs.promises.mkdir(targetPath, { recursive: true })
    } else {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.promises.writeFile(targetPath, '', 'utf8')
    }
    emitSkillsUpdated()
    return true
  } catch (e) {
    console.error('Failed to create skill item', e)
    return false
  }
})

on('skills:delete-item', async (name, relativePath) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  try {
    const safe = sanitizeSkillRelPath(relativePath)
    if (safe == null) rejectTraversal()
    const targetPath = path.join(SKILLS_DIR, name, safe)
    if (fs.existsSync(targetPath)) {
      const stat = await fs.promises.stat(targetPath)
      if (stat.isDirectory()) {
        await fs.promises.rm(targetPath, { recursive: true, force: true })
      } else {
        await fs.promises.unlink(targetPath)
      }
      emitSkillsUpdated()
      return true
    }
    return false
  } catch (e) {
    console.error('Failed to delete skill item', e)
    return false
  }
})

on('skills:rename-item', async (name, oldRelativePath, newRelativePath) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  try {
    const oldSafe = sanitizeSkillRelPath(oldRelativePath)
    const newSafe = sanitizeSkillRelPath(newRelativePath)
    if (oldSafe == null || newSafe == null) rejectTraversal()
    const oldPath = path.join(SKILLS_DIR, name, oldSafe)
    const newPath = path.join(SKILLS_DIR, name, newSafe)
    if (fs.existsSync(oldPath)) {
      await fs.promises.rename(oldPath, newPath)
      emitSkillsUpdated()
      return true
    }
    return false
  } catch (e) {
    console.error('Failed to rename skill item', e)
    return false
  }
})

// Install skill dari file .zip (dipilih lewat dialog native misc_open_file_dialog).
on('skills:install', async (sourcePath) => {
  try {
    if (
      typeof sourcePath !== 'string' ||
      (!sourcePath.endsWith('.zip') && !sourcePath.endsWith('.tar.gz') && !sourcePath.endsWith('.tgz'))
    ) {
      throw new Error('Hanya mendukung file .zip, .tar.gz, atau .tgz')
    }

    if (sourcePath.endsWith('.tar.gz') || sourcePath.endsWith('.tgz')) {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFilePromise = promisify(execFile)
      const baseName = path.basename(sourcePath).replace(/(\.tar\.gz|\.tgz)$/, '')
      const targetPath = path.join(SKILLS_DIR, baseName)
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }
      await execFilePromise('tar', ['-xzf', sourcePath, '-C', targetPath])
      emitSkillsUpdated()
      return true
    }

    const { default: AdmZip } = await import('adm-zip')
    const zip = new AdmZip(sourcePath)
    const zipEntries = zip.getEntries()

    let hasSkillMd = false
    for (const entry of zipEntries) {
      if (entry.entryName.endsWith('SKILL.md')) {
        hasSkillMd = true
        break
      }
    }
    if (!hasSkillMd) {
      throw new Error('Invalid Skill Package: Tidak ditemukan file SKILL.md di dalam zip.')
    }

    // Check if all files are inside a single root folder
    const firstEntry = zipEntries[0]
    const firstPart = firstEntry ? firstEntry.entryName.split('/')[0] : ''
    const isSingleRoot = firstPart && zipEntries.every((e) => e.entryName.startsWith(firstPart + '/'))

    if (isSingleRoot) {
      zip.extractAllTo(SKILLS_DIR, true)
    } else {
      const zipName = path.basename(sourcePath, '.zip')
      const targetPath = path.join(SKILLS_DIR, zipName)
      zip.extractAllTo(targetPath, true)
    }

    emitSkillsUpdated()
    return true
  } catch (e) {
    console.error('Failed to install skill', e)
    throw e
  }
})

// Auto-scan workflow: user bisa drop folder skill (dengan SKILL.md) langsung ke
// folder store via file manager OS. Scan berikutnya (skills:get-all / refresh
// halaman Skills) otomatis mendeteksinya — tidak butuh import wizard.
// Read-only seperti plugin:open-folder: execFile xdg-open ter-kontinemen.
on('skills:open-folder', async () => {
  const { execFile } = await import('child_process')
  await fs.promises.mkdir(SKILLS_DIR, { recursive: true })
  return new Promise((resolve) => {
    execFile('xdg-open', [SKILLS_DIR], (err) => {
      if (err) console.error('[skills] xdg-open gagal:', err.message)
    })
    resolve({ success: true, path: SKILLS_DIR })
  })
})

// Proyeksi meta skill untuk registry terpadu (aditif; handler tidak diubah).
// Memindai seluruh search roots (~/.local/share/abelink/skills, ~/.agents/skills, ~/.claude/skills)
// secara progresif (hanya name + description + type + path) dengan dedup prioritas.
export const listSkillsMeta = async () => {
  const roots = getSkillSearchRoots()
  const found = new Map()

  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    try {
      const entries = await fs.promises.readdir(root, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        if (!isValidSkillName(e.name.replace(/\.md$/, ''))) continue

        const full = path.join(root, e.name)
        if (e.isDirectory()) {
          const skillMd = path.join(full, 'SKILL.md')
          if (fs.existsSync(skillMd) && !found.has(e.name)) {
            const desc = await readDescription(full)
            found.set(e.name, {
              name: e.name,
              description: desc,
              type: 'folder',
              path: full,
              root
            })
          }
        } else if (e.name.endsWith('.md')) {
          const skillName = e.name.replace(/\.md$/, '')
          if (!found.has(skillName)) {
            const content = await fs.promises.readFile(full, 'utf8')
            found.set(skillName, {
              name: skillName,
              description: content.split('\n')[0] || '',
              type: 'file',
              path: full,
              root
            })
          }
        }
      }
    } catch (err) {
      console.warn(`[skills] Gagal memindai root ${root}:`, err.message)
    }
  }

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// Proyeksi skill ke CapabilityDescriptor terpadu (aditif; handler tidak diubah).
// Skills tidak punya argumen (isi dimuat via read-skill) dan tidak punya toggle.
export const skillToDescriptor = (input) => {
  const raw = typeof input?.name === 'string' ? input.name : ''
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^-+|-+$/g, '')
  if (!slug) return null
  const description =
    typeof input?.description === 'string' && input.description.trim()
      ? input.description
      : 'Skill tanpa deskripsi'
  return {
    id: `skill:${slug}`,
    kind: 'skill',
    version: '1',
    description,
    inputSchema: { type: 'object', properties: {} },
    scopes: [],
    guide: { steps: [`Gunakan read-skill:${slug} untuk memuat isi penuh.`], examples: [] },
    enabled: true,
    source: { type: 'skill', name: raw.trim() },
  }
}
