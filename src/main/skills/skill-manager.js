import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'

const getSkillDir = () => {
  const dir = path.join(app.getPath('documents'), 'Mark Skills')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export const setupSkillIPC = () => {
  ipcMain.handle('get-skills', async () => {
    try {
      const dir = getSkillDir()
      const files = await fs.promises.readdir(dir)
      return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    } catch (e) {
      console.error('Failed to get skills', e)
      return []
    }
  })

  ipcMain.handle('read-skill', async (event, name) => {
    try {
      const dir = getSkillDir()
      const filePath = path.join(dir, `${name}.md`)
      if (fs.existsSync(filePath)) {
        return await fs.promises.readFile(filePath, 'utf8')
      }
      return ''
    } catch (e) {
      console.error('Failed to read skill', e)
      return ''
    }
  })

  ipcMain.handle('save-skill', async (event, name, content) => {
    try {
      const dir = getSkillDir()
      const filePath = path.join(dir, `${name}.md`)
      await fs.promises.writeFile(filePath, content, 'utf8')
      return true
    } catch (e) {
      console.error('Failed to save skill', e)
      return false
    }
  })

  ipcMain.handle('install-skill', async (event, sourcePath) => {
    try {
      const dir = getSkillDir()
      const fileName = path.basename(sourcePath)
      if (!fileName.endsWith('.md')) return false
      
      const destPath = path.join(dir, fileName)
      await fs.promises.copyFile(sourcePath, destPath)
      return true
    } catch (e) {
      console.error('Failed to install skill', e)
      return false
    }
  })

  ipcMain.handle('delete-skill', async (event, name) => {
    try {
      const dir = getSkillDir()
      const filePath = path.join(dir, `${name}.md`)
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
      }
      return true
    } catch (e) {
      console.error('Failed to delete skill', e)
      return false
    }
  })
}
