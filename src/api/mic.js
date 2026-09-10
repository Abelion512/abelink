// Resolusi mikrofon terpusat (dipakai useVAD + LiveAudio).
//
// Dua masalah observasi nyata:
// 1. micDeviceId basi di config -> OverconstrainedError "Invalid constraint".
//    Solusi: validasi via enumerateDevices dulu, abaikan id tak dikenal.
// 2. Gagal getUserMedia meledak berulang (warn x5 + alert blocking).
//    Solusi: cooldown global 60 detik; selama cooldown, caller diam.
let lastFailAt = 0
const COOLDOWN_MS = 4000

export function micCoolingDown() {
  return Date.now() - lastFailAt < COOLDOWN_MS
}

export function noteMicFailure() {
  lastFailAt = Date.now()
}

export function resetMicFailure() {
  lastFailAt = 0
}

export async function resolveMicConstraints(savedId, audioSettings = {}) {
  let deviceOk = false
  try {
    if (navigator?.mediaDevices?.enumerateDevices) {
      const devs = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devs.filter((d) => d.kind === 'audioinput')
      if (audioInputs.length > 0 && savedId && savedId !== 'default') {
        deviceOk = audioInputs.some((d) => d.deviceId === savedId)
      }
    }
  } catch {
    // Abaikan error enumerasi awal; lanjutkan dengan stream audio default
  }
  const audio = { ...audioSettings }
  if (savedId && savedId !== 'default' && deviceOk) {
    audio.deviceId = { ideal: savedId }
  } else if (Object.keys(audio).length === 0) {
    return { audio: true }
  }
  return { audio }
}
