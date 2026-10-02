// Build extension (W8) — `bun run build:extension`.
//
// Standar yang dipakai: dokumentasi resmi Chrome, bukan pilihan sendiri.
// https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
//
//   "To use the import statement, add the 'type' field to your manifest and
//    specify 'module'."  → service worker MV3 boleh ESM sejak Chrome 91.
//
// Konsekuensinya: TIDAK PERLU bundler. Chrome bisa memuat service worker yang
// berupa modul ES dengan `import` biasa. Yang kita butuhkan cuma transpile
// `.ts` → `.js` (browser tidak bisa baca TypeScript) dengan struktur modul
// dipertahankan apa adanya.
//
// Karena tidak ada bundling, artefak `.js` bisa diletakkan DI DALAM folder
// `extension/` — sehingga "Load unpacked → folder extension/" (alur yang
// tertulis di extension/README.md dan docs/EXTENSION-PUBLISH-CHECKLIST.md)
// TIDAK BERUBAH. Tidak ada folder output baru, tidak ada langkah "build lalu
// load folder lain".
//
// Yang di-generate (gitignored, selalu bisa dibangun ulang):
//   extension/background.js          <- extension/src/background.ts
//   extension/popup.js               <- extension/src/popup.ts
//   extension/lib/*.js               <- extension/src/lib/*.ts
//
// Yang TIDAK disentuh: manifest.json, popup.html, icons/, README.
// Versi manifest tetap milik sync-version/ext-version sebagai satu-satunya
// sumber kebenaran.

import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'extension', 'src')
const EXT = path.join(ROOT, 'extension')

// outbase/outdir: extension/src/**.ts -> extension/**.js. Struktur modul ESM
// dipertahankan (bukan di-inline), sesuai standar service worker modul Chrome.
const ENTRY_POINTS = [
  path.join(SRC, 'background.ts'),
  path.join(SRC, 'popup.ts'),
  path.join(SRC, 'lib', 'browser-observation.ts'),
  path.join(SRC, 'lib', 'overlay-policy.ts'),
  path.join(SRC, 'lib', 'popup-status.ts'),
  path.join(SRC, 'lib', 'tab-identity.ts'),
  path.join(SRC, 'lib', 'tagger-rank.ts')
]

async function main() {
  await build({
    entryPoints: ENTRY_POINTS,
    outdir: EXT,
    outbase: SRC,
    bundle: false, // struktur modul dipertahankan; Chrome yang me-resolve import
    format: 'esm',
    target: ['chrome110'],
    platform: 'browser',
    sourcemap: 'linked', // Inspect service worker di chrome://extensions tetap enak dibaca
    minify: false,
    legalComments: 'none',
    logLevel: 'warning'
  })

  assertManifestDeclaresModule()
  assertImportSpecifiersResolvable()

  console.log('extension: extension/{background,popup,lib/*}.js diperbarui dari extension/src/**/*.ts')
  console.log('           muat ulang di chrome://extensions -> Reload (folder extension/ tetap sama)')
}

// Penjaga 1: manifest harus mendeklarasikan service worker sebagai modul.
// Tanpa ini, `import` di background.js gagal dimuat dengan pesan "Cannot use
// import statement outside a module" — kesalahan yang mahal dicari di browser.
function assertManifestDeclaresModule() {
  const manifestPath = path.join(EXT, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bg = manifest?.background
  if (!bg?.service_worker) {
    console.error('manifest.json: background.service_worker tidak ada')
    process.exit(1)
  }
  if (bg.type !== 'module') {
    console.error(
      'manifest.json: background.type harus "module" — extension/src/background.ts memakai import ESM.'
    )
    process.exit(1)
  }
}

// Penjaga 2: setiap `import ... from './x.js'` di artefak harus benar-benar ada
// di disk. esbuild tidak me-resolve saat bundle:false, jadi specifier salah
// baru ketahuan saat Chrome memuat service worker.
function assertImportSpecifiersResolvable() {
  const artifacts = [
    path.join(EXT, 'background.js'),
    path.join(EXT, 'popup.js')
  ]
  const missing = []
  for (const file of artifacts) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(file), m[1])
      try {
        readFileSync(target)
      } catch {
        missing.push(`${path.relative(ROOT, file)} -> ${m[1]}`)
      }
    }
  }
  if (missing.length) {
    console.error('build-extension: import relatif tidakresolve:')
    for (const m of missing) console.error('  ' + m)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
