// S1+G1: isolasi tab antar-sesi (pure-logic).
// - sessionId dinormalisasi String (angka sesi main 1/17 vs string subagent).
// - adopsi tab mengecualikan primer milik sesi lain.
// - grup boleh multi-tab; primer tunggal per sesi.
import { describe, it, expect } from 'vitest'

const sessionKeyOf = (sid) => String(sid ?? 'default')

const pickAdoptableTab = (tabs = [], url = '', excludeIds = []) => {
  const excluded = new Set(Array.isArray(excludeIds) ? excludeIds : [])
  // Chrome: TAB_GROUP_ID_NONE === -1. Hanya -1/undefined yang tak-bergrup.
  const ungrouped = (Array.isArray(tabs) ? tabs : []).filter(
    (t) => t && (t.groupId === -1 || t.groupId == null) && !excluded.has(t.id)
  )
  return (
    ungrouped.find((t) => t.url === url) ||
    ungrouped.find((t) => t.url === 'about:blank' || t.url === 'chrome://newtab/') ||
    null
  )
}

// Cermin logika navigate(): primer sesi lain dikecualikan dari adopsi.
const otherPrimaries = (primaryTabs, sid) =>
  Object.entries(primaryTabs || {})
    .filter(([k]) => String(k) !== sessionKeyOf(sid))
    .map(([, id]) => id)

describe('sessionKeyOf', () => {
  it('angka sesi main dan string subagent dinormalisasi konsisten', () => {
    expect(sessionKeyOf(1)).toBe('1')
    expect(sessionKeyOf(17)).toBe('17')
    expect(sessionKeyOf('sub_abc')).toBe('sub_abc')
    expect(sessionKeyOf(undefined)).toBe('default')
    expect(sessionKeyOf(null)).toBe('default')
  })
})

describe('pickAdoptableTab (anti-curi)', () => {
  const tabs = [
    { id: 1, url: 'https://x.test/', groupId: -1 },
    { id: 2, url: 'about:blank', groupId: -1 },
    { id: 3, url: 'https://x.test/', groupId: 5 }
  ]
  it('adopsi URL cocok yang tak-bergrup', () => {
    expect(pickAdoptableTab(tabs, 'https://x.test/', []).id).toBe(1)
  })
  it('lewati primer sesi lain walau URL cocok', () => {
    expect(pickAdoptableTab(tabs, 'https://x.test/', [1]).id).toBe(2)
  })
  it('abaikan tab bergrup', () => {
    expect(pickAdoptableTab(tabs, 'https://lain.test/', []).id).toBe(2)
  })
  it('null bila tak ada kandidat', () => {
    expect(pickAdoptableTab(tabs, 'https://lain.test/', [1, 2])).toBeNull()
  })
})

describe('otherPrimaries', () => {
  it('hanya primer sesi lain yang dikecualikan', () => {
    const primaries = { 1: 101, 17: 102, sub_abc: 103 }
    expect(otherPrimaries(primaries, 1)).toEqual([102, 103])
    expect(otherPrimaries(primaries, 'sub_abc')).toEqual([101, 102])
  })
})
