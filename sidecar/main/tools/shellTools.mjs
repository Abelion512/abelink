// Tool shell/git/task (dipindah murni dari main/node-tools.js).
import { exec, spawn } from 'child_process'
import util from 'util'
import { getGitStatus, getGitDiff, gitCommit, gitRevert } from '../git-service.js'
import { spawnBackgroundTask, readBackgroundTaskOutput, killBackgroundTask, listBackgroundTasks } from '../task-daemon.js'
import { execPromise, isDangerousCommand, DANGEROUS_KEYWORDS } from './_shared.mjs'

export const shellTools = {
  'run-shell': {
    needsApproval: (query) => isDangerousCommand(query),
    approvalMessage: (query) =>
      `Mark ingin mengeksekusi perintah shell yang berpotensi BERBAHAYA:\n\n${query}`,
    handler: async (query, config) => {
      if (!query) return { success: false, message: 'Tidak ada perintah yang diberikan.' }
      // Pagar anti-spiral: ambil + parse halaman web bukan tugas shell.
      // (Observasi nyata: curl|grep|sed berulang 20 turn lalu give up.)
      const { isWebScrapeCommand } = await import('./browser/bridge-core.mjs')
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
        let output = stdout.trim() || 'Perintah berhasil dieksekusi tanpa output teks.'
        // rtk: kompres output panjang sebelum masuk konteks LLM (hemat token)
        if (output.length > 4000 && config?.rtkCompress !== false) {
          try {
            const { execFileSync } = await import('child_process')
            const filtered = execFileSync('rtk', ['log'], {
              input: output,
              encoding: 'utf8',
              timeout: 10000
            })
            if (filtered && filtered.trim().length > 0 && filtered.length < output.length) {
              output = filtered.trim()
            }
          } catch {}
        }
        return {
          success: true,
          output,
          error: stderr.trim() || null
        }
      } catch (error) {
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
    handler: async (query, config) => {
      const activeRoot = config?.workspaceRoot || (query?.trim() ? query.trim() : getWorkspaceDir())
      const res = await getGitStatus(activeRoot)
      // rtk always-on: status panjang dikompres sebelum masuk konteks.
      if (res?.success) res.status = await rtkFilter(res.status, 'git-status', config)
      return res
    }
  },
  'git-diff': {
    needsApproval: false,
    handler: async (query, config) => {
      const activeRoot = config?.workspaceRoot || getWorkspaceDir()
      const res = await getGitDiff(activeRoot, query?.trim() || '')
      // rtk always-on: diff gemuk adalah kontributor token terbesar.
      if (res?.success) res.diff = await rtkFilter(res.diff, 'git-diff', config)
      return res
    }
  },
  'git-commit': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin melakukan git commit dengan pesan:\n"${query}"`,
    handler: async (query, config) => {
      const parts = query ? query.split('||') : []
      const message = parts[0]?.trim() || 'Mark Agent Commit'
      const customCwd = parts[1]?.trim()
      const activeRoot = customCwd || config?.workspaceRoot || getWorkspaceDir()
      return await gitCommit(activeRoot, message)
    }
  },
  'git-revert': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin me-rollback perubahan git:\n"${query || 'Seluruh file (reset --hard)'}`,
    handler: async (query, config) => {
      const activeRoot = config?.workspaceRoot || getWorkspaceDir()
      return await gitRevert(activeRoot, query?.trim() || '')
    }
  },
  'run-task': {
    needsApproval: (query) => isDangerousCommand(query?.split('||')[1] || query || ''),
    approvalMessage: (query) => `Mark ingin menjalankan background task:\n${query}`,
    handler: async (query, config) => {
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
    handler: async (query) => {
      const parts = query ? query.split('||') : []
      const taskId = parts[0]?.trim()
      const lines = parts[1] ? parseInt(parts[1].trim(), 10) : 40
      if (!taskId) return { success: false, message: 'Wajib menyertakan taskId' }
      return readBackgroundTaskOutput(taskId, lines)
    }
  },
  'kill-task': {
    needsApproval: false,
    handler: async (query) => {
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
