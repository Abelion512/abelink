// Native messaging host: protokol + installer + pin ID extension.
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { ensureNativeHost, NATIVE_HOST_NAME, EXTENSION_ID } from '../sidecar/main/browser/native-host.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const HOST = path.join(ROOT, 'extension', 'native-host', 'mark-bridge-host.mjs')

function sendMsg(child, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)
  child.stdin.write(Buffer.concat([head, body]))
}

function readOne(child) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0)
    const timer = setTimeout(() => reject(new Error('timeout baca respons host')), 10000)
    child.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (buf.length >= 4) {
        const len = buf.readUInt32LE(0)
        if (buf.length >= 4 + len) {
          clearTimeout(timer)
          resolve(JSON.parse(buf.subarray(4, 4 + len).toString('utf8')))
        }
      }
    })
    child.stdout.on('error', reject)
  })
}

describe('host: protokol get-token', () => {
  it('mengembalikan token dari file', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-host-'))
    fs.writeFileSync(path.join(home, 'browser-bridge-token'), 'tok-rahasia', { mode: 0o600 })
    const child = spawn(process.execPath, [HOST], { env: { ...process.env, XDG_DATA_HOME: home }, stdio: ['pipe', 'pipe', 'ignore'] })
    try {
      const p = readOne(child)
      sendMsg(child, { type: 'get-token' })
      const res = await p
      expect(res.ok).toBe(true)
      expect(res.token).toBe('tok-rahasia')
    } finally {
      child.kill()
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('file hilang -> ok:false, bukan crash', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-host-'))
    const child = spawn(process.execPath, [HOST], { env: { ...process.env, XDG_DATA_HOME: home }, stdio: ['pipe', 'pipe', 'ignore'] })
    try {
      const p = readOne(child)
      sendMsg(child, { type: 'salah' })
      expect((await p).ok).toBe(false)
      const p2 = readOne(child)
      sendMsg(child, { type: 'get-token' })
      expect((await p2).ok).toBe(false)
    } finally {
      child.kill()
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('installer', () => {
  it('salin skrip + tulis manifest, idempoten kedua kali', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-host-inst-'))
    const configHome = path.join(tmp, 'config')
    const dataHome = path.join(tmp, 'data')
    fs.mkdirSync(path.join(configHome, 'google-chrome'), { recursive: true })
    const opts = { configHome, dataHome, sourceFile: { pathname: HOST } }
    const r1 = await ensureNativeHost(opts)
    expect(r1.ok).toBe(true)
    const manifest = path.join(configHome, 'google-chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`)
    expect(fs.existsSync(manifest)).toBe(true)
    const body = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    expect(body.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID}/`])
    expect(body.path).toBe(path.join(dataHome, 'mark', 'native-host', 'mark-bridge-host.sh'))
    expect(fs.existsSync(body.path)).toBe(true)
    // Wrapper memakai runtime absolut (bukan env PATH).
    const wrapperSrc = fs.readFileSync(body.path, 'utf8')
    expect(wrapperSrc.startsWith('#!/bin/sh')).toBe(true)
    expect(wrapperSrc).toContain('mark-bridge-host.mjs')
    expect(r1.installed[0].changed).toBe(true)
    const r2 = await ensureNativeHost(opts)
    expect(r2.installed[0].changed).toBe(false)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('browser tanpa config dir dilewati, bukan gagal', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-host-inst-'))
    const r = await ensureNativeHost({ configHome: path.join(tmp, 'cfg'), dataHome: path.join(tmp, 'data'), sourceFile: { pathname: HOST } })
    expect(r.ok).toBe(true)
    expect(r.installed).toEqual([])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('pin ID extension', () => {
  it('EXTENSION_ID cocok turunan key manifest (anti-drift)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'))
    expect(typeof manifest.key).toBe('string')
    const der = Buffer.from(manifest.key, 'base64')
    const h = crypto.createHash('sha256').update(der).digest().subarray(0, 16)
    const id = [...h].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('')
    expect(id).toBe(EXTENSION_ID)
  })
})
