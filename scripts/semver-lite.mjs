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

// Regex resmi dari spesifikasi SemVer 2.0.0 (semver.org, bagian "Backus-Naur").
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** Pecah versi jadi komponen; null bila bukan SemVer valid. */
export function parse(input) {
  const m = SEMVER_RE.exec(String(input ?? '').trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
    build: m[5] ? m[5].split('.') : []
  }
}

/** Kembalikan versi ter-trim bila valid, null bila tidak (mirip semver.valid). */
export const valid = (input) => (parse(input) ? String(input).trim() : null)

// SemVer 11.4.1-11.4.3: identifier numerik dibandingkan sebagai angka dan
// selalu lebih rendah dari identifier alfanumerik.
const compareIdentifiers = (a, b) => {
  const aNum = /^(0|[1-9]\d*)$/.test(a)
  const bNum = /^(0|[1-9]\d*)$/.test(b)
  if (aNum && bNum) {
    const na = Number(a)
    const nb = Number(b)
    return na === nb ? 0 : na < nb ? -1 : 1
  }
  if (aNum) return -1
  if (bNum) return 1
  return a === b ? 0 : a < b ? -1 : 1
}

/** -1 bila a < b, 0 bila setara, 1 bila a > b. Build metadata diabaikan (SemVer 10). */
export function compare(a, b) {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa) throw new Error(`SemVer tidak valid: ${a}`)
  if (!pb) throw new Error(`SemVer tidak valid: ${b}`)

  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }

  // SemVer 11.3: rilis final lebih tinggi dari prerelease pada angka yang sama.
  if (pa.prerelease.length === 0 && pb.prerelease.length > 0) return 1
  if (pa.prerelease.length > 0 && pb.prerelease.length === 0) return -1

  const len = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < len; i++) {
    const ai = pa.prerelease[i]
    const bi = pb.prerelease[i]
    // Set identifier yang lebih pendek lebih rendah (SemVer 11.4.4).
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    const c = compareIdentifiers(ai, bi)
    if (c !== 0) return c
  }
  return 0
}

export const gt = (a, b) => compare(a, b) > 0
export const lt = (a, b) => compare(a, b) < 0
export const eq = (a, b) => compare(a, b) === 0

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
