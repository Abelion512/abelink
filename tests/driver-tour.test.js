import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { filterExistingSteps } from '../src/utils/driverTour.js'

const visibleEl = { getClientRects: () => [{ width: 10 }], offsetParent: {} }
const hiddenEl = { getClientRects: () => [], offsetParent: null }

describe('filterExistingSteps', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { querySelector: vi.fn() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('popover tanpa element selalu lolos', () => {
    const steps = [{ popover: { title: 'intro' } }]
    expect(filterExistingSteps(steps)).toEqual(steps)
  })

  it('elemen ada & terlihat -> lolos', () => {
    document.querySelector.mockReturnValue(visibleEl)
    const steps = [{ element: '#ada', popover: { title: 'x' } }]
    expect(filterExistingSteps(steps)).toEqual(steps)
    expect(document.querySelector).toHaveBeenCalledWith('#ada')
  })

  it('elemen tidak ada di DOM -> dibuang', () => {
    document.querySelector.mockReturnValue(null)
    const steps = [{ element: '#hantu', popover: { title: 'x' } }, { popover: { title: 'intro' } }]
    const result = filterExistingSteps(steps)
    expect(result).toHaveLength(1)
    expect(result[0].popover.title).toBe('intro')
  })

  it('elemen tersembunyi (hidden) -> dibuang', () => {
    document.querySelector.mockReturnValue(hiddenEl)
    const steps = [{ element: '#tersembunyi', popover: { title: 'x' } }]
    expect(filterExistingSteps(steps)).toEqual([])
  })

  it('selector invalid -> dibuang tanpa melempar error', () => {
    document.querySelector.mockImplementation(() => {
      throw new Error('bad selector')
    })
    const steps = [{ element: '???', popover: { title: 'x' } }]
    expect(filterExistingSteps(steps)).toEqual([])
  })

  it('urutan langkah tersisa dipertahankan', () => {
    document.querySelector.mockImplementation((sel) => (sel === '#b' ? null : visibleEl))
    const steps = [
      { popover: { title: 'a-intro' } },
      { element: '#a', popover: { title: 'a' } },
      { element: '#b', popover: { title: 'b' } },
      { element: '#c', popover: { title: 'c' } }
    ]
    const result = filterExistingSteps(steps)
    expect(result.map((s) => s.popover?.title || s.element)).toEqual(['a-intro', 'a', 'c'])
  })

  it('input bukan array -> array kosong', () => {
    expect(filterExistingSteps(null)).toEqual([])
    expect(filterExistingSteps(undefined)).toEqual([])
  })
})

describe('startDriverTour', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tidak memanggil driver bila semua langkah hantu', async () => {
    vi.stubGlobal('document', { querySelector: () => null })
    vi.resetModules()
    const driverSpy = vi.fn(() => ({ drive: vi.fn() }))
    vi.doMock('driver.js', () => ({ driver: driverSpy }))
    const { startDriverTour: start } = await import('../src/utils/driverTour.js')
    const result = start([{ element: '#hantu', popover: { title: 'x' } }])
    expect(result).toBeNull()
    expect(driverSpy).not.toHaveBeenCalled()
    vi.doUnmock('driver.js')
    vi.unstubAllGlobals()
  })
})
