// Auto-profile detection — self-tuning based on hardware spec
// Analogy: seperti n8n auto-detect worker threads, atau Zapier limit concurrent tasks

const PROFILES = {
  MINIMAL: {
    label: 'Laptop Ringan (4GB)',
    description: 'Heating resource — fitur berat off default',
    enableVoiceSTT: false,
    enableWorkspaceRAG: false,
    enableMemoryVisualizer: true,
    enableGraphView: false,
    sttTrigger: 'manual',
    ragTrigger: 'manual'
  },
  STANDARD: {
    label: 'Laptop Biasa (8GB)',
    description: 'Balance — heavy features lazy-load',
    enableVoiceSTT: true,
    enableWorkspaceRAG: false,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'on-demand',
    ragTrigger: 'manual'
  },
  PERFORMANCE: {
    label: 'Laptop Kuat (16GB)',
    description: 'Semua fitur aktif dengan resource senang',
    enableVoiceSTT: true,
    enableWorkspaceRAG: true,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'on-demand',
    ragTrigger: 'auto'
  },
  UNLIMITED: {
    label: 'Desktop/Workstation (32GB+)',
    description: 'Tanpa batas, semua fitur langsung aktif',
    enableVoiceSTT: true,
    enableWorkspaceRAG: true,
    enableMemoryVisualizer: true,
    enableGraphView: true,
    sttTrigger: 'always-on',
    ragTrigger: 'auto'
  }
}

// Detect hardware profile based on system info
export function detectHardwareProfile() {
  // Navigator APIs available di browser/Tauri WebView
  const ramGB = typeof navigator !== 'undefined' ? (navigator.deviceMemory || 8) : 8
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4
  const hasGPU = typeof navigator !== 'undefined' && !!(navigator.gpu || window.__TAURI_INTEGRATION__)
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTEGRATION__

  // Heuristic: Tauri + low RAM = conservative profile
  if (isTauri && ramGB <= 4) return 'MINIMAL'
  if (ramGB <= 4) return 'MINIMAL'
  if (ramGB <= 8) return 'STANDARD'
  if (ramGB <= 16) return 'PERFORMANCE'
  return 'UNLIMITED'
}

// Get profile config by name
export function getProfileConfig(profileName = 'STANDARD') {
  return PROFILES[profileName] || PROFILES.STANDARD
}

// Get active profile (from stored config or auto-detect)
export async function getActiveProfile() {
  const { getAppConfig } = await import('./db')
  const stored = await getAppConfig('hardwareProfile')
  if (stored && PROFILES[stored]) return stored
  const detected = detectHardwareProfile()
  await setAppConfig('hardwareProfile', detected)
  return detected
}

// Apply profile to config flags
export async function applyProfile(profileName) {
  const config = getProfileConfig(profileName)
  const { setAppConfig } = await import('./db')
  await Promise.all([
    setAppConfig('hardwareProfile', profileName),
    setAppConfig('autoProfile', config)
  ])
  window.dispatchEvent(new CustomEvent('profile-applied', { detail: config }))
  return config
}

// Export for use in Configuration.jsx
export { PROFILES }