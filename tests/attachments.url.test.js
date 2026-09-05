import { describe, it, expect } from 'vitest'
import { isPublicHttpUrl } from '../src/utils/attachments.js'

// CodeQL SSRF guard: URL hasil drop web harus lolos whitelist ketat sebelum
// di-fetch — blokir loopback/private/link-local/CGNAT dan scheme non-web.

describe('isPublicHttpUrl — SSRF guard drop web', () => {
  it('lolos untuk URL publik http/https', () => {
    expect(isPublicHttpUrl('https://example.com/a.png')?.href).toBe('https://example.com/a.png')
    expect(isPublicHttpUrl('http://example.com')?.href).toBe('http://example.com/')
    expect(isPublicHttpUrl('https://8.8.8.8/img.png')?.href).toBe('https://8.8.8.8/img.png')
    expect(isPublicHttpUrl('https://193.168.1.1/x.jpg')).not.toBeNull() // bukan 192.168
  })

  it('blokir scheme non-web', () => {
    expect(isPublicHttpUrl('file:///etc/passwd')).toBeNull()
    expect(isPublicHttpUrl('ftp://example.com/a')).toBeNull()
    expect(isPublicHttpUrl('javascript:alert(1)')).toBeNull()
    expect(isPublicHttpUrl('data:text/html,hi')).toBeNull()
  })

  it('blokir loopback & localhost', () => {
    expect(isPublicHttpUrl('http://localhost:1420/')).toBeNull()
    expect(isPublicHttpUrl('http://127.0.0.1/')).toBeNull()
    expect(isPublicHttpUrl('http://127.1/a')).toBeNull()
    expect(isPublicHttpUrl('http://app.localhost/')).toBeNull()
    expect(isPublicHttpUrl('http://[::1]/')).toBeNull()
  })

  it('blokir range private/link-local/CGNAT', () => {
    expect(isPublicHttpUrl('http://10.0.0.5/')).toBeNull()
    expect(isPublicHttpUrl('http://192.168.1.1/')).toBeNull()
    expect(isPublicHttpUrl('http://172.16.0.9/')).toBeNull()
    expect(isPublicHttpUrl('http://172.31.255.1/')).toBeNull()
    expect(isPublicHttpUrl('http://169.254.169.254/metadata')).toBeNull() // cloud metadata
    expect(isPublicHttpUrl('http://100.64.0.1/')).toBeNull()
    expect(isPublicHttpUrl('http://0.0.0.0/')).toBeNull()
  })

  it('blokir hostname internal konvensi', () => {
    expect(isPublicHttpUrl('http://nas.local/')).toBeNull()
    expect(isPublicHttpUrl('http://svc.internal/')).toBeNull()
    expect(isPublicHttpUrl('http://host.intranet/')).toBeNull()
    expect(isPublicHttpUrl('http://router.lan/')).toBeNull()
  })

  it('172 di luar /12 tetap lolos (172.32 bukan private)', () => {
    expect(isPublicHttpUrl('https://172.32.0.1/x')).not.toBeNull()
    expect(isPublicHttpUrl('https://172.15.0.1/x')).not.toBeNull()
  })

  it('input sampah -> null tanpa throw', () => {
    expect(isPublicHttpUrl('')).toBeNull()
    expect(isPublicHttpUrl('bukan url')).toBeNull()
    expect(isPublicHttpUrl('http://')).toBeNull()
    expect(isPublicHttpUrl('https://999.1.1.1/')).toBeNull()
  })
})
