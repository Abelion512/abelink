// Tool shell/git/task (dipindah murni dari main/node-tools.ts).
import { getGitStatus, getGitDiff, gitCommit, gitRevert } from '../git-service.ts'
import { spawnBackgroundTask, readBackgroundTaskOutput, killBackgroundTask, listBackgroundTasks } from '../task-daemon.ts'
import { execPromise, isDangerousCommand, isHardlineCommand, classifyCommand, getWorkspaceDir } from './_shared.ts'

export const shellTools: Record<string, any> = {
  'run-shell': {
    needsApproval: (query: any) => isDangerousCommand(query),
    approvalMessage: (query: any) =>
      classifyCommand(query) === 'hardline'
        ? `DITOLAK OTOMATIS (hardline, tanpa approval): perintah merusak tanpa jalan pulih:\n\n${query}`
        : `Abelink ingin mengeksekusi perintah shell yang berpotensi BERBAHAYA:\n\n${query}`,
    handler: async (query: any, config: any) => {
      if (!query) return { success: false, message: 'Tidak ada perintah yang diberikan.' }
      // Guardian hardline (ala Hermes): auto-deny TANPA approval — bahkan bila
      // user pernah grant session. Approval tidak berlaku untuk wipe/mkfs/dd.
      if (isHardlineCommand(query)) {
        return {
          success: false,
          message:
            'DITOLAK OTOMATIS (hardline): perintah merusak tanpa jalan pulih ' +
            '(wipe sistem/home, mkfs, dd ke block device, fork bomb, matikan mesin). ' +
            'Tidak bisa di-approve. Rumuskan ulang tanpa pola tersebut.'
        }
      }
      // Pagar anti-spiral: ambil + parse halaman web bukan tugas shell.
      // (Observasi nyata: curl|grep|sed berulang 20 turn lalu give up.)
      const { isWebScrapeCommand } = await import('../browser/bridge-core.ts')
      if (isWebScrapeCommand(query)) {
        return {
          success: false,
          message:
            'Ditolak: jangan ambil halaman web via curl/wget/python di shell. ' +
            'Gunakan browser-navigate (URL bersih) atau browser-extract (selector CSS).'
        }
      }
      try {
        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        // Linux-native: bash langsung. Timeout + maxBuffer mencegah proses
        // menggantung atau menguras memori lewat output raksasa.
        const { stdout, stderr } = await execPromise(query, {
          cwd: activeRoot,
          shell: '/bin/bash',
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024
        })
        const output = stdout.trim() || 'Perintah berhasil dieksekusi tanpa output teks.'
        return {
          success: true,
          output,
          error: stderr.trim() || null
        }
      } catch (error: any) {
        return {
          success: false,
          message: 'Gagal mengeksekusi perintah.',
          error: error.message
        }
      }
    }
  },
  'git-status': {
    needsApproval: false,
    handler: async (query: any, config: any) => {
      const activeRoot = config?.workspaceRoot || (query?.trim() ? query.trim() : getWorkspaceDir())
      const res = await getGitStatus(activeRoot)
      return res
    }
  },
  'git-diff': {
    needsApproval: false,
    handler: async (query: any, config: any) => {
      const activeRoot = config?.workspaceRoot || getWorkspaceDir()
      const res = await getGitDiff(activeRoot, query?.trim() || '')
      return res
    }
  },
  'git-commit': {
    needsApproval: true,
    approvalMessage: (query: any) => `Abelink ingin melakukan git commit dengan pesan:\n"${query}"`,
    handler: async (query: any, config: any) => {
      const parts = query ? query.split('||') : []
      const message = parts[0]?.trim() || 'Abelink Agent Commit'
      const customCwd = parts[1]?.trim()
      const activeRoot = customCwd || config?.workspaceRoot || getWorkspaceDir()
      return await gitCommit(activeRoot, message)
    }
  },
  'git-revert': {
    needsApproval: true,
    approvalMessage: (query: any) => `Abelink ingin me-rollback perubahan git:\n"${query || 'Seluruh file (reset --hard)'}`,
    handler: async (query: any, config: any) => {
      const activeRoot = config?.workspaceRoot || getWorkspaceDir()
      return await gitRevert(activeRoot, query?.trim() || '')
    }
  },
  'run-task': {
    needsApproval: (query: any) => isDangerousCommand(query?.split('||')[1] || query || ''),
    approvalMessage: (query: any) => `Abelink ingin menjalankan background task:\n${query}`,
    handler: async (query: any, config: any) => {
      const parts = query.split('||')
      if (parts.length < 2) {
        return { success: false, message: 'Format salah. Gunakan: taskId||command (contoh: dev-server||npm run dev)' }
      }
      const taskId = parts[0].trim()
      const command = parts.slice(1).join('||').trim()
      const activeRoot = config?.workspaceRoot || getWorkspaceDir()
      return spawnBackgroundTask(taskId, command, activeRoot)
    }
  },
  'read-task-output': {
    needsApproval: false,
    handler: async (query: any) => {
      const parts = query ? query.split('||') : []
      const taskId = parts[0]?.trim()
      const lines = parts[1] ? parseInt(parts[1].trim(), 10) : 40
      if (!taskId) return { success: false, message: 'Wajib menyertakan taskId' }
      return readBackgroundTaskOutput(taskId, lines)
    }
  },
  'kill-task': {
    needsApproval: false,
    handler: async (query: any) => {
      const taskId = query?.trim()
      if (!taskId) return { success: false, message: 'Wajib menyertakan taskId' }
      return killBackgroundTask(taskId)
    }
  },
  'list-tasks': {
    needsApproval: false,
    handler: async () => {
      return listBackgroundTasks()
    }
  }
};
