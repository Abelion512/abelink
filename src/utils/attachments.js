// Helper lampiran file — dipakai InputBar & halaman lain (drop di area mana pun).
// formatFileSize: B/KB/MB/GB untuk preview; formatBytes: varian ketat (bytes wajib number).
export const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '?'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Ikon per ekstensi dipakai via key — komponen UI memetakan key -> komponen ikon.
export const getFileIconKey = (fileName = '') => {
  const ext = fileName.split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'mkv', 'webm', 'avi', 'mov'].includes(ext)) return 'video'
  if (['zip', 'tar', 'gz', '7z', 'rar', 'xz'].includes(ext)) return 'archive'
  if (['pdf'].includes(ext)) return 'pdf'
  if (
    ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp', 'cs', 'sh', 'rs', 'go'].includes(
      ext
    )
  )
    return 'code'
  if (['md', 'txt', 'docx', 'doc', 'rtf'].includes(ext)) return 'doc'
  return 'generic'
}

// Lengkapi metadata via stat native bila tersedia (dialog native tidak selalu
// menyertakan size). Gagal stat = tetap masuk daftar dengan size 0, bukan crash.
export const enrichWithStat = async (item) => {
  if (!item?.path || (item.size && item.size > 0)) return item
  if (typeof window === 'undefined' || !window.api?.statPath) return item
  try {
    const [size, isDir] = await window.api.statPath(item.path)
    return { ...item, size: Number(size) || 0, isDir: !!isDir }
  } catch {
    return item
  }
}

// Dedup by path — sinkron, aman dipakai di dalam setState updater React.
export const dedupeAttachments = (prev, incoming) => {
  const existingPaths = new Set(prev.map((p) => p.path))
  return [...prev, ...incoming.filter((item) => item.path && !existingPaths.has(item.path))]
}

// Resolve path asli dari File hasil drag&drop: web drop tanpa path disimpan
// ke temp file via saveTempFile supaya AI tetap bisa membaca isinya.
// Dipakai InputBar DAN DropAnywhere (drop di area mana pun).

// Gambar -> object URL untuk thumbnail chip attachment. Hanya saat kita
// memegang File asli (drop web/file manager); lampiran dialog native tidak
// punya File, jadi chip pakai ikon biasa.
const isImageFile = (f) =>
  (f?.type || '').startsWith('image/') ||
  ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(
    String(f?.name || '')
      .split('.')
      .pop()
      .toLowerCase()
  )

const createPreviewUrl = (f) => {
  if (!isImageFile(f)) return ''
  try {
    return URL.createObjectURL(f)
  } catch {
    return ''
  }
}

// Validasi URL hasil drop web SEBELUM dipakai untuk fetch (CodeQL: URL of
// request depends on user-provided value). Hanya http/https publik yang
// lolos — blokir loopback/private/link-local agar drop tidak bisa dipakai
// memindai jaringan lokal (SSRF) atau mengeksekusi scheme non-web.
export const isPublicHttpUrl = (raw) => {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!host) return null
    // IPv6 literal ([..] sudah dilepas): blokir loopback/unspecified/link-local/
    // ULA (fc00::/7) & IPv4-mapped; hanya global unicast 2000::/3 yang lolos.
    if (host.includes(':')) {
      let v6 = host
      let embeddedV4 = null
      const v4Mapped = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
      if (v4Mapped) {
        embeddedV4 = v4Mapped[1]
        v6 = host.slice(0, host.lastIndexOf(':') + 1) + '0:0'
      }
      if (embeddedV4) return isPublicHttpUrl(`http://${embeddedV4}/`)
      if (v6 === '::1' || v6 === '::') return null
      const firstHextet = parseInt(v6.split(':')[0].replace(/^0+(?=\w)/, ''), 16)
      if (!Number.isFinite(firstHextet)) return null
      const isGlobalUnicast = firstHextet >> 13 === 0b001 // 2000::/3
      const isLinkLocal = firstHextet >> 6 === 0b1111111010 // fe80::/10
      const isUla = firstHextet >> 9 === 0b1111110 // fc00::/7
      return isGlobalUnicast && !isLinkLocal && !isUla ? url : null
    }
    // Non-IP: blokir localhost & subdomain internal (.local, .internal, dsb.)
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      if (host === 'localhost' || host.endsWith('.localhost')) return null
      if (/\.(local|internal|intranet|lan)$/.test(host)) return null
      return url
    }
    const octets = host.split('.').map(Number)
    if (octets.some((o) => o > 255)) return null
    const [a, b] = octets
    const isPrivate =
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10.0.0.0/8
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) || // link-local 169.254/16
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) // 192.168/16
    return isPrivate ? null : url
  } catch {
    return null
  }
}

export const resolveDroppedFile = async (f) => {
  let resolvedPath = ''
  if (window.api?.getPathForFile) {
    try {
      resolvedPath = window.api.getPathForFile(f)
    } catch (e) {
      console.error('[attachments] getPathForFile error:', e)
    }
  }

  const looksLikePath = (p) => p && (p.includes('/') || p.includes('\\'))
  if (!looksLikePath(resolvedPath) && looksLikePath(f.path)) {
    resolvedPath = f.path
  }

  if (!looksLikePath(resolvedPath) && window.api?.saveTempFile) {
    try {
      const buffer = await f.arrayBuffer()
      if (buffer && buffer.byteLength > 0) {
        const tempPath = await window.api.saveTempFile(buffer, f.name)
        if (tempPath) resolvedPath = tempPath
      }
    } catch (err) {
      console.error('[attachments] Failed to save dropped file to temp:', err)
    }
  }

  return {
    name: f.name,
    path: resolvedPath || f.name,
    size: f.size || 0,
    type: f.type || '',
    previewUrl: createPreviewUrl(f)
  }
}

// Ekstraksi item dari DataTransfer drop — SATU pintu untuk InputBar &
// DropAnywhere. Urutan:
//  1) dataTransfer.files (drop file manager / OS — selalu ada File + path)
//  2) text/uri-list (drag gambar/link dari web — TIDAK punya Files type;
//     tanpa ini drag dari browser webview lain diabaikan diam-diam dan malah
//     bisa menavigasi halaman). Gambar di-fetch jadi File (CSP connect-src
//     https://* sudah diizinkan); bila fetch gagal (CORS dsb.), item link
//     saja tetap dilampirkan agar URL-nya terlihat & bisa diproses AI.
export const extractDroppedItems = async (dataTransfer) => {
  const files = Array.from(dataTransfer?.files || [])
  if (files.length > 0) {
    return Promise.all(files.map(resolveDroppedFile))
  }

  const uriRaw =
    (typeof dataTransfer?.getData === 'function' &&
      (dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain'))) ||
    ''
  const urls = uriRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(isPublicHttpUrl)
    .filter(Boolean)
    .map((url) => url.href)
  if (urls.length === 0) return []

  const MAX_WEB_FETCH_BYTES = 10 * 1024 * 1024 // samakan dengan batas baca FS native
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(15000)
      : undefined
  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u, { signal: timeoutSignal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const declared = Number(res.headers.get('content-length') || 0)
        if (declared > MAX_WEB_FETCH_BYTES) throw new Error('Ukuran melebihi 10MB')
        const blob = await res.blob()
        if (blob.size > MAX_WEB_FETCH_BYTES) throw new Error('Ukuran melebihi 10MB')
        const ext = (blob.type.split('/')[1] || 'png').split(';')[0]
        let name =
          decodeURIComponent((u.split('/').pop() || '').split('?')[0]) || `gambar-web.${ext}`
        if (!name.includes('.')) name = `${name}.${ext}`
        const file = new File([blob], name, { type: blob.type || 'image/png' })
        return resolveDroppedFile(file)
      } catch (err) {
        // CORS/network gagal: lampirkan sebagai link (jujur — bukan file),
        // supaya drop dari web tetap menghasilkan sesuatu yang bisa dipakai.
        console.warn(
          '[attachments] Fetch drop URL gagal, dilampirkan sebagai link:',
          u,
          err?.message
        )
        const name = decodeURIComponent((u.split('/').pop() || '').split('?')[0]) || u
        return { name, path: u, size: 0, type: 'text/uri-list', previewUrl: '', linkOnly: true }
      }
    })
  )
  return results.filter(Boolean)
}

// Dedup + enrich stat sekaligus (untuk pemanggil non-React / nilai sudah final).
export const mergeAttachments = async (prev, incoming) => {
  const existingPaths = new Set(prev.map((p) => p.path))
  const unique = incoming.filter((item) => item.path && !existingPaths.has(item.path))
  return [...prev, ...(await Promise.all(unique.map(enrichWithStat)))]
}
