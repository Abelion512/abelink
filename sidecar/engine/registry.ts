// Abelink Sidecar — channel registry core.
// Satu-satunya tempat yang tahu bentuk frame protokol; modul channel hanya
// mendaftarkan handler lewat on() dan tidak pernah menulis stdout langsung.
//
//   request : {"id":1,"action":"ai:fetch","payload":[...args]}
//   response: {"id":1,"success":true,"data":...} | {"id":1,"success":false,"error":"..."}
//   event   : {"event":"ai:status","payload":"..."}
//
// W1-1 (js-to-ts-spec.md): rename .mjs -> .ts + kontrak frame jadi tipe.
// Wire format BEKU — tiap baris tetap satu objek JSON + '\n'.

/** Frame permintaan masuk via stdin. */
export type FrameRequest = { id: number | null; action: string; payload: unknown }

/** Frame respons keluar (balasan langsung atas satu request).
 * error = unknown: sebagian handler (mis. ai:fetch) mengirim objek
 * { message, code }, bukan string — wire format tidak diubah. */
export type FrameResponse = {
  id: number | null
  success: boolean
  data?: unknown
  error?: unknown
}

/** Frame event keluar (broadcast tanpa korelasi id). */
export type FrameEvent = { event: string; payload: unknown }

/** Handler channel menerima sisa argumen payload yang sudah di-spread on(). */
export type HandlerFn = (...args: unknown[]) => unknown

/** Bentuk yang dikembalikan handler setelah dibungkus ok()/fail().
 * error = unknown: sebagian handler (mis. ai:fetch) mengirim objek
 * { message, code }, bukan string — wire format tidak diubah. */
export type HandlerResult = { success: boolean; data?: unknown; error?: unknown }

export const send = (frame: FrameResponse | FrameEvent): void => {
  process.stdout.write(JSON.stringify(frame) + '\n')
}

export const emit = (event: string, payload: unknown): void => send({ event, payload })

export const ok = (data: unknown): { success: true; data: unknown } => ({
  success: true,
  data: data ?? null,
})

export const fail = (error: unknown): { success: false; error: string } => ({
  success: false,
  error: String((error as { message?: string })?.message || error),
})

export const handlers: Record<string, (payload: unknown) => Promise<HandlerResult>> = {}

export const on = (action: string, fn: HandlerFn): void => {
  handlers[action] = async (payload: unknown) =>
    ok(await fn(...(Array.isArray(payload) ? payload : [payload])))
}

// Prinsip load-when-needed: modul berat hanya di-import saat channel-nya
// dipakai pertama kali. Startup sidecar jadi instan, dan efek samping modul
// (mis. interval polling window-tracker) baru hidup saat benar-benar dibutuhkan.
export const lazy = <T>(loader: () => Promise<T>): (() => Promise<T>) => {
  let p: Promise<T> | null = null
  return () => (p ??= loader())
}
