import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { app, ipcMain, shell } from 'electron'
import { execSync } from 'child_process'

const _require = createRequire(import.meta.url)

let loadedPlugins = []
let pluginHandlers = {}

/** Cache of lazy-loaded plugin modules: pluginName → module exports */
const pluginModuleCache = new Map()

export const getPluginsDir = () => {
  const docPath = app.getPath('documents')
  const pluginDir = path.join(docPath, 'Mark Plugins')
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true })
  }
  return pluginDir
}

/**
 * Load only plugin manifests at boot — no module imports.
 * import() happens lazily on first plugin:execute call.
 */
export const loadPlugins = async () => {
  const pluginDir = getPluginsDir()
  loadedPlugins = []

  const folders = fs.readdirSync(pluginDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  for (const folder of folders) {
    const pluginPath = path.join(pluginDir, folder)
    const manifestPath = path.join(pluginPath, 'plugin.json')
    const indexPath = path.join(pluginPath, 'index.js')

    if (fs.existsSync(manifestPath) && fs.existsSync(indexPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        manifest.folderPath = pluginPath
        manifest.indexPath = indexPath
        loadedPlugins.push(manifest)
      } catch (err) {
        console.error(`Gagal load manifest plugin ${folder}:`, err)
      }
    }
  }
  return loadedPlugins
}

/**
 * Lazily import a plugin module — only on first execution.
 * Cached for subsequent calls.
 */
async function ensurePluginLoaded(indexPath) {
  if (pluginModuleCache.has(indexPath)) return pluginModuleCache.get(indexPath)
  delete _require.cache[_require.resolve(indexPath)]
  const moduleUrl = fileURLToPath(indexPath) + '?t=' + Date.now()
  const handler = await import(moduleUrl)
  pluginModuleCache.set(indexPath, handler)
  return handler
}

export const getLoadedPlugins = () => loadedPlugins
export const getPluginHandlers = () => pluginHandlers

// Inisialisasi IPC Bridge
export const initPluginIPC = () => {
  ipcMain.handle('plugin:get-list', () => loadedPlugins.map(p => ({
    name: p.name,
    version: p.version,
    description: p.description,
    isEnabled: p.isEnabled,
    actions: p.actions || [],
    folderPath: p.folderPath
  })))

  ipcMain.handle('plugin:execute', async (event, action, query) => {
    // Find which plugin owns this action
    const plugin = loadedPlugins.find(p =>
      p.actions && p.actions.some(a => a.name === action)
    )
    if (!plugin) return { success: false, error: 'Action tidak ditemukan' }

    try {
      const handler = await ensurePluginLoaded(plugin.indexPath)
      if (handler.default && handler.default[action]) {
        const result = await handler.default[action]({ query })
        return { success: true, data: result }
      }
      return { success: false, error: `Handler '${action}' not found in plugin module` }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('plugin:open-folder', () => {
    shell.openPath(getPluginsDir())
  })

  ipcMain.handle('plugin:toggle', async (event, pluginName, isEnabled) => {
    const pluginPath = path.join(getPluginsDir(), pluginName)
    const manifestPath = path.join(pluginPath, 'plugin.json')
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      manifest.isEnabled = isEnabled
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      // Clear plugin module cache so it reloads on next execute
      const idx = loadedPlugins.findIndex(p => p.name === pluginName)
      if (idx !== -1) {
        const indexPath = loadedPlugins[idx].indexPath
        delete _require.cache[_require.resolve(indexPath)]
        pluginModuleCache.delete(indexPath)
      }
      await loadPlugins()
      return { success: true }
    }
    return { success: false, error: 'Plugin not found' }
  })

  ipcMain.handle('plugin:open-specific-folder', (event, targetPath) => {
    shell.openPath(targetPath)
  })

  ipcMain.handle('plugin:reload', async () => {
    pluginModuleCache.clear()
    return await loadPlugins()
  })

  ipcMain.handle('plugin:create', async (event, payload) => {
    try {
      const { name, description, actions, isEdit } = payload
      const kebabPluginName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

      const pDir = getPluginsDir()
      const newPluginDir = path.join(pDir, kebabPluginName)

      if (!isEdit && fs.existsSync(newPluginDir)) {
        return { success: false, error: 'Plugin dengan nama tersebut sudah ada' }
      }

      fs.mkdirSync(newPluginDir, { recursive: true })

      const manifestActions = actions.map(act => ({
        name: act.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
        description: act.description,
        triggerHint: act.triggerHint,
        code: act.code
      }))

      const manifest = {
        name: kebabPluginName,
        version: "1.0.0",
        description: description,
        dependencies: payload.dependencies ? payload.dependencies.split(',').map(d => d.trim()).filter(d => d) : [],
        actions: manifestActions
      }

      fs.writeFileSync(path.join(newPluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2))

      let codeTemplate = `module.exports = {\n`
      actions.forEach((act, index) => {
        const actionKebabName = act.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
        codeTemplate += `  '${actionKebabName}': async ({ query }) => {\n${act.code.split('\\n').map(line => '    ' + line).join('\\n')}\n  }`
        if (index < actions.length - 1) codeTemplate += `,\n`
        else codeTemplate += `\n`
      })
      codeTemplate += `}`

      fs.writeFileSync(path.join(newPluginDir, 'index.js'), codeTemplate)

      // Install dependencies if specified
      if (manifest.dependencies.length > 0) {
        try {
          if (!fs.existsSync(path.join(newPluginDir, 'package.json'))) {
            execSync('npm init -y', { cwd: newPluginDir, stdio: 'ignore' })
          }
          execSync(`npm install ${manifest.dependencies.join(' ')}`, { cwd: newPluginDir, stdio: 'ignore' })
        } catch (npmErr) {
          console.error('Gagal install dependencies:', npmErr)
          return { success: false, error: 'Gagal menginstall dependencies npm: ' + npmErr.message }
        }
      }

      await loadPlugins()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
