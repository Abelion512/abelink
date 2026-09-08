// Resolusi mikrofon terpusat (dipakai useVAD + LiveAudio).
//
// Dua masalah observasi nyata:
// 1. micDeviceId basi di config -> OverconstrainedError "Invalid constraint".
//    Solusi: validasi via enumerateDevices dulu, abaikan id tak dikenal.
// 2. Gagal getUserMedia meledak berulang (warn x5 + alert blocking).
//    Solusi: cooldown global 60 detik; selama cooldown, caller diam.
let lastFailAt = 0
const COOLDOWN_MS = 60000

export function micCoolingDown() {
  return Date.now() - lastFailAt < COOLDOWN_MS
}

export function noteMicFailure() {
  lastFailAt = Date.now()
}

export async function resolveMicConstraints(savedId, audioSettings = {}) {
  let deviceOk = false
  try {
    if (!navigator?.mediaDevices?.enumerateDevices) {
      return null
    }
    const devs = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devs.filter((d) => d.kind === 'audioinput')
    // Jika tidak ada hardware mikrofon sama sekali di sistem host (0 devices)
    if (audioInputs.length === 0) {
      return null
    }
    deviceOk = audioInputs.some((d) => d.deviceId === savedId)
  } catch {
    return null
  }
  const audio = { ...audioSettings }
  if (savedId && savedId !== 'default' && deviceOk) {
    audio.deviceId = { ideal: savedId }
  }
  return { audio }
}
