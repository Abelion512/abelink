// Auto-error guard: deteksi error/warning umum dan terapkan perbaikan otomatis.
// Juga menyimpan log error ke localStorage untuk audit.

const KNOWN_FIXES = [
  {
    test: (msg) => /wasm-simd is not enabled/i.test(msg),
    name: 'WASM_SIMD',
    fix: () => {
      try {
        localStorage.setItem('mark:lite-mode', '1')
      } catch (_) {}
    }
  },
  {
    test: (msg) => /playVideo is not a function|pauseVideo is not a function/i.test(msg),
    name: 'YT_PLAYER_NOT_READY',
    fix: () => {}
  },
  {
    test: (msg) => /deleteMemoryFromOrama.*undefined is not an object/i.test(msg),
    name: 'ORAMA_DELETE_ID',
    fix: () => {}
  },
  {
    test: (msg) => /useNavigate\(\).*<Router>/i.test(msg),
    name: 'USE_NAVIGATE_ROUTER',
    fix: () => {}
  }
]

let errorLog = []
const MAX_LOG = 50

function pushLog(entry) {
  errorLog.push(entry)
  if (errorLog.length > MAX_LOG) errorLog.shift()
  try {
    localStorage.setItem('mark:error-guard', JSON.stringify(errorLog.slice(-20)))
  } catch (_) {}
}

export function initErrorGuard() {
  if (typeof window === 'undefined') return

  const seen = new Set()

  const handler = (type, args) => {
    const msg = args?.length ? args[0] : ''
    const text = typeof msg === 'string' ? msg : msg?.message || ''
    const key = `${type}:${text}`

    if (seen.has(key)) return
    seen.add(key)

    const match = KNOWN_FIXES.find((f) => f.test(text))
    if (match) {
      try {
        match.fix()
      } catch (_) {}
    }

    pushLog({ type, text, time: Date.now(), fix: match?.name || null })
  }

  window.addEventListener('error', (e) => handler('error', [e.message]))
  window.addEventListener('unhandledrejection', (e) => handler('unhandledrejection', [e.reason]))
}

export function getErrorLog() {
  try {
    return JSON.parse(localStorage.getItem('mark:error-guard') || '[]')
  } catch (_) {
    return []
  }
}
