import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Kontrak UI Capabilities — Plugins/Skills/Connectors terintegrasi penuh di dalam Configuration
// (Adopsi pola UI/UX claude.ai/customize: inline capability management tanpa rute halaman terpisah).

const readSrc = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('ConfigSidebar sections', async () => {
  const mod = await import('../src/components/ConfigSidebar.jsx')

  it('menyediakan entry capabilites dan voice & video', () => {
    const ids = mod.sections.map((s) => s.id)
    expect(ids).toContain('cfg-capabilities')
    expect(ids).toContain('cfg-voice-video')
  })

  it('semua section punya label & icon', () => {
    for (const s of [...mod.sections, ...mod.sectionsLogged]) {
      expect(s.label.length).toBeGreaterThan(2, `label ${s.id} tidak masuk akal`)
      expect(s.icon).toBeTruthy()
    }
  })

  it('tidak ada id section duplikat', () => {
    const all = [...mod.sections, ...mod.sectionsLogged].map((s) => s.id)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('Configuration page sections (contract via source)', () => {
  const src = readSrc('src/pages/Configuration.jsx')

  it('section capabilities dirender berdasarkan activeSection', () => {
    expect(src.includes("id=\"cfg-capabilities\"")).toBe(true)
    expect(src.includes("activeSection !== 'cfg-capabilities'")).toBe(true)
  })

  it('section voice-video dirender berdasarkan activeSection', () => {
    expect(src.includes("id=\"cfg-voice-video\"")).toBe(true)
    expect(src.includes("activeSection !== 'cfg-voice-video'")).toBe(true)
  })

  it('merender CapabilitiesHub terpadu tanpa navigasi halaman eksternal', () => {
    expect(src.includes('<CapabilitiesHub')).toBe(true)
  })

  it('tidak ada TODO kosong tersisa di section capabilities', () => {
    const sectionsArea = src.slice(src.indexOf("id=\"cfg-capabilities\""))
    expect(sectionsArea).not.toContain('TODO: Plugin management list')
    expect(sectionsArea).not.toContain('TODO: Skills toggle list')
    expect(sectionsArea).not.toContain('TODO: MCP connection list')
  })
})

describe('App routing konsolidasi (halaman terpisah dihapus)', async () => {
  const appSrc = readSrc('src/App.jsx')

  it('rute halaman mandiri /plugins, /skills, dan /connectors sudah dihapus', () => {
    for (const route of ['/plugins', '/skills', '/connectors']) {
      expect(appSrc.includes(`path="${route}"`), `route ${route} masih terdaftar`).toBe(false)
    }
  })
})
