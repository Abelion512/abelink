// Mark Sidecar — channel registry core.
// Satu-satunya tempat yang tahu bentuk frame protokol; modul channel hanya
// mendaftarkan handler lewat on() dan tidak pernah menulis stdout langsung.
//
//   request : {"id":1,"action":"ai:fetch","payload":[...args]}
//   response: {"id":1,"success":true,"data":...} | {"id":1,"success":false,"error":"..."}
//   event   : {"event":"ai:status","payload":"..."}

export const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
export const emit = (event, payload) => send({ event, payload })
export const ok = (data) => ({ success: true, data: data ?? null })
export const fail = (error) => ({ success: false, error: String(error?.message || error) })

export const handlers = {}

export const on = (action, fn) => {
  handlers[action] = async (payload) => ok(await fn(...(Array.isArray(payload) ? payload : [payload])))
}

export const unsupported = (phase) => async () =>
  ok({ unsupported: true, message: `Channel ini dipindah ke ${phase} (lihat docs/MIGRATION-PLAN.md)` })

// Prinsip load-when-needed: modul berat hanya di-import saat channel-nya
// dipakai pertama kali. Startup sidecar jadi instan, dan efek samping modul
// (mis. interval polling window-tracker) baru hidup saat benar-benar dibutuhkan.
export const lazy = (loader) => {
  let p = null
  return () => (p ??= loader())
}
