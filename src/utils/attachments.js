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
// CATATAN FETCH: pengambilan resource web TIDAK dilakukan di renderer —
// semua fetch URL drop lewat native `misc_fetch_web_resource` (Rust) yang
// memvalidasi scheme + host privat dan membuang URL taint dari boundary
// renderer (CodeQL SSRF). isPublicHttpUrl tetap dipakai sebagai pre-filter
// cepat + ter-tes agar drop host internal gagal cepat tanpa round-trip.
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
const IPV4_MAX = 0xff
const LOOPBACK_SUFFIX = '.localhost'

const isPrivateIPv4 = (a, b) => {
  // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 100.64.0.0/10,
  // 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

export const isPublicHttpUrl = (raw) => {
  if (typeof raw !== 'string' || (!raw.startsWith('http://') && !raw.startsWith('https://'))) return null
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (!host) return null
    // Strip IPv6 literal brackets if any remain
    const plainHost = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host
    if (!plainHost) return null

    // IPv6 host detection: contains a colon
    if (plainHost.includes(':')) {
      // v4-mapped suffix like ::ffff:192.168.1.1 -> recurse on the v4 part
      const v4MappedSuffix = plainHost.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
      if (v4MappedSuffix) {
        return isPublicHttpUrl(`http://${v4MappedSuffix[1]}/`)
      }
      if (plainHost === '::1' || plainHost === '::') return null
      // parse first hextet, stripping leading zeros without a full regex lower-power path
      const rawFirst = plainHost.split(':')[0]
      let firstHextet = 0
      for (let i = 0; i < rawFirst.length; i++) {
        const d = rawFirst.charCodeAt(i)
        if (d < 48 || d > 57) return null
        firstHextet = firstHextet * 16 + (d - 48)
        if (firstHextet > 0xffff) return null
      }
      if (!Number.isFinite(firstHextet)) return null
      // 2000::/3 global unicast, fe80::/10 link-local, fc00::/7 ULA
      const isGlobalUnicast = (firstHextet & 0x2000) === 0x2000
      const isLinkLocal = (firstHextet & 0xffc0) === 0xfe80
      const isUla = (firstHextet & 0xfe00) === 0xfc00
      return isGlobalUnicast && !isLinkLocal && !isUla ? url : null
    }

    // IPv4 only: dotted decimal form
    const dots = host.split('.')
    if (dots.length !== 4) {
      // Non-IP hostname: block localhost and common internal suffixes
      if (host === 'localhost' || host.endsWith(LOOPBACK_SUFFIX)) return null
      if (/\.(local|internal|intranet|lan)$/.test(host)) return null
      return url
    }
    // parse octets without Number() for per-octet speed
    const octets = dots.map((oct) => {
      let v = 0
      for (let i = 0; i < oct.length; i++) {
        const d = oct.charCodeAt(i)
        if (d < 48 || d > 57) return -1
        v = v * 10 + (d - 48)
        if (v > IPV4_MAX) return -1
      }
      return v
    })
    if (octets.some((o) => o < 0)) return null
    const a = octets[0]
    const b = octets[1]
    return isPrivateIPv4(a, b) ? null : url
  } catch {
    return null
  }
}

// Ekstrak URL gambar langsung bila URL berupa Google Images redirect (/imgres, /url?url=)
export const sanitizeImageUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  try {
    const parsed = new URL(rawUrl)
    // 1. Google Images redirect: https://www.google.com/imgres?imgurl=...
    if (parsed.searchParams.has('imgurl')) {
      const realImg = parsed.searchParams.get('imgurl')
      if (realImg && isPublicHttpUrl(realImg)) return realImg
    }
    // 2. Google redirect umum: https://www.google.com/url?url=...
    if (parsed.searchParams.has('url')) {
      const realTarget = parsed.searchParams.get('url')
      if (realTarget && isPublicHttpUrl(realTarget)) return realTarget
    }
    return rawUrl
  } catch {
    return rawUrl
  }
}

export const resolveDroppedFile = async (f) => {
  let resolvedPath = ''
  const hasWindowApi = typeof window !== 'undefined' && window.api
  if (hasWindowApi && window.api.getPathForFile) {
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

  if (!looksLikePath(resolvedPath) && hasWindowApi && window.api.saveTempFile) {
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

  // 1) File lokal via URI (Linux file manager drag-drop saat dataTransfer.files kosong)
  const localUris = uriRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('file://'))

  if (localUris.length > 0) {
    const localItems = await Promise.all(
      localUris.map(async (u) => {
        try {
          const rawPath = decodeURIComponent(u.replace(/^file:\/\//, ''))
          const name = rawPath.split(/[/\\]/).pop() || 'file'
          const item = { name, path: rawPath, size: 0, type: '', isDir: false }
          if (typeof window !== 'undefined' && window.api?.statPath) {
            try {
              const [size, isDir] = await window.api.statPath(rawPath)
              item.size = Number(size) || 0
              item.isDir = !!isDir
            } catch {}
          }
          return item
        } catch {
          return null
        }
      })
    )
    const validLocals = localItems.filter(Boolean)
    if (validLocals.length > 0) return validLocals
  }

  // 2) Ekstraksi URL publik dari uriRaw ATAU dari tag <img src="..."> di text/html
  let rawUrls = uriRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const html = typeof dataTransfer?.getData === 'function' ? dataTransfer.getData('text/html') : ''
  if (html) {
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    for (const m of imgMatches) {
      if (m[1]) rawUrls.push(m[1].trim())
    }
  }

  const urls = rawUrls
    .map(sanitizeImageUrl)
    .map(isPublicHttpUrl)
    .filter(Boolean)
    .map((url) => url.href)

  if (urls.length === 0) return []

  // Fetch via NATIVE Rust (misc_fetch_web_resource): URL taint dari user tidak
  // pernah menyentuh fetch renderer (CodeQL SSRF cleared), validasi host privat
  // diulang di native (defense in depth), dan bonus: bebas CORS situs tujuan.
  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await window.api.fetchWebResource(u)
        if (!res?.dataB64) throw new Error(res?.error || 'Respons native kosong')
        const mime = res.mime || 'application/octet-stream'

        // Guard anti-landing-page: jika fetch mengembalikan text/html (mis. imgres.html / halaman web),
        // JANGAN jadikan lampiran file biner/visual karena user berniat melampirkan gambar.
        if (mime.includes('text/html')) {
          console.warn('[attachments] Fetch mengembalikan dokumen HTML (bukan biner gambar), abaikan:', u)
          return null
        }

        const bin = atob(res.dataB64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const ext = (mime.split('/')[1] || 'png').split(';')[0]
        let name =
          decodeURIComponent((u.split('/').pop() || '').split('?')[0]) || `gambar-web.${ext}`
        if (!name.includes('.')) name = `${name}.${ext}`
        const file = new File([bytes], name, { type: mime })
        return resolveDroppedFile(file)
      } catch (err) {
        // Gagal (network/4xx/5xx/host privat): lampirkan sebagai link bila bukan landing page Google
        if (!u.includes('google.com/imgres') && !u.includes('google.com/url')) {
          console.warn('[attachments] Fetch native drop URL gagal, dilampirkan sebagai link:', u, err?.message)
          const name = decodeURIComponent((u.split('/').pop() || '').split('?')[0]) || u
          return { name, path: u, size: 0, type: 'text/uri-list', previewUrl: '', linkOnly: true }
        }
        return null
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

// Ekstraksi file atau gambar dari ClipboardEvent (paste Ctrl+V)
export const extractClipboardFiles = async (clipboardData) => {
  if (!clipboardData) return []
  const files = []
  const items = Array.from(clipboardData.items || [])
  for (const item of items) {
    if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f) {
        const name =
          f.name && f.name !== 'image.png' ? f.name : `screenshot-${Date.now()}.png`
        const namedFile = new File([f], name, { type: f.type || 'image/png' })
        files.push(namedFile)
      }
    }
  }
  if (files.length === 0 && clipboardData.files?.length > 0) {
    for (const f of Array.from(clipboardData.files)) {
      files.push(f)
    }
  }
  if (files.length > 0) {
    return Promise.all(files.map(resolveDroppedFile))
  }

  // Fallback 1: Local file URI dari Linux file manager (text/uri-list atau text/plain dengan file://)
  const uriText =
    (typeof clipboardData?.getData === 'function' &&
      (clipboardData.getData('text/uri-list') || clipboardData.getData('text/plain'))) ||
    ''
  const localFileUris = uriText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('file://'))

  if (localFileUris.length > 0) {
    const localItems = await Promise.all(
      localFileUris.map(async (u) => {
        try {
          const rawPath = decodeURIComponent(u.replace(/^file:\/\//, ''))
          const name = rawPath.split(/[/\\]/).pop() || 'file'
          const item = { name, path: rawPath, size: 0, type: '', isDir: false }
          if (typeof window !== 'undefined' && window.api?.statPath) {
            try {
              const [size, isDir] = await window.api.statPath(rawPath)
              item.size = Number(size) || 0
              item.isDir = !!isDir
            } catch {}
          }
          return item
        } catch {
          return null
        }
      })
    )
    const validLocals = localItems.filter(Boolean)
    if (validLocals.length > 0) return validLocals
  }

  // Fallback 2: HTML tag <img> dari clipboard web
  const html = typeof clipboardData?.getData === 'function' ? clipboardData.getData('text/html') : ''
  if (html) {
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    const imgUrls = imgMatches
      .map((m) => m[1]?.trim())
      .filter(Boolean)
      .map(sanitizeImageUrl)
      .map(isPublicHttpUrl)
      .filter(Boolean)
      .map((u) => u.href)

    if (imgUrls.length > 0 && typeof window !== 'undefined' && window.api?.fetchWebResource) {
      const fetched = await Promise.all(
        imgUrls.map(async (u) => {
          try {
            const res = await window.api.fetchWebResource(u)
            if (res?.dataB64) {
              const mime = res.mime || 'image/png'
              if (mime.includes('text/html')) return null
              const bin = atob(res.dataB64)
              const bytes = new Uint8Array(bin.length)
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
              const ext = (mime.split('/')[1] || 'png').split(';')[0]
              let name = decodeURIComponent((u.split('/').pop() || '').split('?')[0]) || `pasted-image.${ext}`
              if (!name.includes('.')) name = `${name}.${ext}`
              const file = new File([bytes], name, { type: mime })
              return resolveDroppedFile(file)
            }
          } catch {}
          return null
        })
      )
      const validFetched = fetched.filter(Boolean)
      if (validFetched.length > 0) return validFetched
    }
  }

  return []
}

