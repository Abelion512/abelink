import { describe, it, expect } from 'vitest'
import { stripDataUrlPrefix } from '../src/utils/dataUrl'

describe('stripDataUrlPrefix', () => {
  it('membuang prefix data:image/png;base64, dari output screenshot', () => {
    expect(stripDataUrlPrefix('data:image/png;base64,QUJD')).toBe('QUJD')
  })

  it('base64 murni lolos tanpa diubah', () => {
    expect(stripDataUrlPrefix('QUJD')).toBe('QUJD')
    expect(stripDataUrlPrefix('  QUJD  ')).toBe('QUJD')
  })

  it('data URL tanpa base64 payload menghasilkan string kosong', () => {
    expect(stripDataUrlPrefix('data:image/png;charset=utf-8')).toBe('')
  })

  it('input non-string / kosong aman', () => {
    expect(stripDataUrlPrefix(null)).toBe('')
    expect(stripDataUrlPrefix(undefined)).toBe('')
    expect(stripDataUrlPrefix(123)).toBe('')
    expect(stripDataUrlPrefix('')).toBe('')
  })
})
