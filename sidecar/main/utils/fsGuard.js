import path from 'path'

/**
 * Guard kontainemen path workspace.
 * Menolak path absolut, segmen '..', dan awalan '~' (ekspansi home)
 * agar operasi file tidak bisa keluar dari folder workspace.
 * Mengembalikan path hasil resolve di dalam root, atau null bila ditolak.
 */
export function resolveContained(root, p) {
  const r = path.resolve(String(root || ''))
  const target = String(p ?? '').trim()
  if (!target) return null
  // Tolak path absolut dan ekspansi home (~) secara eksplisit.
  if (path.isAbsolute(target)) return null
  if (target.startsWith('~')) return null
  // Tolak segmen '..' sebelum resolve agar traversal tersaring lebih awal.
  const segments = target.split(/[\\/]+/)
  if (segments.some((s) => s === '..')) return null
  const resolved = path.resolve(r, target)
  // Pemeriksaan ganda setelah resolve sebagai jaring pengaman terakhir.
  if (resolved !== r && !resolved.startsWith(r + path.sep)) return null
  return resolved
}

/**
 * Bentuk hasil siap pakai untuk handler tool:
 * { ok: true, path } bila aman, atau { ok: false, error } bila ditolak.
 */
export function assertContained(root, p) {
  const resolved = resolveContained(root, p)
  if (!resolved) return { ok: false, error: 'Path di luar workspace tidak diizinkan' }
  return { ok: true, path: resolved }
}
