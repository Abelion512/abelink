// harness-common.mjs — helper bersama harness-export + harness-diagnose.
// Selaras writer Rust cmd_harness.rs: data_home().join("abelink").join("harness").
// M2c: formula data-home didelegasikan ke sumber TUNGGAL
// sidecar/main/utils/dataHome.mjs (resolveDataHome: ABELINK_DATA_HOME trim >
// XDG > ~/.local/share) — dulu duplikat inline di sini.
import path from 'path'
import { resolveDataHome } from '../sidecar/main/utils/dataHome.mjs'

export const parseArgs = (argv) => {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      out[key] = next && !next.startsWith('--') ? argv[++i] : true
    }
  }
  return out
}

export const harnessRoot = (overrideDir) => {
  if (overrideDir) return overrideDir
  return path.join(resolveDataHome(process.env), 'abelink', 'harness')
}
