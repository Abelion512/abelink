// Connector browser-extension — lifecycle resmi extension Mark Bridge.
//
// Extension BUKAN folder lepas: status (terpasang/terhubung), panduan pasang,
// dan tutup sesi dibaca dari sini (capabilities:list/inspect/guide).
// Aksi di sini hanya membaca state lokal + drop sesi; tidak menyentuh tab
// user (tutup tab = perintah extension via channel browser:*, bukan sini).
import { listSessions, dropSession, getBrowserConfig } from '../browser/bridge-core.mjs'

export async function runBrowserExtension(actionId, args = {}) {
  switch (String(actionId || '')) {
    case 'status': {
      const sessions = listSessions().map((s) => ({
        id: s.id,
        connected: s.connected,
        queued: s.queued
      }))
      return {
        sessions,
        connected: sessions.some((s) => s.connected),
        autoCloseTabs: getBrowserConfig().autoCloseTabs
      }
    }
    case 'guide-install': {
      return {
        steps: [
          'Di app Mark: tekan tombol "Pasang extension browser" (salin folder ke data dir).',
          'Buka chrome://extensions, aktifkan Developer mode, Load unpacked, pilih folder itu.',
          'Pastikan ID extension = kdcfgmlamndkapaiakhlplckfhmjieml.',
          'Buka popup Mark Bridge: harus hijau tanpa klik (token tersimpan otomatis).'
        ]
      }
    }
    case 'close-session': {
      const id = String(args?.sessionId || 'default')
      const had = dropSession(id)
      return had ? `Sesi browser '${id}' ditutup.` : `Sesi '${id}' tidak dikenal.`
    }
    default:
      throw new Error(`Aksi browser-extension tidak dikenal: ${actionId}`)
  }
}
