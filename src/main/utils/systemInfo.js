import os from 'os'

const GB = 1024 ** 3

export function detectLiteMode() {
  const envOverride = process.env.LITE_MODE
  const totalRAMGB = os.totalmem() / GB
  if (envOverride === '1') return { isLite: true, totalRAMGB: +totalRAMGB.toFixed(1) }
  if (envOverride === '0') return { isLite: false, totalRAMGB: +totalRAMGB.toFixed(1) }
  const isLite = totalRAMGB <= 4.2
  return { isLite, totalRAMGB: +totalRAMGB.toFixed(1) }
}
