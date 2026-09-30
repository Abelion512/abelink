// Registry terpadu CapabilityDescriptor: connectors + MCP custom + plugins + skills.
// Satu sumber untuk blok prompt registry (planning.ts) dan validasi bundle.
// Prinsip: tidak pernah throw — sumber yang gagal / deskriptor invalid hanya
// dibuang dengan console.warn. Lazy-import agar tidak ada siklus modul dan
// startup sidecar tetap instan.
import { validateDescriptor, normalizeDescriptor } from './descriptor.ts'
import type { CapabilityDescriptor } from './descriptor.ts'

const san = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed'

const pushValid = (out: CapabilityDescriptor[], d: unknown) => {
  try {
    const v = validateDescriptor(d)
    if (!v.ok) {
      console.warn('[registry] descriptor invalid dibuang:', (d as { id?: string })?.id, v.errors.join('; '))
      return
    }
    out.push(normalizeDescriptor(d as CapabilityDescriptor))
  } catch (e) {
    console.warn('[registry] descriptor gagal dibangun:', (e as Error)?.message)
  }
}

const GUIDE_UNAUTHORIZED = ['Otorisasi dulu di Capabilities']

export async function listRegistry(): Promise<CapabilityDescriptor[]> {
  const out: CapabilityDescriptor[] = []

  // ---- connectors (built-in katalog + runtime MCP custom) ----
  try {
    const { CONNECTORS } = await import('./catalog.ts')
    const { readConnections } = await import('./connections.ts')
    let stored = {}
    try {
      stored = (await readConnections()) || {}
    } catch {
      stored = {}
    }
    for (const [connId, cRaw] of CONNECTORS as unknown as Map<string, Record<string, unknown>>) {
      const c = cRaw as Record<string, any>
      if (!c || typeof c !== 'object') continue
      // Transport MCP: proyeksikan tools tersimpan bila sudah diotorisasi,
      // bila belum — satu deskriptor penunjuk otorisasi (fail-fast jujur).
      if (c.transport === 'mcp') {
        const conn = (stored as Record<string, Record<string, unknown>>)?.[connId]
        const tools = conn?.url && Array.isArray(conn.tools) ? (conn.tools as Array<Record<string, unknown>>) : null
        if (tools?.length) {
          for (const tRaw of tools) {
            const t = tRaw as Record<string, unknown>
            if (!t || !t.name) continue
            pushValid(out, {
              id: `${san(connId)}:${san(t.name)}`,
              kind: 'connector',
              description: String(t.description || `Aksi MCP ${t.name} (${connId})`),
              inputSchema:
                (t.inputSchema as { type?: string }) && (t.inputSchema as { type?: string }).type === 'object'
                  ? (t.inputSchema as CapabilityDescriptor['inputSchema'])
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
      for (const [actionId, aRaw] of Object.entries(c.actions || {})) {
        const a = aRaw as Record<string, any>
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
    console.warn('[registry] connectors gagal:', (e as Error)?.message)
  }

  // ---- plugins (satu deskriptor per action via pluginToDescriptors) ----
  try {
    const { loadPlugins, pluginToDescriptors } = await import('../plugins/plugin-loader.ts')
    const manifests = ((await loadPlugins()) || []) as Record<string, unknown>[]
    for (const m of manifests) {
      for (const d of pluginToDescriptors(m) || []) pushValid(out, d)
    }
  } catch (e) {
    console.warn('[registry] plugins gagal:', (e as Error)?.message)
  }

  // ---- skills (via listSkillsMeta + skillToDescriptor) ----
  try {
    const { listSkillsMeta, skillToDescriptor } = await import(
      '../../engine/channels/skills.ts'
    )
    const metas = ((await listSkillsMeta()) || []) as Record<string, unknown>[]
    for (const s of metas) {
      const d = skillToDescriptor(s)
      if (d) pushValid(out, d)
      else console.warn('[registry] skill invalid dibuang:', s?.name)
    }
  } catch (e) {
    console.warn('[registry] skills gagal:', (e as Error)?.message)
  }

  return out
}
