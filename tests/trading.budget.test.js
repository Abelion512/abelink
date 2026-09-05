import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { tradingDb, addLedgerEntry, setAllocation, recordUsage } from '../src/api/trading/wallet.js'
import {
  BUDGET_POLICIES,
  estimateCost,
  getModelBudgetStatus,
  checkModelBudget,
  setAllocationWithPricing
} from '../src/api/trading/budgetMonitor.js'

// Token-budget monitor: otak self-funding wallet. Pastikan perhitungan
// burn rate, exhausted, dan policy guard benar sebelum dipercaya.

beforeEach(async () => {
  await tradingDb.ledger.clear()
  await tradingDb.allocations.clear()
  await tradingDb.usage.clear()
})

describe('estimateCost', () => {
  it('hitung biaya dari harga per 1M token (in & out beda harga)', () => {
    // 2M in @ $0.27/M + 1M out @ $1.10/M = 0.54 + 1.10
    expect(
      estimateCost({
        tokensIn: 2_000_000,
        tokensOut: 1_000_000,
        pricePerMTokIn: 0.27,
        pricePerMTokOut: 1.1
      })
    ).toBeCloseTo(1.64, 6)
  })
  it('0 bila harga kosong / input sampah', () => {
    expect(estimateCost({})).toBe(0)
    expect(estimateCost({ tokensIn: 'abc' })).toBe(0)
  })
})

describe('getModelBudgetStatus', () => {
  it('spent & remaining & exhausted benar', async () => {
    await setAllocation('deepseek-chat', 5)
    await recordUsage({ modelKey: 'deepseek-chat', cost: 2 })
    await recordUsage({ modelKey: 'deepseek-chat', cost: 1.5 })
    const s = await getModelBudgetStatus('deepseek-chat')
    expect(s.allocated).toBe(5)
    expect(s.spent).toBeCloseTo(3.5, 6)
    expect(s.remaining).toBeCloseTo(1.5, 6)
    expect(s.exhausted).toBe(false)
  })
  it('exhausted saat spent >= budget', async () => {
    await setAllocation('glm-4.7-air', 1)
    await recordUsage({ modelKey: 'glm-4.7-air', cost: 1 })
    const s = await getModelBudgetStatus('glm-4.7-air')
    expect(s.exhausted).toBe(true)
    expect(s.remaining).toBe(0)
  })
  it('tanpa alokasi -> allocated null (fallback balance)', async () => {
    const s = await getModelBudgetStatus('never-allocated')
    expect(s.allocated).toBeNull()
    expect(s.exhausted).toBe(false)
  })
})

describe('checkModelBudget — policy guard', () => {
  it('hard_stop memblok saat budget habis', async () => {
    await setAllocation('deepseek-chat', 2)
    await recordUsage({ modelKey: 'deepseek-chat', cost: 2 })
    const r = await checkModelBudget('deepseek-chat', { policy: BUDGET_POLICIES.hard_stop })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('budget-exhausted')
    expect(r.suggestion).toBe('topup-or-cheaper-model')
  })
  it('warn_only tetap izinkan meski habis (cuma nyalakan alarm)', async () => {
    await setAllocation('deepseek-chat', 2)
    await recordUsage({ modelKey: 'deepseek-chat', cost: 3 })
    const r = await checkModelBudget('deepseek-chat', { policy: BUDGET_POLICIES.warn_only })
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('budget-exhausted')
  })
  it('fallback ke saldo kas utama bila tanpa alokasi', async () => {
    await addLedgerEntry({ kind: 'deposit', amount: 10 })
    const r = await checkModelBudget('ad-hoc-model')
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('fallback-balance')
    expect(r.status.remaining).toBe(10)
  })
  it('hard_stop + tanpa alokasi + kas kosong = blok', async () => {
    const r = await checkModelBudget('ad-hoc-model', { policy: BUDGET_POLICIES.hard_stop })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('no-allocation-no-balance')
  })
})

describe('setAllocationWithPricing', () => {
  it('simpan harga per 1M token pada alokasi', async () => {
    await setAllocationWithPricing('deepseek-chat', 20, 0.27, 1.1)
    const row = await tradingDb.allocations.where('modelKey').equals('deepseek-chat').first()
    expect(row).toMatchObject({ budget: 20, pricePerMTokIn: 0.27, pricePerMTokOut: 1.1 })
  })
})
