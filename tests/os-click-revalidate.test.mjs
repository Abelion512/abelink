// Re-validasi klik berjangkar-teks: executeClick tidak boleh klik koordinat basi.
// - matchElementText / parseClickQuery: murni, tanpa daemon.
// - executeClick: daemon + electron di-mock, sesi dibuka nyata via openPCSession.
import { describe, it, expect, vi } from 'vitest'

const state = vi.hoisted(() => ({ cmds: [], elements: [] }))

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: class {
    constructor() {}
    loadURL() {}
    on() {}
    setAlwaysOnTop() {}
    setSize() {}
    setFocusable() {}
    close() {}
    showInactive() {}
    isDestroyed() { return true }
  },
  globalShortcut: { register() {}, unregister() {} },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) }
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal()
  function handleWrite(proc, raw) {
    let cmd = null
    try {
      cmd = JSON.parse(String(raw).trim())
    } catch {
      return
    }
    state.cmds.push(cmd)
    let resp = { status: 'ok' }
    if (cmd.cmd === 'read-ui' || cmd.cmd === 'read-focus') {
      resp = {
        window: 'Mock',
        method: 'uia',
        elements: state.elements,
        element_count: state.elements.length
      }
    }
    setImmediate(() => {
      if (proc._dataCb) proc._dataCb(`${JSON.stringify(resp)}---ABELINK_DONE---`)
    })
  }
  function fakeSpawn(bin) {
    const proc = {
      killed: false,
      stdin: { write: (d) => handleWrite(proc, d) },
      stdout: { on: (ev, cb) => { if (ev === 'data') proc._dataCb = cb } },
      stderr: { on: () => {} },
      on: () => {},
      kill: () => { proc.killed = true }
    }
    if (bin === 'python3') {
      setImmediate(() => {
        if (proc._dataCb) proc._dataCb('{"status":"ready"}---ABELINK_DONE---')
      })
    }
    return proc
  }
  return { ...actual, spawn: fakeSpawn }
})

const {
  matchElementText,
  parseClickQuery,
  executeClick,
  executeDoubleClick,
  openPCSession,
  closePCSession,
  readDesktop
} = await import('../sidecar/main/pc-agent.js')

describe('matchElementText', () => {
  it('cocok substring', () => {
    expect(matchElementText({ id: 1, text: 'Simpan Berkas' }, 'simpan')).toBe(true)
  })

  it('case-insensitive di name/label/value', () => {
    expect(matchElementText({ name: 'TUTUP' }, 'tutup')).toBe(true)
    expect(matchElementText({ label: 'OK' }, 'ok')).toBe(true)
    expect(matchElementText({ value: 'Cancel' }, 'cancel')).toBe(true)
  })

  it('tanpa field teks -> false', () => {
    expect(matchElementText({ id: 2, rect: [0, 0, 10, 10] }, 'x')).toBe(false)
    expect(matchElementText(null, 'x')).toBe(false)
  })

  it('expected kosong -> true', () => {
    expect(matchElementText({ id: 1 }, '')).toBe(true)
    expect(matchElementText(null, '')).toBe(true)
  })
})

describe('parseClickQuery', () => {
  it('id polos', () => {
    expect(parseClickQuery('7')).toEqual({ kind: 'id', id: 7 })
  })

  it('koordinat polos', () => {
    expect(parseClickQuery('100||200')).toEqual({ kind: 'coords', x: 100, y: 200 })
  })

  it('id + expected-text', () => {
    expect(parseClickQuery('7||Simpan Berkas')).toEqual({ kind: 'id', id: 7, expected: 'Simpan Berkas' })
  })

  it('koordinat + expected-text', () => {
    expect(parseClickQuery('100||200||Simpan')).toEqual({ kind: 'coords', x: 100, y: 200, expected: 'Simpan' })
  })

  it('invalid -> null', () => {
    expect(parseClickQuery('')).toBeNull()
    expect(parseClickQuery(null)).toBeNull()
    expect(parseClickQuery('abc')).toBeNull()
  })
})

describe('executeClick re-validasi', () => {
  it('tanpa sesi -> error sesi, tanpa daemon call', async () => {
    const res = await executeClick('1||Simpan')
    expect(res).toMatch(/ERROR/i)
    expect(state.cmds.length).toBe(0)
  })

  it('buka sesi', async () => {
    const res = await openPCSession()
    expect(res).toContain('success')
  })

  it('stale cache + teks mismatch -> error TANPA klik', async () => {
    state.elements = [{ id: 1, text: 'Batal', rect: [10, 20, 100, 40] }]
    state.cmds.length = 0
    const res = await executeClick('1||Simpan')
    expect(res).toContain('target berubah/pindah')
    expect(res).toContain('Simpan')
    expect(state.cmds.some((c) => c.cmd === 'click' || c.cmd === 'native-invoke')).toBe(false)
  })

  it('teks cocok -> klik koordinat fresh', async () => {
    state.elements = [{ id: 1, text: 'Simpan Berkas', rect: [10, 20, 100, 40] }]
    state.cmds.length = 0
    const res = await executeClick('1||simpan')
    expect(res).toContain('Clicked at (60, 40)')
    expect(state.cmds.some((c) => c.cmd === 'native-invoke' && c.id === 1)).toBe(true)
  })

  it('coords + expected mismatch -> error TANPA klik', async () => {
    state.elements = [{ id: 9, text: 'Lain', rect: [0, 0, 10, 10] }]
    state.cmds.length = 0
    const res = await executeClick('300||400||Hilang')
    expect(res).toContain('target berubah/pindah')
    expect(state.cmds.some((c) => c.cmd === 'click' || c.cmd === 'native-invoke')).toBe(false)
  })

  it('coords + expected cocok -> klik coords asli', async () => {
    state.elements = [{ id: 9, text: 'Tombol Hilang', rect: [0, 0, 10, 10] }]
    const res = await executeClick('300||400||hilang')
    expect(res).toContain('Clicked at (300, 400)')
  })

  it('tanpa expected -> perilaku lama, tanpa read tambahan', async () => {
    state.elements = [{ id: 2, text: 'OK', rect: [0, 0, 20, 20] }]
    await readDesktop({})
    state.cmds.length = 0
    const res = await executeClick('2')
    expect(res).toContain('Clicked at (10, 10)')
    expect(state.cmds.some((c) => c.cmd === 'read-ui')).toBe(false)
  })

  it('double-click tidak berubah', async () => {
    const res = await executeDoubleClick('2')
    expect(res).toContain('Double-Clicked at (10, 10)')
  })

  it('tutup sesi', async () => {
    await closePCSession()
  })
})
