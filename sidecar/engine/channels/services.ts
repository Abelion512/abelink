// Channel: plugin system, Google services, Workspace RAG, awareness tracker.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
//
// W1-2 (js-to-ts-spec.md): rename + tipe. Handler param = unknown (kontravari
// HandlerFn); cast type-only di dalam, terhapus saat runtime — perilaku eksak.
import { on, lazy } from '../registry.ts'

type PluginLoaderModule = {
  pluginOpenFolder: () => Promise<unknown>
  pluginOpenSpecificFolder: (targetPath: unknown) => Promise<unknown>
  pluginToggle: (pluginName: unknown, isEnabled: unknown) => Promise<unknown>
  pluginReload: () => Promise<unknown>
  pluginCreate: (payload: unknown) => Promise<unknown>
  pluginDelete: (pluginName: unknown) => Promise<unknown>
  pluginInstallFromGit: (repoUrl: unknown) => Promise<unknown>
  loadPlugins: () => Promise<unknown>
  getLoadedPlugins: () => unknown
}
type GoogleServiceModule = {
  connectGoogle: (clientId: unknown, clientSecret: unknown) => Promise<unknown>
  disconnectGoogle: () => Promise<unknown>
  getGoogleStatus: () => unknown
}
type WorkspaceRagModule = {
  indexWorkspace: (root: unknown) => Promise<unknown>
  queryCodebase: (workspaceRoot: unknown, queryText: unknown, topK: unknown) => Promise<unknown>
  readWorkingMemory: (root: unknown) => Promise<unknown>
  saveWorkingMemory: (workspaceRoot: unknown, memoryData: unknown) => Promise<unknown>
  ensureAbelinkWorkspace: (root: unknown) => Promise<unknown>
}
type WindowTrackerModule = {
  startTracking: () => void
  getBuffer: () => unknown
  flushBuffer: () => unknown
}

const getPl = lazy(async () =>
  (await import('../../main/plugins/plugin-loader.ts')) as unknown as PluginLoaderModule
)
const getGsvc = lazy(async () =>
  (await import('../../main/google/google-service.js')) as unknown as GoogleServiceModule
)
const getWs = lazy(async () =>
  (await import('../../main/workspace-rag.ts')) as unknown as WorkspaceRagModule
)
const getTracker = lazy(async () =>
  (await import('../../main/awareness/window-tracker.ts')) as unknown as WindowTrackerModule
)

// ------------------------------------------------------- Plugins (fase B: tanpa Electron)
// Loader lama memakai ipcMain.handle — di Tauri channel-nya didaftarkan langsung di sini.
// plugin:execute = alias legacy ke rute terpadu capabilities (manager:
// policy + audit). Format action `<plugin>:<aksi>` atau bare `<aksi>`;
// argumen string legacy dibungkus {query} oleh manager.
on('plugin:execute', async (action: unknown, query: unknown) => {
  try {
    const { executeCapability } = await import('../../main/capabilities/manager.ts')
    const args: unknown =
      typeof query === 'string' ? { query } : query && typeof query === 'object' ? query : {}
    const data = await executeCapability({ connectorId: 'plugin', actionId: String(action || ''), args } as Parameters<typeof executeCapability>[0])
    return { success: true, data }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})
on('plugin:open-folder', async () => (await getPl()).pluginOpenFolder())
on('plugin:open-specific-folder', async (targetPath: unknown) =>
  (await getPl()).pluginOpenSpecificFolder(targetPath)
)
on('plugin:toggle', async (pluginName: unknown, isEnabled: unknown) =>
  (await getPl()).pluginToggle(pluginName, isEnabled)
)
on('plugin:reload', async () => (await getPl()).pluginReload())
on('plugin:create', async (payload: unknown) => (await getPl()).pluginCreate(payload))
on('plugin:delete', async (pluginName: unknown) => (await getPl()).pluginDelete(pluginName))
on('plugin:install-git', async (repoUrl: unknown) => (await getPl()).pluginInstallFromGit(repoUrl))

// Listing metadata saja (nama/deskripsi/actions) — kode plugin tidak dieksekusi
// di jalur ini; eksekusi tetap fase C4 (Web Worker sandbox, load-when-needed).
on('plugins:list', async () => {
  const pl = await getPl()
  await pl.loadPlugins()
  return pl.getLoadedPlugins()
})

// ------------------------------------------------------------------ Google
on('google:connect', async (clientId: unknown, clientSecret: unknown) => {
  try {
    await (await getGsvc()).connectGoogle(clientId, clientSecret)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})
on('google:disconnect', async () => (await getGsvc()).disconnectGoogle())
on('google:status', async () => (await getGsvc()).getGoogleStatus())

// ------------------------------------------------------- Workspace RAG (.abelink)
on('workspace:index', async (root: unknown) => (await getWs()).indexWorkspace(root))
on('workspace:query', async (p: unknown) => {
  // Cast type-only; destructure dari undefined tetap throw persis seperti asli.
  const { workspaceRoot, queryText, topK } = p as { workspaceRoot?: unknown; queryText?: unknown; topK?: unknown }
  return (await getWs()).queryCodebase(workspaceRoot, queryText, topK)
})
on('workspace:get-memory', async (root: unknown) => (await getWs()).readWorkingMemory(root))
on('workspace:save-memory', async (p: unknown) => {
  const { workspaceRoot, memoryData } = p as { workspaceRoot?: unknown; memoryData?: unknown }
  return (await getWs()).saveWorkingMemory(workspaceRoot, memoryData)
})
on('workspace:ensure', async (root: unknown) => (await getWs()).ensureAbelinkWorkspace(root))

// ---------------------------------------------------------------- Awareness
// Nama fungsi asli modul: startTracking/getBuffer/flushBuffer. get-buffer
// otomatis memulai tracking sekali (interval polling internal modul).
let trackerStarted = false
on('awareness:get-buffer', async () => {
  const tracker = await getTracker()
  if (!trackerStarted) {
    tracker.startTracking()
    trackerStarted = true
  }
  return tracker.getBuffer()
})
on('awareness:clear-buffer', async () => (await getTracker()).flushBuffer())
