// Capability Manager — lapisan eksekusi Capability System (fase Kapabilitas,
// referensi arsitektur OpenConnector: catalog -> connection/auth -> action
// schema -> execution -> policy -> audit).
//
// Prinsip keamanan (sesuai invarian AGENTS.md):
// - Policy adherence di boundary: keputusan approval tidak pernah dibuat model;
//   sumber kebenarannya adalah tool/connector itu sendiri (needsApproval) —
//   satu sumber, tanpa duplikasi daftar keyword berbahaya.
// - Fail-fast: connector/action yang tidak ada melempar error eksplisit,
//   tidak pernah sukses palsu.
// - Audit append-only pada setiap eksekusi (request + hasil), tersimpan di
//   XDG (connections.mjs).
// - Load-when-needed: catalog di-import lazy; sidecar startup tetap instan.

import { listConnectors, getConnector, getActionGuide } from './catalog.mjs'
import { appendAudit, readAudit, readConnections, writeConnections } from './connections.mjs'

export { listConnectors, getConnector, getActionGuide, readAudit }

// ------------------------------------------------------------- policy

/**
 * Evaluasi policy sebuah aksi SEBELUM eksekusi.
 * Sumber kebenaran approval = connector itu sendiri (declared.requiresApproval),
 * ditambah opsi deny eksplisit dari pemanggil (deniedScopes) untuk caller yang
 * punya konteks keterbatasan sendiri (mis. sub-agent dengan scope terbatas).
 * Model/AI tidak bisa meng-approve dirinya — hasil sini hanya menjelaskan
 * KENAPA diblok, keputusan approval tetap di gate di atasnya (rfd native).
 */
export function resolvePolicy(connector, action, { deniedScopes } = {}) {
  const actionScopes = action.scopes || []
  const denied = Array.isArray(deniedScopes) ? deniedScopes : []
  const deniedHit = actionScopes.find((s) => denied.includes(s))
  if (deniedHit) {
    return {
      allowed: false,
      approvalRequired: false,
      reason: `Scope "${deniedHit}" dilarang oleh konteks pemanggil.`,
      deniedScope: deniedHit
    }
  }
  const approvalRequired = !!connector.requiresApproval
  return {
    allowed: true,
    approvalRequired,
    reason: approvalRequired
      ? connector.approvalMessage ||
        `Aksi connector "${connector.id}" membutuhkan persetujuan user.`
      : null
  }
}

// ------------------------------------------------------------- execute

/**
 * Eksekusi satu aksi connector dengan policy + audit.
 * @param {object} p
 * @param {string} p.connectorId   id connector (mis. 'fs', 'weather', 'shell-tool')
 * @param {string} p.actionId      id aksi dalam connector (mis. 'read', 'current')
 * @param {object} [p.args]        argumen aksi sesuai inputSchema
 * @param {string} [p.sessionId]   konteks pemanggil (mis. id sub-agent) untuk audit
 * @param {string[]} [p.deniedScopes] scope yang dilarang konteks pemanggil
 */
export async function executeCapability({ connectorId, actionId, args, sessionId, deniedScopes }) {
  const connector = getConnector(connectorId)
  if (!connector) {
    throw new Error(`Connector tidak dikenal: ${connectorId} (lihat capabilities:list)`)
  }
  const action = connector.actions[String(actionId || '')]
  if (!action) {
    throw new Error(
      `Aksi tidak dikenal pada connector ${connectorId}: ${actionId} (lihat capabilities:guide)`
    )
  }

  const policy = resolvePolicy(connector, action, { deniedScopes })
  appendAudit({
    op: 'execute.request',
    connector: connectorId,
    action: String(actionId),
    session: sessionId || null,
    policy
  })

  if (!policy.allowed) {
    const e = new Error(policy.reason)
    e.code = 'CAPABILITY_POLICY_DENIED'
    appendAudit({
      op: 'execute.result',
      connector: connectorId,
      action: String(actionId),
      status: 'policy-denied'
    })
    throw e
  }
  if (policy.approvalRequired) {
    // Sengaja dilempar (bukan sukses palsu): gate approval di atas channel ini
    // (rfd native di Rust main thread) yang memutuskan. Pesan disertakan agar
    // dialog menampilkan alasan yang tepat.
    const e = new Error(policy.reason)
    e.code = 'CAPABILITY_APPROVAL_REQUIRED'
    appendAudit({
      op: 'execute.result',
      connector: connectorId,
      action: String(actionId),
      status: 'approval-required'
    })
    throw e
  }

  try {
    const result = await action.run(String(actionId), args || {}, {
      sessionId: sessionId || null,
      audit: appendAudit
    })
    appendAudit({
      op: 'execute.result',
      connector: connectorId,
      action: String(actionId),
      status: 'ok',
      session: sessionId || null
    })
    return result
  } catch (err) {
    appendAudit({
      op: 'execute.result',
      connector: connectorId,
      action: String(actionId),
      status: 'error',
      error: String(err?.message || err).slice(0, 300),
      session: sessionId || null
    })
    throw err
  }
}

// --------------------------------------------------------- connections

/**
 * Authorize sebuah connector. Connector built-in saat ini connection-less
 * (scopes kosong, tanpa kredensial), jadi authorize eksplisit: bila connector
 * memang butuh koneksi, catat scopes yang diberikan ke connections.json
 * (mode 0600); bila tidak, kembalikan status connection-less yang jujur.
 */
export function authorizeConnector(connectorId, grantedScopes = []) {
  const connector = getConnector(connectorId)
  if (!connector) throw new Error(`Connector tidak dikenal: ${connectorId}`)
  if (!connector.scopes?.length) {
    appendAudit({ op: 'authorize', connector: connectorId, status: 'connectionless' })
    return { connectionless: true, grantedScopes: [] }
  }
  const valid = grantedScopes.filter((s) => connector.scopes.includes(s))
  const map = readConnections()
  map[connectorId] = { scopes: valid, authorizedAt: new Date().toISOString() }
  writeConnections(map)
  appendAudit({ op: 'authorize', connector: connectorId, scopes: valid, status: 'ok' })
  return { connectionless: false, grantedScopes: valid }
}

/** Lepas koneksi/otorisasi connector (hapus entri koneksi + jejak audit). */
export function revokeConnector(connectorId) {
  const connector = getConnector(connectorId)
  if (!connector) throw new Error(`Connector tidak dikenal: ${connectorId}`)
  const map = readConnections()
  if (!(connectorId in map)) {
    appendAudit({ op: 'revoke', connector: connectorId, status: 'not-found' })
    return { revoked: false }
  }
  delete map[connectorId]
  writeConnections(map)
  appendAudit({ op: 'revoke', connector: connectorId, status: 'ok' })
  return { revoked: true }
}

/** Daftar koneksi aktif (untuk UI/inspeksi; tanpa kredensial — hanya scopes). */
export function listConnections() {
  return readConnections()
}
