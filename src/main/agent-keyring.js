// src/main/agent-keyring.js
// MARK's signing identity — Ed25519 keypair, encrypted at rest via safeStorage.
import { safeStorage } from 'electron'
import { generateKeyPairSync, sign, verify, createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

const KEY_DIR = path.join(os.homedir(), '.config', 'mark-agent', 'keys')
const KEY_FILE = path.join(KEY_DIR, 'mark-signing-key.bin')

let cached = null

/** Load keypair from disk (decrypted) or generate + persist on first run. */
function loadOrCreateKey() {
  if (cached) return cached

  if (fs.existsSync(KEY_FILE)) {
    const blob = fs.readFileSync(KEY_FILE)
    const pem = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(blob)
      : blob.toString('utf8')
    cached = JSON.parse(pem)
    return cached
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  cached = {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' })
  }
  fs.mkdirSync(KEY_DIR, { recursive: true })
  const payload = JSON.stringify(cached)
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(payload)
    : (console.warn('[Keyring] safeStorage unavailable — storing key as plaintext (chmod 600)'), Buffer.from(payload))
  fs.writeFileSync(KEY_FILE, out, { mode: 0o600 })
  return cached
}

/**
 * Canonical string for signing/verification.
 * Includes body hash so ANY content tamper invalidates the signature.
 */
export function buildCanonical({ name, watermark = '', origin, provider = '', bodyHash }) {
  return [
    `name:${name}`,
    `watermark:${watermark}`,
    `origin:${origin}`,
    `provider:${provider}`,
    `body:${bodyHash}`
  ].join('\n')
}

/** sha256 hex of a skill body (for canonical + manifest checks) */
export function hashBody(body) {
  return createHash('sha256').update(body).digest('hex')
}

/** Sign a canonical string. Returns base64 signature. */
export function signContent(canonical) {
  const { privateKey } = loadOrCreateKey()
  return sign(null, Buffer.from(canonical), privateKey).toString('base64')
}

/** Verify a base64 signature against a canonical string. Returns boolean. */
export function verifyContent(canonical, signature) {
  if (!signature) return false
  try {
    const { publicKey } = loadOrCreateKey()
    return verify(null, Buffer.from(canonical), publicKey, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}
