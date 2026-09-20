// Rute terpadu plugin + skill lewat executeCapability (policy + audit).
// - Plugin: temp plugin dir via XDG_DOCUMENTS_DIR (getPluginsDir override).
// - Skill: temp SKILL.md di bawah XDG skills dir (brandDir hormati XDG_DATA_HOME).
// - Jalur connector lama (time now) tetap hijau.
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-cap-unified-'))
process.env.XDG_DATA_HOME = path.join(tmpRoot, 'data')
const docsDir = path.join(tmpRoot, 'docs')
fs.mkdirSync(docsDir, { recursive: true })
process.env.XDG_DOCUMENTS_DIR = docsDir

const writePlugin = (name, { enabled = true, action = 'sapa', body = 'halo' } = {}) => {
  const dir = path.join(docsDir, 'Abelink Plugins', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({ name, version: '1.0.0', description: 'uji', isEnabled: enabled, actions: [{ name: action, description: 'uji' }] }, null, 2)
  )
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `module.exports = { '${action}': async (args) => ${JSON.stringify(body)} + ':' + (args?.query ?? '') }`
  )
}

writePlugin('penyapa', { action: 'sapa', body: 'halo' })
writePlugin('penyapa-dua', { action: 'sapa', body: 'hai' })
writePlugin('mati', { enabled: false, action: 'bisik', body: '...' })
writePlugin('unik', { action: 'solo', body: 'sendiri' })

const skillsDir = path.join(tmpRoot, 'data', 'abelink', 'skills')
fs.mkdirSync(path.join(skillsDir, 'resep'), { recursive: true })
fs.writeFileSync(path.join(skillsDir, 'resep', 'SKILL.md'), '# Resep\nlangkah 1')

const { executeCapability, readAudit } = await import(
  '../sidecar/main/capabilities/manager.mjs'
)

describe('unified execute: plugin', () => {
  it('format <plugin>:<aksi> mengembalikan nilai mentah handler', async () => {
    const out = await executeCapability({
      connectorId: 'plugin',
      actionId: 'unik:solo',
      args: { query: 'dunia' }
    })
    expect(out).toBe('sendiri:dunia')
  })

  it('string legacy dibungkus {query}', async () => {
    const out = await executeCapability({ connectorId: 'plugin', actionId: 'unik:solo', args: 'legacy' })
    expect(out).toBe('sendiri:legacy')
  })

  it('bare unik lolos; bare ambigu melempar daftar kandidat', async () => {
    const out = await executeCapability({ connectorId: 'plugin', actionId: 'solo', args: {} })
    expect(out).toBe('sendiri:')
    await expect(executeCapability({ connectorId: 'plugin', actionId: 'sapa', args: {} })).rejects.toThrow(
      /ambigu.*penyapa:sapa.*penyapa-dua:sapa/
    )
  })

  it('aksi tak dikenal melempar eksplisit + kandidat', async () => {
    await expect(
      executeCapability({ connectorId: 'plugin', actionId: 'hantu', args: {} })
    ).rejects.toThrow(/tidak dikenal.*kandidat/)
  })

  it('plugin disabled -> CAPABILITY_POLICY_DENIED', async () => {
    await expect(
      executeCapability({ connectorId: 'plugin', actionId: 'mati:bisik', args: {} })
    ).rejects.toMatchObject({ code: 'CAPABILITY_POLICY_DENIED' })
    const audit = await readAudit(20)
    expect(audit.some((a) => a.status === 'policy-denied')).toBe(true)
  })
})

describe('unified execute: skill', () => {
  it('skill ada -> body SKILL.md mentah', async () => {
    const out = await executeCapability({ connectorId: 'skill', actionId: 'resep' })
    expect(out).toContain('# Resep')
  })

  it('skill hilang -> error eksplisit', async () => {
    await expect(executeCapability({ connectorId: 'skill', actionId: 'hantu' })).rejects.toThrow(
      /tidak ditemukan/
    )
  })
})

describe('jalur connector lama utuh', () => {
  it('time.now tetap jalan', async () => {
    const out = await executeCapability({ connectorId: 'time', actionId: 'now' })
    expect(out.iso).toBeTruthy()
  })
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})
