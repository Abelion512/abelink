// Registry terpadu CapabilityDescriptor: connectors + MCP custom + plugins + skills.
// Satu sumber untuk blok prompt registry (planning.js) dan validasi bundle.
// Prinsip: tidak pernah throw — sumber yang gagal / deskriptor invalid hanya
// dibuang dengan console.warn. Lazy-import agar tidak ada siklus modul dan
// startup sidecar tetap instan.
import { validateDescriptor, normalizeDescriptor } from './descriptor.mjs'

const san = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed'

const pushValid = (out, d) => {
  try {
    const v = validateDescriptor(d)
    if (!v.ok) {
      console.warn('[registry] descriptor invalid dibuang:', d?.id, v.errors.join('; '))
      return
    }
    out.push(normalizeDescriptor(d))
  } catch (e) {
    console.warn('[registry] descriptor gagal dibangun:', e?.message)
  }
}

const GUIDE_UNAUTHORIZED = ['Otorisasi dulu di Capabilities']

export async function listRegistry() {
  const out = []

  // ---- connectors (built-in katalog + runtime MCP custom) ----
  try {
    const { CONNECTORS } = await import('./catalog.mjs')
    const { readConnections } = await import('./connections.mjs')
    let stored = {}
    try {
      stored = (await readConnections()) || {}
    } catch {
      stored = {}
    }
    for (const [connId, c] of CONNECTORS) {
      if (!c || typeof c !== 'object') continue
      // Transport MCP: proyeksikan tools tersimpan bila sudah diotorisasi,
      // bila belum — satu deskriptor penunjuk otorisasi (fail-fast jujur).
      if (c.transport === 'mcp') {
        const conn = stored?.[connId]
        const tools = conn?.url && Array.isArray(conn.tools) ? conn.tools : null
        if (tools?.length) {
          for (const t of tools) {
            if (!t || !t.name) continue
            pushValid(out, {
              id: `${san(connId)}:${san(t.name)}`,
              kind: 'connector',
              description: String(t.description || `Aksi MCP ${t.name} (${connId})`),
              inputSchema:
                t.inputSchema && t.inputSchema.type === 'object'
                  ? t.inputSchema
                  : { type: 'object', properties: {} },
              scopes: [],
              guide: {
                steps: [`Jalankan via connector-run: ${connId}||${t.name}||{...args}`],
                examples: []
              },
              enabled: true,
              source: { type: 'connector', transport: 'mcp' }
            })
          }
        } else {
          pushValid(out, {
            id: san(connId),
            kind: 'connector',
            description: String(c.description || 'Custom MCP Server'),
            inputSchema: { type: 'object', properties: {} },
            scopes: [],
            guide: { steps: GUIDE_UNAUTHORIZED, examples: [] },
            enabled: true,
            source: { type: 'connector', transport: 'mcp' }
          })
        }
        continue
      }
      for (const [actionId, a] of Object.entries(c.actions || {})) {
        if (!a || typeof a !== 'object') {
          console.warn('[registry] aksi invalid dibuang:', `${connId}.${actionId}`)
          continue
        }
        pushValid(out, {
          id: `${san(connId)}:${san(actionId)}`,
          kind: 'connector',
          description: String(a.summary || c.description || ''),
          inputSchema: a.inputSchema ?? { type: 'object', properties: {} },
          scopes: a.scopes ?? [],
          guide: a.guide ?? { steps: [], examples: [] },
          enabled: true,
          source: { type: 'connector' }
        })
      }
    }
  } catch (e) {
    console.warn('[registry] connectors gagal:', e?.message)
  }

  // ---- plugins (satu deskriptor per action via pluginToDescriptors) ----
  try {
    const { loadPlugins, pluginToDescriptors } = await import('../plugins/plugin-loader.js')
    const manifests = (await loadPlugins()) || []
    for (const m of manifests) {
      for (const d of pluginToDescriptors(m) || []) pushValid(out, d)
    }
  } catch (e) {
    console.warn('[registry] plugins gagal:', e?.message)
  }

  // ---- skills (via listSkillsMeta + skillToDescriptor) ----
  try {
    const { listSkillsMeta, skillToDescriptor } = await import(
      '../../engine/channels/skills.mjs'
    )
    const metas = (await listSkillsMeta()) || []
    for (const s of metas) {
      const d = skillToDescriptor(s)
      if (d) pushValid(out, d)
      else console.warn('[registry] skill invalid dibuang:', s?.name)
    }
  } catch (e) {
    console.warn('[registry] skills gagal:', e?.message)
  }

  return out
}
