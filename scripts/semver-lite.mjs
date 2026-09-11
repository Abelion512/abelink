#!/usr/bin/env node
// Semver-lite — validasi & perbandingan SemVer TANPA dependensi eksternal.
//
// Alasan (audit 2026-09): .github/workflows/release-finalize.yml memakai
// `node -e "const semver=require('semver')"` padahal paket `semver` TIDAK
// terdaftar di package.json — ia hanya kebetulan ada sebagai transitive
// dependency. Begitu hoisting bun berubah atau paket induknya hilang, gerbang
// rilis mati dengan ERR_MODULE_NOT_FOUND dan finalisasi rilis gagal tanpa
// alasan yang jelas. Modul ini menghapus ketergantungan rapuh itu.
//
// Dipakai sebagai CLI oleh workflow (exit 0 = benar, 1 = salah):
//   node scripts/semver-lite.mjs valid "1.0.0-alpha.3"
//   node scripts/semver-lite.mjs gt "1.0.0-alpha.3" "1.0.0-alpha.2"

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { valid, gt } from '../src/api/semverLite.js'

// ----------------------------------------------------------------- CLI
const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const [cmd, a, b] = process.argv.slice(2)
  try {
    if (cmd === 'valid') {
      process.exit(valid(a) ? 0 : 1)
    } else if (cmd === 'gt') {
      process.exit(gt(a, b) ? 0 : 1)
    } else {
      console.error('Pemakaian: semver-lite.mjs valid <versi> | gt <versiA> <versiB>')
      process.exit(2)
    }
  } catch (err) {
    console.error(String(err?.message || err))
    process.exit(1)
  }
}

export { valid, gt }
export { parse, compare, lt, eq, rcompare } from '../src/api/semverLite.js'
