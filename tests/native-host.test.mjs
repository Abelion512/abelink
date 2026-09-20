// Native messaging host: protokol + installer + pin ID extension.
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { ensureNativeHost, NATIVE_HOST_NAME, NATIVE_HOST_NAME_DEV, EXTENSION_ID, resolveDataHome, hostNameForFlavor, hostDirFor } from '../sidecar/main/browser/native-host.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const HOST = path.join(ROOT, 'extension', 'native-host', 'abelink-bridge-host.mjs')

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

describe('host: protokol get-token (strict per-flavor)', () => {
  it('host prod membaca path kanonik prod', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-'))
    const brand = path.join(home, 'abelink')
    fs.mkdirSync(brand, { recursive: true })
    fs.writeFileSync(path.join(brand, 'browser-bridge-token'), 'tok-rahasia', { mode: 0o600 })
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

  it('host prod menolak namespace dev; host dev (FLAVOR_PINNED) melayani tanpa namespace', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-'))
    const devDir = path.join(home, 'abelink-dev')
    fs.mkdirSync(devDir, { recursive: true })
    fs.writeFileSync(path.join(devDir, 'browser-bridge-token'), 'tok-dev', { mode: 0o600 })
    const prodBrand = path.join(home, 'abelink')
    fs.mkdirSync(prodBrand, { recursive: true })
    fs.writeFileSync(path.join(prodBrand, 'browser-bridge-token'), 'tok-prod', { mode: 0o600 })
    const prod = spawn(process.execPath, [HOST], { env: { ...process.env, XDG_DATA_HOME: home }, stdio: ['pipe', 'pipe', 'ignore'] })
    const dev = spawn(process.execPath, [HOST, '--flavor=dev'], { env: { ...process.env, XDG_DATA_HOME: home }, stdio: ['pipe', 'pipe', 'ignore'] })
    try {
      // Host prod (tidak FLAVOR_PINNED): masih check namespace -> namespace dev ditolak.
      let p = readOne(prod)
      sendMsg(prod, { type: 'get-token', namespace: 'dev' })
      expect((await p).ok).toBe(false)
      p = readOne(prod)
      sendMsg(prod, { type: 'get-token' })
      expect((await p).token).toBe('tok-prod')
      // Host dev (FLAVOR_PINNED via --flavor=dev): skip namespace check.
      // background.js baru tidak kirim namespace; host melayani langsung.
      p = readOne(dev)
      sendMsg(dev, { type: 'get-token' })
      expect((await p).token).toBe('tok-dev')
      // Dengan namespace='dev' pun tetap dilayani (FLAVOR_PINNED = field diabaikan).
      p = readOne(dev)
      sendMsg(dev, { type: 'get-token', namespace: 'dev' })
      expect((await p).token).toBe('tok-dev')
    } finally {
      prod.kill()
      dev.kill()
      fs.rmSync(home, { recursive: true, force: true })
    }
  })


  it('file hilang -> ok:false, bukan crash', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-'))
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-inst-'))
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
    expect(body.path).toBe(path.join(dataHome, 'abelink', 'native-host', 'abelink-bridge-host.sh'))
    expect(fs.existsSync(body.path)).toBe(true)
    // Wrapper memakai runtime absolut (bukan env PATH).
    const wrapperSrc = fs.readFileSync(body.path, 'utf8')
    expect(wrapperSrc.startsWith('#!/bin/sh')).toBe(true)
    expect(wrapperSrc).toContain('abelink-bridge-host.mjs')
    expect(r1.installed[0].changed).toBe(true)
    const r2 = await ensureNativeHost(opts)
    expect(r2.installed[0].changed).toBe(false)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('browser tanpa config dir dilewati, bukan gagal', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-inst-'))
    const r = await ensureNativeHost({ configHome: path.join(tmp, 'cfg'), dataHome: path.join(tmp, 'data'), sourceFile: { pathname: HOST } })
    expect(r.ok).toBe(true)
    expect(r.installed).toEqual([])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('pin ID extension', () => {  it('EXTENSION_ID cocok turunan key manifest (anti-drift)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'))
    expect(typeof manifest.key).toBe('string')
    const der = Buffer.from(manifest.key, 'base64')
    const h = crypto.createHash('sha256').update(der).digest().subarray(0, 16)
    const id = [...h].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('')
    expect(id).toBe(EXTENSION_ID)
  })
})

describe('dua host prod/dev', () => {
  it('hostNameForFlavor + hostDirFor flavor-aware (anti double-brand)', () => {
    expect(hostNameForFlavor('prod')).toBe(NATIVE_HOST_NAME)
    expect(hostNameForFlavor('dev')).toBe(NATIVE_HOST_NAME_DEV)
    expect(NATIVE_HOST_NAME_DEV).toBe('id.abelink.bridge.dev')
    expect(hostDirFor('/x/abelink', 'prod')).toBe(path.join('/x/abelink', 'native-host'))
    expect(hostDirFor('/x/abelink-dev', 'dev')).toBe(path.join('/x/abelink-dev', 'native-host'))
    expect(hostDirFor('/x/abelink-dev', 'dev')).not.toContain(path.join('abelink-dev', 'abelink'))
  })

  it('kedua manifest ada + idempoten + dev tak ubah byte prod', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-flav-'))
    const configHome = path.join(tmp, 'config')
    fs.mkdirSync(path.join(configHome, 'google-chrome'), { recursive: true })
    const prodData = path.join(tmp, 'xdg', 'abelink')
    const devData = path.join(tmp, 'xdg', 'abelink-dev')
    const prodOpts = { configHome, dataHome: prodData, sourceFile: { pathname: HOST } }
    const devOpts = { configHome, dataHome: devData, sourceFile: { pathname: HOST }, flavor: 'dev' }
    const rProd = await ensureNativeHost(prodOpts)
    const prodManifest = path.join(configHome, 'google-chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`)
    const prodBytes = fs.readFileSync(rProd.host, 'utf8')
    const rDev = await ensureNativeHost(devOpts)
    const devManifest = path.join(configHome, 'google-chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME_DEV}.json`)
    expect(fs.existsSync(prodManifest)).toBe(true)
    expect(fs.existsSync(devManifest)).toBe(true)
    // Dev tak menyentuh byte wrapper prod
    expect(fs.readFileSync(rProd.host, 'utf8')).toBe(prodBytes)
    // Manifest menunjuk wrapper masing-masing + nama benar
    expect(JSON.parse(fs.readFileSync(prodManifest, 'utf8')).name).toBe(NATIVE_HOST_NAME)
    expect(JSON.parse(fs.readFileSync(devManifest, 'utf8')).name).toBe(NATIVE_HOST_NAME_DEV)
    // Wrapper flavor-pinned: token path flavor sendiri di dalam skrip
    expect(prodBytes).toContain('ABELINK_BRIDGE_FLAVOR=prod')
    expect(fs.readFileSync(rDev.host, 'utf8')).toContain('ABELINK_BRIDGE_FLAVOR=dev')
    expect(prodBytes).toContain('ABELINK_BRIDGE_FLAVOR=prod')
    // Idempoten kedua kali per flavor
    expect((await ensureNativeHost(prodOpts)).installed[0].changed).toBe(false)
    expect((await ensureNativeHost(devOpts)).installed[0].changed).toBe(false)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('flavor-pinned: wrapper prod melayani prod apa pun namespace-nya', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-host-strict-'))
    const xdg = path.join(tmp, 'xdg')
    const prodBrand = path.join(xdg, 'abelink')
    fs.mkdirSync(prodBrand, { recursive: true })
    fs.writeFileSync(path.join(prodBrand, 'browser-bridge-token'), 'tok-prod-only', { mode: 0o600 })
    const configHome = path.join(tmp, 'config')
    fs.mkdirSync(path.join(configHome, 'google-chrome'), { recursive: true })
    const r = await ensureNativeHost({ configHome, dataHome: prodBrand, sourceFile: { pathname: HOST } })
    // Regression: exec wrapper .sh persis seperti Chrome (bukan ekstrak blok py
    // ke file — ekstraksi menyembunyikan bug shell-quoting single-quote).
    const run = (msg) =>
      new Promise((resolve, reject) => {
        const child = spawn(r.host, [], {
          env: { ...process.env, XDG_DATA_HOME: xdg, ABELINK_DATA_HOME: '' },
          stdio: ['pipe', 'pipe', 'ignore']
        })
        let buf = Buffer.alloc(0)
        const timer = setTimeout(() => reject(new Error('timeout wrapper')), 10000)
        child.stdout.on('data', (c) => {
          buf = Buffer.concat([buf, c])
          if (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
            clearTimeout(timer)
            resolve(JSON.parse(buf.subarray(4, 4 + buf.readUInt32LE(0)).toString('utf8')))
          }
        })
        const body = Buffer.from(JSON.stringify(msg), 'utf8')
        const head = Buffer.alloc(4)
        head.writeUInt32LE(body.length, 0)
        child.stdin.write(Buffer.concat([head, body]))
      })
    // Flavor-pinned: wrapper hanya melayani flavornya; namespace diabaikan
    // (background.js baru tak mengirimnya). Request dev-namespace ke host prod
    // tetap dilayani dari file token prod.
    expect(await run({ namespace: 'dev' })).toMatchObject({ ok: true, token: 'tok-prod-only' })
    expect(await run({})).toMatchObject({ ok: true, token: 'tok-prod-only' })
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('resolveDataHome (pemisah dev/prod)', () => {
  it('ABELINK_DATA_HOME menang atas XDG_DATA_HOME', () => {
    expect(resolveDataHome({ ABELINK_DATA_HOME: '/dev-data', XDG_DATA_HOME: '/xdg', HOME: '/home/u' })).toBe('/dev-data')
  })
  it('fallback XDG lalu HOME bila override kosong', () => {
    expect(resolveDataHome({ ABELINK_DATA_HOME: '  ', XDG_DATA_HOME: '/xdg', HOME: '/home/u' })).toBe('/xdg')
    expect(resolveDataHome({ HOME: '/home/u' })).toBe('/home/u/.local/share')
  })
})
