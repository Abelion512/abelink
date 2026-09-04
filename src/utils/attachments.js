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
    .filter((u) => /^https?:\/\//i.test(u))
  if (urls.length === 0) return []

  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
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
