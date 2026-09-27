// src/api/ai/planStepBudget.js
// Resolves step budget dynamically from effortSystem policies.
// Allows long-horizon complex tasks to scale up to ~50-64 steps (or higher for max/ultra),
// replacing the hardcoded MAX_PLAN_STEPS=25 limit.

import { resolveEffortLevel } from './effortEstimator.js'
import { EffortLevel, resolve_effort } from './effortSystem.js'
import { isFailure } from './progressEvaluator.js'
import { DIRECTIVE } from './trajectorySupervisor.js'

export const DEFAULT_PLAN_STEPS = 25

// Safety net: jendela baru saat budget habis tapi kerja produktif.
export const BUDGET_RENEW_STEPS = 48

const RENEW_BLOCK_DIRECTIVES = new Set([DIRECTIVE.ABANDON, DIRECTIVE.ESCALATE])

const toolResultText = (t) => {
  if (!t || typeof t !== 'object') return ''
  const r = t.fullResult ?? t.resultString ?? t.result ?? ''
  return typeof r === 'string' ? r : JSON.stringify(r ?? '')
}

const toolSucceeded = (t) => {
  if (t?.status === 'not-executed') return false
  if (typeof t?.success === 'boolean') return t.success
  const text = toolResultText(t)
  if (!text) return false
  return !isFailure(text)
}

// Pure: budget habis -> perbarui jendela bila produktif, stop jujur bila stagnan.
// Produktif = ada tool sukses baru-baru ini ATAU verifikasi bergerak ke
// terbukti. Stagnan = breaker buka/spiral ATAU supervisor ABANDON/ESCALATE
// ATAU tak ada sinyal kemajuan sama sekali.
export function shouldRenewBudget({
  recentTools = [],
  verificationMoved = false,
  breakerOpen = false,
  supervisorDirective = DIRECTIVE.CONTINUE
} = {}) {
  if (breakerOpen === true) return false
  if (RENEW_BLOCK_DIRECTIVES.has(String(supervisorDirective || '').toLowerCase())) return false
  if (verificationMoved === true) return true
  const list = Array.isArray(recentTools) ? recentTools : []
  return list.some(toolSucceeded)
}

// Pure: jendela baru = +48 langkah, dibatasi hard ceiling (default 512).
export function renewBudgetWindow(currentSteps = 0, hardCeiling = 512) {
  const base = Number.isFinite(currentSteps) && currentSteps > 0 ? Math.floor(currentSteps) : 0
  const ceiling = Number.isFinite(hardCeiling) && hardCeiling > 0 ? Math.floor(hardCeiling) : 512
  return Math.min(base + BUDGET_RENEW_STEPS, ceiling)
}

/**
 * Resolves the maximum plan steps for a ReAct execution loop.
 *
 * Precedence:
 * 1. Explicit numeric override in options (maxSteps or maxPlanSteps)
 * 2. Canonical policy execution_step_budget resolved via effortSystem:
 *    - low: 8
 *    - medium: 24
 *    - high: 48
 *    - xhigh: 64 (target for complex tasks)
 *    - max: 128
 *    - ultra: 256
 * 3. Fallback to DEFAULT_PLAN_STEPS (25)
 *
 * @param {Object} params
 * @param {Object} [params.config] - Application or session config
 * @param {string} [params.userInput] - User prompt / objective
 * @param {Object} [params.options] - Execution options (may specify effortLevel or maxSteps)
 * @returns {number} Integer step budget >= 1
 */
export function resolvePlanStepBudget({ config = {}, userInput = '', options = {} } = {}) {
  if (Number.isFinite(options?.maxSteps) && options.maxSteps > 0) {
    return Math.floor(options.maxSteps)
  }
  if (Number.isFinite(options?.maxPlanSteps) && options.maxPlanSteps > 0) {
    return Math.floor(options.maxPlanSteps)
  }

  try {
    const effConf = options?.effortLevel
      ? { ...config, effortLevel: options.effortLevel }
      : config

    const decision = resolveEffortLevel(effConf, userInput)
    const levelKey = String(decision?.effort || '').toUpperCase()

    if (EffortLevel[levelKey]) {
      const resolved = resolve_effort(EffortLevel[levelKey])
      const budget = resolved?.policy?.execution_step_budget
      if (Number.isFinite(budget) && budget > 0) {
        return budget
      }
    }
  } catch {
    // Fail-safe: degrade to default
  }

  return DEFAULT_PLAN_STEPS
}
