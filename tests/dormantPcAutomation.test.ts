// Kontrak dorman os-automation (keputusan owner 2026-09-27, anti over-engineering):
// group pc_automation TIDAK direkrut ke prompt planner/sub-agent; read-tools
// menjawab JUJUR saat ditanya; jalur tetap hidup (os-open core, emergency-stop,
// plumbing os-control) tidak tersentuh.
//
// Data pemutus (harness prod+dev, 1380 tool call): os-read/click/type/key/scroll
// = 0 call; os-* hidup = os-control-close 42 + os-open 3 + os-search 1 (plumbing
// + shell fallback). Audit de-Windows: mesin sudah Linux-native; debt nyata =
// Wayland (X11-only) -> backlog, dikerjakan hanya bila group diaktifkan.
//
// Sumber: docs/PLANNED/sessions/2026-09-27_os-automation-dorman.md
import { describe, it, expect } from 'vitest'
import { GROUP_TOOLS_DEFINITION, loadGroupToolsText } from '../src/api/tools/group-tools.ts'
import { core_tools } from '../src/api/tools/core-tools.ts'
import { DEFERRED_GROUP_SPECS, UNIFIED_TOOL_CATALOG } from '../src/api/tools/toolCatalog.ts'

describe('pc_automation dorman (keputusan owner 2026-09-27)', () => {
  it('group ditandai dormant dengan alasan yang jujur', () => {
    const g = GROUP_TOOLS_DEFINITION.pc_automation
    expect(g).toBeTruthy() // definisi tetap ada (reversible), bukan dihapus
    expect(g.dormant).toBe(true)
    expect(g.dormantReason).toMatch(/0 call|dormant|X11/i)
  })

  it('planner tidak merekrut grup dormant ke prompt (filter dormant di planning)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/api/ai/planning.ts', 'utf8')
    // Filter dormant dipasang pada baris daftar grup deferred:
    expect(src).toMatch(/\.filter\(\(\[, v\]\) => !v\.dormant\)/)
    // Contoh teks prompt tidak lagi menyebut pc_automation:
    expect(src).not.toMatch(/"pc_automation"/)
  })

  it('sub-agent juga tidak merekrut grup dormant', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/api/subagent/subagentExecutor.ts', 'utf8')
    expect(src).toMatch(/\.filter\(\(\[, v\]\) => !v\.dormant\)/)
  })

  it('read-tools "pc_automation" menjawab JUJUR (dorman + cara aktifkan), bukan miss senyap', async () => {
    const msg = await loadGroupToolsText('pc_automation')
    expect(msg).toBeTruthy()
    expect(msg).toMatch(/DORMAN/i)
    expect(msg).toMatch(/os-open/) // jalur tetap hidup disebut
    expect(msg).toMatch(/Wayland/) // batasan jujur disebut
  })

  it('grup lain tidak terdampak (masih terdokumentasi penuh)', async () => {
    const msg = await loadGroupToolsText('advanced_browser')
    expect(msg).toBeTruthy()
    expect(msg).not.toMatch(/DORMAN/)
  })

  it('jalur tetap hidup: os-open tetap core tool (di prompt default)', () => {
    expect(core_tools['os-open']).toBeTruthy()
    // os-open tetap terdaftar di katalog unified sebagai core:
    expect(UNIFIED_TOOL_CATALOG.get('os-open')).toBeTruthy()
    expect(UNIFIED_TOOL_CATALOG.get('os-open').group).toBe('core')
  })

  // Timeout zamanikan: baca file + import chain di worker sibuk bisa >5s.
  it('plumbing os-control tetap terdaftar (teardown/overlay tidak pecah)', { timeout: 15000 }, async () => {
    for (const t of ['os-control-open', 'os-control-close']) {
      expect(UNIFIED_TOOL_CATALOG.get(t)).toBeTruthy()
    }
    // Katalog grup (docs katalog) tetap memuat pc_automation (reversible):
    expect(DEFERRED_GROUP_SPECS.pc_automation).toBeTruthy()
    // Kode mesin tidak dihapus (diimport node-tools):
    const { readFileSync } = await import('node:fs')
    const nt = readFileSync('sidecar/main/node-tools.ts', 'utf8')
    expect(nt).toMatch(/from '\.\/tools\/osTools\.ts'/)
  })
})
