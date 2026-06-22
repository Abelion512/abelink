import fs from 'fs'
import path from 'path'
import { app, ipcMain, shell } from 'electron'

let loadedPlugins = []
let pluginHandlers = {}

export const getPluginsDir = () => {
  const docPath = app.getPath('documents')
  const pluginDir = path.join(docPath, 'Mark Plugins')
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true })
  }
  return pluginDir
}

export const loadPlugins = async () => {
  const pluginDir = getPluginsDir()
  loadedPlugins = []
  pluginHandlers = {}

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
        // Gunakan dynamic import (file://) untuk module eksternal di Windows
        const moduleUrl = require('url').pathToFileURL(indexPath).href
        const handler = await import(moduleUrl)
        
        manifest.folderPath = pluginPath
        loadedPlugins.push(manifest)
        
        // Daftarkan semua action ke dictionary global
        if (manifest.actions && Array.isArray(manifest.actions)) {
          manifest.actions.forEach(act => {
             // asumsikan handler di-export secara default
             if (handler.default && handler.default[act.name]) {
               pluginHandlers[act.name] = handler.default[act.name]
             }
          })
        }
      } catch (err) {
        console.error(`Gagal load plugin ${folder}:`, err)
      }
    }
  }
  return loadedPlugins
}

export const getLoadedPlugins = () => loadedPlugins
export const getPluginHandlers = () => pluginHandlers

// Inisialisasi IPC Bridge
export const initPluginIPC = () => {
  ipcMain.handle('plugin:get-list', () => loadedPlugins)
  
  ipcMain.handle('plugin:execute', async (event, action, query) => {
    if (pluginHandlers[action]) {
      try {
        const result = await pluginHandlers[action]({ query })
        return { success: true, data: result }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }
    return { success: false, error: 'Action tidak ditemukan' }
  })

  ipcMain.handle('plugin:open-folder', () => {
    shell.openPath(getPluginsDir())
  })
  
  ipcMain.handle('plugin:reload', async () => {
    return await loadPlugins()
  })

  ipcMain.handle('plugin:create', async (event, payload) => {
    try {
      const { name, description, actions } = payload
      const kebabPluginName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
      
      const pDir = getPluginsDir()
      const newPluginDir = path.join(pDir, kebabPluginName)
      
      if (fs.existsSync(newPluginDir)) {
        return { success: false, error: 'Plugin dengan nama tersebut sudah ada' }
      }
      
      fs.mkdirSync(newPluginDir, { recursive: true })
      
      const manifestActions = actions.map(act => ({
        name: act.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
        description: act.description,
        triggerHint: act.triggerHint
      }))

      const manifest = {
        name: kebabPluginName,
        version: "1.0.0",
        description: description,
        actions: manifestActions
      }
      
      fs.writeFileSync(path.join(newPluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2))
      
      let codeTemplate = `export default {\n`
      actions.forEach((act, index) => {
        const actionKebabName = act.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
        codeTemplate += `  '${actionKebabName}': async ({ query }) => {\n${act.code.split('\\n').map(line => '    ' + line).join('\\n')}\n  }`
        if (index < actions.length - 1) codeTemplate += `,\n`
        else codeTemplate += `\n`
      })
      codeTemplate += `}`
      
      fs.writeFileSync(path.join(newPluginDir, 'index.js'), codeTemplate)
      
      await loadPlugins()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
