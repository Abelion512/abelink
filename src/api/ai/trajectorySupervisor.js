// trajectorySupervisor.js — Trajectory Supervisor Fase 1 (main loop).
//
// agentDecision.js classifies the MODEL CLAIM per turn.
// objectiveVerifier.js owns SYSTEM VERIFICATION of completion claims.
// This module owns TRAJECTORY POLICY across attempts: it watches the
// per-task attempt history, detects stagnation (same strategy repeating
// without progress), and proposes a strategy directive injected as a short
// system observation. It never terminates, never executes tools, never
// overrides safety/verification/budget guards — an additive layer.
//
// Design rules (locked Fase 1 spec):
//   - Deterministic & pure: no window/db/network imports. All evidence is
//     passed in per update() call by the executor (tool, query, success,
//     verification state, budget left, verify-gate flag).
//   - Thresholds align with existing harness constants: MODIFY on the 3rd
//     repeat (MAX_NO_PROGRESS_STREAK=3), ABANDON on the 5th (circuit-open=5),
//     silence when stepsLeft <= 7 ([SYSTEM / BUDGET] owns convergence).
//   - Hysteresis + cooldown: one directive per strategy key per task, 2-turn
//     cooldown after an injection, max 2 hint injections per task. Past the
//     hint budget the supervisor goes silent (ESCALATE, no text) and lets the
//     existing guards (no-progress streak, circuit breaker, step budget)
//     finish the job.
//   - Strategy key = tool + normalized target (NOT tool name alone), so legit
//     multi-step exploration across different targets is never flagged.
//   - Success on an already-succeeded key is neutral, not progress. Progress
//     = a NEW successful key, or verification state moving toward verified.
//   - The supervisor never throws: any internal error degrades to CONTINUE.

export const DIRECTIVE = {
  CONTINUE: 'continue',
  MODIFY: 'modify_strategy',
  ABANDON: 'abandon_strategy',
  RETRIEVE: 'retrieve_pattern',
  ESCALATE: 'escalate'
}

// Fase 2 (additive): deterministic next-strategy ranking over the closed
// strategy set. Pure module, no cycle (strategyLib imports nothing).
import { rankNextStrategy } from './strategyLib.js'

// Locked thresholds (named exports so tests pin them, not magic numbers).
export const MODIFY_REPEAT = 3
export const ABANDON_REPEAT = 5
export const BUDGET_SILENCE_STEPS_LEFT = 7
export const MAX_HINTS_PER_TASK = 2
export const HINT_COOLDOWN_TURNS = 2
export const MAX_ATTEMPTS = 25
export const MAX_HINT_CHARS = 300
// Semantic-stagnation tripwire (conservative): many successful tools but
// verification never moved and recent attempts re-tread old ground.
export const SEMANTIC_MIN_SUCCESSES = 5
export const SEMANTIC_MIN_ATTEMPTS = 6

const FAIL_STATES = new Set(['failed'])
const PROVEN_STATES = new Set(['partially_verified', 'verified'])

const rankOf = (state) => {
  switch (state) {
    case 'verified':
      return 3
    case 'partially_verified':
      return 2
    case 'unavailable':
    case 'not_run':
      return 1
    default:
      return 0
  }
}

// Normalize the strategy target so trivial variants of the SAME strategy
// share one key ("Auth" vs "auth "), while different targets stay distinct.
// Deliberately shallow: lowercase + trim + collapse whitespace + strip
// wrapping quotes. No stemming, no embeddings.
export function normalizeAttemptKey(tool = '', query = '') {
  const t = String(tool || '').trim().toLowerCase()
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return `${t}:${q}`
}

const shortKey = (key = '') => {
  const [tool, ...rest] = String(key).split(':')
  const target = rest.join(':')
  return target ? `${tool} "${target.slice(0, 60)}"` : tool
}

const TOOL_NUDGE = [
  { re: /grep-search|grep/i, tip: 'ubah pola pencarian atau cari dari file yang sudah diketahui' },
  { re: /read-file|read-document/i, tip: 'baca path yang lebih spesifik, atau grep dulu untuk menemukan lokasi tepat' },
  { re: /list-dir|find-files/i, tip: 'persempit ke subdirektori yang relevan, jangan ulang dari root' },
  { re: /run-shell|run-task/i, tip: 'baca output/error mentah terakhir sebelum mengulang perintah' },
  { re: /browser-/i, tip: 'baca ulang halaman (browser-read) dan buktikan konfirmasi, jangan klik ulang buta' },
  { re: /os-/i, tip: 'verifikasi state via os-read/list-windows/screenshot sebelum aksi berikutnya' }
]

const nudgeFor = (key = '') => {
  const hit = TOOL_NUDGE.find((n) => n.re.test(key))
  return hit ? hit.tip : 'baca langsung targetnya, ubah kata kunci, atau cek asumsi yang berbeda'
}

function buildHint(directive, key, repeat, retrievedKey = null, nextStrategy = null, restoreHint = null) {
  const label = shortKey(key)
  const stratTag = nextStrategy ? `[STRATEGI: ${nextStrategy}] ` : ''
  if (directive === DIRECTIVE.ABANDON) {
    const restoreText = restoreHint ? ` Kembali ke checkpoint: ${restoreHint}.` : ''
    return (
      `[TRAJECTORY HINT] ${stratTag}Tinggalkan pendekatan ${label}: ${repeat}x tanpa kemajuan, terbukti buntu. ` +
        `Jangan ulangi tool+target yang sama.${restoreText} ${nudgeFor(key)[0].toUpperCase()}${nudgeFor(key).slice(1)}.`
    ).slice(0, MAX_HINT_CHARS)
  }
  if (directive === DIRECTIVE.RETRIEVE && retrievedKey) {
    return (
      `[TRAJECTORY HINT] ${stratTag}Pendekatan ${label} macet (${repeat}x). ` +
        `Pola ${shortKey(retrievedKey)} pernah berhasil di task ini — adaptasi polanya ke target sekarang.`
    ).slice(0, MAX_HINT_CHARS)
  }
  // MODIFY (default injection shape).
  const stratNudge = nextStrategy === 'BACKTRACK' && restoreHint
    ? `Kembali ke checkpoint: ${restoreHint}.`
    : nudgeFor(key)
  return (
    `[TRAJECTORY HINT] ${stratTag}Pendekatan ${label} sudah ${repeat}x tanpa kemajuan. ` +
      `Coba strategi BERBEDA (${nextStrategy || 'BARU'}): ${stratNudge}. Jangan ulangi tool+target yang sama.`
  ).slice(0, MAX_HINT_CHARS)
}

export function createTrajectorySupervisor() {
  let attempts = [] // [{ key, success }] — sliding window, capped at MAX_ATTEMPTS
  let succeededKeys = new Set()
  let successfulStrategies = [] // keys that succeeded, in order (for retrieve)
  let failedStrategies = new Set() // abandoned keys — never hinted twice
  let hintsUsed = 0
  let cooldownLeft = 0
  let successCount = 0
  let verificationMoved = false
  let lastVerificationRank = 1
  let semanticHintGiven = false
  let lastNewKeyAt = -1 // attempts index of the latest NEW succeeded key
  // Fase 2 additive state: strategy attempts seen, best-key hint for
  // backtrack restore, latest stagnation signal from the executor lineage.
  let attemptedStrategies = []
  let bestKey = null
  let lastStagnation = 0

  const trailingRepeat = () => {
    if (attempts.length === 0) return { key: null, repeat: 0 }
    const key = attempts[attempts.length - 1].key
    let repeat = 0
    for (let i = attempts.length - 1; i >= 0 && attempts[i].key === key; i--) repeat++
    return { key, repeat }
  }

  const record = ({ tool, query, success, verificationState }) => {
    const key = normalizeAttemptKey(tool, query)
    attempts.push({ key, success: success === true })
    if (attempts.length > MAX_ATTEMPTS) attempts = attempts.slice(-MAX_ATTEMPTS)
    if (success === true) {
      successCount++
      if (!succeededKeys.has(key)) {
        succeededKeys.add(key)
        successfulStrategies.push(key)
        lastNewKeyAt = attempts.length - 1
      }
    }
    if (typeof verificationState === 'string') {
      const rank = rankOf(verificationState)
      if (!FAIL_STATES.has(verificationState) && PROVEN_STATES.has(verificationState) && rank > lastVerificationRank) {
        verificationMoved = true
      }
      lastVerificationRank = Math.max(lastVerificationRank, rank)
    }
  }

  // Stale run: attempts since the last NEW succeeded key. A high count with
  // many banked successes and unmoving verification means circling, even
  // when every individual tool call "succeeds".
  const staleRun = () => (lastNewKeyAt < 0 ? attempts.length : attempts.length - 1 - lastNewKeyAt)

  return {
    update(input = {}) {
      let fallbackNext = 'DIRECT'
      try {
        const {
          tool = '',
          query = '',
          success = false,
          verificationState = null,
          stepsLeft = null,
          verifyGateActive = false,
          strategy = null,
          score = null,
          stagnation = null,
          bestKey: incomingBest = null
        } = input || {}

        record({ tool, query, success, verificationState })

        // Fase 2 additive tracking (no effect on Fase 1 branches below).
        // `score` is accepted for call-shape compat (executor scores); the
        // supervisor ranks strategies, it does not rescore attempts.
        void score
        if (typeof stagnation === 'number') lastStagnation = stagnation
        if (typeof strategy === 'string' && !attemptedStrategies.includes(strategy)) attemptedStrategies.push(strategy)
        if (typeof incomingBest === 'string') bestKey = incomingBest

        // Fase 2 outputs, computed once per call. Fase 1 branch conditions
        // below are untouched; these fields ride along on every return.
        const nextStrategy = rankNextStrategy({
          failedKeys: [...failedStrategies],
          preferredKeys: successfulStrategies,
          attemptedStrategies,
          verificationRank: lastVerificationRank,
          stagnation: lastStagnation,
          hasProofTool: /read-file|read-document|run-shell|run-task|browser-read|os-read/i.test(
            normalizeAttemptKey(tool, query)
          )
        }).strategy
        fallbackNext = nextStrategy
        const restoreHint = (directive) => (directive === DIRECTIVE.ABANDON && bestKey ? bestKey : null)

        // Verification improved toward proven states: strategy works, stay out.
        if (verificationMoved) {
          verificationMoved = false
          if (cooldownLeft > 0) cooldownLeft--
          return { directive: DIRECTIVE.CONTINUE, hintText: null, nextStrategy, restoreHint: restoreHint(DIRECTIVE.CONTINUE) }
        }

        // Cooldown after an injection: record silently, never stack hints.
        if (cooldownLeft > 0) {
          cooldownLeft--
          return { directive: DIRECTIVE.CONTINUE, hintText: null, nextStrategy, restoreHint: restoreHint(DIRECTIVE.CONTINUE) }
        }

        // Budget guard owns convergence: stay silent when steps run thin.
        if (typeof stepsLeft === 'number' && stepsLeft <= BUDGET_SILENCE_STEPS_LEFT) {
          return { directive: DIRECTIVE.CONTINUE, hintText: null, nextStrategy, restoreHint: restoreHint(DIRECTIVE.CONTINUE) }
        }

        // Verify gate owns this turn: defer, don't compete for one slot.
        if (verifyGateActive === true) {
          return { directive: DIRECTIVE.CONTINUE, hintText: null, nextStrategy, restoreHint: restoreHint(DIRECTIVE.CONTINUE) }
        }

        const { key, repeat } = trailingRepeat()

        // Hint budget exhausted: hand over to existing guards, silently.
        if (hintsUsed >= MAX_HINTS_PER_TASK) {
          const directive = repeat >= MODIFY_REPEAT ? DIRECTIVE.ESCALATE : DIRECTIVE.CONTINUE
          return {
            directive,
            hintText: null,
            nextStrategy,
            restoreHint: restoreHint(directive)
          }
        }

        // Abandon: same key at/above the circuit-scale threshold, once per key.
        if (repeat >= ABANDON_REPEAT && !failedStrategies.has(key)) {
          failedStrategies.add(key)
          hintsUsed++
          cooldownLeft = HINT_COOLDOWN_TURNS
          return {
            directive: DIRECTIVE.ABANDON,
            hintText: buildHint(DIRECTIVE.ABANDON, key, repeat, null, nextStrategy, restoreHint(DIRECTIVE.ABANDON)),
            nextStrategy,
            restoreHint: restoreHint(DIRECTIVE.ABANDON)
          }
        }

        // Modify / retrieve: same key stuck at the no-progress scale.
        if (repeat >= MODIFY_REPEAT && !failedStrategies.has(key)) {
          const retrievedKey = successfulStrategies.find((k) => k !== key) || null
          const directive = retrievedKey ? DIRECTIVE.RETRIEVE : DIRECTIVE.MODIFY
          failedStrategies.add(key) // one directive per key per task (hysteresis)
          hintsUsed++
          cooldownLeft = HINT_COOLDOWN_TURNS
          return {
            directive,
            hintText: buildHint(directive, key, repeat, retrievedKey, nextStrategy, restoreHint(directive)),
            nextStrategy,
            restoreHint: restoreHint(directive)
          }
        }

        // Semantic tripwire (conservative, once per task): many successful
        // tools banked but nothing NEW for a while and verification never
        // moved — circling on old ground, not exploring.
        if (
          !semanticHintGiven &&
          successCount >= SEMANTIC_MIN_SUCCESSES &&
          attempts.length >= SEMANTIC_MIN_ATTEMPTS &&
          lastVerificationRank <= 1 &&
          staleRun() >= 3
        ) {
          semanticHintGiven = true
          hintsUsed++
          cooldownLeft = HINT_COOLDOWN_TURNS
          const directive = lastStagnation >= 0.6 && bestKey ? DIRECTIVE.ABANDON : DIRECTIVE.MODIFY
          const restore = restoreHint(directive)
          const tripwireHint =
            nextStrategy === 'BACKTRACK' && bestKey
              ? `[TRAJECTORY HINT] [STRATEGI: BACKTRACK] Kemacetan terdeteksi. Kembali ke checkpoint: ${bestKey}.`
              : `[TRAJECTORY HINT] [STRATEGI: ${nextStrategy}] Beberapa tool sukses tapi verifikasi tidak bergerak dan pencarian berputar di tempat. Berhenti mengulang target lama: pilih SATU hipotesis baru yang bisa dibuktikan (read-back, test, atau konfirmasi halaman).`
          return {
            directive,
            hintText: tripwireHint.slice(0, MAX_HINT_CHARS),
            nextStrategy,
            restoreHint: restore
          }
        }

        return { directive: DIRECTIVE.CONTINUE, hintText: null, nextStrategy, restoreHint: restoreHint(DIRECTIVE.CONTINUE) }
      } catch {
        // Additive contract: a supervisor fault must never break the loop.
        return { directive: DIRECTIVE.CONTINUE, hintText: null, nextStrategy: fallbackNext, restoreHint: null }
      }
    },

    reset() {
      attempts = []
      succeededKeys = new Set()
      successfulStrategies = []
      failedStrategies = new Set()
      hintsUsed = 0
      cooldownLeft = 0
      successCount = 0
      verificationMoved = false
      lastVerificationRank = 1
      semanticHintGiven = false
      lastNewKeyAt = -1
      attemptedStrategies = []
      bestKey = null
      lastStagnation = 0
    },

    snapshot() {
      return {
        attempts: attempts.length,
        successes: successCount,
        hintsUsed,
        cooldownLeft,
        succeededStrategies: successfulStrategies.length,
        failedStrategies: failedStrategies.size
      }
    }
  }
}

export default { DIRECTIVE, createTrajectorySupervisor, normalizeAttemptKey }
