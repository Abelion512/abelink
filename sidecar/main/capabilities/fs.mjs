// Connector plugin: berkas DI DALAM workspace mark (XDG data dir).
// Kontainmen path lewat utils/fsGuard.js — persis konvensi node-tools.js.
// Baca: teks saja, maks 2MB, tampil 400 baris awal (hemat konteks LLM).

import fs from 'fs'
import path from 'path'
import os from 'os'
import { assertContained } from '../utils/fsGuard.js'

const MAX_READ_BYTES = 2 * 1024 * 1024
const MAX_READ_LINES = 400

const workspaceRoot = () => {
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdg, 'mark', 'workspace')
}

export async function runFs(actionId, args) {
  const root = workspaceRoot()
  const rel = String(args?.path || '').trim()
  const guarded = rel ? assertContained(root, rel) : { ok: true, path: root }

  if (actionId === 'list') {
    if (!guarded.ok) throw new Error(guarded.error)
    const dir = guarded.path
    if (!fs.existsSync(dir)) throw new Error(`Folder tidak ditemukan: ${rel || '(root workspace)'}`)
    if (!fs.statSync(dir).isDirectory()) throw new Error(`Bukan folder: ${rel}`)
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const rows = entries.slice(0, 200).map((e) => {
      let size = null
      try {
        if (e.isFile()) size = fs.statSync(path.join(dir, e.name)).size
      } catch {
        // Entry hilang antara readdir dan stat (race) — laporkan size null,
        // jangan gagalkan seluruh listing.
      }
      return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size_bytes: size }
    })
    return { path: rel || '.', entries: rows, total: entries.length }
  }

  if (!rel) throw new Error('Parameter path wajib diisi.')
  if (!guarded.ok) throw new Error(guarded.error)
  const filePath = guarded.path

  if (actionId === 'read') {
    if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${rel}`)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) throw new Error(`Path adalah folder, bukan file: ${rel}`)
    if (stat.size > MAX_READ_BYTES)
      throw new Error(`File terlalu besar (${stat.size} bytes; maks ${MAX_READ_BYTES}).`)
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    const shown = lines
      .slice(0, MAX_READ_LINES)
      .map((l, i) => `[${i + 1}] ${l}`)
      .join('\n')
    return {
      path: rel,
      total_lines: lines.length,
      shown_lines: Math.min(lines.length, MAX_READ_LINES),
      content: shown
    }
  }

  if (actionId === 'write') {
    const content = args?.content
    if (typeof content !== 'string') throw new Error('Parameter content (string) wajib diisi.')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, content, 'utf8')
    return { path: rel, bytes_written: Buffer.byteLength(content, 'utf8') }
  }

  if (actionId === 'delete') {
    if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${rel}`)
    if (fs.statSync(filePath).isDirectory()) {
      // delete untuk folder: hanya jika kosong (anti rm -rf tidak sengaja)
      fs.rmdirSync(filePath)
      return { path: rel, deleted: 'dir (kosong)' }
    }
    fs.unlinkSync(filePath)
    return { path: rel, deleted: 'file' }
  }

  throw new Error(`Aksi fs tidak dikenal: ${actionId}`)
}
