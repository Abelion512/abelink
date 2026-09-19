import { describe, it, expect } from 'vitest'
import {
  CORE_TOOL_SPECS,
  DEFERRED_GROUP_SPECS,
  UNIFIED_TOOL_CATALOG,
  getToolSpec,
  searchTools,
  formatToolDocumentation,
  formatGroupDocumentation,
  resolveReadToolsQuery
} from '../src/api/tools/toolCatalog'
import { loadGroupToolsText } from '../src/api/tools/group-tools'

describe('Tool Catalog & Deferred Specs Integrity', () => {
  it('semua core tool specs memiliki metadata lengkap dan contoh pemakaian nyata', () => {
    for (const [name, spec] of Object.entries(CORE_TOOL_SPECS)) {
      expect(spec.name).toBe(name)
      expect(spec.group).toBe('core')
      expect(spec.defer_loading).toBe(false)
      expect(spec.summary?.length || 0).toBeGreaterThan(10)
      expect(spec.description?.length || 0).toBeGreaterThan(10)
      expect(spec.queryFormat).toBeTruthy()
      expect(Array.isArray(spec.examples)).toBe(true)
      expect(spec.examples.length).toBeGreaterThan(0)
      for (const ex of spec.examples) {
        expect(ex).toHaveProperty('query')
        expect(ex).toHaveProperty('description')
      }
      expect(Array.isArray(spec.tags)).toBe(true)
      expect(spec.tags.length).toBeGreaterThan(0)
    }
  })

  it('semua deferred group specs memiliki queryFormat, examples, dan tags', () => {
    for (const [groupName, groupDef] of Object.entries(DEFERRED_GROUP_SPECS)) {
      expect(groupDef.description?.length || 0).toBeGreaterThan(10)
      expect(Object.keys(groupDef.tools).length).toBeGreaterThan(0)
      for (const [toolName, toolMeta] of Object.entries(groupDef.tools)) {
        expect(toolMeta.summary?.length || 0).toBeGreaterThan(5)
        expect(toolMeta.queryFormat).toBeTruthy()
        expect(Array.isArray(toolMeta.examples)).toBe(true)
        expect(toolMeta.examples.length).toBeGreaterThan(0)
        expect(Array.isArray(toolMeta.tags)).toBe(true)
        expect(toolMeta.tags.length).toBeGreaterThan(0)
      }
    }
  })

  it('UNIFIED_TOOL_CATALOG memuat seluruh tool unik dari core dan deferred groups', () => {
    expect(UNIFIED_TOOL_CATALOG.size).toBeGreaterThan(40)
    expect(UNIFIED_TOOL_CATALOG.has('replace-content')).toBe(true)
    expect(UNIFIED_TOOL_CATALOG.has('browser-click')).toBe(true)
    expect(UNIFIED_TOOL_CATALOG.has('git-commit')).toBe(true)
    expect(UNIFIED_TOOL_CATALOG.has('run-task')).toBe(true)
  })
})

describe('getToolSpec & searchTools', () => {
  it('getToolSpec mengambil spec tool dengan benar', () => {
    const coreTool = getToolSpec('replace-content')
    expect(coreTool).toBeTruthy()
    expect(coreTool.defer_loading).toBe(false)
    expect(coreTool.group).toBe('core')

    const deferredTool = getToolSpec('browser-click')
    expect(deferredTool).toBeTruthy()
    expect(deferredTool.defer_loading).toBe(true)
    expect(deferredTool.group).toBe('advanced_browser')

    expect(getToolSpec('alat-fiktif-tak-ada')).toBeNull()
    expect(getToolSpec('')).toBeNull()
  })

  it('searchTools menemukan tool berdasarkan nama persis dan parsial', () => {
    const hitsExact = searchTools('browser-click')
    expect(hitsExact.length).toBeGreaterThan(0)
    expect(hitsExact[0].name).toBe('browser-click')

    const hitsPartial = searchTools('commit')
    expect(hitsPartial.some((t) => t.name === 'git-commit')).toBe(true)
  })

  it('searchTools menemukan tool berdasarkan fungsi, tag, dan deskripsi', () => {
    const hitsAst = searchTools('ast')
    expect(hitsAst.some((t) => t.name === 'file-outline')).toBe(true)

    const hitsDaemon = searchTools('background server')
    expect(hitsDaemon.some((t) => t.name === 'run-task')).toBe(true)
  })

  it('searchTools memfilter berdasarkan group saat group dispesifikasikan', () => {
    const hitsBrowser = searchTools('click', { group: 'advanced_browser' })
    expect(hitsBrowser.length).toBeGreaterThan(0)
    for (const h of hitsBrowser) {
      expect(h.group).toBe('advanced_browser')
    }
  })
})

describe('formatToolDocumentation & formatGroupDocumentation', () => {
  it('formatToolDocumentation menyajikan format query dan contoh pemakaian nyata', () => {
    const spec = getToolSpec('replace-content')
    const formatted = formatToolDocumentation(spec)
    expect(formatted).toContain('[TOOL: replace-content]')
    expect(formatted).toContain('Format Query:')
    expect(formatted).toContain('Contoh Pemakaian Nyata:')
    expect(formatted).toContain('src/components/Header.jsx')
  })

  it('formatGroupDocumentation menyajikan seluruh tools dalam grup beserta contohnya', () => {
    const toolsInGit = Array.from(UNIFIED_TOOL_CATALOG.values()).filter((t) => t.group === 'git_vcs')
    const formatted = formatGroupDocumentation('git_vcs', toolsInGit)
    expect(formatted).toContain('=== DOKUMENTASI GRUP TOOL: GIT_VCS ===')
    expect(formatted).toContain('[TOOL: git-status]')
    expect(formatted).toContain('[TOOL: git-commit]')
    expect(formatted).toContain('Contoh Pemakaian Nyata:')
  })
})

describe('resolveReadToolsQuery & loadGroupToolsText (Deferred Tool Search)', () => {
  it('query kosong mengembalikan error ramah dengan available_sources', async () => {
    const res = await resolveReadToolsQuery('')
    expect(res.success).toBe(false)
    expect(res.available_sources).toContain('advanced_browser')
    expect(res.available_sources).toContain('git_vcs')
    expect(res.message).toContain('Harap sebutkan nama grup')
  })

  it('memuat grup yang valid menghasilkan panduan grup lengkap', async () => {
    const res = await resolveReadToolsQuery('git_vcs')
    expect(res.success).toBe(true)
    expect(res.isGroup).toBe(true)
    expect(res.groupName).toBe('git_vcs')
    expect(res.message).toContain('=== DOKUMENTASI GRUP TOOL: GIT_VCS ===')
    expect(res.message).toContain('git-diff')
  })

  it('memuat satu nama tool spesifik menghasilkan panduan tunggal + contoh', async () => {
    const res = await resolveReadToolsQuery('browser-click')
    expect(res.success).toBe(true)
    expect(res.isTool).toBe(true)
    expect(res.toolName).toBe('browser-click')
    expect(res.message).toContain('PANDUAN LENGKAP TOOL BROWSER-CLICK:')
    expect(res.message).toContain('ak5||Login')
  })

  it('eksplisit search query ("search: ...") mengembalikan hasil pencarian terstruktur', async () => {
    const res = await resolveReadToolsQuery('search: background terminal')
    expect(res.success).toBe(true)
    expect(res.isSearch).toBe(true)
    expect(res.matches_count).toBeGreaterThan(0)
    expect(res.message).toContain('HASIL PENCARIAN TOOL UNTUK "background terminal"')
    expect(res.message).toContain('run-task')
  })

  it('eksplisit search query tanpa hasil mengembalikan hint ala Hermes', async () => {
    const res = await resolveReadToolsQuery('search: qzz_tidak_mungkin_ada_123')
    expect(res.success).toBe(false)
    expect(res.isSearch).toBe(true)
    expect(res.available_sources.length).toBeGreaterThan(0)
    expect(res.message).toContain('Tidak ditemukan tool yang cocok')
  })

  it('fallback search otomatis bekerja ketika query bukan nama grup atau tool persis', async () => {
    const res = await resolveReadToolsQuery('screenshot')
    expect(res.success).toBe(true)
    expect(res.isFallbackSearch).toBe(true)
    expect(res.message).toContain('browser-screenshot')
  })

  it('loadGroupToolsText menghasilkan teks yang siap dikonsumsi agent planner & subagent', async () => {
    const textGroup = await loadGroupToolsText('git_vcs')
    expect(textGroup).toContain('=== DOKUMENTASI GRUP TOOL: GIT_VCS ===')

    const textTool = await loadGroupToolsText('replace-content')
    expect(textTool).toContain('PANDUAN LENGKAP TOOL REPLACE-CONTENT:')

    const textEmpty = await loadGroupToolsText('')
    expect(textEmpty).toBeNull()
  })
})
