import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Kontrak UI Capabilities — Plugins/Skills/Connectors dikonsolidasi ke cfg-capabilities
// Semua profil manajemen tetap ada di halaman masing-masing via deep-link.

const readSrc = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('ConfigSidebar sections', async () => {
  const mod = await import('../src/components/ConfigSidebar.jsx')

  it('menyediakan entry capabilites', () => {
    const ids = mod.sections.map((s) => s.id)
    expect(ids).toContain('cfg-capabilities')
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

  it('setiap item di capabilities deep-link ke halaman manajemennya', () => {
    expect(src.includes("navigate('/plugins')"), 'deep-link /plugins hilang').toBe(true)
    expect(src.includes("navigate('/skills')"), 'deep-link /skills hilang').toBe(true)
    expect(src.includes("navigate('/connectors')"), 'deep-link /connectors hilang').toBe(true)
  })

  it('tidak ada TODO kosong tersisa di section capabilities', () => {
    const sectionsArea = src.slice(src.indexOf("id=\"cfg-capabilities\""))
    expect(sectionsArea).not.toContain('TODO: Plugin management list')
    expect(sectionsArea).not.toContain('TODO: Skills toggle list')
    expect(sectionsArea).not.toContain('TODO: MCP connection list')
  })
})

describe('App routing untuk halaman capabilities', async () => {
  const appSrc = readSrc('src/App.jsx')

  it('route /plugins, /skills, dan /connectors semuanya terdaftar', () => {
    for (const route of ['/plugins', '/skills', '/connectors']) {
      expect(appSrc.includes(`path="${route}"`), `route ${route} tidak terdaftar`).toBe(true)
    }
  })
})
