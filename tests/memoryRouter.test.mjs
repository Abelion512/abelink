import { describe, it, expect, vi } from 'vitest'
import {
  buildWorkspacePromptSection,
  buildUserMemorySection,
  buildMemoryRulesSection,
  buildFactsIntegritySection,
  buildArchivesSection,
  buildTurnPairsSection,
  buildDocumentsSection,
  composeAllMemorySections,
  routeTurnMemoryContext,
  normalizeMemoryDecision
} from '../src/api/ai/memoryRouter.js'

describe('memoryRouter - Prompt Section Builders', () => {
  it('buildWorkspacePromptSection menghasilkan markdown bersih atau kosong', () => {
    expect(buildWorkspacePromptSection(null)).toBe('')
    expect(buildWorkspacePromptSection({})).toBe('')

    const section = buildWorkspacePromptSection({
      workingMemoryText: 'Memetakan modul auth',
      codeRagText: 'export function login() {}',
      sessionFactsText: 'Port backend 5000'
    })
    expect(section).toContain('# ACTIVE WORKSPACE CONTEXT & RAG (.abelink/)')
    expect(section).toContain('ACTIVE WORKING MEMORY')
    expect(section).toContain('RELEVAN CODEBASE CONTEXT')
    expect(section).toContain('FAKTA SESAAT')
  })

  it('buildUserMemorySection memformat ID dan type dengan benar', () => {
    expect(buildUserMemorySection([])).toBe('')
    const memories = [
      { id: 101, type: 'profile', memory: 'User adalah frontend dev' },
      { id: 102, type: 'preference', memory: 'Lebih suka Tailwind' }
    ]
    const out = buildUserMemorySection(memories)
    expect(out).toContain('# MEMORY USER (Daftar Ingatan Saat Ini)')
    expect(out).toContain('- [PROFILE] (ID:101) User adalah frontend dev')
    expect(out).toContain('- [PREFERENCE] (ID:102) Lebih suka Tailwind')
  })

  it('buildMemoryRulesSection & buildFactsIntegritySection memuat aturan kunci', () => {
    const rules = buildMemoryRulesSection()
    expect(rules).toContain('Anti-Duplikasi & Update')
    expect(rules).toContain('RECALL PENGALAMAN')

    const facts = buildFactsIntegritySection()
    expect(facts).toContain('ANTI-HALUSINASI MEMORI')
    expect(facts).toContain('ANTI-EKSTRAPOLASI')
  })

  it('buildArchivesSection memformat arsip obrolan lama', () => {
    expect(buildArchivesSection([])).toBe('')
    const archives = [
      { timestamp: '2026-09-18T10:00:00Z', summary: 'Diskusi setup Tauri v2' }
    ]
    const out = buildArchivesSection(archives)
    expect(out).toContain('# ARSIP OBROLAN LAMA')
    expect(out).toContain('Diskusi setup Tauri v2')
  })

  it('buildTurnPairsSection memformat dialog tanya-jawab historis', () => {
    expect(buildTurnPairsSection([])).toBe('')
    const turns = [
      { sessionTitle: 'Projek Alpha', userText: 'Cara run test?', aiText: 'Gunakan bunx vitest' }
    ]
    const out = buildTurnPairsSection(turns)
    expect(out).toContain('# RIWAYAT PERCAKAPAN RELEVAN (Turn Pairs Vektor)')
    expect(out).toContain('User: Cara run test?')
    expect(out).toContain('Abelink: Gunakan bunx vitest')
  })

  it('buildDocumentsSection memformat referensi dokumen RAG', () => {
    expect(buildDocumentsSection([])).toBe('')
    const docs = [
      { docName: 'API_SPEC.md', content: 'GET /api/health -> 200 OK' }
    ]
    const out = buildDocumentsSection(docs)
    expect(out).toContain('# REFERENSI DOKUMEN (RAG Knowledge Base)')
    expect(out).toContain('[API_SPEC.md] GET /api/health -> 200 OK')
  })

  it('composeAllMemorySections merakit semua komponen memori secara padu', () => {
    const context = {
      memories: [{ id: 1, type: 'profile', memory: 'Developer Linux' }],
      archives: [{ summary: 'Riset Hermes' }],
      documents: [{ docName: 'README.md', content: 'Panduan' }],
      turnPairs: [{ userText: 'Halo', aiText: 'Hai' }]
    }
    const fullPrompt = composeAllMemorySections(context)
    expect(fullPrompt).toContain('# MEMORY USER')
    expect(fullPrompt).toContain('# ATURAN PENYIMPANAN & PEMBARUAN MEMORY')
    expect(fullPrompt).toContain('# ATURAN INTEGRITAS FAKTA')
    expect(fullPrompt).toContain('# ARSIP OBROLAN LAMA')
    expect(fullPrompt).toContain('# RIWAYAT PERCAKAPAN RELEVAN')
    expect(fullPrompt).toContain('# REFERENSI DOKUMEN')
  })
})

describe('memoryRouter - Context Routing & Normalization', () => {
  it('routeTurnMemoryContext mengorkestrasi unified context dan workspace context', async () => {
    const mockUnified = vi.fn().mockResolvedValue({
      memories: [{ id: 5, type: 'preference', memory: 'Pakai Bun' }],
      archives: [],
      documents: [],
      turnPairs: []
    })
    const mockWorkspace = vi.fn().mockResolvedValue({
      workingMemoryText: 'Fase 3 aktif',
      codeRagText: null,
      sessionFactsText: null
    })

    const routed = await routeTurnMemoryContext({
      userInput: 'Lanjutkan tugas',
      searchQuery: 'tugas',
      workspaceRoot: '/test/workspace',
      getUnifiedContextFn: mockUnified,
      getWorkspaceContextFn: mockWorkspace
    })

    expect(routed.memories.length).toBe(1)
    expect(routed.memories[0].memory).toBe('Pakai Bun')
    expect(routed.workspaceContext.workingMemoryText).toBe('Fase 3 aktif')
  })

  it('normalizeMemoryDecision memvalidasi insert, update, delete dan deteksi duplikat', () => {
    const existing = [
      { id: 10, type: 'preference', memory: 'Pakai dark mode' }
    ]

    // Duplikat insert ditolak
    const dupResult = normalizeMemoryDecision(
      { action: 'insert', type: 'preference', memory: 'Pakai dark mode' },
      existing
    )
    expect(dupResult.valid).toBe(false)
    expect(dupResult.isDuplicate).toBe(true)

    // Insert valid
    const validInsert = normalizeMemoryDecision(
      { action: 'insert', type: 'preference', memory: 'Pakai Vim keys' },
      existing
    )
    expect(validInsert.valid).toBe(true)
    expect(validInsert.action).toBe('insert')
    expect(validInsert.normalized.memory).toBe('Pakai Vim keys')

    // Update butuh id
    const updateNoId = normalizeMemoryDecision({
      action: 'update',
      type: 'preference',
      memory: 'Pakai Neovim'
    })
    expect(updateNoId.valid).toBe(false)

    // Update valid
    const validUpdate = normalizeMemoryDecision({
      action: 'update',
      id: 10,
      type: 'preference',
      memory: 'Pakai Neovim'
    })
    expect(validUpdate.valid).toBe(true)
    expect(validUpdate.normalized.id).toBe(10)

    // Delete butuh id
    const deleteNoId = normalizeMemoryDecision({ action: 'delete' })
    expect(deleteNoId.valid).toBe(false)

    // Delete valid
    const validDelete = normalizeMemoryDecision({ action: 'delete', id: 10 })
    expect(validDelete.valid).toBe(true)
    expect(validDelete.normalized.id).toBe(10)
  })
})
