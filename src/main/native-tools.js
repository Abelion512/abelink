import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import util from 'util'
import { navigateTo, readDOM, executeAction } from './browser-agent.js'

const execPromise = util.promisify(exec)

// Platform detection
const IS_WIN = process.platform === 'win32'
const IS_LINUX = process.platform === 'linux'
const IS_MAC = process.platform === 'darwin'

const pathExample = IS_WIN ? 'D:\\file.txt' : '/home/user/file.txt'

// RSI audit log: writes every CLI invocation to ~/.mark/rsi-audit.log
const RSIAuditLog = (() => {
  const logDir = path.join(os.homedir(), '.mark')
  const logFile = path.join(logDir, 'rsi-audit.log')
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
  } catch {}
  const maxBytes = 5 * 1024 * 1024 // 5MB rotate
  return (toolName, cmd, success) => {
    try {
      const line = JSON.stringify({ t: new Date().toISOString(), tool: toolName, cmd: cmd.slice(0, 200), ok: success })
      fs.appendFileSync(logFile, line + '\n')
      const stat = fs.statSync(logFile)
      if (stat.size > maxBytes) {
        // Rotate: keep last 1MB
        const content = fs.readFileSync(logFile, 'utf8')
        const lines = content.split('\n').slice(-1000)
        fs.writeFileSync(logFile, lines.join('\n'))
      }
    } catch {} // silent — never crash from audit
  }
})()

// Safer env for subprocess: strip dangerous variables, keep essential ones
const safeEnv = () => {
  const keep = new Set(['HOME', 'USER', 'PATH', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'NODE_PATH', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_TYPE'])
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (keep.has(k) || k.startsWith('NODE_') || k.startsWith('npm_')) env[k] = v
  }
  // Always ensure HOME
  env.HOME = process.env.HOME || os.homedir()
  return env
}

// Helper: Cek apakah command shell berbahaya
const DANGEROUS_KEYWORDS = [
  'remove-item', 'rm ', 'rm -', 'del ', 'rmdir', 'format-',
  'clear-disk', 'stop-process', 'kill ', 'taskkill',
  'set-executionpolicy', 'restart-computer', 'shutdown',
  'reg delete', 'dd if=', ':(){ :|:& };:', '> /dev/sda',
  'chmod 000', 'chown -r', 'sudo rm', '> /dev/null 2>&1 || rm'
]
export const isDangerousCommand = (cmd) =>
  DANGEROUS_KEYWORDS.some((k) => cmd.toLowerCase().includes(k.toLowerCase()))

export const NATIVE_TOOLS = {
  'read-file': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const parts = query.split('||')
        const filePath = parts[0].trim()
        if (!fs.existsSync(filePath))
          return { success: false, message: 'File tidak ditemukan di path tersebut.' }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')
        const totalLines = lines.length

        if (parts.length >= 3) {
          const startLine = parseInt(parts[1].trim(), 10)
          const endLine = parseInt(parts[2].trim(), 10)

          if (!isNaN(startLine) && !isNaN(endLine)) {
            const sliceLines = lines.slice(
              Math.max(0, startLine - 1),
              Math.min(totalLines, endLine)
            )
            const sliceContent = sliceLines.map((l, i) => `[${startLine + i}] ${l}`).join('\n')
            return {
              success: true,
              totalLines,
              showing: `Baris ${startLine} - ${endLine}`,
              content: sliceContent
            }
          }
        }

        // Default potong 400 baris awal
        const defaultLines = lines.slice(0, 400)
        const defaultContent = defaultLines.map((l, i) => `[${i + 1}] ${l}`).join('\n')
        return {
          success: true,
          totalLines,
          content: defaultContent,
          note:
            totalLines > 400
              ? 'File panjang. Hanya menampilkan 400 baris awal. Gunakan read-file dengan argumen startLine||endLine untuk melihat sisa baris.'
              : ''
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'write-file': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin menulis/membuat file:\n${query.split('||')[0].trim()}`,
    handler: async (query) => {
      try {
        const parts = query.split('||')
        if (parts.length < 2)
          return {
            success: false,
            message: `Format salah. Gunakan separator '||' (contoh: ${pathExample}||Halo)`
          }

        const filePath = parts[0].trim()
        const content = parts.slice(1).join('||')

        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        fs.writeFileSync(filePath, content, 'utf8')
        return { success: true, message: `Berhasil menyimpan file ke ${filePath}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'replace-lines': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin mengganti baris ${parts[1]} hingga ${parts[2]} di file:\n${parts[0].trim()}`
    },
    handler: async (query) => {
      try {
        const parts = query.split('||')
        if (parts.length < 4)
          return {
            success: false,
            message: 'Format salah. Gunakan: path||startLine||endLine||kode_baru'
          }

        const filePath = parts[0].trim()
        const startLine = parseInt(parts[1].trim(), 10)
        const endLine = parseInt(parts[2].trim(), 10)
        const newContent = parts.slice(3).join('||')

        if (!fs.existsSync(filePath)) return { success: false, message: 'File tidak ditemukan.' }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')

        if (startLine < 1 || startLine > lines.length || endLine < startLine) {
          return { success: false, message: 'Range baris tidak valid' }
        }

        lines.splice(startLine - 1, endLine - startLine + 1, newContent)

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
        return {
          success: true,
          message: `Berhasil mengganti baris ${startLine}-${endLine} di ${filePath}`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'delete-file': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin MENGHAPUS file secara permanen:\n${query}`,
    handler: async (query) => {
      try {
        if (!fs.existsSync(query)) return { success: false, message: 'File tidak ditemukan.' }
        fs.unlinkSync(query)
        return { success: true, message: `Berhasil menghapus file ${query}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'list-dir': {
    needsApproval: false,
    handler: async (query) => {
      try {
        if (!fs.existsSync(query)) return { success: false, message: 'Folder tidak ditemukan.' }
        const files = fs.readdirSync(query)
        return { success: true, total_files: files.length, contents: files.join('\n') }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'grep-search': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const parts = query.split('||')
        if (parts.length < 2)
          return {
            success: false,
            message: `Format salah. Gunakan separator '||' (contoh: ${pathExample}||nama_fungsi)`
          }

        const dirPath = parts[0].trim()
        const keyword = parts[1].trim()

        const cmd = IS_WIN
          ? `findstr /S /I /N /C:"${keyword}" "${dirPath}\\*.*"`
          : `grep -rni "${keyword}" "${dirPath}"`
        const { stdout } = await execPromise(cmd)

        const result = stdout.split('\n').slice(0, 50).join('\n')
        return { success: true, result: result || 'Pencarian tidak menemukan hasil apapun.' }
      } catch (e) {
        return {
          success: true,
          result: 'Pencarian tidak menemukan hasil apapun (atau folder kosong).'
        }
      }
    }
  },
  // Eksekusi shell command. Di Linux/Mac: bash; di Windows: PowerShell.
  'run-shell': {
    needsApproval: (query) => isDangerousCommand(query),
    approvalMessage: (query) => {
      const label = IS_WIN ? 'PowerShell' : 'Shell'
      return `Mark ingin mengeksekusi perintah ${label} yang berpotensi BERBAHAYA:\n\n${query}`
    },
    handler: async (query) => {
      if (!query) return { success: false, message: 'Tidak ada perintah yang diberikan.' }
      try {
        const shellCmd = IS_WIN
          ? `powershell.exe -Command "${query}"`
          : `bash -c "${query}"`
        const { stdout, stderr } = await execPromise(shellCmd, { env: safeEnv() })
        RSIAuditLog('run-shell', query, true)
        return {
          success: true,
          output: stdout.trim() || 'Perintah berhasil dieksekusi tanpa output teks.',
          error: stderr.trim() || null
        }
      } catch (error) {
        RSIAuditLog('run-shell', query, false)
        return {
          success: false,
          message: 'Gagal mengeksekusi perintah.',
          error: error.message
        }
      }
    }
  },
  // RSI (Recursive Self Improvement) — eksekusi CLI tanpa approval untuk coding/infra tools
  'run-cli': {
    needsApproval: false,
    handler: async (query) => {
      const parts = query.split('||')
      const cmd = parts[0].trim()
      const cwd = parts[1]?.trim() || process.cwd()
      const timeout = parseInt(parts[2]) || 180000
      if (!cmd) return { success: false, message: 'Tidak ada perintah yang diberikan.' }
      // --- Safety: block known destructive patterns even without approval ---
      if (isDangerousCommand(cmd)) {
        RSIAuditLog('run-cli-blocked', cmd, false)
        return { success: false, message: 'Perintah ditolak oleh safety guard (run-cli tidak approval). Gunakan run-shell untuk perintah berbahaya.' }
      }
      try {
        const { stdout, stderr } = await execPromise(cmd, {
          cwd,
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          env: safeEnv()
        })
        RSIAuditLog('run-cli', cmd, true)
        return {
          success: true,
          output: stdout.trim() || '(no stdout)',
          stderr: stderr?.trim() || null
        }
      } catch (error) {
        RSIAuditLog('run-cli', cmd, false)
        return {
          success: false,
          message: 'Gagal mengeksekusi perintah.',
          error: error.message,
          stderr: error.stderr?.trim() || null,
          stdout: error.stdout?.trim() || null
        }
      }
    }
  },
  'browser-navigate': {
    needsApproval: false,
    handler: async (query) => {
      try {
        let url = query.trim()
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url
        }
        const result = await navigateTo(url)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-close': {
    handler: async () => {
      try {
        const { closeBrowser } = await import('./browser-agent.js')
        const result = await closeBrowser()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-read': {
    needsApproval: false,
    handler: async () => {
      try {
        const result = await readDOM()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-click': {
    needsApproval: false,
    handler: async (query) => {
      const id = parseInt(query.trim(), 10)
      if (isNaN(id)) return { success: false, error: 'ID harus berupa angka.' }
      try {
        const result = await executeAction({ action: 'click', id })
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-type': {
    needsApproval: false,
    handler: async (query) => {
      const parts = query.split('||')
      if (parts.length < 2) return { success: false, error: 'Format: ID||teks' }
      const id = parseInt(parts[0].trim(), 10)
      const text = parts.slice(1).join('||')
      if (isNaN(id)) return { success: false, error: 'ID harus berupa angka.' }
      try {
        const result = await executeAction({ action: 'type', id, value: text })
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-scroll': {
    needsApproval: false,
    handler: async (query) => {
      const direction = query.trim().toLowerCase()
      if (direction !== 'up' && direction !== 'down') {
        return { success: false, error: "Gunakan 'up' atau 'down'." }
      }
      try {
        const result = await executeAction({ action: 'scroll', direction })
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'browser-ask-user': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await executeAction({ action: 'unblock', value: query })
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
