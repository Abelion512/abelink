// selfHealingEngine.js
// Autonomous Runtime Error Interceptor & Self-Repair Dispatcher
// Mengizinkan Abelink menangkap error runtime sendiri dan memanggil CLI agent untuk memperbaikinya.

import { buildCodingCommand } from './codingAgentBridge.js'

// In-memory circuit breaker registry: signature -> { count, lastAttempt }
const repairHistory = new Map()
export const MAX_REPAIR_ATTEMPTS = 2
export const REPAIR_COOLDOWN_MS = 3600000 // 1 jam

/**
 * Membuat signature error unik dari pesan dan stack trace.
 */
export function getErrorSignature(error) {
  if (!error) return 'unknown_error'
  const msg = error.message || String(error)
  const firstStack = (error.stack || '')
    .split('\n')
    .slice(0, 3)
    .join(' ')
    .replace(/:\d+:\d+/g, '') // strip line/col numbers to normalize
  return `${msg}::${firstStack}`.trim()
}

/**
 * Memeriksa apakah error signature diizinkan untuk dipicu perbaikan (circuit breaker).
 */
export function isRepairAllowed(signature, now = Date.now()) {
  const record = repairHistory.get(signature)
  if (!record) return true

  if (now - record.lastAttempt > REPAIR_COOLDOWN_MS) {
    repairHistory.set(signature, { count: 0, lastAttempt: now })
    return true
  }

  return record.count < MAX_REPAIR_ATTEMPTS
}

/**
 * Mencatat percobaan perbaikan untuk circuit breaker.
 */
export function recordRepairAttempt(signature, now = Date.now()) {
  const record = repairHistory.get(signature) || { count: 0, lastAttempt: now }
  repairHistory.set(signature, {
    count: record.count + 1,
    lastAttempt: now
  })
}

/**
 * Merumuskan instruksi perbaikan diri yang aman untuk CLI agent.
 */
export function createSelfRepairMission({ error, contextInfo = {}, agentId = 'claude' }) {
  const signature = getErrorSignature(error)
  if (!isRepairAllowed(signature)) {
    return {
      allowed: false,
      reason: `Circuit breaker aktif: signature error '${signature.slice(0, 40)}' sudah mencapai batas ${MAX_REPAIR_ATTEMPTS}x perbaikan.`
    }
  }

  recordRepairAttempt(signature)
  const timestamp = Date.now().toString(36)
  const branch = `auto/fix-runtime-${timestamp}`

  const prompt = `Abelink mengalami runtime error pada sistem:
Pesan: ${error.message || String(error)}
Stack: ${error.stack || 'tidak tersedia'}
Konteks: ${JSON.stringify(contextInfo)}

Tugas kamu:
1. Analisis akar penyebab error pada file yang bersangkutan di repositori ini.
2. Perbaiki bug tersebut tanpa merusak fungsionalitas lain.
3. Jalankan "bunx vitest run" untuk memastikan seluruh unit test hijau.
4. Buat commit git ringkas di branch saat ini (${branch}).`

  const { command, agent } = buildCodingCommand({
    agentId,
    prompt,
    branch
  })

  return {
    allowed: true,
    signature,
    branch,
    prompt,
    command,
    agent
  }
}
