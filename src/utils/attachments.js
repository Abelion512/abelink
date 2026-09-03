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
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp', 'cs', 'sh', 'rs', 'go'].includes(ext)) return 'code'
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
    type: f.type || ''
  }
}

// Dedup + enrich stat sekaligus (untuk pemanggil non-React / nilai sudah final).
export const mergeAttachments = async (prev, incoming) => {
  const existingPaths = new Set(prev.map((p) => p.path))
  const unique = incoming.filter((item) => item.path && !existingPaths.has(item.path))
  return [...prev, ...(await Promise.all(unique.map(enrichWithStat)))]
}
