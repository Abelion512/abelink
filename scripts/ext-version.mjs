// ext-version.mjs — pemetaan versi app (SemVer) ke versi extension Chrome.
//
// Standar Chrome (developer.chrome.com/docs/extensions/reference/manifest/version):
// "version" HANYA 1-4 integer dot-separated (tiap 0-65535, tanpa nol depan,
// tak boleh semua nol); string pra-rilis SemVer ("1.0.0-alpha.4") TIDAK valid.
// "version_name" menampung label cantik untuk tampilan.
// Pemetaan: basis X.Y.Z + counter pra-rilis jadi komponen ke-4
// ("1.0.0-alpha.4" -> version "1.0.0.4", version_name "1.0.0-alpha.4").
// Chrome membandingkan per angka dari kiri, jadi update otomatis tetap jalan.
// Batas: counter pra-rilis >65535 DITOLAK (Chrome tak bisa bandingkan).
import { parse as semverParse } from './semver-lite.mjs'

const MAX_CHROME_PART = 65535

function assertChromePart(n, label) {
  if (!Number.isInteger(n) || n < 0 || n > MAX_CHROME_PART) {
    throw new Error(`Komponen ${label}=${n} di luar rentang Chrome (0-65535)`)
  }
  return n
}

// "1.0.0-alpha.4" -> { version: "1.0.0.4", versionName: "1.0.0-alpha.4" }
// "1.0.0" -> { version: "1.0.0", versionName: "1.0.0" }
export function appToExtVersion(appVersion) {
  const parsed = semverParse(appVersion)
  if (!parsed) throw new Error(`Versi app bukan SemVer: ${appVersion}`)
  assertChromePart(parsed.major, 'major')
  assertChromePart(parsed.minor, 'minor')
  assertChromePart(parsed.patch, 'patch')
  const versionName = String(appVersion).trim()
  const allZero = parsed.major === 0 && parsed.minor === 0 && parsed.patch === 0
  if (parsed.prerelease.length === 0) {
    if (allZero) throw new Error('Versi extension tak boleh semua nol (aturan Chrome)')
    return { version: `${parsed.major}.${parsed.minor}.${parsed.patch}`, versionName }
  }
  // Counter = identifier numerik TERAKHIR ("alpha.4"->4, "beta.11"->11).
  // Tanpa angka ("alpha" polos) -> 0.
  const nums = parsed.prerelease.filter((p) => /^[0-9]+$/.test(p)).map(Number)
  const counter = nums.length ? nums[nums.length - 1] : 0
  assertChromePart(counter, 'prerelease-counter')
  if (allZero && counter === 0) {
    throw new Error('Versi extension tak boleh semua nol (aturan Chrome)')
  }
  return { version: `${parsed.major}.${parsed.minor}.${parsed.patch}.${counter}`, versionName }
}
