// src/api/ai/planStepBudget.js
// Resolves step budget dynamically from effortSystem policies.
// Allows long-horizon complex tasks to scale up to ~50-64 steps (or higher for max/ultra),
// replacing the hardcoded MAX_PLAN_STEPS=25 limit.

import { resolveEffortLevel } from './effortEstimator.js'
import { EffortLevel, resolve_effort } from './effortSystem.js'

export const DEFAULT_PLAN_STEPS = 25

/**
 * Resolves the maximum plan steps for a ReAct execution loop.
 *
 * Precedence:
 * 1. Explicit numeric override in options (maxSteps or maxPlanSteps)
 * 2. Canonical policy execution_step_budget resolved via effortSystem:
 *    - low: 8
 *    - medium: 16
 *    - high: 32
 *    - xhigh: 64 (target for complex tasks, ~50-64 steps)
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
