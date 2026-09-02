// Sinkronisasi versi fork MARK Linux.
// Single source of truth: src-tauri/tauri.conf.json -> "version"
// Target sinkron: package.json + src-tauri/Cargo.toml (+ Cargo.lock via cargo metadata saat build).
//
// Pakai: node scripts/sync-version.mjs [--check]
//   --check : exit 1 tanpa menulis bila ada yang tidak sinkron (dipakai CI release gate).
import { readFileSync, writeFileSync } from 'node:fs'

const CONF_PATH = 'src-tauri/tauri.conf.json'
const PKG_PATH = 'package.json'
const CARGO_PATH = 'src-tauri/Cargo.toml'

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/
const checkOnly = process.argv.includes('--check')

const conf = JSON.parse(readFileSync(CONF_PATH, 'utf8'))
const version = conf.version
if (!SEMVER_RE.test(version)) {
  console.error(`[sync-version] Versi di ${CONF_PATH} tidak valid: "${version}"`)
  process.exit(1)
}

let drift = []

// --- package.json ---
const pkgRaw = readFileSync(PKG_PATH, 'utf8')
const pkg = JSON.parse(pkgRaw)
if (pkg.version !== version) {
  if (!checkOnly) {
    pkg.version = version
    writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`[sync-version] package.json: ${pkg.version || '(kosong)'} -> ${version}`)
  }
  drift.push(`package.json (${pkg.version})`)
}

// --- Cargo.toml (hanya blok [package], kemunculan `version =` pertama) ---
const cargoRaw = readFileSync(CARGO_PATH, 'utf8')
const pkgSection = cargoRaw.match(/^\[package\]\r?\n(?:(?!^\[).)*/ms)
if (!pkgSection) {
  console.error(`[sync-version] Blok [package] tidak ditemukan di ${CARGO_PATH}`)
  process.exit(1)
}
const verLine = pkgSection[0].match(/^version\s*=\s*"([^"]+)"/m)
if (!verLine) {
  console.error(`[sync-version] Field version tidak ditemukan di [package] ${CARGO_PATH}`)
  process.exit(1)
}
if (verLine[1] !== version) {
  if (!checkOnly) {
    const updatedBlock = pkgSection[0].replace(
      /^version\s*=\s*"[^"]+"/m,
      `version = "${version}"`
    )
    writeFileSync(CARGO_PATH, cargoRaw.replace(pkgSection[0], updatedBlock))
    console.log(`[sync-version] Cargo.toml: ${verLine[1]} -> ${version}`)
  }
  drift.push(`Cargo.toml (${verLine[1]})`)
}

if (drift.length > 0) {
  const msg = `[sync-version] Drift versi vs ${CONF_PATH} (${version}): ${drift.join(', ')}`
  if (checkOnly) {
    console.error(msg + ' — jalankan `bun run sync-version` lalu commit.')
    process.exit(1)
  }
} else {
  console.log(`[sync-version] Semua manifest sinkron di ${version}`)
}
