import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractDroppedItems,
  extractClipboardFiles
} from '../src/utils/attachments.js'

describe('extractClipboardFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('mengembalikan array kosong jika clipboardData null atau kosong', async () => {
    expect(await extractClipboardFiles(null)).toEqual([])
    expect(
      await extractClipboardFiles({
        items: [],
        files: [],
        getData: () => ''
      })
    ).toEqual([])
  })

  it('mengekstrak File langsung dari clipboardData.items (screenshot)', async () => {
    const fakeBlob = new Blob(['dummy-png-data'], { type: 'image/png' })
    const fakeFile = new File([fakeBlob], 'image.png', { type: 'image/png' })
    const fakeClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => fakeFile
        }
      ],
      files: [fakeFile],
      getData: () => ''
    }

    // Mock window.api
    global.window = {
      api: {
        saveTempFile: vi.fn().mockResolvedValue('/tmp/saved-screenshot.png')
      }
    }

    const items = await extractClipboardFiles(fakeClipboard)
    expect(items).toHaveLength(1)
    expect(items[0].name).toMatch(/^screenshot-\d+\.png$/)
    expect(items[0].path).toBe('/tmp/saved-screenshot.png')
    expect(items[0].type).toBe('image/png')
  })

  it('mengekstrak local file URI dari clipboard Linux (text/uri-list)', async () => {
    const fakeClipboard = {
      items: [
        {
          kind: 'string',
          type: 'text/uri-list'
        }
      ],
      files: [],
      getData: (type) => {
        if (type === 'text/uri-list') return 'file:///home/abelion/Pictures/Screenshot%202026.png\r\n'
        return ''
      }
    }

    global.window = {
      api: {
        statPath: vi.fn().mockResolvedValue([2048, false])
      }
    }

    const items = await extractClipboardFiles(fakeClipboard)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Screenshot 2026.png')
    expect(items[0].path).toBe('/home/abelion/Pictures/Screenshot 2026.png')
    expect(items[0].size).toBe(2048)
    expect(items[0].isDir).toBe(false)
  })
})

describe('extractDroppedItems', () => {
  it('mengekstrak local file URI dari dataTransfer text/uri-list saat files kosong', async () => {
    const fakeDataTransfer = {
      files: [],
      getData: (type) => {
        if (type === 'text/uri-list') return 'file:///home/abelion/Documents/report.pdf'
        return ''
      }
    }

    global.window = {
      api: {
        statPath: vi.fn().mockResolvedValue([5120, false])
      }
    }

    const items = await extractDroppedItems(fakeDataTransfer)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('report.pdf')
    expect(items[0].path).toBe('/home/abelion/Documents/report.pdf')
    expect(items[0].size).toBe(5120)
  })

  it('mengekstrak URL gambar dari dataTransfer text/html jika text/uri-list kosong', async () => {
    const fakeDataTransfer = {
      files: [],
      getData: (type) => {
        if (type === 'text/html') return '<img src="https://images.unsplash.com/photo-123.jpg" alt="test" />'
        return ''
      }
    }

    global.window = {
      api: {
        fetchWebResource: vi.fn().mockResolvedValue({
          dataB64: btoa('fake-image-bytes'),
          mime: 'image/jpeg'
        }),
        saveTempFile: vi.fn().mockResolvedValue('/tmp/temp-photo.jpg')
      }
    }

    const items = await extractDroppedItems(fakeDataTransfer)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('photo-123.jpg')
    expect(items[0].path).toBe('/tmp/temp-photo.jpg')
  })
})
