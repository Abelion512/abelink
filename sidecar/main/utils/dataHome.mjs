// Data-home tunggal sidecar (mirror Rust lib.rs data_home() + join brand).
//
// Konvensi: ABELINK_DATA_HOME menang (namespace dev/prod, lihat dev.sh),
// lalu XDG_DATA_HOME, lalu ~/.local/share. Brand 'abelink' di-append SEKALI
// di sini (brandDir) — modul pemanggil JANGAN append lagi, agar tak terjadi
// double abelink/abelink maupun bocor ke namespace prod.
import path from 'path'

export function resolveDataHome(env = process.env) {
  const over = env?.ABELINK_DATA_HOME
  if (typeof over === 'string' && over.trim()) return over
  return env?.XDG_DATA_HOME || `${env?.HOME ?? ''}/.local/share`
}

export function brandDir(env = process.env) {
  return path.join(resolveDataHome(env), 'abelink')
}

export function isDev(env = process.env) {
  if (env?.NODE_ENV === 'development' || env?.ABELINK_DEV === '1' || env?.ABELINK_DEV === 'true') {
    return true
  }
  const over = env?.ABELINK_DATA_HOME || ''
  return over.includes('abelink-dev') || over.endsWith('-dev')
}

