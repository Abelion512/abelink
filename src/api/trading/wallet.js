import Dexie from 'dexie'

// Mark Trading Support — fondasi fase 1 (read-only market + self-funding budget).
//
// Filosofi (permintaan owner): Mark sebagai asisten trading dengan "wallet"
// sendiri — agent bisa bekerja membayar token model murah & pintar (model
// China) dari hasil aktivitasnya, tanpa owner harus top-up manual.
//
// Fase 1 (commit ini): buku kas lokal + pencatat alokasi & usage. 100% lokal
// (Dexie), tanpa koneksi exchange, TANPA order execution. Fase berikutnya
// (terdokumentasi di docs/ROADMAP.md): binding exchange read-only via API key,
// lalu auto-rebalance budget token dengan guard ketat + approval user.
//
// Aturan keamanan: modul ini TIDAK pernah memegang kredensial exchange dan
// TIDAK pernah mengeksekusi order. Semua angka uang disimpan apa adanya (user
// yang memilih mata uang/satuan), tanpa pembulatan tersirat.

export const TRADING_DB_NAME = 'mark-trading'

export const tradingDb = new Dexie(TRADING_DB_NAME)

tradingDb.version(1).stores({
  // Buku kas: setiap perubahan saldo (deposit, alokasi ke model, pengeluaran
  // inference, hasil/withdraw). amount bisa negatif (pengeluaran).
  ledger: '++id, ts, kind, source',
  // Alokasi per model/provider: berapa budget yang diberikan ke model X.
  allocations: '++id, modelKey, active, createdAt',
  // Usage inference per model: token in/out + biaya tercatat (dari respons AI).
  usage: '++id, modelKey, ts'
})

export const LEDGER_KINDS = ['deposit', 'allocation', 'spend', 'yield', 'withdraw']

// Buku kas ringkas: saldo per source (default 'main').
export const getBalance = async (source = 'main') => {
  const rows = await tradingDb.ledger.where('source').equals(source).toArray()
  return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
}

export const addLedgerEntry = async ({ kind, amount, note = '', source = 'main', meta = null }) => {
  if (!LEDGER_KINDS.includes(kind)) {
    throw new Error(`Jenis ledger tidak dikenal: ${kind}`)
  }
  const entry = {
    kind,
    amount: Number(amount) || 0,
    note,
    source,
    meta,
    ts: Date.now()
  }
  return tradingDb.ledger.add(entry)
}

export const listLedger = async (source = 'main', limit = 50) => {
  return tradingDb.ledger.where('source').equals(source).reverse().limit(limit).toArray()
}

// Alokasi budget per model (mis. 'deepseek-chat', 'glm-4.7-air').
export const setAllocation = async (modelKey, budget, { active = true } = {}) => {
  const existing = await tradingDb.allocations.where('modelKey').equals(modelKey).first()
  if (existing) {
    await tradingDb.allocations.update(existing.id, { budget: Number(budget) || 0, active })
    return existing.id
  }
  return tradingDb.allocations.add({
    modelKey,
    budget: Number(budget) || 0,
    active,
    createdAt: Date.now()
  })
}

export const listAllocations = async () => tradingDb.allocations.toArray()

// Pencatatan usage inference (dipanggil nanti dari jalur ai-bridge).
export const recordUsage = async ({
  modelKey,
  tokensIn = 0,
  tokensOut = 0,
  cost = 0,
  note = ''
}) => {
  return tradingDb.usage.add({
    modelKey,
    tokensIn: Number(tokensIn) || 0,
    tokensOut: Number(tokensOut) || 0,
    cost: Number(cost) || 0,
    note,
    ts: Date.now()
  })
}

export const getUsageSummary = async (modelKey = null) => {
  const rows = modelKey
    ? await tradingDb.usage.where('modelKey').equals(modelKey).toArray()
    : await tradingDb.usage.toArray()
  return rows.reduce(
    (acc, r) => ({
      tokensIn: acc.tokensIn + (r.tokensIn || 0),
      tokensOut: acc.tokensOut + (r.tokensOut || 0),
      cost: acc.cost + (r.cost || 0),
      calls: acc.calls + 1
    }),
    { tokensIn: 0, tokensOut: 0, cost: 0, calls: 0 }
  )
}
