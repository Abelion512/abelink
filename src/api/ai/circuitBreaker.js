// circuitBreaker.js — session-scoped failure circuit for ABELINK loops.
//
// N consecutive tool failures -> OPEN -> destructive tools blocked until reset.
// New session = new breaker (auto-reset); user can also reset mid-session.
// Pure & unit-testable (no window/db/network imports).
//
// This is layer 1 (cooperative, in-runtime). Layer 2 (Rust watchdog, Fase 2)
// enforces the same idea where the agent cannot reach it.

// Gagal beruntun sebelum sirkuit terbuka (pola hermes-agent: 5).
export const DEFAULT_CONSECUTIVE_THRESHOLD = 5

// Spiral stop: N gagal tool beruntun (APAPUN jenisnya, destruktif atau bukan)
// -> loop dihentikan paksa dengan laporan jujur. Bukti observasi nyata:
// spiral curl/grep 20+ turn membakar ~30k token tanpa hasil. Harus di atas
// threshold sirkuit agar pemulihan wajar sempat dicoba dulu.
export const SPIRAL_STOP_STREAK = 8

// os:emergency-stop is NEVER blocked — the brake itself must always work.
const ALWAYS_ALLOWED = ['os:emergency-stop']

export function isDestructive(tool = '') {
  const t = String(tool || '')
  if (ALWAYS_ALLOWED.includes(t)) return false
  if (t.startsWith('os:')) return true
  return ['run-shell', 'delete-file', 'git-commit', 'git-revert'].includes(t)
}

export function createCircuitBreaker({ threshold = DEFAULT_CONSECUTIVE_THRESHOLD } = {}) {
  let consecutiveFailures = 0
  let open = false

  return {
    threshold: () => threshold,
    failures: () => consecutiveFailures,
    isOpen: () => open,
    // success=true resets the streak. Non-boolean (e.g. user-denied approval)
    // is ignored: a refusal is a decision, not a malfunction.
    record: (success) => {
      if (typeof success !== 'boolean') return
      if (success) {
        consecutiveFailures = 0
        return
      }
      consecutiveFailures++
      if (consecutiveFailures >= threshold) open = true
    },
    shouldBlock: (tool) => open && isDestructive(tool),
    // Spiral stop: streak mencapai batas -> pemanggil WAJIB menghentikan loop
    // dengan jawaban final yang jujur (bukan tool lagi).
    shouldSpiralStop: () => consecutiveFailures >= SPIRAL_STOP_STREAK,
    reset: () => {
      consecutiveFailures = 0
      open = false
    }
  }
}
