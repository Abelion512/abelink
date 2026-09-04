import { describe, it, expect } from 'vitest'
import { asyncPool } from '../src/utils/asyncPool'

describe('asyncPool', () => {
  it('mengembalikan hasil dengan urutan sama seperti input (bukan urutan selesai)', async () => {
    const delays = [30, 10, 20]
    const result = await asyncPool(3, delays, (d) =>
      new Promise((r) => setTimeout(() => r(`done-${d}`), d))
    )
    expect(result).toEqual(['done-30', 'done-10', 'done-20'])
  })

  it('membatasi concurrency (maksimal N tugas berjalan bersamaan)', async () => {
    let running = 0
    let peak = 0
    await asyncPool(2, [1, 2, 3, 4, 5, 6], async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 10))
      running--
      return true
    })
    expect(peak).toBe(2)
  })

  it('kegagalan satu slot tidak menggagalkan pool; posisi berisi Error', async () => {
    const result = await asyncPool(2, ['ok', 'boom', 'ok2'], async (x) => {
      if (x === 'boom') throw new Error('meledak')
      return x.toUpperCase()
    })
    expect(result[0]).toBe('OK')
    expect(result[1]).toBeInstanceOf(Error)
    expect(result[1].message).toBe('meledak')
    expect(result[2]).toBe('OK2')
  })

  it('non-Error throw tetap dikonversi jadi Error', async () => {
    const result = await asyncPool(1, [1], () => Promise.reject('string error'))
    expect(result[0]).toBeInstanceOf(Error)
    expect(result[0].message).toBe('string error')
  })

  it('input kosong / concurrency tidak valid tetap aman', async () => {
    expect(await asyncPool(4, [], async (x) => x)).toEqual([])
    expect(await asyncPool(0, [1, 2], async (x) => x * 2)).toEqual([2, 4])
    expect(await asyncPool(-3, [5], async (x) => x)).toEqual([5])
    expect(await asyncPool(2, null, async (x) => x)).toEqual([])
  })

  it('concurrency lebih besar dari jumlah item tidak membuat runner liar', async () => {
    let calls = 0
    const result = await asyncPool(10, ['a', 'b'], async (x) => {
      calls++
      return x
    })
    expect(calls).toBe(2)
    expect(result).toEqual(['a', 'b'])
  })
})
