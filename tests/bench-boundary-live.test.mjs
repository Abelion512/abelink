import { describe, it, expect } from 'vitest'

import { describeBoundary } from '../evaluation/bench/capture.mjs'
import { createAbelinkBoundary } from '../evaluation/bench/boundary-abelink.mjs'
import { makeRunRequest } from '../evaluation/bench/capture.mjs'
import { wrapBoundary } from '../evaluation/bench/runner-stub.mjs'

function fakeRun(result) {
  return async () => result ?? {
    response: 'Selesai. File sudah dibuat dan dicek ulang.',
    trajectory: {
      trace: [
        { step: 1, kind: 'decision', response: 'Rencana: buat file, baca kembali, lalu verifikasi.' },
        {
          step: 2, kind: 'tool',
          toolCalls: [{ tool: 'write-file', query: '/tmp/x||isi', result: 'ok' }],
          observation: 'ok',
        },
      ],
    },
  }
}

describe('abelink live boundary', () => {
  it('satisfies describeBoundary', () => {
    const d = describeBoundary(createAbelinkBoundary({ runFn: fakeRun() }))
    expect(d.compliant).toBe(true)
    expect(d.label).toBe('complete')
  })

  it('passes wrapBoundary', () => {
    const w = wrapBoundary(createAbelinkBoundary({ runFn: fakeRun() }))
    expect(typeof w.sendPrompt).toBe('function')
  })

  it('streams raw steps then completes', async () => {
    const b = createAbelinkBoundary({ runFn: fakeRun() })
    const ctx = await b.startRun(makeRunRequest({ runId: 'live-1', taskId: 'io-01-read-modify-write', prompt: 'x' }))
    const raws = []
    for await (const r of b.sendPrompt(ctx, 'x')) raws.push(r)
    expect(raws.length).toBeGreaterThanOrEqual(3) // decision + tool + answer
    expect(raws.some((r) => r.kind === 'tool' && r.tool === 'write-file')).toBe(true)
    const final = await b.endRun(ctx)
    expect(final.status).toBe('completed')
    expect(final.completed).toBe(true)
  })

  it('empty response ends failed, never fake success', async () => {
    const b = createAbelinkBoundary({ runFn: fakeRun({ response: '', trajectory: { trace: [] } }) })
    const ctx = await b.startRun(makeRunRequest({ runId: 'live-2', taskId: 't', prompt: 'x' }))
    for await (const _ of b.sendPrompt(ctx, 'x')) { /* drain */ }
    const final = await b.endRun(ctx)
    expect(final.status).toBe('failed')
    expect(final.completed).toBe(false)
  })

  it('abort marks context and returns true', async () => {
    const b = createAbelinkBoundary({ runFn: fakeRun() })
    const ctx = await b.startRun(makeRunRequest({ runId: 'live-3', taskId: 't', prompt: 'x' }))
    expect(await b.abortRun(ctx)).toBe(true)
    expect(await b.abortRun(ctx)).toBe(false)
  })

  it('unknown context throws', async () => {
    const b = createAbelinkBoundary({ runFn: fakeRun() })
    await expect(b.endRun({ runId: 'nope' })).rejects.toThrow(/Unknown run context/)
  })
})
