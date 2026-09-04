// Channel: Capabilities (Capability Manager — fase Kapabilitas).
// Kontrak kecil ala OpenConnector: list_apps -> inspect -> guide -> execute,
// ditambah audit dan revoke. UI/agent membaca metadata dari sini; tidak ada
// hardcode service di renderer.
//
// KEAMANAN: `capabilities:execute` bisa memicu shell (connector 'shell-tool').
// Gate approval dinamis run-shell tidak bisa diandalkan dari jalur ini
// (hasilnya tidak mengalir lewat native-tool:*), sehingga channel ini
// WAJIB ada di APPROVAL_ACTIONS (cmd_node_bridge.rs) — keputusan approval
// tetap native (rfd) di Rust main thread, bukan di renderer/model.
//
// Load-when-needed: main/capabilities hanya di-import saat channel pertama
// dipakai; startup sidecar tetap instan.

import { on } from '../registry.mjs'

const getManager = lazyManager()

function lazyManager() {
  let p = null
  return () => (p ??= import('../../main/capabilities/manager.mjs'))
}

on('capabilities:list', async () => {
  const { listConnectors } = await getManager()
  return listConnectors()
})

on('capabilities:inspect', async (connectorId) => {
  const { getConnector } = await getManager()
  const c = getConnector(connectorId)
  if (!c) throw new Error(`Connector tidak dikenal: ${connectorId} (lihat capabilities:list)`)
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    scopes: c.scopes,
    actions: Object.entries(c.actions).map(([id, a]) => ({
      id,
      summary: a.summary,
      inputSchema: a.inputSchema,
      scopes: a.scopes || []
    }))
  }
})

on('capabilities:guide', async (connectorId, actionId) => {
  const { getActionGuide } = await getManager()
  const guide = getActionGuide(connectorId, actionId)
  if (!guide) {
    throw new Error(`Aksi tidak dikenal: ${connectorId}.${actionId} (lihat capabilities:inspect)`)
  }
  return guide
})

on('capabilities:execute', async (connectorId, actionId, args, opts) => {
  const { executeCapability } = await getManager()
  return executeCapability({
    connectorId: String(connectorId || ''),
    actionId: String(actionId || ''),
    args: args || {},
    sessionId: opts?.sessionId,
    deniedScopes: opts?.deniedScopes
  })
})

on('capabilities:connections', async () => {
  const { listConnections } = await getManager()
  return listConnections()
})

on('capabilities:authorize', async (connectorId, grantedScopes) => {
  const { authorizeConnector } = await getManager()
  return authorizeConnector(
    String(connectorId || ''),
    Array.isArray(grantedScopes) ? grantedScopes : []
  )
})

on('capabilities:revoke', async (connectorId) => {
  const { revokeConnector } = await getManager()
  return revokeConnector(String(connectorId || ''))
})

on('capabilities:audit', async (limit) => {
  const { readAudit } = await getManager()
  return readAudit(limit)
})
