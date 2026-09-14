// Native messaging host installer — token extension tanpa copas.
//
// Dipanggil best-effort saat bridge start (server.mjs). Menyalin skrip host
// ke data dir + menulis manifest host ke tiap browser yang config dir-nya
// ada (Chrome/Chromium). Tidak pernah menggagalkan bridge bila gagal.
//
// ID extension di-pin via field "key" di extension/manifest.json sehingga
// SAMA di semua mesin. Konstanta di bawah wajib cocok (ada test penjaga).
export const NATIVE_HOST_NAME = 'id.abelink.bridge'
export const NATIVE_HOST_NAME_DEV = 'id.abelink.bridge.dev'
export const NATIVE_HOST_VERSION = 1

import path from 'node:path'
import fs from 'node:fs'
// Turunan sha256 public key manifest (lihat extension/manifest.json "key").
export const EXTENSION_ID = 'kdcfgmlamndkapaiakhlplckfhmjieml'

// Home data dir: ABELINK_DATA_HOME menang atas XDG_DATA_HOME (pemisah dev/prod;
// dev.sh men-set-nya agar dev & prod bisa jalan bersamaan).
export function resolveDataHome(env = process.env) {
  const over = env?.ABELINK_DATA_HOME
  if (typeof over === 'string' && over.trim()) return over
  return env?.XDG_DATA_HOME || `${env?.HOME ?? ''}/.local/share`
}

export function hostNameForFlavor(flavor) {
  return flavor === 'dev' ? NATIVE_HOST_NAME_DEV : NATIVE_HOST_NAME
}

// destDir flavor-aware: dataHome .../abelink (+'/native-host'), dataHome
// .../abelink-dev langsung +'/native-host' (anti double-brand
// .../abelink-dev/abelink). dataHome polos (XDG base/tmp uji) -> +brand/flavor.
export function hostDirFor(dataHome, flavor = 'prod') {
  if (/(^|\/)abelink(-dev)?$/.test(dataHome)) return path.join(dataHome, 'native-host')
  return path.join(dataHome, flavor === 'dev' ? 'abelink-dev' : 'abelink', 'native-host')
}

const MANIFEST_BODY = (hostPath, name = NATIVE_HOST_NAME) =>
  JSON.stringify(
    {
      name,
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
  ],
  flavor = 'prod'
} = {}) {
  // Migrasi sekali-jalan brand lama (best-effort, silent): XDG/abelink -> XDG/abelink.
  // Migrasi utama di Rust setup (lib.rs); penjaga ini menutup ras headless-sidecar.
  try {
    const legacy = path.join(dataHome, 'mark')
    const current = path.join(dataHome, 'abelink')
    if (fs.existsSync(legacy) && !fs.existsSync(current)) fs.renameSync(legacy, current)
  } catch {}

  const hostName = hostNameForFlavor(flavor)
  const destDir = hostDirFor(dataHome, flavor)
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
  // STRICT per-flavor: wrapper prod hanya membaca path token prod, wrapper dev
  // hanya path token dev. Request namespace silang -> ok:false eksplisit.
  const wrapper = path.join(destDir, 'abelink-bridge-host.sh')
  const flavorLit = flavor === 'dev' ? 'dev' : 'prod'
  const prodTokenPy = "os.path.join(xdg, 'abelink', 'browser-bridge-token')"
  const devTokenPy = "(os.environ.get('ABELINK_DATA_HOME') or os.path.join(xdg, 'abelink-dev')) + '/browser-bridge-token'"
  const tokenExpr = flavor === 'dev' ? devTokenPy : prodTokenPy
  const wrapperScript = `#!/bin/sh
# Abelink Bridge native messaging host wrapper (flavor: ${flavorLit}; abelink-bridge-host.mjs fallback)
# STRICT: hanya membaca token flavor ${flavorLit}; namespace silang ditolak.
ABELINK_BRIDGE_FLAVOR=${flavorLit}
export ABELINK_BRIDGE_FLAVOR
if [ -x "/usr/bin/python3" ]; then
  exec /usr/bin/python3 -c '
import sys, json, os, struct

def send(obj):
    raw = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(raw)) + raw)
    sys.stdout.buffer.flush()

def read_exact(n):
    chunks = []
    while sum(len(c) for c in chunks) < n:
        part = sys.stdin.buffer.read(n - sum(len(c) for c in chunks))
        if not part:
            break
        chunks.append(part)
    return b"".join(chunks)

try:
    raw_in = read_exact(4)
    namespace = ""
    if len(raw_in) == 4:
        body_len = struct.unpack("<I", raw_in)[0]
        try:
            payload = read_exact(body_len).decode("utf-8")
            namespace = (json.loads(payload) or {}).get("namespace") or ""
        except Exception:
            namespace = ""
    req_dev = namespace in ("dev", "49713")
    host_dev = "${flavorLit}" == "dev"
    if req_dev != host_dev:
        send({"ok": False, "error": "flavor mismatch: host ${flavorLit}"})
    else:
        home = os.path.expanduser("~")
        xdg = os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share")
        token_file = ${tokenExpr}
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
  exec bun "${destMjs}" --flavor=${flavorLit}
elif command -v node >/dev/null 2>&1 && [ -f "${destMjs}" ]; then
  exec node "${destMjs}" --flavor=${flavorLit}
fi
`
  fs.writeFileSync(wrapper, wrapperScript)
  fs.chmodSync(wrapper, 0o755)

  const body = MANIFEST_BODY(wrapper, hostName)
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
    const file = path.join(dir, `${hostName}.json`)
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
