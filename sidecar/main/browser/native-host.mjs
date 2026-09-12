// Native messaging host installer — token extension tanpa copas.
//
// Dipanggil best-effort saat bridge start (server.mjs). Menyalin skrip host
// ke data dir + menulis manifest host ke tiap browser yang config dir-nya
// ada (Chrome/Chromium). Tidak pernah menggagalkan bridge bila gagal.
//
// ID extension di-pin via field "key" di extension/manifest.json sehingga
// SAMA di semua mesin. Konstanta di bawah wajib cocok (ada test penjaga).
export const NATIVE_HOST_NAME = 'id.abelink.bridge'
export const NATIVE_HOST_VERSION = 1
// Turunan sha256 public key manifest (lihat extension/manifest.json "key").
export const EXTENSION_ID = 'kdcfgmlamndkapaiakhlplckfhmjieml'

// Home data dir: ABELINK_DATA_HOME menang atas XDG_DATA_HOME (pemisah dev/prod;
// dev.sh men-set-nya agar dev & prod bisa jalan bersamaan).
export function resolveDataHome(env = process.env) {
  const over = env?.ABELINK_DATA_HOME
  if (typeof over === 'string' && over.trim()) return over
  return env?.XDG_DATA_HOME || `${env?.HOME ?? ''}/.local/share`
}

const MANIFEST_BODY = (hostPath) =>
  JSON.stringify(
    {
      name: NATIVE_HOST_NAME,
      description: 'Abelink Bridge token helper (baca file token lokal, tanpa network).',
      path: hostPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
      'x-abelink-version': NATIVE_HOST_VERSION
    },
    null,
    2
  )

export async function ensureNativeHost({
  configHome = process.env.HOME + '/.config',
  dataHome = resolveDataHome(),
  sourceFile = null,
  browsers = [
    'google-chrome',
    'chromium',
    'google-chrome-beta',
    'google-chrome-unstable',
    'microsoft-edge',
    'BraveSoftware/Brave-Browser'
  ]
} = {}) {
  const fs = await import('node:fs')
  const path = await import('node:path')

  // Migrasi sekali-jalan brand lama (best-effort, silent): XDG/abelink -> XDG/abelink.
  // Migrasi utama di Rust setup (lib.rs); penjaga ini menutup ras headless-sidecar.
  try {
    const legacy = path.join(dataHome, 'mark')
    const current = path.join(dataHome, 'abelink')
    if (fs.existsSync(legacy) && !fs.existsSync(current)) fs.renameSync(legacy, current)
  } catch {}

  const destDir = path.join(dataHome, 'abelink', 'native-host')
  fs.mkdirSync(destDir, { recursive: true })

  const destMjs = path.join(destDir, 'abelink-bridge-host.mjs')
  const src = sourceFile?.pathname ?? String(sourceFile ?? '')
  if (src && fs.existsSync(src)) {
    try {
      fs.copyFileSync(src, destMjs)
      fs.chmodSync(destMjs, 0o755)
    } catch {}
  }

  // Wrapper shell mandiri: menggunakan python3 yang selalu tersedia di Linux Mint / Ubuntu.
  // Tidak bergantung pada keberadaan Bun atau Node di mesin pengguna rilis .deb.
  const wrapper = path.join(destDir, 'abelink-bridge-host.sh')
  const wrapperScript = `#!/bin/sh
# Abelink Bridge native messaging host wrapper (abelink-bridge-host.mjs fallback)
if [ -x "/usr/bin/python3" ]; then
  exec /usr/bin/python3 -c '
import sys, json, os, struct

def send(obj):
    raw = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(raw)) + raw)
    sys.stdout.buffer.flush()

try:
    data_home = os.environ.get("ABELINK_DATA_HOME") or os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    token_file = os.path.join(data_home, "browser-bridge-token")
    if os.path.exists(token_file):
        with open(token_file, "r", encoding="utf-8") as f:
            raw = f.read().strip()
        try:
            rec = json.loads(raw)
            tok = rec.get("token") or raw
        except Exception:
            tok = raw
        send({"ok": True, "token": tok})
    else:
        send({"ok": False, "error": "token file missing"})
except Exception as e:
    send({"ok": False, "error": str(e)})
'
fi

if command -v bun >/dev/null 2>&1 && [ -f "${destMjs}" ]; then
  exec bun "${destMjs}"
elif command -v node >/dev/null 2>&1 && [ -f "${destMjs}" ]; then
  exec node "${destMjs}"
fi
`
  fs.writeFileSync(wrapper, wrapperScript)
  fs.chmodSync(wrapper, 0o755)

  const body = MANIFEST_BODY(wrapper)
  const installed = []
  for (const b of browsers) {
    const browserDir = path.join(configHome, b)
    if (!fs.existsSync(browserDir)) continue
    const dir = path.join(browserDir, 'NativeMessagingHosts')
    fs.mkdirSync(dir, { recursive: true })
    // Bersihkan manifest brand lama agar tidak yatim (rename id.abelink.bridge).
    try {
      const legacyFile = path.join(dir, 'id.mark.bridge.json')
      if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile)
    } catch {}
    const file = path.join(dir, `${NATIVE_HOST_NAME}.json`)
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (prev === body) {
      installed.push({ browser: b, file, changed: false })
    } else {
      fs.writeFileSync(file, body)
      installed.push({ browser: b, file, changed: true })
    }
  }
  return { ok: true, host: wrapper, script: destMjs, installed }
}
