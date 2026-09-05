import { tradingDb, addLedgerEntry, getBalance, listAllocations } from './wallet.js'

// Token-Budget Monitor — otak self-funding wallet (fase 1: monitor + guard).
//
// Tesis owner: model tidak bisa diubah, tapi arsitektur bisa dibuat lebih
// smart. Di sini arsitekturnya menjaga keberlangsungan hidup agent:
// 1. Model murah (mis. deepseek-chat, glm-4.7-air) diberi alokasi budget.
// 2. Setiap giliran agen, usage terekam; monitor menghitung burn rate.
// 3. Saat budget model tinggal tipis, monitor menyarankan degradasi (mis.
//    pindah ke model lebih murah) ATAU menandai perlunya top-up — dengan
//    POLICY yang bisa dipilih (warn-only vs hard-stop spend).
//
// Prinsip aman: modul ini TIDAK pernah memindahkan uang, TIDAK pernah
// mengeksekusi order — hanya menghitung dan menyarankan. Eksekusi nyata
// (fase berikutnya) wajib lewat approval gate native (rfd).

export const BUDGET_POLICIES = {
  // Hanya beri tahu agent (intermediate_answer) — kerja lanjut.
  warn_only: 'warn_only',
  // Berhenti memakai model itu saat budget habis; agent wajib lapor user.
  hard_stop: 'hard_stop'
}

export const DEFAULT_POLICY = BUDGET_POLICIES.warn_only

// Estimasi biaya dari usage (harga per 1M token, standar industri).
// Harga di-set saat alokasi dibuat; tanpa harga, biaya dihitung dari ledger.
export const estimateCost = ({
  tokensIn = 0,
  tokensOut = 0,
  pricePerMTokIn = 0,
  pricePerMTokOut = 0
}) =>
  (Number(tokensIn) / 1e6 || 0) * (Number(pricePerMTokIn) || 0) +
  (Number(tokensOut) / 1e6 || 0) * (Number(pricePerMTokOut) || 0)

// Ringkasan budget satu model: alokasi vs terpakai vs sisa + burn rate.
export const getModelBudgetStatus = async (modelKey, windowMs = 24 * 60 * 60 * 1000) => {
  const alloc = await tradingDb.allocations.where('modelKey').equals(modelKey).first()
  if (!alloc) {
    return {
      modelKey,
      allocated: null,
      spent: 0,
      remaining: null,
      burnRatePerHour: 0,
      exhausted: false
    }
  }
  const since = Date.now() - windowMs
  const usageRows = await tradingDb.usage
    .where('modelKey')
    .equals(modelKey)
    .filter((u) => u.ts >= since)
    .toArray()
  const spent = usageRows.reduce((s, u) => s + (u.cost || 0), 0)
  const windowHours = Math.max(windowMs / 3600000, 0.001)
  const burnRatePerHour = spent / windowHours
  const remaining = Math.max((alloc.budget || 0) - spent, 0)
  return {
    modelKey,
    allocated: alloc.budget || 0,
    spent: +spent.toFixed(6),
    remaining: +remaining.toFixed(6),
    burnRatePerHour: +burnRatePerHour.toFixed(6),
    exhausted: alloc.budget > 0 && spent >= alloc.budget
  }
}

// Putusan alokasi untuk model sebelum call AI: boleh jalan atau perlu degradasi.
// policy hard_stop memblok saat exhausted; warn_only hanya menandai.
export const checkModelBudget = async (modelKey, { policy = DEFAULT_POLICY } = {}) => {
  const status = await getModelBudgetStatus(modelKey)
  if (status.allocated === null) {
    // Tanpa alokasi: sisa kas utama jadi fallback budget (self-funding).
    const balance = await getBalance()
    if (balance > 0)
      return {
        allowed: true,
        reason: 'fallback-balance',
        status: { ...status, remaining: balance }
      }
    return {
      allowed: policy !== BUDGET_POLICIES.hard_stop,
      reason: 'no-allocation-no-balance',
      status
    }
  }
  if (status.exhausted) {
    return {
      allowed: policy !== BUDGET_POLICIES.hard_stop,
      reason: 'budget-exhausted',
      status,
      suggestion: 'topup-or-cheaper-model'
    }
  }
  return { allowed: true, reason: 'within-budget', status }
}

// Alokasi lengkap dengan harga per 1M token (meta dipakai estimator biaya).
export const setAllocationWithPricing = async (
  modelKey,
  budget,
  pricePerMTokIn,
  pricePerMTokOut,
  { active = true } = {}
) => {
  const { setAllocation } = await import('./wallet.js')
  await setAllocation(modelKey, budget, { active })
  const existing = await tradingDb.allocations.where('modelKey').equals(modelKey).first()
  await tradingDb.allocations.update(existing.id, {
    pricePerMTokIn: Number(pricePerMTokIn) || 0,
    pricePerMTokOut: Number(pricePerMTokOut) || 0
  })
  return existing.id
}
