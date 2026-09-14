// Sinkronisasi versi fork ABELINK Linux.
// Single source of truth: src-tauri/tauri.conf.json -> "version"
// Target sinkron: package.json + src-tauri/Cargo.toml (+ Cargo.lock via cargo metadata saat build)
//   + extension/manifest.json (version angka Chrome, version_name label penuh;
//     pemetaan di ./ext-version.mjs).
//
// Pakai: node scripts/sync-version.mjs [--check]
//   --check : exit 1 tanpa menulis bila ada yang tidak sinkron (dipakai CI release gate).
import { readFileSync, writeFileSync } from 'node:fs'
import { appToExtVersion } from './ext-version.mjs'

const CONF_PATH = 'src-tauri/tauri.conf.json'
const PKG_PATH = 'package.json'
const CARGO_PATH = 'src-tauri/Cargo.toml'
const EXT_MANIFEST_PATH = 'extension/manifest.json'

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

if (drift.length !== 0) console.log(`[sync-version] Drift awal: ${drift.join(', ')} — perbaiki di bawah.`)

// --- extension/manifest.json (Chrome: version angka, version_name label) ---
const { version: extVersion, versionName: extName } = appToExtVersion(version)
const extRaw = readFileSync(EXT_MANIFEST_PATH, 'utf8')
const ext = JSON.parse(extRaw)
if (ext.version !== extVersion || ext.version_name !== extName) {
  drift.push(`${EXT_MANIFEST_PATH} (${ext.version}/${ext.version_name || '-'})`)
  if (!checkOnly) {
    ext.version = extVersion
    ext.version_name = extName
    writeFileSync(EXT_MANIFEST_PATH, JSON.stringify(ext, null, 2) + '\n')
    console.log(`[sync-version] ${EXT_MANIFEST_PATH}: ${extRaw.match(/"version":\s*"([^"]+)"/) ?.[1]} -> ${extVersion} (name: ${extName})`)
  }
}

if (drift.length > 0) {
  if (checkOnly) {
    // --check: tidak menulis, exit 1 menandakan drift ke CI.
    console.error(
      `[sync-version] Drift terdeteksi vs ${CONF_PATH} (${version}): ${drift.join(', ')} — jalankan \`bun run sync-version\` lalu commit.`
    )
    process.exit(1)
  }
  // Write mode: berhasil update semua file di atas. Laporkan apa yang diubah.
  console.log(`[sync-version] Update selesai: ${drift.join(', ')} -> ${version}`)
}
console.log(`[sync-version] Semua manifest sinkron di ${version}`)
