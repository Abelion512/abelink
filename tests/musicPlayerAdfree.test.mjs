import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('YouTube Music Ad-Free Player Configuration', () => {
  const contextPath = path.resolve(process.cwd(), 'src/contexts/YoutubeMusicContext.jsx')
  const content = fs.readFileSync(contextPath, 'utf-8')

  it('menggunakan host youtube-nocookie.com', () => {
    expect(content).toContain("host: 'https://www.youtube-nocookie.com'")
  })

  it('mengkonfigurasi playerVars anti-iklan dan overlay', () => {
    expect(content).toContain('iv_load_policy: 3')
    expect(content).toContain('modestbranding: 1')
    expect(content).toContain('playsinline: 1')
    expect(content).toContain('controls: 0')
    expect(content).toContain('disablekb: 1')
    expect(content).toContain('fs: 0')
    expect(content).toContain('rel: 0')
  })

  it('memiliki logic penanganan unMute dan error handling pada event player', () => {
    expect(content).toContain('target.unMute()')
    expect(content).toContain('setPlaybackError(msg)')
  })
})
