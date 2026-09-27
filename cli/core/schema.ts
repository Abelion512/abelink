// cli/core/schema.ts — kontrak frame JSON-over-stdio client <-> sidecar engine.
//
// Single source bentuk frame; registry.mjs (sisi engine) dan
// sidecar-client.mjs (sisi client) wajib konsisten dengan tipe ini.
// Kontrak runtime TIDAK berubah: `payload` tetap array atau tunggal,
// response tetap `{ success, data | error }`, event tetap `{ event, payload }`.
//
// Referensi: sidecar/engine/registry.mjs:5-7.

/** Request client -> engine: `{ id, action, payload }`. */
export interface SidecarRequest {
  id: number
  action: string
  payload?: unknown
}

/** Response engine -> client (sukses): `{ id, success: true, data }`. */
export interface SidecarSuccessResponse {
  id: number
  success: true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

/** Response engine -> client (gagal): `{ id, success: false, error }`. */
export interface SidecarErrorResponse {
  id: number
  success: false
  error: string
}

export type SidecarResponse = SidecarSuccessResponse | SidecarErrorResponse

/** Event engine -> client (tanpa id): `{ event, payload }`. */
export interface SidecarEvent {
  event: string
  payload?: unknown
}

/** Type guard: bedakan response ber-id dari event tanpa id. */
export function isSidecarResponse(msg: unknown): msg is SidecarResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { id?: unknown }).id != null &&
    typeof (msg as { success?: unknown }).success === 'boolean'
  )
}
