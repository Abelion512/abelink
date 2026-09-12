// Tool Google Workspace (dipindah murni dari main/node-tools.js).
import {
  searchFiles, listFiles, readFile, uploadFile, createFile, moveFile, copyFile, getDriveInfo
} from '../google/google-drive.js'
import { listEvents, createEvent, deleteEvent } from '../google/google-calendar.js'
import { searchEmails, readEmail, sendEmail, markAsRead } from '../google/google-gmail.js'

export const googleTools = {
  'gdrive-info': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await getDriveInfo(clientId, clientSecret)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-search': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const q = parts[0].trim()
        const { start, end, fetchCount } = parsePagination(parts[1] || '')
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const rawResult = await searchFiles(clientId, clientSecret, q, fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-list': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const folderId = parts[0].trim() || null
        const { start, end, fetchCount } = parsePagination(parts[1] || '')
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const rawResult = await listFiles(clientId, clientSecret, folderId, fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-read': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await readFile(clientId, clientSecret, query.trim())
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-upload': {
    needsApproval: true,
    approvalMessage: (query) =>
      `Abelink ingin mengunggah file ke Google Drive-mu:\n${query.split('||')[0]}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const name = parts[0].trim()
        const content = parts.slice(1).join('||')
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await uploadFile(clientId, clientSecret, name, content)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-create': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Abelink ingin membuat dokumen kosong baru di Google Drive:\nNama: ${parts[0]}\nTipe: ${parts[1] || 'doc'}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const name = parts[0].trim()
        const type = parts[1] ? parts[1].trim() : 'doc'
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await createFile(clientId, clientSecret, name, type)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-move': {
    needsApproval: true,
    approvalMessage: (query) =>
      `Abelink ingin memindahkan file di Google Drive.\nFile ID: ${query.split('||')[0]}\nFolder Tujuan ID: ${query.split('||')[1]}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const fileId = parts[0].trim()
        const folderId = parts[1].trim()
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await moveFile(clientId, clientSecret, fileId, folderId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gdrive-copy': {
    needsApproval: true,
    approvalMessage: (query) =>
      `Abelink ingin menduplikasi file di Google Drive.\nFile ID: ${query.split('||')[0]}\nNama Baru: ${query.split('||')[1]}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const fileId = parts[0].trim()
        const newName = parts[1].trim()
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await copyFile(clientId, clientSecret, fileId, newName)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gcalendar-list': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const { start, end, fetchCount } = parsePagination(parts[0])
        const timeMin = parts[1] ? parts[1].trim() : new Date().toISOString()
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const rawResult = await listEvents(clientId, clientSecret, fetchCount, timeMin)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gcalendar-create': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Abelink ingin membuat jadwal baru di kalendermu:\nJudul: ${parts[0]}\nWaktu Mulai: ${parts[2]}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const summary = parts[0].trim()
        const description = parts[1].trim()
        const startTime = parts[2].trim()
        const endTime = parts[3].trim()
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await createEvent(
          clientId,
          clientSecret,
          summary,
          description,
          startTime,
          endTime
        )
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gcalendar-delete': {
    needsApproval: true,
    approvalMessage: (query) => `Abelink ingin MENGHAPUS jadwal/event ini:\nEvent ID: ${query}`,
    handler: async (query, config) => {
      try {
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await deleteEvent(clientId, clientSecret, query.trim())
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gmail-search': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const q = parts[0].trim() || 'is:unread'
        const { start, end, fetchCount } = parsePagination(parts[1] || '')
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const rawResult = await searchEmails(clientId, clientSecret, q, fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gmail-list': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const { start, end, fetchCount } = parsePagination(query)
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const rawResult = await searchEmails(clientId, clientSecret, 'is:unread', fetchCount)
        return { success: true, data: rawResult.slice(start, end) }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gmail-read': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await readEmail(clientId, clientSecret, query.trim())
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gmail-send': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Abelink ingin MENGIRIM EMAIL baru.\nTujuan: ${parts[0]}\nSubjek: ${parts[1]}\nIsi Pesan:\n${parts[2].slice(0, 100)}...`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const to = parts[0].trim()
        const subject = parts[1].trim()
        const bodyText = parts.slice(2).join('||')
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await sendEmail(clientId, clientSecret, to, subject, bodyText)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'gmail-abelink-read': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const clientId = config?.[0]?.googleClientId
        const clientSecret = config?.[0]?.googleClientSecret
        const result = await markAsRead(clientId, clientSecret, query.trim())
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
};
