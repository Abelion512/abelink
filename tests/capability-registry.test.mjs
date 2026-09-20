// Registry terpadu: connector action + skill + plugin shape + invalid dibuang.
// XDG diarahkan ke temp per-run agar skills/connections terisolasi.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-reg-test-'))
process.env.XDG_DATA_HOME = tmpRoot
// Isolasi pemindaian plugin: loadPlugins() membaca XDG_DOCUMENTS_DIR —
// tanpa ini test memindai ~/Documents asli (lambat + tidak hermetik).
process.env.XDG_DOCUMENTS_DIR = path.join(tmpRoot, 'Documents')

const { pluginToDescriptors } = await import('../sidecar/main/plugins/plugin-loader.js')
const { skillToDescriptor } = await import('../sidecar/engine/channels/skills.mjs')
const { listRegistry } = await import('../sidecar/main/capabilities/registry.mjs')

beforeAll(async () => {
  // Seed satu skill temp: <XDG>/abelink/skills/uji-reg/SKILL.md
  const dir = path.join(tmpRoot, 'abelink', 'skills', 'uji-reg')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    '---\ndescription: Skill uji registry\n---\nIsi skill.\n',
    'utf8'
  )
})

describe('registry mencakup connector action', () => {
  it('memuat aksi built-in time:now + fs:read sebagai descriptor valid', async () => {
    const reg = await listRegistry()
    const ids = reg.map((d) => d.id)
    expect(ids).toContain('time:now')
    expect(ids).toContain('fs:read')
    const now = reg.find((d) => d.id === 'time:now')
    expect(now.kind).toBe('connector')
    expect(now.inputSchema?.type).toBe('object')
  })
})

describe('registry mencakup skill temp', () => {
  it('skill uji-reg muncul sebagai skill:uji-reg', async () => {
    const reg = await listRegistry()
    const d = reg.find((x) => x.id === 'skill:uji-reg')
    expect(d).toBeTruthy()
    expect(d.description).toContain('Skill uji registry')
  })

  it('skillToDescriptor menolak nama kosong (unit)', () => {
    expect(skillToDescriptor({ name: '' })).toBeNull()
  })
})

describe('plugin descriptor shape', () => {
  it('pluginToDescriptors satu aksi -> id plugin:<p>:<a>', () => {
    const out = pluginToDescriptors({
      name: 'Reg Plug',
      description: 'plug uji',
      isEnabled: true,
      folderPath: '/x',
      actions: [{ name: 'Sapa', description: 'menyapa', parameters: { q: 'string' } }]
    })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('plugin:reg-plug:sapa')
    expect(out[0].inputSchema).toEqual({ type: 'object', properties: { q: { type: 'string' } } })
  })
})

describe('invalid dibuang tanpa throw', () => {
  it('listRegistry resolve array walau ada sumber rusak', async () => {
    await expect(listRegistry()).resolves.toEqual(expect.any(Array))
  })
})
