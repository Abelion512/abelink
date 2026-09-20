import { describe, it, expect } from 'vitest'
import {
  parseSkillQuery,
  formatBytes,
  formatSkillFolderBundle,
  extractSkillSubfile
} from '../src/api/skills/skillFolder.js'
import {
  sanitizeSkillRelPath,
  getSkillFolderManifest
} from '../sidecar/engine/channels/skills.mjs'

describe('parseSkillQuery', () => {
  it('mem-parse nama skill sederhana tanpa subpath', () => {
    expect(parseSkillQuery('goal')).toEqual({ skillName: 'goal', subpath: null })
    expect(parseSkillQuery('  speedrunner  ')).toEqual({ skillName: 'speedrunner', subpath: null })
    expect(parseSkillQuery('')).toEqual({ skillName: '', subpath: null })
    expect(parseSkillQuery(null)).toEqual({ skillName: '', subpath: null })
  })

  it('mem-parse query berpemisah pipe "||" untuk subpath', () => {
    expect(parseSkillQuery('grill-abelion||references/guidelines.md')).toEqual({
      skillName: 'grill-abelion',
      subpath: 'references/guidelines.md'
    })
    expect(parseSkillQuery('my-skill||scripts/test.sh')).toEqual({
      skillName: 'my-skill',
      subpath: 'scripts/test.sh'
    })
  })

  it('mem-parse query berbasis slash path untuk references/ atau scripts/', () => {
    expect(parseSkillQuery('grill-abelion/references/guidelines.md')).toEqual({
      skillName: 'grill-abelion',
      subpath: 'references/guidelines.md'
    })
    expect(parseSkillQuery('dev-skill//scripts/verify.mjs')).toEqual({
      skillName: 'dev-skill',
      subpath: 'scripts/verify.mjs'
    })
  })
})

describe('formatBytes', () => {
  it('memformat byte menjadi unit yang mudah dibaca', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
    expect(formatBytes(null)).toBe('')
  })
})

describe('formatSkillFolderBundle', () => {
  it('memformat teks bundle lengkap dengan daftar references dan scripts', () => {
    const output = formatSkillFolderBundle({
      name: 'audit-skill',
      content: '# Panduan Audit\nLakukan verifikasi berkala.',
      references: [
        { name: 'cheatsheet.md', path: 'references/cheatsheet.md', sizeBytes: 1500 },
        { name: 'schema.json', path: 'references/schema.json', sizeBytes: 3200 }
      ],
      scripts: [
        { name: 'run-audit.sh', path: 'scripts/run-audit.sh', sizeBytes: 420 }
      ],
      basePath: '/home/user/.local/share/abelink/skills/audit-skill',
      sourceType: 'DISK'
    })

    expect(output).toContain('[PEDOMAN SKILL (DISK): AUDIT-SKILL]')
    expect(output).toContain('[BASE DIRECTORY: /home/user/.local/share/abelink/skills/audit-skill]')
    expect(output).toContain('# Panduan Audit')
    expect(output).toContain('[BERKAS REFERENSI TERSEDIA (references/)]:')
    expect(output).toContain('references/cheatsheet.md (1.5 KB)')
    expect(output).toContain('references/schema.json (3.1 KB)')
    expect(output).toContain('[SCRIPTS OTOMASI TERSEDIA (scripts/)]:')
    expect(output).toContain('scripts/run-audit.sh (420 B)')
    expect(output).toContain('read-skill dengan query: "audit-skill||<path_relatif>"')
  })
})

describe('extractSkillSubfile', () => {
  it('mengekstrak subfile dari references object map', () => {
    const record = {
      name: 'test-skill',
      content: 'main content',
      references: {
        'api.md': '# API Reference\nEndpoint auth.',
        'rules.txt': 'Rule 1: Always verify.'
      }
    }
    expect(extractSkillSubfile(record, 'references/api.md')).toBe('# API Reference\nEndpoint auth.')
    expect(extractSkillSubfile(record, 'references/rules.txt')).toBe('Rule 1: Always verify.')
    expect(extractSkillSubfile(record, 'references/missing.md')).toBeNull()
  })

  it('mengekstrak subfile dari references array of objects', () => {
    const record = {
      name: 'test-skill',
      content: 'main content',
      references: [
        { path: 'references/api.md', content: 'Array API Content' }
      ]
    }
    expect(extractSkillSubfile(record, 'references/api.md')).toBe('Array API Content')
  })

  it('mengekstrak subfile dari scripts object map', () => {
    const record = {
      name: 'test-skill',
      scripts: {
        'run.sh': '#!/bin/bash\necho "Running"'
      }
    }
    expect(extractSkillSubfile(record, 'scripts/run.sh')).toBe('#!/bin/bash\necho "Running"')
    expect(extractSkillSubfile(record, 'scripts/missing.sh')).toBeNull()
  })
})

describe('sanitizeSkillRelPath & Path Traversal Protection', () => {
  it('menolak path traversal dengan ..', () => {
    expect(sanitizeSkillRelPath('../secret.txt')).toBeNull()
    expect(sanitizeSkillRelPath('references/../../etc/passwd')).toBeNull()
    expect(sanitizeSkillRelPath('..')).toBeNull()
  })

  it('menolak path absolut dan tilde', () => {
    expect(sanitizeSkillRelPath('/etc/passwd')).toBeNull()
    expect(sanitizeSkillRelPath('~/.ssh/id_rsa')).toBeNull()
  })

  it('menerima path relatif yang bersih', () => {
    expect(sanitizeSkillRelPath('references/guidelines.md')).toBe('references/guidelines.md')
    expect(sanitizeSkillRelPath('scripts/deploy.sh')).toBe('scripts/deploy.sh')
  })
})
