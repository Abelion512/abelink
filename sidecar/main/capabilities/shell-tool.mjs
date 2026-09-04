// Connector plugin: shell via tool `run-shell` yang sudah ada.
// Catatan penting: handler run-shell di node-tools.js punya gate approval
// DINAMIS (dangerous-keyword check). Agar satu sumber kebenaran, plugin ini
// memanggil NATIVE_TOOLS['run-shell'].needsApproval(command) sendiri untuk
// menentukan policy — TANPA menduplikasi daftar keyword berbahaya.
//
// Perilaku approval (satu sumber kebenaran):
// - Perintah AMAN  -> langsung dieksekusi (tidak ada gate internal kedua;
//   gate `capabilities:execute` di jalur Tauri menangkap ini secara konsisten).
// - Perintah BERBAHAYA -> sinyal approval dengan PESAN dari tool asli
//   (approvalMessage) diteruskan ke atas; dialog rfd di Rust main thread yang
//   menampilkan dan memutuskan — tidak ada blok diam-diam.

import { NATIVE_TOOLS } from '../node-tools.js'

// Test hook: override perilaku isDangerousCommand untuk keperluan pengujian
// (null = pakai perilaku asli). Import node-tools tetap jalan normal; hanya
// keputusan approval yang bisa di-stub sehingga tes tidak menyentuh spawn.
let _dangerousOverride = null
export const setDangerousOverride = (v) => {
  _dangerousOverride = v
}

export async function runShellTool(actionId, args, ctx) {
  if (actionId !== 'exec') throw new Error(`Aksi shell-tool tidak dikenal: ${actionId}`)
  const command = String(args?.command || '').trim()
  if (!command) throw new Error('Parameter command wajib diisi.')

  const tool = NATIVE_TOOLS['run-shell']
  if (!tool) throw new Error('Tool run-shell tidak tersedia.')

  const needsApproval =
    _dangerousOverride !== null
      ? !!_dangerousOverride
      : typeof tool.needsApproval === 'function'
        ? tool.needsApproval(command)
        : !!tool.needsApproval
  if (needsApproval) {
    // Teruskan sinyal dengan PESAN asli dari tool (bukan blok di sini).
    const e = new Error(
      tool.approvalMessage
        ? tool.approvalMessage(command)
        : `Perintah berbahaya perlu persetujuan: ${command}`
    )
    e.code = 'CAPABILITY_APPROVAL_REQUIRED'
    e.approvalMessage = e.message
    throw e
  }

  const result =
    _dangerousOverride !== null
      ? { success: true, output: 'MOCK-OUTPUT', error: null }
      : await tool.handler(command, ctx?.config || undefined)
  if (!result?.success) {
    throw new Error(result?.message || result?.error || 'run-shell gagal tanpa pesan.')
  }
  return { output: result.output, stderr: result.error || null }
}
