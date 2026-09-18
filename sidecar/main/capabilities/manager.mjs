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

import { listConnectors, getConnector, getActionGuide, registerConnector } from './catalog.mjs'
import { appendAudit, readAudit, readConnections, writeConnections } from './connections.mjs'
import { validateArgs } from './validation.mjs'
import fs from 'fs'
import path from 'path'
import { brandDir } from '../utils/dataHome.mjs'

export { listConnectors, getConnector, getActionGuide, readAudit, registerConnector }

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
 * @param {string} p.connectorId   id connector (mis. 'fs', 'weather', 'shell-tool'),
 *                                 atau 'plugin' / 'skill' untuk rute terpadu
 * @param {string} p.actionId      id aksi dalam connector (mis. 'read', 'current');
 *                                 untuk 'plugin': `<plugin>:<aksi>` atau bare `<aksi>`;
 *                                 untuk 'skill': nama skill
 * @param {object|string} [p.args] argumen aksi sesuai inputSchema
 *                                 (plugin: string legacy dibungkus {query})
 * @param {string} [p.sessionId]   konteks pemanggil (mis. id sub-agent) untuk audit
 * @param {string[]} [p.deniedScopes] scope yang dilarang konteks pemanggil
 */
export async function executeCapability({ connectorId, actionId, args, sessionId, deniedScopes }) {
  if (connectorId === 'plugin') return executePluginAction({ actionId, args, sessionId })
  if (connectorId === 'skill') return executeSkillRead({ actionId, sessionId })
  const connector = getConnector(connectorId)
  if (!connector) {
    throw new Error(`Connector tidak dikenal: ${connectorId} (lihat capabilities:list)`)
  }
  if (connector.transport === 'mcp') {
    // MCP transport (Fase F3): kredensial+endpoint dibaca dari koneksi yang
    // tersimpan (bukan dari argumen model) — model hanya boleh menyebut nama tool.
    const map = await readConnections()
    const conn = map[connectorId]
    if (!conn?.url) {
      const e = new Error(`Connector MCP '${connectorId}' belum diotorisasi. Otorisasi dulu di Capabilities.`)
      e.code = 'MCP_NOT_AUTHORIZED'
      throw e
    }
    const { callMcpTool } = await import('./mcp-client.mjs')
    appendAudit({ op: 'execute.request', connector: connectorId, action: String(actionId), session: sessionId || null, transport: 'mcp' })
    // Tahap 4: validasi args terhadap inputSchema tool MCP tersimpan
    // (fail-open bila skema longgar; menolak sebelum panggilan jaringan).
    const storedTool = Array.isArray(conn.tools)
      ? conn.tools.find((t) => String(t?.name) === String(actionId))
      : null
    const mcpChecked = validateArgs(storedTool?.inputSchema, args || {})
    if (!mcpChecked.ok) {
      const e = new Error(
        `Argumen tidak valid untuk ${connectorId}.${actionId}: ${mcpChecked.errors.join('; ')}`
      )
      e.code = 'CAPABILITY_INVALID_ARGS'
      appendAudit({ op: 'execute.result', connector: connectorId, action: String(actionId), status: 'invalid-args', error: mcpChecked.errors.join('; ').slice(0, 300), session: sessionId || null, transport: 'mcp' })
      throw e
    }
    try {
      const text = await callMcpTool(conn.url, conn.headers || {}, String(actionId), args || {})
      appendAudit({ op: 'execute.result', connector: connectorId, action: String(actionId), status: 'ok', session: sessionId || null, transport: 'mcp' })
      return text
    } catch (err) {
      appendAudit({ op: 'execute.result', connector: connectorId, action: String(actionId), status: 'error', error: String(err?.message || err).slice(0, 300), session: sessionId || null, transport: 'mcp' })
      throw err
    }
  }
  const action = connector.actions[String(actionId || '')]
  if (!action) {
    throw new Error(
      `Aksi tidak dikenal pada connector ${connectorId}: ${actionId} (lihat capabilities:guide)`
    )
  }

  // Tahap 4: validasi args terhadap inputSchema SEBELUM run (fail-fast,
  // bukan sukses palsu). Skema tak dikenal -> fail-open (validateArgs ok).
  const checked = validateArgs(action.inputSchema, args || {})
  if (!checked.ok) {
    const e = new Error(
      `Argumen tidak valid untuk ${connectorId}.${actionId}: ${checked.errors.join('; ')}`
    )
    e.code = 'CAPABILITY_INVALID_ARGS'
    await appendAudit({
      op: 'execute.result',
      connector: connectorId,
      action: String(actionId),
      status: 'invalid-args',
      error: checked.errors.join('; ').slice(0, 300),
      session: sessionId || null
    })
    throw e
  }

  const policy = resolvePolicy(connector, action, { deniedScopes })
  await appendAudit({
    op: 'execute.request',
    connector: connectorId,
    action: String(actionId),
    session: sessionId || null,
    policy
  })

  if (!policy.allowed) {
    const e = new Error(policy.reason)
    e.code = 'CAPABILITY_POLICY_DENIED'
    await appendAudit({
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
    await appendAudit({
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
    await appendAudit({
      op: 'execute.result',
      connector: connectorId,
      action: String(actionId),
      status: 'ok',
      session: sessionId || null
    })
    return result
  } catch (err) {
    await appendAudit({
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

// --------------------------------------------------------- plugin + skill

// Rute 'plugin': actionId `<plugin>:<aksi>` atau bare `<aksi>` (scan unik).
// Handler plugin menerima SATU objek args penuh ({query} = legacy); manager
// mengembalikan nilai mentah handler, pembungkus {success,data} milik channel.
async function executePluginAction({ actionId, args, sessionId }) {
  const { getLoadedPlugins, getPluginHandlers, loadPlugins, pluginToDescriptors } = await import(
    '../plugins/plugin-loader.js'
  )
  await loadPlugins()
  const manifests = getLoadedPlugins()
  const handlers = getPluginHandlers()
  const raw = String(actionId || '').trim()
  let pluginName = null
  let actionName = raw
  if (raw.includes(':')) {
    const i = raw.indexOf(':')
    pluginName = raw.slice(0, i).trim().toLowerCase()
    actionName = raw.slice(i + 1).trim().toLowerCase()
  }
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '-')
  const candidates = []
  for (const m of manifests) {
    if (!m || !m.name || !Array.isArray(m.actions)) continue
    for (const act of m.actions) {
      if (!act?.name) continue
      const match = pluginName
        ? norm(m.name) === norm(pluginName) && norm(act.name) === norm(actionName)
        : norm(act.name) === norm(actionName)
      if (match) candidates.push({ plugin: m.name, action: act.name, manifest: m })
    }
  }
  await appendAudit({
    op: 'execute.request',
    connector: 'plugin',
    action: raw,
    session: sessionId || null
  })
  const fail = async (err) => {
    await appendAudit({
      op: 'execute.result',
      connector: 'plugin',
      action: raw,
      status: 'error',
      error: String(err?.message || err).slice(0, 300),
      session: sessionId || null
    })
    throw err
  }
  if (!candidates.length) {
    const known = manifests.flatMap((m) =>
      (m.actions || []).map((a) => `${m.name}:${a.name}`)
    )
    return fail(
      new Error(
        `Aksi plugin tidak dikenal: '${raw}'` +
          (known.length ? ` (kandidat: ${known.join(', ')})` : ' (tidak ada plugin terpasang)') +
          ` (lihat plugins:list)`
      )
    )
  }
  if (candidates.length > 1) {
    const list = candidates.map((c) => `${c.plugin}:${c.action}`).join(', ')
    return fail(new Error(`Aksi plugin '${raw}' ambigu (kandidat: ${list}); gunakan format <plugin>:<aksi>.`))
  }
  const hit = candidates[0]
  const descriptors = pluginToDescriptors(hit.manifest)
  const enabled = descriptors.length
    ? descriptors.every((d) => d.enabled !== false)
    : hit.manifest.isEnabled !== false
  if (!enabled) {
    const e = new Error(`Plugin '${hit.plugin}' dinonaktifkan (isEnabled=false).`)
    e.code = 'CAPABILITY_POLICY_DENIED'
    await appendAudit({
      op: 'execute.result',
      connector: 'plugin',
      action: raw,
      status: 'policy-denied',
      session: sessionId || null
    })
    throw e
  }
  const handler =
    handlers[hit.action] ||
    handlers[`${hit.plugin}:${hit.action}`] ||
    handlers[`${norm(hit.plugin)}:${norm(hit.action)}`]
  if (typeof handler !== 'function') {
    return fail(new Error(`Handler plugin tidak ditemukan: '${hit.plugin}:${hit.action}'.`))
  }
  const params = typeof args === 'string' ? { query: args } : args || {}
  // Tahap 4: validasi params terhadap inputSchema deskriptor aksi yang kena
  // (pluginToDescriptors bangun properties dari parameters manifes). Tanpa
  // parameters, skema = {query: string} dan string legacy sudah dibungkus.
  // Cari di daftar aksi tervalidasi yang SAMA urutannya dengan descriptors
  // (bukan indeks mentah manifest — aksi tanpa nama difilter loader).
  const validActions = (hit.manifest.actions || []).filter((a) => a && typeof a === 'object' && a.name)
  const hitIdx = validActions.findIndex((a) => norm(a.name) === norm(hit.action))
  const hitSchema = hitIdx >= 0 ? descriptors[hitIdx]?.inputSchema : null
  const checked = validateArgs(hitSchema, params)
  if (!checked.ok) {
    const e = new Error(
      `Argumen tidak valid untuk plugin ${hit.plugin}:${hit.action}: ${checked.errors.join('; ')}`
    )
    e.code = 'CAPABILITY_INVALID_ARGS'
    await appendAudit({
      op: 'execute.result',
      connector: 'plugin',
      action: raw,
      status: 'invalid-args',
      error: checked.errors.join('; ').slice(0, 300),
      session: sessionId || null
    })
    throw e
  }
  try {
    const result = await handler(params)
    await appendAudit({
      op: 'execute.result',
      connector: 'plugin',
      action: raw,
      status: 'ok',
      session: sessionId || null
    })
    return result
  } catch (err) {
    return fail(err)
  }
}

// Rute 'skill': skill = injeksi prompt, bukan exec — kembalikan body SKILL.md
// (folder SKILL.md -> standalone .md -> null). Manager balikan teks mentah.
async function executeSkillRead({ actionId, sessionId }) {
  const name = String(actionId || '').trim()
  await appendAudit({
    op: 'execute.request',
    connector: 'skill',
    action: name,
    session: sessionId || null
  })
  const fail = async (err) => {
    await appendAudit({
      op: 'execute.result',
      connector: 'skill',
      action: name,
      status: 'error',
      error: String(err?.message || err).slice(0, 300),
      session: sessionId || null
    })
    throw err
  }
  if (!name) return fail(new Error('Nama skill kosong.'))
  const dir = path.join(brandDir(), 'skills')
  for (const cand of [path.join(dir, name, 'SKILL.md'), path.join(dir, `${name}.md`)]) {
    try {
      const body = await fs.promises.readFile(cand, 'utf8')
      await appendAudit({
        op: 'execute.result',
        connector: 'skill',
        action: name,
        status: 'ok',
        session: sessionId || null
      })
      return body
    } catch (e) {
      if (e?.code !== 'ENOENT') return fail(e)
    }
  }
  return fail(new Error(`Skill '${name}' tidak ditemukan di folder skills.`))
}

// --------------------------------------------------------- connections

/**
 * Authorize sebuah connector. Connector built-in saat ini connection-less
 * (scopes kosong, tanpa kredensial), jadi authorize eksplisit: bila connector
 * memang butuh koneksi, catat scopes yang diberikan ke connections.json
 * (mode 0600); bila tidak, kembalikan status connection-less yang jujur.
 */
export async function authorizeConnector(connectorId, grantedScopes = []) {
  const connector = getConnector(connectorId)
  if (!connector) throw new Error(`Connector tidak dikenal: ${connectorId}`)
  if (connector.transport === 'mcp') {
    // Custom MCP: probe tools/list sebagai validasi endpoint SEKALIGUS
    // discovery (gagal = pesan jelas, bukan sukses palsu). URL+header+tools
    // tersimpan di connections.json 0600 untuk dipakai execute.
    const { listMcpTools } = await import('./mcp-client.mjs')
    let tools
    try {
      tools = await listMcpTools(connector.url, connector.headers || {})
    } catch (e) {
      const err = new Error(`MCP '${connectorId}' tidak terjangkau: ${e.message}`)
      err.code = 'MCP_UNREACHABLE'
      appendAudit({ op: 'authorize', connector: connectorId, status: 'error', error: String(e?.message || e).slice(0, 300) })
      throw err
    }
    const map = await readConnections()
    map[connectorId] = {
      url: connector.url,
      headers: connector.headers || {},
      tools,
      authorizedAt: new Date().toISOString()
    }
    await writeConnections(map)
    appendAudit({ op: 'authorize', connector: connectorId, status: 'ok', transport: 'mcp', toolCount: tools.length })
    return { connectionless: false, grantedScopes: [], transport: 'mcp', tools }
  }
  if (!connector.scopes?.length) {
    await appendAudit({ op: 'authorize', connector: connectorId, status: 'connectionless' })
    return { connectionless: true, grantedScopes: [] }
  }
  const valid = grantedScopes.filter((s) => connector.scopes.includes(s))
  const map = await readConnections()
  map[connectorId] = { scopes: valid, authorizedAt: new Date().toISOString() }
  await writeConnections(map)
  await appendAudit({ op: 'authorize', connector: connectorId, scopes: valid, status: 'ok' })
  return { connectionless: false, grantedScopes: valid }
}

/** Lepas koneksi/otorisasi connector (hapus entri koneksi + jejak audit). */
export async function revokeConnector(connectorId) {
  const connector = getConnector(connectorId)
  if (!connector) throw new Error(`Connector tidak dikenal: ${connectorId}`)
  const map = await readConnections()
  if (!(connectorId in map)) {
    await appendAudit({ op: 'revoke', connector: connectorId, status: 'not-found' })
    return { revoked: false }
  }
  delete map[connectorId]
  await writeConnections(map)
  await appendAudit({ op: 'revoke', connector: connectorId, status: 'ok' })
  return { revoked: true }
}

/**
 * Daftar koneksi aktif untuk UI/inspeksi — SELALU disanitasi: TIDAK PERNAH
 * headers/kredensial/token. Per id hanya: authorizedAt, scopes, urlHost
 * (hostname saja, tanpa path/query), toolCount, transport.
 */
export async function listConnections() {
  const map = await readConnections()
  const out = {}
  for (const [id, conn] of Object.entries(map || {})) {
    if (!conn || typeof conn !== 'object') continue
    const entry = {}
    if (conn.authorizedAt) entry.authorizedAt = conn.authorizedAt
    if (Array.isArray(conn.scopes)) entry.scopes = conn.scopes
    if (typeof conn.url === 'string' && conn.url) {
      try {
        entry.urlHost = new URL(conn.url).hostname
      } catch {
        // URL tidak parseable: jangan bocorkan mentahnya — tandai saja.
        entry.urlHost = '(invalid-url)'
      }
    }
    if (Array.isArray(conn.tools)) entry.toolCount = conn.tools.length
    if (conn.transport) entry.transport = conn.transport
    else if (conn.url) entry.transport = 'mcp'
    out[id] = entry
  }
  return out
}
