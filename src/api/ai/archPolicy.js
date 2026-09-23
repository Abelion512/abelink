// archPolicy.js — Single architecture-axis policy (pure, env-only, no I/O).
//
// `benchArch.js` owns the axis values + resolution (vanilla/basic, default
// basic). This module owns what each value MEANS: supervisor on/off, verify
// gate on/off, whether a model completion claim is trusted. Renderer call
// sites (useAbelinkPlan.js, subagentExecutor.js) and the bench loop consume
// this policy instead of branching on the raw arch string inline, so the
// duplicated `benchArch === 'vanilla'` branches in two files collapse to one.
//
// vanilla = model-only baseline: no supervisor, no verify-gate replan, the
//           model claim is trusted (terminal reason `verify:skipped-vanilla`).
// basic   = thin trajectory supervisor + verification gate (production
//           default): claims need world-state proof (reason `verify:<state>`).

import { resolveBenchArch } from './benchArch.js'

export function getArchPolicy(arch) {
  const resolved = resolveBenchArch(arch)
  if (resolved === 'vanilla') {
    return {
      arch: 'vanilla',
      supervisorEnabled: false,
      verifyGateEnabled: false,
      completionClaimTrusted: true
    }
  }
  return {
    arch: 'basic',
    supervisorEnabled: true,
    verifyGateEnabled: true,
    completionClaimTrusted: false
  }
}

// Terminal reason for a completion claim under a policy: vanilla skips the
// gate (claim trusted), basic records the gate's own reason.
export function archTerminalReason(policy, gateReason = '') {
  if (!policy || policy.verifyGateEnabled !== true) return 'verify:skipped-vanilla'
  return `verify:${gateReason || 'unknown'}`
}

export default { getArchPolicy, archTerminalReason }
