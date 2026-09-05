import { describe, it, expect, vi } from 'vitest'
import { core_tools } from '../src/api/tools/core-tools'
import { GROUP_TOOLS_DEFINITION, group_tools_flat } from '../src/api/tools/group-tools'

// Katalog tool = kontrak agent <-> tools. Katalog rusak = agent bingung.

describe('core_tools', () => {
  it('semua deskripsi non-kosong & informatif', () => {
    for (const [name, desc] of Object.entries(core_tools)) {
      expect(desc?.length || 0).toBeGreaterThan(10, `deskripsi ${name} terlalu pendek`)
    }
  })
  it('tool inti wajib ada', () => {
    for (const t of ['read-tools', 'memory-search', 'read-file', 'browser-search', 'spawn_subagent']) {
      expect(core_tools[t]).toBeTruthy()
    }
  })
})

describe('GROUP_TOOLS_DEFINITION', () => {
  it('grup connector ada (general-pluggable, bukan task-specific)', () => {
    const c = GROUP_TOOLS_DEFINITION.connectors
    expect(c).toBeTruthy()
    for (const t of ['connector-list', 'connector-inspect', 'connector-guide', 'connector-run', 'connector-status']) {
      expect(c.tools[t]).toBeTruthy()
    }
  })
  it('grup trading_support ada dengan 5 tool wallet', () => {
    const t = GROUP_TOOLS_DEFINITION.trading_support
    expect(Object.keys(t.tools).sort()).toEqual(
      ['trading-allocate', 'trading-deposit', 'trading-ledger', 'trading-log-spend', 'trading-status'].sort()
    )
  })
  it('flat map sinkron dengan grup (lookup O(1) valid)', () => {
    for (const [group, def] of Object.entries(GROUP_TOOLS_DEFINITION)) {
      for (const toolName of Object.keys(def.tools)) {
        expect(group_tools_flat[toolName], `${toolName} hilang dari flat map`).toBeTruthy()
      }
    }
  })
  it('tidak ada tabrakan nama tool antar grup', () => {
    const seen = new Map()
    for (const [group, def] of Object.entries(GROUP_TOOLS_DEFINITION)) {
      for (const toolName of Object.keys(def.tools)) {
        expect(seen.has(toolName), `${toolName} dobel di ${group} & ${seen.get(toolName)}`).toBe(false)
        seen.set(toolName, group)
      }
    }
  })
})
