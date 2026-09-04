// Tag routing prefixes written by subagentExecutor.js — matched exactly, as literals.
export const LEAD_AGENT_TAG = '[DARI LEAD AGENT (MARK)]:'
export const CREATOR_TAG = '[DARI CREATOR / USER (MADA)]:'

/**
 * Strip routing-tag prefixes from sub-agent message content before display.
 * Pure, name-agnostic: matches the literal executor tags and any
 * "[DARI CREATOR / USER (<name>)]:" variant (e.g. a configured owner name).
 * Safe on non-string input.
 */
export function stripAgentTags(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(/^\[DARI LEAD AGENT \(MARK\)\]:\s*/, '')
    .replace(/^\[DARI CREATOR \/ USER \([\s\S]*?\)\]:\s*/, '')
    .replace(/^\[DARI CREATOR \/ USER \([^)]*\)\]:\s*/, '')
}
