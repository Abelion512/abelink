// popup-status.mjs — kontrak pill: notice kuning vs lastError merah.
// Regresi: "Menyambung ulang otomatis..." ditulis ke lastError -> popup
// merah "terputus" padahal loop akan kembali sendiri (noise tiap 5s).
import { describe, it, expect } from 'vitest'
import { popupStatus } from '../extension/popup-status.mjs'

describe('popupStatus notice vs lastError', () => {
  it('running=true -> hijau, notice/lastError diabaikan', () => {
    const st = popupStatus({ running: true, lastError: 'x', notice: 'y', pairing: { flavor: 'dev', port: 49713 } })
    expect(st.pill).toBe('tersambung')
    expect(st.kind).toBe('ok')
  })
  it('notice tanpa lastError -> kuning, bukan merah', () => {
    const st = popupStatus({ running: false, notice: 'Menyambung ulang otomatis...' })
    expect(st.kind).toBe('warn')
    expect(st.pill).not.toBe('terputus')
  })
  it('lastError nyata -> merah walau ada notice', () => {
    const st = popupStatus({ running: false, lastError: 'Token ditolak (401)', notice: 'Menyambung ulang otomatis...' })
    expect(st.pill).toBe('terputus')
    expect(st.kind).toBe('err')
  })
  it('tanpa keduanya -> menunggu kuning', () => {
    const st = popupStatus({ running: false })
    expect(st.kind).toBe('warn')
    expect(st.pill).toBe('menunggu')
  })
})
