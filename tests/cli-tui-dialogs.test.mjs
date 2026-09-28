// tests/cli-tui-dialogs.test.mjs — Port batch B: dialog/select/palette/model/sessions.
// Pure logic (theme helper + engine rows + confirm guard); render JSX hanya
// runtime Bun, bukan vitest. Source: opencode packages/tui/src/ui/dialog-select.tsx,
// component/dialog-model.tsx, component/dialog-session-list.tsx,
// component/command-palette.tsx, ui/dialog-confirm.tsx.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { annotateSections } from '../cli/tui/theme.ts'
import {
  createTuiState,
  submitLine,
  modelPickerRows,
  effortDialogRows,
  sessionDialogRows,
  needsNewConfirm,
} from '../cli/tui/engine.mjs'

// Home isolasi per test: path tetap berisiko tabrakan cache dengan suite lain
// (terukur: /tmp/tak-ada-* dipakai pola tmp test lain + cache fetchedAt palsu
// dianggap fresh sehingga fetchFn tak dipanggil). mkdtemp = hermetik.
const freshHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-pb-dialog-'))

describe('annotateSections (port dialog-select grouping)', () => {
  it('header hanya untuk seksi bersama (>1 baris)', () => {
    const rows = [
      { id: 'a', section: 'Aktif' },
      { id: 'b', section: 'Recent' },
      { id: 'c', section: 'Recent' },
      { id: 'd', section: '' },
    ]
    const out = annotateSections(rows)
    expect(out[0].header).toBeNull()
    expect(out[1].header).toBe('Recent')
    expect(out[2].header).toBeNull()
    expect(out[3].header).toBeNull()
  })
  it('seksi unik per baris (commands/sesi) tetap inline, tanpa header', () => {
    const rows = [
      { id: '/a', section: 'desc a' },
      { id: '/b', section: 'desc b' },
    ]
    expect(annotateSections(rows).every((r) => r.header === null)).toBe(true)
  })
  it('input tak masuk akal aman', () => {
    expect(annotateSections(null)).toEqual([])
    expect(annotateSections(undefined)).toEqual([])
  })
})

describe('current marker (port dialog-select ●)', () => {
  it('modelPickerRows: Aktif selalu current', async () => {
    const s = createTuiState({ model: 'm-aktif', recentModels: [] })
    const r = await modelPickerRows(s, { homeDir: freshHome(), aliases: {}, cliConfig: {} }, '')
    const aktif = r.rows.find((x) => x.section === 'Aktif')
    expect(aktif?.current).toBe(true)
  })
  it('effortDialogRows: level aktif current + section aktif', async () => {
    const all = await effortDialogRows(createTuiState({ effort: 'high' }))
    const hit = all.find((r) => r.id === 'high')
    expect(hit?.current).toBe(true)
    expect(hit?.section).toMatch(/aktif/)
    expect(all.filter((r) => r.current).length).toBe(1)
  })
})

describe('model details (port dialog-select details baris kedua)', () => {
  it('Katalog dengan capability -> detail reasoning/ctx/out', async () => {
    const s = createTuiState({ model: 'x', recentModels: [] })
    const d = {
      homeDir: freshHome(),
      aliases: {},
      cliConfig: {},
      loadCatalog: true,
      fetchFn: async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: 'qwen', capabilities: { reasoning: true, contextWindow: 262144, maxOutput: 1000 } }],
        }),
      }),
    }
    const r = await modelPickerRows(s, d, 'qwen')
    const hit = r.rows.find((x) => x.id === 'qwen')
    expect(hit?.detail).toContain('reasoning')
    expect(hit?.detail).toContain('262144')
  })
  it('alias (label ->) tanpa detail', async () => {
    const s = createTuiState({ model: 'x', recentModels: [] })
    const r = await modelPickerRows(s, { homeDir: freshHome(), aliases: { zen: 'z-id' }, cliConfig: {} }, 'zen')
    expect(r.rows.find((x) => x.id === 'zen')?.detail ?? null).toBeNull()
  })
})

describe('sessionDialogRows (port dialog-session-list buildOption)', () => {
  const NOW = new Date('2026-09-28T12:00:00Z').getTime()
  const mk = (id, extra = {}) => ({
    id, title: `T-${id}`, updatedAt: new Date(NOW - 3600000).toISOString(), prompt: 'halo dunia prompt sesi', ...extra,
  })
  it('Pinned paling atas + kategori Today + current ● + detail prompt', () => {
    const rows = sessionDialogRows([mk('a'), mk('b')], {
      pinned: ['b'], currentId: 'a', now: NOW,
    })
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(rows[0].section).toBe('Pinned')
    expect(rows[1].section).toBe('Today')
    expect(rows.find((r) => r.id === 'a')?.current).toBe(true)
    expect(rows.find((r) => r.id === 'b')?.current).toBe(false)
    expect(rows[0].detail).toContain('halo dunia')
  })
  it('slot = prefix [n] di label (port gutter slot)', () => {
    const rows = sessionDialogRows([mk('a')], { slots: ['a'], now: NOW })
    expect(rows[0].label).toContain('[1]')
  })
  it('child (parentID) difilter; tanpa sesi -> []', () => {
    expect(sessionDialogRows([mk('a'), { ...mk('c'), parentID: 'a' }], { now: NOW }).map((r) => r.id)).toEqual(['a'])
    expect(sessionDialogRows(null)).toEqual([])
  })
})

describe('needsNewConfirm + /new --force (port dialog-confirm)', () => {
  it('guard: histori kosong -> false; ada histori -> true; --force -> false', () => {
    expect(needsNewConfirm(createTuiState())).toBe(false)
    expect(needsNewConfirm(createTuiState({ history: [{ role: 'user', content: 'hi' }] }))).toBe(true)
    expect(needsNewConfirm(createTuiState({ history: [{ role: 'user', content: 'hi' }] }), '--force')).toBe(false)
    expect(needsNewConfirm(createTuiState({ currentTurn: {} }))).toBe(true)
  })
  it('/new sesi kotor -> kind confirm + pesan --force; --force -> reset', async () => {
    const home = freshHome()
    const s = createTuiState({ history: [{ role: 'user', content: 'hi' }] })
    const r = await submitLine(s, '/new', { homeDir: home })
    expect(r.kind).toBe('confirm')
    expect(s.history.length).toBe(1)
    expect(s.messages.at(-1).text).toContain('--force')
    const r2 = await submitLine(s, '/new --force', { homeDir: home })
    expect(r2.kind).toBe('message')
    expect(s.history).toEqual([])
  })
  it('/new sesi bersih -> langsung reset (kontrak lama utuh)', async () => {
    const s = createTuiState()
    const r = await submitLine(s, '/new', { homeDir: freshHome() })
    expect(r.kind).toBe('message')
    expect(s.history).toEqual([])
  })
})
