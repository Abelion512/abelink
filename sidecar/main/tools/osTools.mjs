// Tool OS automation Linux (dipindah murni dari main/node-tools.js).
import fs from 'fs'
import {
  readDesktop, executeClick, executeDoubleClick, executeType, executeKey,
  executeScroll, openApp, listWindows, focusWindow, askUserPC,
  openPCSession, closePCSession, isPCSessionOpen
} from '../pc-agent.js'
import { isDangerousKeyCombo } from './_shared.mjs'

export const osTools = {
  'os-read': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const result = await readDesktop({}, (query || '').trim())
        if (result?.error && result?.window === 'error') {
          return { success: false, error: result.error }
        }
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-click': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const message = await executeClick((query || '').trim())
        return { success: !/ERROR/i.test(message), data: message }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-double-click': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const message = await executeDoubleClick((query || '').trim())
        return { success: !/ERROR/i.test(message), data: message }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-type': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const message = await executeType(query || '')
        return { success: !/ERROR/i.test(message), data: message }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-key': {
    needsApproval: (query) => isDangerousKeyCombo(query),
    approvalMessage: (query) =>
      `Mark ingin menekan shortcut keyboard yang berpotensi BERBAHAYA:\n\n${query}`,
    handler: async (query) => {
      try {
        const message = await executeKey((query || '').trim())
        return { success: !/ERROR/i.test(message), data: message }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-scroll': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const message = await executeScroll(query || '')
        return { success: !/ERROR/i.test(message), data: message }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-delay': {
    needsApproval: false,
    handler: async (query) => {
      const ms = Math.min(Math.max(parseInt(query, 10) || 500, 50), 30000)
      await new Promise((r) => setTimeout(r, ms))
      return { success: true, data: `Delay ${ms}ms selesai.` }
    }
  },
  'os-search': {
    // Buka overview/launcher GNOME lalu ketik query. Pola katalog:
    // os-search -> os-delay(1000) -> os-key(enter).
    needsApproval: false,
    handler: async (query) => {
      try {
        const openRes = await executeKey('super')
        if (/ERROR/i.test(openRes)) return { success: false, error: openRes }
        await new Promise((r) => setTimeout(r, 700))
        const typeRes = await executeType(query || '')
        return { success: !/ERROR/i.test(typeRes), data: `${openRes} ${typeRes}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-open': {
    needsApproval: false,
    handler: async (query) => {
      try {
        if (isPCSessionOpen()) {
          const message = await openApp((query || '').trim())
          return { success: !/ERROR/i.test(message), data: message }
        }
        // Di luar sesi kontrol: fallback xdg-open (path file atau URL web).
        // Batas aman: tolak executable/script agar tool baca-jelajah tidak
        // berubah jadi eksekusi arbitrer (daemon sesi tetap jalur utama).
        const raw = (query || '').trim()
        const urlMatch = raw.match(/https?:\/\/[^\s)\]>"]+/)
        const target = urlMatch ? urlMatch[0].replace(/[.,;:!?]+$/, '') : raw
        const isWebUrl = /^https?:\/\//i.test(target)
        const lower = target.toLowerCase()
        const deniedExt = [
          '.sh', '.bash', '.zsh', '.py', '.pyc', '.pl', '.rb', '.php', '.run', '.bin',
          '.appimage', '.deb', '.rpm', '.desktop', '.so', '.exe', '.msi', '.bat', '.ps1'
        ]
        if (!isWebUrl && deniedExt.some((ext) => lower.endsWith(ext))) {
          return {
            success: false,
            error: 'Ditolak: file executable/script hanya boleh dibuka dalam sesi os-control (approval).'
          }
        }
        if (target && (isWebUrl || fs.existsSync(target))) {
          const { execFile } = await import('child_process')
          execFile('xdg-open', [target], (err) => {
            if (err) console.error('xdg-open error:', err)
          })
          return { success: true, data: `Membuka ${target}` }
        }
        return { success: false, error: 'File/tautan tidak ditemukan' }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-list-windows': {
    needsApproval: false,
    handler: async () => {
      try {
        const result = await listWindows()
        return { success: result?.status === 'success', data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-focus-window': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const message = await focusWindow((query || '').trim())
        return { success: !/ERROR/i.test(message), data: message }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-ask': {
    needsApproval: false,
    handler: async (query) => {
      if (isPCSessionOpen()) {
        try {
          const raw = await askUserPC(query || '')
          let parsed = raw
          if (typeof raw === 'string') {
            try {
              parsed = JSON.parse(raw)
            } catch {}
          }
          const status = parsed?.status
          return { success: status !== 'error', data: parsed }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }
      return { success: false, error: 'PC automation session not open. Call os-control-open first.' }
    }
  },
  'os-control-open': {
    needsApproval: () => !isPCSessionOpen(),
    approvalMessage: () =>
      'Mark ingin mengontrol fisik PC/desktop-mu (mengunci sesi sementara dan memunculkan overlay kontrol PC). Apakah kamu mengizinkan?',
    handler: async () => {
      try {
        const result = await openPCSession()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'os-control-close': {
    needsApproval: false,
    handler: async () => {
      try {
        const result = await closePCSession()
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
};
