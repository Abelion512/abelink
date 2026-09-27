// cli/core/sidecar-client.mjs — client JSON-over-stdio ke sidecar engine.
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9) agar host bin/ dan cli/tui
// memakai satu implementasi (bentuk sama dengan createSidecarClient di bin/abelink.mjs).
import { spawn } from 'node:child_process'
import { BUN_BIN, ROOT, SIDECAR_ENTRY } from './paths.mjs'

export function createSidecarClient() {
  const child = spawn(BUN_BIN, [SIDECAR_ENTRY], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  let reqIdCounter = 1
  const pending = new Map()
  let buf = ''

  child.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg && msg.id != null && pending.has(msg.id)) {
          const p = pending.get(msg.id)
          pending.delete(msg.id)
          clearTimeout(p.timer)
          p.resolve(msg)
        }
      } catch {}
    }
  })

  child.stderr.on('data', (chunk) => {
    if (process.env.ABELINK_DEBUG_SIDECAR) {
      process.stderr.write(`[sidecar:err] ${chunk.toString()}`)
    }
  })

  const rpc = (action, payload) =>
    new Promise((resolve, reject) => {
      const id = reqIdCounter++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Sidecar RPC timeout (action=${action}, id=${id})`))
      }, 120000)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ id, action, payload }) + '\n')
    })

  const dispose = () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar process terminated.'))
    }
    pending.clear()
    try {
      child.stdin.end()
    } catch {}
    child.kill('SIGTERM')
  }

  // Jaring pengaman anti-orphan: kalau pemanggil lupa dispose, proses exit
  // normal tetap membunuh sidecar. Child ber-stdio pipe menahan event loop
  // parent, jadi tanpa ini TUI bisa menggantung + meninggalkan proses hidup.
  process.once('exit', () => {
    try {
      child.kill('SIGTERM')
    } catch {}
  })

  child.once('error', (err) => {
    for (const [, p] of pending) p.reject(err)
  })

  return { rpc, dispose }
}
