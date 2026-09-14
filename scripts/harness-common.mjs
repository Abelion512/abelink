// harness-common.mjs — helper bersama harness-export + harness-diagnose.
// Selaras writer Rust cmd_harness.rs: data_home().join("abelink").join("harness").
// ABELINK_DATA_HOME (.../abelink-dev) belum termasuk brand.
import { homedir } from 'os'
import path from 'path'

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
  const base =
    process.env.ABELINK_DATA_HOME || process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share')
  return path.join(base, 'abelink', 'harness')
}
