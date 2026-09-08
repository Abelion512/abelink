// Native messaging host installer — token extension tanpa copas.
//
// Dipanggil best-effort saat bridge start (server.mjs). Menyalin skrip host
// ke data dir + menulis manifest host ke tiap browser yang config dir-nya
// ada (Chrome/Chromium). Tidak pernah menggagalkan bridge bila gagal.
//
// ID extension di-pin via field "key" di extension/manifest.json sehingga
// SAMA di semua mesin. Konstanta di bawah wajib cocok (ada test penjaga).
export const NATIVE_HOST_NAME = 'id.mark.bridge'
export const NATIVE_HOST_VERSION = 1
// Turunan sha256 public key manifest (lihat extension/manifest.json "key").
export const EXTENSION_ID = 'kdcfgmlamndkapaiakhlplckfhmjieml'

const MANIFEST_BODY = (hostPath) =>
  JSON.stringify(
    {
      name: NATIVE_HOST_NAME,
      description: 'Mark Bridge token helper (baca file token lokal, tanpa network).',
      path: hostPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
      'x-mark-version': NATIVE_HOST_VERSION
    },
    null,
    2
  )

export async function ensureNativeHost({
  configHome = process.env.HOME + '/.config',
  dataHome = process.env.XDG_DATA_HOME || process.env.HOME + '/.local/share',
  sourceFile = new URL('../../../extension/native-host/mark-bridge-host.mjs', import.meta.url),
  browsers = ['google-chrome', 'chromium']
} = {}) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const src = sourceFile?.pathname ?? String(sourceFile ?? '')
  if (!src || !fs.existsSync(src)) return { ok: false, skipped: 'skrip host tidak ada (mode bundle?)' }

  const destDir = path.join(dataHome, 'mark', 'native-host')
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, 'mark-bridge-host.mjs')
  fs.copyFileSync(src, dest)
  fs.chmodSync(dest, 0o755)

  // Wrapper shell dengan path runtime ABSOLUT: Chrome yang dibuka dari
  // desktop tidak mewarisi PATH shell user (~/.bun/bin), sehingga
  // `#!/usr/bin/env bun` gagal dan helper "tidak ada". Manifest menunjuk
  // ke wrapper ini, bukan langsung ke .mjs.
  const wrapper = path.join(destDir, 'mark-bridge-host.sh')
  const runtime = process.execPath || 'bun'
  fs.writeFileSync(wrapper, `#!/bin/sh\nexec "${runtime}" "${dest}"\n`)
  fs.chmodSync(wrapper, 0o755)

  const body = MANIFEST_BODY(wrapper)
  const installed = []
  for (const b of browsers) {
    const dir = path.join(configHome, b, 'NativeMessagingHosts')
    if (!fs.existsSync(path.join(configHome, b))) continue
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${NATIVE_HOST_NAME}.json`)
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (prev === body) {
      installed.push({ browser: b, file, changed: false })
    } else {
      fs.writeFileSync(file, body)
      installed.push({ browser: b, file, changed: true })
    }
  }
  return { ok: true, host: wrapper, script: dest, installed }
}
