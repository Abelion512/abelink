// SemVer murni tanpa dependensi — aman untuk renderer (browser), sidecar,
// maupun skrip Node. Single source of truth untuk parse/compare/gt/lt/eq;
// scripts/semver-lite.mjs hanyalah pembungkus CLI di atas modul ini.

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
export const rcompare = (a, b) => compare(b, a)

export default { parse, valid, compare, gt, lt, eq, rcompare }
