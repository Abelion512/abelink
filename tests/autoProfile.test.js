/**
 * Unit tests for src/utils/autoProfile.js.
 * The '../api/db' dynamic import is mocked in-memory, so no Dexie/IndexedDB is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectHardwareProfile, getProfileConfig, PROFILES } from '../src/utils/autoProfile.js'

// Mock modul db (dinamis di-import oleh getActiveProfile/applyProfile)
vi.mock('../src/api/db', () => ({
  getAppConfig: vi.fn(),
  setAppConfig: vi.fn()
}))

import { getAppConfig, setAppConfig } from '../src/api/db'
import { getActiveProfile, applyProfile } from '../src/utils/autoProfile.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getProfileConfig', () => {
  it('mengembalikan profil standar untuk nama tidak dikenal', () => {
    expect(getProfileConfig('NGAWUR')).toBe(PROFILES.STANDARD)
    expect(getProfileConfig()).toBe(PROFILES.STANDARD)
  })

  it('mengembalikan profil sesuai nama', () => {
    expect(getProfileConfig('MINIMAL')).toBe(PROFILES.MINIMAL)
    expect(getProfileConfig('PERFORMANCE')).toBe(PROFILES.PERFORMANCE)
  })
})

describe('detectHardwareProfile', () => {
  it('tidak crash di environment tanpa window & hasil valid', () => {
    // Regresi: dulu melempar ReferenceError (window tidak terdefinisi) saat
    // navigator tersedia tanpa window (Node 21+, SSR, test runner).
    const result = detectHardwareProfile()
    expect(['MINIMAL', 'STANDARD', 'PERFORMANCE', 'UNLIMITED']).toContain(result)
  })

  it('RAM native akurat: 12GB+ = PERFORMANCE (semua fitur eager/hidup)', () => {
    // Prinsip owner: device RAM 12+ TIDAK BOLEH kehilangan fitur karena
    // deviceMemory Chromium dipatok 8. /proc/meminfo native = 12 -> PERFORMANCE.
    expect(detectHardwareProfile(12)).toBe('PERFORMANCE')
    expect(detectHardwareProfile(16)).toBe('PERFORMANCE')
    expect(detectHardwareProfile(24)).toBe('PERFORMANCE')
    expect(detectHardwareProfile(32)).toBe('UNLIMITED')
    expect(detectHardwareProfile(8)).toBe('STANDARD')
    expect(detectHardwareProfile(4)).toBe('MINIMAL')
  })

  it('native gagal/null -> fallback navigator tanpa pernah mematikan fitur', () => {
    expect(detectHardwareProfile(null)).toMatch(/MINIMAL|STANDARD|PERFORMANCE/)
    expect(detectHardwareProfile(undefined)).toMatch(/MINIMAL|STANDARD|PERFORMANCE/)
    expect(detectHardwareProfile(-1)).toMatch(/MINIMAL|STANDARD|PERFORMANCE/)
  })

  it('semua profil punya fitur AKTIF (trigger berbeda, bukan on/off)', () => {
    for (const cfg of Object.values(PROFILES)) {
      expect(cfg.enableVoiceSTT).toBe(true)
      expect(cfg.enableWorkspaceRAG).toBe(true)
      expect(cfg.enableMemoryVisualizer).toBe(true)
      expect(cfg.enableGraphView).toBe(true)
      expect(Array.isArray(cfg.eagerLoad)).toBe(true)
    }
    // Hanya urutan yang beda: MINIMAL lazy semua, PERFORMANCE eager.
    expect(PROFILES.MINIMAL.eagerLoad).toEqual([])
    expect(PROFILES.PERFORMANCE.eagerLoad).toContain('vectors')
    expect(PROFILES.PERFORMANCE.eagerLoad).toContain('orama')
  })
})

describe('getActiveProfile', () => {
  it('memakai profil yang sudah tersimpan tanpa menulis ulang', async () => {
    getAppConfig.mockResolvedValue('PERFORMANCE')
    const result = await getActiveProfile()
    expect(result).toBe('PERFORMANCE')
    expect(setAppConfig).not.toHaveBeenCalled()
  })

  it('profil tersimpan tidak valid -> deteksi + persist', async () => {
    getAppConfig.mockResolvedValue('NAMA_TAK_KENAL')
    const result = await getActiveProfile()
    expect(['MINIMAL', 'STANDARD', 'PERFORMANCE', 'UNLIMITED']).toContain(result)
    expect(setAppConfig).toHaveBeenCalledTimes(1)
    expect(setAppConfig).toHaveBeenCalledWith('hardwareProfile', result)
  })

  it('belum ada profil tersimpan -> deteksi + persist sekali', async () => {
    getAppConfig.mockResolvedValue(null)
    const result = await getActiveProfile()
    expect(['MINIMAL', 'STANDARD', 'PERFORMANCE', 'UNLIMITED']).toContain(result)
    expect(setAppConfig).toHaveBeenCalledTimes(1)
    expect(setAppConfig).toHaveBeenCalledWith('hardwareProfile', result)
  })
})

describe('applyProfile', () => {
  it('menyimpan hardwareProfile + autoProfile dan mengembalikan config', async () => {
    const config = await applyProfile('MINIMAL')
    expect(config).toBe(PROFILES.MINIMAL)
    expect(setAppConfig).toHaveBeenCalledWith('hardwareProfile', 'MINIMAL')
    expect(setAppConfig).toHaveBeenCalledWith('autoProfile', PROFILES.MINIMAL)
  })

  it('tidak crash tanpa window (node/env tanpa DOM) dan tetap resolve', async () => {
    // environment vitest ini adalah node: `window` tidak terdefinisi.
    // Sebelum guard, baris ini melempar ReferenceError.
    await expect(applyProfile('STANDARD')).resolves.toBe(PROFILES.STANDARD)
  })
})
