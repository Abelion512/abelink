import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  tradingDb,
  addLedgerEntry,
  getBalance,
  listLedger,
  setAllocation,
  listAllocations,
  recordUsage,
  getUsageSummary,
  LEDGER_KINDS
} from '../src/api/trading/wallet.js'

// Buku kas & alokasi — fondasi wallet self-funding Mark (100% lokal Dexie).

beforeEach(async () => {
  await tradingDb.ledger.clear()
  await tradingDb.allocations.clear()
  await tradingDb.usage.clear()
})

describe('wallet ledger', () => {
  it('saldo = jumlah semua entry (deposit positif, spend negatif)', async () => {
    await addLedgerEntry({ kind: 'deposit', amount: 100, note: 'modal awal' })
    await addLedgerEntry({ kind: 'spend', amount: -12.5, note: 'token deepseek' })
    await addLedgerEntry({ kind: 'yield', amount: 30, note: 'hasil sinyal' })
    expect(await getBalance()).toBe(117.5)
  })

  it('sumber terpisah (main vs savings) tidak tercampur', async () => {
    await addLedgerEntry({ kind: 'deposit', amount: 50, source: 'main' })
    await addLedgerEntry({ kind: 'deposit', amount: 25, source: 'savings' })
    expect(await getBalance('main')).toBe(50)
    expect(await getBalance('savings')).toBe(25)
  })

  it('tolak kind tidak dikenal', async () => {
    await expect(addLedgerEntry({ kind: 'ngasal', amount: 1 })).rejects.toThrow()
    expect(LEDGER_KINDS).toContain('yield')
  })

  it('listLedger terbaru dulu', async () => {
    await addLedgerEntry({ kind: 'deposit', amount: 1 })
    await new Promise((r) => setTimeout(r, 5))
    await addLedgerEntry({ kind: 'spend', amount: -1 })
    const rows = await listLedger()
    expect(rows[0].kind).toBe('spend')
  })
})

describe('allocation & usage', () => {
  it('setAllocation idempoten per modelKey', async () => {
    await setAllocation('deepseek-chat', 20)
    await setAllocation('deepseek-chat', 35, { active: false })
    const all = await listAllocations()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ modelKey: 'deepseek-chat', budget: 35, active: false })
  })

  it('usage summary mengakumulasi token & biaya', async () => {
    await recordUsage({ modelKey: 'glm-4.7-air', tokensIn: 1000, tokensOut: 500, cost: 0.02 })
    await recordUsage({ modelKey: 'glm-4.7-air', tokensIn: 500, tokensOut: 250, cost: 0.01 })
    await recordUsage({ modelKey: 'deepseek-chat', tokensIn: 100, tokensOut: 50, cost: 0.005 })
    const glm = await getUsageSummary('glm-4.7-air')
    expect(glm).toMatchObject({ tokensIn: 1500, tokensOut: 750, cost: 0.03, calls: 2 })
    const all = await getUsageSummary()
    expect(all.calls).toBe(3)
  })
})
