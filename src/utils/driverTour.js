// Helper bersama untuk tur Driver.js (Configuration, Plugins, dst).
// Akar bug "petunjuk salah tunjuk": langkah yang menunjuk elemen yang tidak
// ada atau sedang hidden membuat spotlight melayang ngawang. Aturannya:
// langkah tanpa target nyata-terlihat TIDAK BOLEH masuk ke drive().
import { driver } from 'driver.js'

/**
 * Elemen dianggap terlihat bila punya rect ter-render ATAU offsetParent
 * (getClientRects menutup kasus position:fixed; offsetParent menutup
 * subtree display:none biasa).
 */
export const isElementVisible = (el) => {
  if (!el) return false
  try {
    if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) return true
  } catch {
    /* jsdom/env tanpa layout: biarkan offsetParent yang memutuskan */
  }
  return el.offsetParent !== null && el.offsetParent !== undefined
}

/**
 * Saring langkah tour: popover tanpa `element` selalu lolos (langkah intro);
 * langkah ber-elemen hanya lolos bila elemennya ada dan terlihat.
 */
export const filterExistingSteps = (steps) => {
  if (!Array.isArray(steps)) return []
  return steps.filter((step) => {
    if (!step?.element) return true
    let el = null
    try {
      el = document.querySelector(step.element)
    } catch {
      return false // selector invalid = anggap hantu
    }
    return isElementVisible(el)
  })
}

/**
 * Jalankan tour dengan langkah yang sudah disaring. Mengembalikan instance
 * Driver.js, atau null bila tak ada langkah valid (driver TIDAK dipanggil).
 */
export const startDriverTour = (steps, options = {}) => {
  const usable = filterExistingSteps(steps)
  if (usable.length === 0) return null
  const driverObj = driver({ ...options, steps: usable })
  driverObj.drive()
  return driverObj
}
