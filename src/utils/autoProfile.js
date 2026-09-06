// Auto-profile detection — self-tuning berdasarkan hardware.
//
// PRINSIP OWNER (jangan rusak fungsi demi RAM ringan):
// - FITUR TIDAK PERNAH HILANG di manapun. Profil hanya mengatur KAPAN fitur
//   dimuat: 'auto' (boot), 'on-demand' (lazy saat pertama dipakai),
//   'manual' (saat user membuka fiturnya). 12GB+ = semua fitur auto.
// - Deteksi RAM dari NATIVE (misc_get_lite_mode.totalRAMGB, /proc/meminfo)
//   yang akurat — navigator.deviceMemory dipatok 8GB oleh Chromium dan TIDAK
//   dipakai lagi sebagai sumber utama.
// - deviceMemory tetap dipakai sebagai fallback conservative BILA native
//   gagal: angka rendah hanya menunda loading, bukan mematikan fitur.
//
// Analogy: n8n auto-detect worker threads — tapi task-nya tidak pernah hilang.

const PROFILES = {
  MINIMAL: {
    label: 'Hemat (<= 4GB)',
    description: 'Semua fitur tetap ada — yang berat menunggu dipanggil (lazy).',
    enableVoiceSTT: true,
    enableWorkspaceRAG: true,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'on-demand',
    ragTrigger: 'on-demand',
    // Eager-load saat boot: tidak ada (semua lazy) — boot tetap ringan.
    eagerLoad: []
  },
  STANDARD: {
    label: 'Standar (8GB)',
    description: 'Fitur inti siap saat boot, sisanya lazy-load.',
    enableVoiceSTT: true,
    enableWorkspaceRAG: true,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'on-demand',
    ragTrigger: 'on-demand',
    eagerLoad: ['vectors']
  },
  PERFORMANCE: {
    label: 'Kuat (16GB)',
    description: 'Hampir semuanya eager — agent langsung sibuk tanpa jeda.',
    enableVoiceSTT: true,
    enableWorkspaceRAG: true,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'on-demand',
    ragTrigger: 'auto',
    eagerLoad: ['vectors', 'orama']
  },
  UNLIMITED: {
    label: 'Workstation (32GB+)',
    description: 'Tanpa batas, semua fitur langsung aktif.',
    enableVoiceSTT: true,
    enableWorkspaceRAG: true,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'on-demand',
    ragTrigger: 'auto',
    eagerLoad: ['vectors', 'orama']
  }
}

// Deteksi profil: RAM native (akurat) -> fallback navigator.
export function detectHardwareProfile(ramGBNative = null) {
  // Sumber utama: /proc/meminfo via Rust (akurat, termasuk 12GB+).
  if (Number.isFinite(ramGBNative) && ramGBNative > 0) {
    if (ramGBNative <= 4.5) return 'MINIMAL'
    if (ramGBNative <= 8.5) return 'STANDARD'
    if (ramGBNative <= 24) return 'PERFORMANCE' // 12/16GB masuk sini — semua fitur
    return 'UNLIMITED'
  }

  // Fallback: navigator.deviceMemory (dipatok Chromium max 8) — hanya
  // menentukan trigger, tidak pernah mematikan fitur.
  const ramGB =
    typeof navigator !== 'undefined' && navigator.deviceMemory ? navigator.deviceMemory : 8
  if (ramGB <= 4) return 'MINIMAL'
  if (ramGB <= 8) return 'STANDARD'
  return 'PERFORMANCE'
}

// Get profile config by name
export function getProfileConfig(profileName = 'STANDARD') {
  return PROFILES[profileName] || PROFILES.STANDARD
}

// Get active profile (from stored config or auto-detect). Native RAM diambil
// dulu supaya 12GB+ tidak pernah salah masuk profil hemat.
export async function getActiveProfile() {
  const { getAppConfig, setAppConfig } = await import('../api/db')
  const stored = await getAppConfig('hardwareProfile')
  if (stored && PROFILES[stored]) return stored
  let ramGB = null
  try {
    const info = await window.api.getLiteMode()
    if (Number.isFinite(info?.totalRAMGB) && info.totalRAMGB > 0) ramGB = info.totalRAMGB
  } catch (_) {}
  const detected = detectHardwareProfile(ramGB)
  await setAppConfig('hardwareProfile', detected)
  return detected
}

// Apply profile to config flags
export async function applyProfile(profileName) {
  const config = getProfileConfig(profileName)
  const { setAppConfig } = await import('../api/db')
  await Promise.all([
    setAppConfig('hardwareProfile', profileName),
    setAppConfig('autoProfile', config)
  ])
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('profile-applied', { detail: config }))
  }
  return config
}

// Export for use in Configuration.jsx
export { PROFILES }
