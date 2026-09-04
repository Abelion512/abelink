// Channel: Skills (Agent Skills filesystem store).
// Layout: XDG ~/.local/share/mark/skills ; folder skill = <nama>/SKILL.md ;
// legacy *.md standalone tetap didukung. Semua nama skill & path relatif
// disanitasi anti path-traversal.
//
// Format SKILL.md mengikuti pola Agent Skills (metadata + isi instruksi,
// progressive disclosure): daftar skill hanya butuh nama + deskripsi; isi
// SKILL.md baru dibaca saat skill dipakai.
import { on, emit } from '../registry.mjs'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SKILLS_DIR = (() => {
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  const dir = process.platform === 'win32'
    ? path.join(os.homedir(), 'Documents', 'Mark Skills')
    : path.join(xdg, 'mark', 'skills')
  fs.mkdirSync(dir, { recursive: true })
  return dir
})()

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

// Sanitasi path relatif skill: buang semua segmen '..' dan '.' (anti path traversal).
const sanitizeSkillRelPath = (relativePath) =>
  path
    .normalize(String(relativePath || ''))
    .split(path.sep)
    .filter((s) => s !== '..' && s !== '.')
    .join(path.sep)

const emitSkillsUpdated = () => emit('skills-updated', { name: null })

on('skills:get-all', async () => {
  await fs.promises.mkdir(SKILLS_DIR, { recursive: true })
  const entries = await fs.promises.readdir(SKILLS_DIR, { withFileTypes: true })
  const skills = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(SKILLS_DIR, e.name)
    if (e.isDirectory()) {
      skills.push({ name: e.name, description: await readDescription(full), type: 'folder', path: full })
    } else if (e.name.endsWith('.md')) {
      const content = await fs.promises.readFile(full, 'utf8')
      skills.push({ name: e.name.replace(/\.md$/, ''), description: content.split('\n')[0] || '', type: 'file', path: full })
    }
  }
  return skills
})

on('skills:read', async (name) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const folder = path.join(SKILLS_DIR, name, 'SKILL.md')
  if (fs.existsSync(folder)) return await fs.promises.readFile(folder, 'utf8')
  const single = path.join(SKILLS_DIR, `${name}.md`)
  if (fs.existsSync(single)) return await fs.promises.readFile(single, 'utf8')
  return null
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
  // Buang SEMUA segmen '..' dan '.' agar file tetap di dalam folder skill.
  const safe = sanitizeSkillRelPath(relativePath)
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
    const folderPath = name ? path.join(SKILLS_DIR, name) : SKILLS_DIR
    if (name && fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      return buildTree(folderPath, folderPath)
    }
    if (!name) return buildTree(SKILLS_DIR, SKILLS_DIR)
    return [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file' }]
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
    const oldPath = path.join(SKILLS_DIR, name, sanitizeSkillRelPath(oldRelativePath))
    const newPath = path.join(SKILLS_DIR, name, sanitizeSkillRelPath(newRelativePath))
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
    if (typeof sourcePath !== 'string' || !sourcePath.endsWith('.zip')) {
      throw new Error('Hanya mendukung file .zip')
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
