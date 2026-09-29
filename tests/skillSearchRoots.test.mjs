// P1 regression fix (audit manager): getSkillSearchRoots() satu sumber kebenaran.
// W3 sempat menghapus $ABELINK_SKILLS_EXTRA + .opencode/skills dari discovery.
// Kontrak: prioritas deterministik, dedup, dedup nama skill by root order,
// symlink escape ditolak, traversal ditolak, discovery read-only.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Import channel sidecar langsung (Vitest menangani .ts via esbuild).
import {
  getSkillSearchRoots,
  isSafeSkillDir,
  resolveSkillPath,
  isValidSkillName
} from '../sidecar/engine/channels/skills.ts'

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-roots-'))
const writeSkill = (root, name, description = 'test skill') => {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\nbody`)
  return dir
}

describe('getSkillSearchRoots — prioritas deterministik', () => {
  it('root pertama selalu brandDir()/skills dan direstriasi eksplisit', () => {
    const roots = getSkillSearchRoots()
    expect(roots.length).toBeGreaterThanOrEqual(4)
    expect(path.basename(roots[0])).toBe('skills')
    // Root lokal dibuat otomatis (read-write home); sisanya boleh belum ada.
    expect(fs.existsSync(roots[0])).toBe(true)
  })

  it('ABELINK_SKILLS_EXTRA masuk sebagai root ke-2', () => {
    const dir = tmpRoot()
    process.env.ABELINK_SKILLS_EXTRA = dir
    try {
      const roots = getSkillSearchRoots()
      expect(roots).toContain(path.resolve(dir))
      expect(roots.indexOf(path.resolve(dir))).toBe(1)
    } finally {
      delete process.env.ABELINK_SKILLS_EXTRA
    }
  })

  it('roots ~/.agents/skills dan ~/.claude/skills tetap ada', () => {
    const roots = getSkillSearchRoots()
    const home = os.homedir()
    expect(roots).toContain(path.join(home, '.agents', 'skills'))
    expect(roots).toContain(path.join(home, '.claude', 'skills'))
  })

  it('workspace .opencode/skills masuk sebagai root terakhir', () => {
    const roots = getSkillSearchRoots()
    expect(roots[roots.length - 1]).toBe(path.join(process.cwd(), '.opencode', 'skills'))
  })

  it('dedup: path yang sama tidak dobel', () => {
    const dir = tmpRoot()
    process.env.ABELINK_SKILLS_EXTRA = dir
    try {
      const roots = getSkillSearchRoots()
      const abs = roots.map((r) => path.resolve(r))
      expect(new Set(abs).size).toBe(abs.length)
    } finally {
      delete process.env.ABELINK_SKILLS_EXTRA
    }
  })
})

describe('isSafeSkillDir — symlink escape & traversal', () => {
  it('folder dalam root diterima', () => {
    const root = tmpRoot()
    const dir = writeSkill(root, 'ok-skill')
    expect(isSafeSkillDir(dir, root)).toBe(true)
  })

  it('symlink keluar root ditolak', () => {
    const root = tmpRoot()
    const outside = tmpRoot()
    const link = path.join(root, 'escape')
    try {
      fs.symlinkSync(outside, link, 'dir')
      expect(isSafeSkillDir(link, root)).toBe(false)
    } catch (err) {
      // FS tanpa privilege symlink (mis. Windows tanpa dev mode): skip jujur.
      if (err.code === 'EPERM') expect(true).toBe(true)
      else throw err
    }
  })

  it('root yang tidak bisa di-realpath ditolak (fail-closed)', () => {
    const missing = path.join(tmpRoot(), 'does-not-exist')
    expect(isSafeSkillDir(missing, missing)).toBe(false)
  })
})

describe('resolveSkillPath — traversal & prioritas', () => {
  it('nama dengan ../ ditolak (fail-closed, async throw)', async () => {
    await expect(resolveSkillPath('../escape')).rejects.toThrow()
    await expect(resolveSkillPath('a/b')).rejects.toThrow()
    await expect(resolveSkillPath('.hidden')).rejects.toThrow()
  })

  it('skill di ABELINK_SKILLS_EXTRA ditemukan saat root lokal tidak punya', () => {
    const extra = tmpRoot()
    writeSkill(extra, 'extra-skill', 'dari env extra')
    process.env.ABELINK_SKILLS_EXTRA = extra
    try {
      const res = resolveSkillPath('extra-skill')
      // resolveSkillPath async — hasilkan promise dan tunggu.
      return Promise.resolve(res).then((r) => {
        expect(r).not.toBeNull()
        expect(r.type).toBe('folder')
        expect(r.folderPath).toContain('extra-skill')
      })
    } finally {
      delete process.env.ABELINK_SKILLS_EXTRA
    }
  })

  it('skill lokal menang atas skill duplikat di root eksternal (prioritas)', async () => {
    const extra = tmpRoot()
    writeSkill(extra, 'dup-skill', 'versi extra')
    process.env.ABELINK_SKILLS_EXTRA = extra
    try {
      // Buat skill lokal setelah set env: brandDir() root pertama.
      const localRoot = getSkillSearchRoots()[0]
      writeSkill(localRoot, 'dup-skill', 'versi lokal')
      const r = await resolveSkillPath('dup-skill')
      expect(r).not.toBeNull()
      expect(r.rootPath).toBe(localRoot)
      // Bersihkan skill lokal agar test idempoten.
      fs.rmSync(path.join(localRoot, 'dup-skill'), { recursive: true, force: true })
    } finally {
      delete process.env.ABELINK_SKILLS_EXTRA
    }
  })
})

describe('isValidSkillName — sanitasi nama', () => {
  it('nama valid diterima', () => {
    expect(isValidSkillName('ringkas')).toBe(true)
    expect(isValidSkillName('My-Skill_1')).toBe(true)
  })
  it('nama traversal/tersembunyi ditolak', () => {
    expect(isValidSkillName('../x')).toBe(false)
    expect(isValidSkillName('.hidden')).toBe(false)
    expect(isValidSkillName('a/b')).toBe(false)
    expect(isValidSkillName('')).toBe(false)
    expect(isValidSkillName(null)).toBe(false)
  })
})
