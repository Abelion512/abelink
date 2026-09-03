// Channel: plugin system, Google services, Workspace RAG, awareness tracker.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
import { on, lazy } from '../registry.mjs'

const getPl = lazy(() => import('../../main/plugins/plugin-loader.js'))
const getGsvc = lazy(() => import('../../main/google/google-service.js'))
const getWs = lazy(() => import('../../main/workspace-rag.js'))
const getTracker = lazy(() => import('../../main/awareness/window-tracker.js'))

// ------------------------------------------------------- Plugins (fase B: tanpa Electron)
// Loader lama memakai ipcMain.handle — di Tauri channel-nya didaftarkan langsung di sini.
on('plugin:execute', async (action, query) => (await getPl()).pluginExecute(action, query))
on('plugin:open-folder', async () => (await getPl()).pluginOpenFolder())
on('plugin:open-specific-folder', async (targetPath) => (await getPl()).pluginOpenSpecificFolder(targetPath))
on('plugin:toggle', async (pluginName, isEnabled) => (await getPl()).pluginToggle(pluginName, isEnabled))
on('plugin:reload', async () => (await getPl()).pluginReload())
on('plugin:create', async (payload) => (await getPl()).pluginCreate(payload))
on('plugin:delete', async (pluginName) => (await getPl()).pluginDelete(pluginName))

// Listing metadata saja (nama/deskripsi/actions) — kode plugin tidak dieksekusi
// di jalur ini; eksekusi tetap fase C4 (Web Worker sandbox, load-when-needed).
on('plugins:list', async () => {
  const pl = await getPl()
  await pl.loadPlugins()
  return pl.getLoadedPlugins()
})

// ------------------------------------------------------------------ Google
on('google:connect', async (clientId, clientSecret) => {
  try {
    await (await getGsvc()).connectGoogle(clientId, clientSecret)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
on('google:disconnect', async () => (await getGsvc()).disconnectGoogle())
on('google:status', async () => (await getGsvc()).getGoogleStatus())

// ------------------------------------------------------- Workspace RAG (.mark)
on('workspace:index', async (root) => (await getWs()).indexWorkspace(root))
on(
  'workspace:query',
  async ({ workspaceRoot, queryText, topK }) => (await getWs()).queryCodebase(workspaceRoot, queryText, topK)
)
on('workspace:get-memory', async (root) => (await getWs()).readWorkingMemory(root))
on(
  'workspace:save-memory',
  async ({ workspaceRoot, memoryData }) => (await getWs()).saveWorkingMemory(workspaceRoot, memoryData)
)
on('workspace:ensure', async (root) => (await getWs()).ensureMarkWorkspace(root))

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
