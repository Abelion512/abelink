import fs from 'fs'
import path from 'path'
import { app, ipcMain, dialog } from 'electron'
import matter from 'gray-matter'
import AdmZip from 'adm-zip'

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
      
      const skills = []
      for (const f of files) {
        const fullPath = path.join(dir, f)
        const stat = await fs.promises.stat(fullPath)

        let isSkill = false
        let name = ''
        let filePath = ''
        let description = 'Custom Mark Skill'

        if (stat.isDirectory()) {
          filePath = path.join(fullPath, 'SKILL.md')
          if (fs.existsSync(filePath)) {
            isSkill = true
            name = f
          }
        } else if (f.endsWith('.md')) {
          // Auto-migrate standalone .md to folder format
          name = f.replace('.md', '')
          const folderPath = path.join(dir, name)
          if (!fs.existsSync(folderPath)) {
            await fs.promises.mkdir(folderPath, { recursive: true })
            const newFilePath = path.join(folderPath, 'SKILL.md')
            await fs.promises.rename(fullPath, newFilePath)
            filePath = newFilePath
          } else {
            // Folder already exists, just use the folder's SKILL.md and ignore the standalone file (or delete it)
            filePath = path.join(folderPath, 'SKILL.md')
          }
          isSkill = true
        }

        if (isSkill) {
          const content = await fs.promises.readFile(filePath, 'utf8')
          try {
            const parsed = matter(content)
            if (parsed.data && parsed.data.description) {
              description = parsed.data.description
            }
            if (parsed.data && parsed.data.name) {
              name = parsed.data.name
            }
          } catch (err) {
            console.error('Failed to parse YAML frontmatter for skill:', f, err)
          }
          skills.push({ name, description })
        }
      }
      return skills
    } catch (e) {
      console.error('Failed to get skills', e)
      return []
    }
  })

  ipcMain.handle('read-skill', async (event, name) => {
    try {
      const dir = getSkillDir()
      
      // Check for folder-based skill
      const folderPath = path.join(dir, name)
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        const skillFilePath = path.join(folderPath, 'SKILL.md')
        if (fs.existsSync(skillFilePath)) {
          return {
            content: await fs.promises.readFile(skillFilePath, 'utf8'),
            basePath: folderPath.replace(/\\/g, '/')
          }
        }
      }

      // Check for standalone .md file
      const filePath = path.join(dir, `${name}.md`)
      if (fs.existsSync(filePath)) {
        return {
          content: await fs.promises.readFile(filePath, 'utf8'),
          basePath: dir.replace(/\\/g, '/')
        }
      }
      return null
    } catch (e) {
      console.error('Failed to read skill', e)
      return null
    }
  })

  ipcMain.handle('save-skill', async (event, name, content) => {
    try {
      const dir = getSkillDir()
      // Check if old standalone file exists
      const oldStandalonePath = path.join(dir, `${name}.md`)
      if (fs.existsSync(oldStandalonePath) && !fs.statSync(oldStandalonePath).isDirectory()) {
        await fs.promises.writeFile(oldStandalonePath, content, 'utf8')
        return true
      }
      // Otherwise, save in folder format
      const folderPath = path.join(dir, name)
      if (!fs.existsSync(folderPath)) {
        await fs.promises.mkdir(folderPath, { recursive: true })
      }
      const skillFilePath = path.join(folderPath, 'SKILL.md')
      await fs.promises.writeFile(skillFilePath, content, 'utf8')
      return true
    } catch (e) {
      console.error('Failed to save skill', e)
      return false
    }
  })

  ipcMain.handle('delete-skill', async (event, name) => {
    try {
      const dir = getSkillDir()
      const folderPath = path.join(dir, name)
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        await fs.promises.rm(folderPath, { recursive: true, force: true })
        return true
      }
      const filePath = path.join(dir, `${name}.md`)
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to delete skill', e)
      return false
    }
  })

  ipcMain.handle('show-open-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mark Skill Package', extensions: ['zip'] }]
    })
    if (canceled) return []
    return filePaths
  })

  ipcMain.handle('install-skill', async (event, sourcePath) => {
    try {
      if (!sourcePath.endsWith('.zip')) {
        throw new Error('Hanya mendukung file .zip')
      }

      const zip = new AdmZip(sourcePath)
      const zipEntries = zip.getEntries()
      
      let hasSkillMd = false
      for (const entry of zipEntries) {
        const name = entry.name.toLowerCase()
        if (!entry.isDirectory && name === 'skill.md') {
          hasSkillMd = true
          break
        }
      }

      if (!hasSkillMd) {
        throw new Error('Invalid Skill Package: Tidak ditemukan file SKILL.md di dalam zip.')
      }

      // Check if all files are inside a single root folder
      const firstEntry = zipEntries[0]
      const firstPart = firstEntry.entryName.split('/')[0]
      const isSingleRoot = zipEntries.every(e => e.entryName.startsWith(firstPart + '/'))
      
      const dir = getSkillDir()
      if (isSingleRoot) {
        zip.extractAllTo(dir, true)
      } else {
        const zipName = path.basename(sourcePath, '.zip')
        const targetPath = path.join(dir, zipName)
        zip.extractAllTo(targetPath, true)
      }

      return true
    } catch (e) {
      console.error('Failed to install skill', e)
      throw e
    }
  })

  // === VSCODE-LIKE FILE MANAGER IPCs ===
  const buildTree = (dirPath, basePath) => {
    const result = []
    const items = fs.readdirSync(dirPath)
    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stat = fs.statSync(itemPath)
      const relativePath = path.relative(basePath, itemPath).replace(/\\/g, '/')
      if (stat.isDirectory()) {
        result.push({
          name: item,
          path: relativePath,
          type: 'folder',
          children: buildTree(itemPath, basePath)
        })
      } else {
        result.push({
          name: item,
          path: relativePath,
          type: 'file'
        })
      }
    }
    // Sort: folders first, then files
    return result.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === 'folder' ? -1 : 1
    })
  }

  ipcMain.handle('get-skill-tree', async (event, name) => {
    try {
      const dir = getSkillDir()
      const folderPath = path.join(dir, name)
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        return buildTree(folderPath, folderPath)
      }
      // If it's a standalone file, return a dummy tree
      return [{ name: 'SKILL.md', path: 'SKILL.md', type: 'file' }]
    } catch (e) {
      console.error('Failed to get skill tree', e)
      return []
    }
  })

  ipcMain.handle('read-skill-file', async (event, name, relativePath) => {
    try {
      const dir = getSkillDir()
      // If standalone
      const standalonePath = path.join(dir, `${name}.md`)
      if (relativePath === 'SKILL.md' && fs.existsSync(standalonePath) && !fs.statSync(standalonePath).isDirectory()) {
        return await fs.promises.readFile(standalonePath, 'utf8')
      }
      
      const targetPath = path.join(dir, name, relativePath)
      if (fs.existsSync(targetPath)) {
        return await fs.promises.readFile(targetPath, 'utf8')
      }
      return ''
    } catch (e) {
      console.error('Failed to read skill file', e)
      return ''
    }
  })

  ipcMain.handle('save-skill-file', async (event, name, relativePath, content) => {
    try {
      const dir = getSkillDir()
      // Standalone fallback
      const standalonePath = path.join(dir, `${name}.md`)
      if (relativePath === 'SKILL.md' && fs.existsSync(standalonePath) && !fs.statSync(standalonePath).isDirectory()) {
        await fs.promises.writeFile(standalonePath, content, 'utf8')
        return true
      }

      const targetPath = path.join(dir, name, relativePath)
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.promises.writeFile(targetPath, content, 'utf8')
      return true
    } catch (e) {
      console.error('Failed to save skill file', e)
      return false
    }
  })

  ipcMain.handle('create-skill-item', async (event, name, relativePath, isFolder) => {
    try {
      const dir = getSkillDir()
      // Force migration to folder if creating items
      const standalonePath = path.join(dir, `${name}.md`)
      const folderPath = path.join(dir, name)
      if (fs.existsSync(standalonePath) && !fs.existsSync(folderPath)) {
        await fs.promises.mkdir(folderPath, { recursive: true })
        await fs.promises.rename(standalonePath, path.join(folderPath, 'SKILL.md'))
      }

      const targetPath = path.join(dir, name, relativePath)
      if (isFolder) {
        await fs.promises.mkdir(targetPath, { recursive: true })
      } else {
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.promises.writeFile(targetPath, '', 'utf8')
      }
      return true
    } catch (e) {
      console.error('Failed to create skill item', e)
      return false
    }
  })

  ipcMain.handle('delete-skill-item', async (event, name, relativePath) => {
    try {
      const dir = getSkillDir()
      const targetPath = path.join(dir, name, relativePath)
      if (fs.existsSync(targetPath)) {
        const stat = await fs.promises.stat(targetPath)
        if (stat.isDirectory()) {
          await fs.promises.rm(targetPath, { recursive: true, force: true })
        } else {
          await fs.promises.unlink(targetPath)
        }
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to delete skill item', e)
      return false
    }
  })

  ipcMain.handle('rename-skill-item', async (event, name, oldRelativePath, newRelativePath) => {
    try {
      const dir = getSkillDir()
      const oldPath = path.join(dir, name, oldRelativePath)
      const newPath = path.join(dir, name, newRelativePath)
      if (fs.existsSync(oldPath)) {
        await fs.promises.rename(oldPath, newPath)
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to rename skill item', e)
      return false
    }
  })
}
