// Eksekutor tool domain KNOWLEDGE (dipindah murni dari useAbelinkPlan.executeSingleTool):
// memory vector search, Capability Manager connectors, trading wallet lokal.
// Modul ini murni: hanya window.api + dynamic import, tanpa state hook.
import { executeMemorySearch } from '../../../api/vectorMemory'
import { executeMemoryTool } from '../../../api/ai/memoryTool.js'

/**
 * @returns {string|undefined} resultString bila tool milik domain ini.
 */
export const runKnowledgeTool = async (tool, query, ctx = {}) => {
  // 4. Memory Vector Search & Mutation (Hermes pattern c)
  if (tool === 'memory-search') {
    return await executeMemorySearch(query)
  }
  if (tool === 'memory') {
    return await executeMemoryTool(query, { turnId: ctx?.turnId || ctx?.sessionId || 'main_turn' })
  }
  // 4a. Capability Manager connectors — general-pluggable (ala Claude
  // connectors): list/inspect/guide/run/status. Eksekusi selalu lewat
  // channel capabilities:* yang sudah approval-gated native (rfd) di Rust.
  if (tool.startsWith('connector-')) {
    try {
      if (tool === 'connector-list') {
        const list = await window.api.listCapabilities()
        return list?.length
          ? list
              .map(
                (c) =>
                  `- ${c.id}: ${c.name} — ${c.description}${c.scopes?.length ? ` (scopes: ${c.scopes.join(', ')})` : ''}`
              )
              .join('\n')
          : 'Tidak ada connector terpasang.'
      }
      if (tool === 'connector-inspect') {
        const detail = await window.api.inspectCapability(String(query || '').trim())
        return JSON.stringify(detail)
      }
      if (tool === 'connector-guide') {
        const parts = String(query || '').split('||')
        const guide = await window.api.capabilityGuide(
          (parts[0] || '').trim(),
          (parts[1] || '').trim()
        )
        return JSON.stringify(guide)
      }
      if (tool === 'connector-run') {
        const parts = String(query || '').split('||')
        const connectorId = (parts[0] || '').trim()
        const actionId = (parts[1] || '').trim()
        let args = {}
        const rawArgs = (parts.slice(2).join('||') || '').trim()
        if (rawArgs) {
          try {
            args = JSON.parse(rawArgs)
          } catch (_) {
            return `[ERROR] args_json tidak valid: ${rawArgs.slice(0, 120)}. Panggil connector-guide dulu untuk schema.`
          }
        }
        if (connectorId !== 'time' && connectorId !== 'weather') {
          // Non-read-only connector: konfirmasi native sekali lagi di sini
          // (belt & suspenders — gate utama tetap di cmd_node_bridge).
          let approved = true
          if (window.api?.nativeConfirm) {
            try {
              approved = await window.api.nativeConfirm(
                `Abelink ingin menjalankan connector "${connectorId}" aksi "${actionId}". Lanjutkan?`
              )
            } catch (_) {
              approved = false
            }
          }
          if (!approved) {
            return '[DITOLAK] User tidak menyetujui eksekusi connector ini.'
          }
        }
        const out = await window.api.executeCapability(connectorId, actionId, args, {
          sessionId: 'main_chat'
        })
        return typeof out === 'string' ? out : JSON.stringify(out)
      }
      if (tool === 'connector-status') {
        const conns = await window.api.listCapabilityConnections()
        const limit = Math.min(Math.max(parseInt(query, 10) || 10, 1), 100)
        const audit = await window.api.readCapabilityAudit(limit)
        return JSON.stringify({ connections: conns, recentAudit: audit })
      }
      return `[ERROR] Tool connector tidak dikenal: ${tool}`
    } catch (e) {
      return `[ERROR] Connector gagal: ${e?.message || e}. Panggil 'connector-list' untuk melihat yang tersedia.`
    }
  }
  // 4b. Trading Support — wallet lokal (fase 1: pencatatan, tanpa order)
  if (tool.startsWith('trading-')) {
    const wallet = await import('../../../api/trading/wallet.js')
    if (tool === 'trading-status') {
      const monitor = await import('../../../api/trading/budgetMonitor.js')
      const balance = await wallet.getBalance()
      const allocs = await wallet.listAllocations()
      const activeAllocs = allocs.filter((a) => a.active)
      const allocatedTotal = activeAllocs.reduce((s, a) => s + (a.budget || 0), 0)
      const statuses = []
      for (const a of activeAllocs) {
        statuses.push(await monitor.getModelBudgetStatus(a.modelKey))
      }
      const usage = await wallet.getUsageSummary()
      return JSON.stringify({
        balance,
        allocatedTotal,
        available: balance - allocatedTotal,
        models: statuses,
        usage,
        hint: statuses.some((s) => s.exhausted)
          ? 'Ada model dengan budget habis - sarankan topup (butuh approval) atau migrasi ke model lebih murah.'
          : null
      })
    }
    if (tool === 'trading-deposit') {
      // Satu-satunya tool trading yang menambah saldo — WAJIB approval native
      // (rfd dialog di Rust main thread) karena ini gerbang uang nyata.
      const parts = String(query || '').split('||')
      const amount = Number(parts[0]) || 0
      const note = (parts[1] || '').trim()
      if (amount <= 0) {
        return '[ERROR] Format: amount||note. Amount harus angka positif.'
      }
      let approved = true
      if (window.api?.nativeConfirm) {
        try {
          approved = await window.api.nativeConfirm(
            `Abelink ingin menambah saldo wallet trading sebesar ${amount}${note ? ` (${note})` : ''}. Lanjutkan?`
          )
        } catch (_) {
          approved = false
        }
      }
      if (!approved) {
        return '[DITOLAK] User tidak menyetujui penambahan saldo.'
      }
      await wallet.addLedgerEntry({ kind: 'deposit', amount, note })
      const balance = await wallet.getBalance()
      return `Deposit ${amount} tercatat. Saldo sekarang: ${balance}.`
    }
    if (tool === 'trading-allocate') {
      const parts = String(query || '').split('||')
      const modelKey = (parts[0] || '').trim()
      const budget = Number(parts[1]) || 0
      if (!modelKey || budget <= 0) {
        return '[ERROR] Format: modelKey||budget (misal: "deepseek-chat||25"). Budget harus angka positif.'
      }
      const balance = await wallet.getBalance()
      const allocs = await wallet.listAllocations()
      const allocatedTotal = allocs
        .filter((a) => a.active)
        .reduce((s, a) => s + (a.budget || 0), 0)
      if (budget > balance - allocatedTotal) {
        return `[ERROR] Budget melebihi kas tersedia (saldo ${balance}, teralokasi ${allocatedTotal}).`
      }
      await wallet.setAllocation(modelKey, budget)
      return `Alokasi ${budget} ke ${modelKey} tercatat. Kas tersisa: ${balance - allocatedTotal - budget}.`
    }
    if (tool === 'trading-log-spend') {
      const parts = String(query || '').split('||')
      const modelKey = (parts[0] || '').trim()
      const amount = Number(parts[1]) || 0
      const note = (parts[2] || '').trim()
      if (!modelKey || amount <= 0) {
        return '[ERROR] Format: modelKey||amount||note. Amount harus angka positif.'
      }
      const balance = await wallet.getBalance()
      if (amount > balance) {
        return `[ERROR] Kas tidak cukup (saldo ${balance}). Catat deposit dulu via ledger atau kurangi amount.`
      }
      await wallet.recordUsage({ modelKey, cost: amount, note })
      await wallet.addLedgerEntry({
        kind: 'spend',
        amount: -amount,
        note: `${modelKey}${note ? ': ' + note : ''}`
      })
      const newBalance = await wallet.getBalance()
      return `Pengeluaran ${amount} untuk ${modelKey} dicatat. Saldo sekarang: ${newBalance}.`
    }
    if (tool === 'trading-ledger') {
      const limit = Math.min(Math.max(parseInt(query, 10) || 20, 1), 100)
      const rows = await wallet.listLedger('main', limit)
      return rows.length
        ? rows
            .map(
              (r) =>
                `[${new Date(r.ts).toLocaleString('id-ID')}] ${r.kind}: ${r.amount} ${r.note ? '- ' + r.note : ''}`
            )
            .join('\n')
        : 'Buku kas masih kosong.'
    }
    return `[ERROR] Tool trading tidak dikenal: ${tool}`
  }
  return undefined
}
