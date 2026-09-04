import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Kontrak UI Capabilities — halaman Configuration menyediakan section
// plugins/skills/connectors, dan masing-masing harus punya tujuan nyata
// (bukan TODO kosong): deep-link ke halaman manajemennya.

const readSrc = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('ConfigSidebar sections', async () => {
  const mod = await import('../src/components/ConfigSidebar.jsx')

  it('menyediakan entry Plugins, Skills, dan Connectors', () => {
    const ids = mod.sections.map((s) => s.id)
    for (const id of ['cfg-plugins', 'cfg-skills', 'cfg-connectors']) {
      expect(ids).toContain(id)
    }
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

  it('section cfg-plugins/skills/connectors dirender berdasarkan activeSection', () => {
    for (const id of ['cfg-plugins', 'cfg-skills', 'cfg-connectors']) {
      expect(src.includes(`id="${id}"`), `section ${id} hilang`).toBe(true)
      expect(src.includes(`activeSection !== '${id}'`), `${id} tidak punya guard visibility`).toBe(
        true
      )
    }
  })

  it('setiap section capabilities deep-link ke halaman manajemennya', () => {
    expect(src.includes("navigate('/plugins')"), 'deep-link /plugins hilang').toBe(true)
    expect(src.includes("navigate('/skills')"), 'deep-link /skills hilang').toBe(true)
    expect(src.includes("navigate('/connectors')"), 'deep-link /connectors hilang').toBe(true)
  })

  it('tidak ada TODO kosong tersisa di section capabilities', () => {
    const sectionsArea = src.slice(src.indexOf('cfg-plugins'))
    expect(sectionsArea).not.toContain('TODO: Plugin management list')
    expect(sectionsArea).not.toContain('TODO: Skills toggle list')
    expect(sectionsArea).not.toContain('TODO: MCP connection list')
  })

  it('ringkasan connectors tidak memanggil API saat section tidak aktif (load-when-needed)', () => {
    // Efek ringkasan wajib men-guard dengan activeSection — tanpa itu,
    // membuka Configuration akan memicu sidecar calls yang tidak perlu.
    const guardIdx = src.indexOf("activeSection === 'cfg-connectors'")
    expect(guardIdx, 'guard load-when-needed untuk connectors hilang').toBeGreaterThan(-1)
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
