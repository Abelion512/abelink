// cli/core/session-store.mjs — adapter store sesi Fase-1 (headlessCli.js).
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9). Perubahan path relatif saat
// pindah dari bin/ ke cli/core/: '../../src/api/ai/headlessCli.js'.
//
// Fase-1 contract (loadCliSession/saveCliSession/listCliSessions +
// options.initialHistory) SUDAH mendarat di headlessCli.js/agentRunner.js.
// loadFase1Store + blockedOn dipertahankan sebagai fallback jujur bila impor
// gagal. Upstream store SYNC — `await` di sini membuatnya toleran dua bentuk.
import { SESSION_MESSAGE_CAP } from './constants.mjs'

export async function loadFase1Store() {
  try {
    const mod = await import('../../src/api/ai/headlessCli.js')
    const { loadCliSession = null, saveCliSession = null, listCliSessions = null } = mod
    if (typeof loadCliSession !== 'function' || typeof saveCliSession !== 'function') return null
    return { loadCliSession, saveCliSession, listCliSessions }
  } catch {
    return null
  }
}

export async function loadTuiSession(id, store = null) {
  const s = store || await loadFase1Store()
  if (!s || typeof s.loadCliSession !== 'function') {
    return { ok: false, blockedOn: 'fase-1', reason: 'loadCliSession belum tersedia (helper store tak termuat).' }
  }
  try {
    const session = await s.loadCliSession(id)
    if (!session) return { ok: false, error: `Sesi "${id}" tidak ditemukan.` }
    return { ok: true, session }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

export async function saveTuiSession(session, store = null) {
  const s = store || await loadFase1Store()
  if (!s || typeof s.saveCliSession !== 'function') {
    return { ok: false, blockedOn: 'fase-1', reason: 'saveCliSession belum tersedia (helper store tak termuat).' }
  }
  try {
    const capped = Array.isArray(session?.messages) ? session.messages.slice(-SESSION_MESSAGE_CAP) : []
    const res = await s.saveCliSession({ ...session, messages: capped })
    if (res && res.ok === false) return { ok: false, error: 'saveCliSession menolak sesi (id tak valid?).' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

/**
 * Daftar sesi CLI tersimpan untuk dialog /sessions.
 * @param {unknown} [store] Store Fase-1 (biasanya null: dimuat sendiri).
 * @returns {Promise<{ ok: boolean, sessions?: Array<{ id: string, outcome?: string, updatedAt?: string, prompt?: string }> }>}
 */
export async function listTuiSessions(store = null) {
  const s = store || await loadFase1Store()
  if (!s || typeof s.listCliSessions !== 'function') {
    return { ok: false, blockedOn: 'fase-1', reason: 'listCliSessions belum tersedia (helper store tak termuat).' }
  }
  try {
    const sessions = await s.listCliSessions()
    return { ok: true, sessions: Array.isArray(sessions) ? sessions : [] }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// Passed as options.initialHistory per §2 contract (runAgentLoop seeds
// loopMessages with it). Filter mirrors the §2 rule: only user/assistant
// string-content messages, capped at 50.
export function sessionToInitialHistory(session = {}) {
  const msgs = Array.isArray(session.messages) ? session.messages : []
  return msgs
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-SESSION_MESSAGE_CAP)
}
