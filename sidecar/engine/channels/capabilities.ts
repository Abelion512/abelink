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
//
// W1-3 (js-to-ts-spec.md): rename + tipe; kontrak manager dianotasi lokal.

import { on } from '../registry.ts'

type ConnectorAction = { summary: unknown; inputSchema: unknown; scopes?: unknown[] }
type ConnectorDef = {
  id: unknown
  name: unknown
  description: unknown
  scopes: unknown
  actions: Record<string, ConnectorAction>
}
type ManagerModule = {
  listConnectors: () => unknown
  getConnector: (id: unknown) => ConnectorDef | null
  getActionGuide: (connectorId: unknown, actionId: unknown) => unknown
  executeCapability: (opts: Record<string, unknown>) => Promise<unknown>
  listConnections: () => unknown
  authorizeConnector: (id: string, scopes: string[]) => Promise<unknown>
  revokeConnector: (id: string) => Promise<unknown>
  readAudit: (limit: unknown, offset: unknown) => Promise<unknown>
  registerConnector: (def: unknown) => Promise<Record<string, unknown>>
}

const getManager = lazyManager()

function lazyManager(): () => Promise<ManagerModule> {
  let p: Promise<ManagerModule> | null = null
  return () => (p ??= import('../../main/capabilities/manager.mjs') as unknown as Promise<ManagerModule>)
}

on('capabilities:list', async () => {
  const { listConnectors } = await getManager()
  return listConnectors()
})

on('capabilities:inspect', async (connectorId: unknown) => {
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

on('capabilities:guide', async (connectorId: unknown, actionId: unknown) => {
  const { getActionGuide } = await getManager()
  const guide = getActionGuide(connectorId, actionId)
  if (!guide) {
    throw new Error(`Aksi tidak dikenal: ${connectorId}.${actionId} (lihat capabilities:inspect)`)
  }
  return guide
})

on('capabilities:execute', async (connectorId: unknown, actionId: unknown, args: unknown, opts: unknown) => {
  const { executeCapability } = await getManager()
  const o = opts as { sessionId?: unknown; deniedScopes?: unknown } | null | undefined
  return executeCapability({
    connectorId: String(connectorId || ''),
    actionId: String(actionId || ''),
    args: args || {},
    sessionId: o?.sessionId,
    deniedScopes: o?.deniedScopes
  })
})

on('capabilities:connections', async () => {
  const { listConnections } = await getManager()
  return listConnections()
})

on('capabilities:authorize', async (connectorId: unknown, grantedScopes: unknown) => {
  const { authorizeConnector } = await getManager()
  return authorizeConnector(
    String(connectorId || ''),
    Array.isArray(grantedScopes) ? grantedScopes : []
  )
})

on('capabilities:revoke', async (connectorId: unknown) => {
  const { revokeConnector } = await getManager()
  return revokeConnector(String(connectorId || ''))
})

on('capabilities:audit', async (limit: unknown, offset: unknown) => {
  const { readAudit } = await getManager()
  return readAudit(limit, offset)
})

on('capabilities:registry', async () => {
  const { listRegistry } = await import('../../main/capabilities/registry.mjs')
  return listRegistry()
})

on('capabilities:bundle-install', async (bundle: unknown) => {
  const { installBundle } = await import('../../main/capabilities/bundles.mjs')
  return installBundle(bundle || {})
})

on('capabilities:bundle-list', async () => {
  const { listBundles } = await import('../../main/capabilities/bundles.mjs')
  return listBundles()
})

on('capabilities:bundle-remove', async (id: unknown) => {
  const { removeBundle } = await import('../../main/capabilities/bundles.mjs')
  return removeBundle(id)
})

// Registrasi runtime connector eksternal (custom MCP dari UI). Dipanggil
// tiap load hub agar sidecar (proses terpisah, tanpa localStorage) mengenal
// id custom sebelum authorize/execute. Idempotent: daftar ulang = replace.
on('capabilities:register-custom', async (list: unknown) => {
  const { registerConnector } = await getManager()
  const out: Array<Record<string, unknown>> = []
  for (const def of Array.isArray(list) ? list : []) {
    try {
      out.push({ ...(await registerConnector(def)), ok: true })
    } catch (e) {
      out.push({ id: (def as { id?: unknown } | null)?.id || null, ok: false, error: (e as Error).message })
    }
  }
  return out
})
