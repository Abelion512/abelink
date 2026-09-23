// autonomyContract.js — compact model-facing protocol for general agentic work.
//
// This is context engineering, not a replacement for reasoning. It defines the
// stable runtime protocol the model must follow while domain-specific tools,
// verifiers, memory, and supervision provide the actual evidence.

export const AUTONOMY_DOMAINS = Object.freeze([
  'research',
  'browser',
  'os_automation',
  'code',
  'learning',
  'general'
])

export const AGENTIC_PROTOCOL_VERSION = '1.1'

const DOMAIN_RULES = {
  research:
    'RESEARCH: discover -> inspect source -> corroborate when material -> synthesize -> cite. A search result is evidence to inspect, not permission to invent.',
  browser:
    'BROWSER: establish the live tab/session -> observe -> act -> read back the resulting state. Action execution is not proof of success. Distinguish no-handshake, timeout, empty content, and real task failure.',
  os_automation:
    'OS_AUTOMATION: inspect current state before mutation -> perform one bounded action -> inspect state after mutation. Do not infer application state from command text alone.',
  code:
    'CODE: reproduce or inspect -> make the smallest useful change -> execute the relevant validator/test -> inspect the artifact/result -> keep, revise, or revert.',
  learning:
    'LEARNING: treat each verified trajectory step as evidence. Retrieve prior successful patterns before repeating work, test new conclusions, and only promote lessons that are grounded in successful observations.',
  general:
    'GENERAL: maintain an explicit objective, current state, next action, evidence, and blocker. Prefer observable progress over eloquent narration.'
}

const COMMON_RULES = [
  'The model decides the next bounded action; the runtime owns safety, execution, verification, budgets, and persistence.',
  'Prefer one meaningful action per decision. Batching is allowed only when actions are independent and failure ordering is safe.',
  'After every action, consume the real observation before selecting the next action.',
  'A failed action requires diagnosis or a materially different strategy, not blind repetition.',
  'A different tool call is not automatically progress. Progress requires new evidence, changed verified state, or a new artifact that advances the objective.',
  'Preserve a compact objective ledger across turns: OBJECTIVE, VERIFIED, NEW EVIDENCE, NEXT ACTION, BLOCKER.',
  'Do not spend context repeating old raw observations. Carry forward state deltas, decisive errors, source identifiers, and verification results.',
  'Completion is a claim from the model plus independent runtime evidence when observable. Never manufacture evidence to make a completion claim fit.'
]

// Failure-memory rules v1.1: distilled from real harness trajectories
// (2026-09-21/22, non-extension failures). Each rule names a failure the
// model actually produced, and the behavior that would have prevented it.
const FAILURE_MEMORY_RULES = [
  'MEMORY PROOF: Dexie/IndexedDB memory is verified with memory-search, never with read-file or list-dir. Read-back means a search that returns the stored item; an empty search is NOT proof of storage.',
  'RESEARCH COMPLETION: a research task is done when sources are read and facts are cited from observation content — never demand a file write, OS action, or page confirmation for a question that asks for information.',
  'BROWSER READ SUFFICIENCY: substantive returned page content (navigate/read/extract output) IS the proof for retrieval tasks. Do not demand a post-action confirmation page when no interaction (click/type/submit) was performed.',
  'THINKING IS NOT ACTING: reasoning without a tool call produces no evidence and advances nothing. After at most 2 consecutive tool-less reasonings, either act with a tool or report blocked/needs-user — never a third empty reasoning.',
  'BLOCKED NEEDS A NAME: reporting blocked without naming the exact failing tool, the exact error text, and what was already tried is not a diagnosis. A blocked report must carry all three.',
]

export function buildAutonomyContractSection({ domain = 'general', stepsLeft = null, protocolVersion = AGENTIC_PROTOCOL_VERSION } = {}) {
  const safeDomain = AUTONOMY_DOMAINS.includes(domain) ? domain : 'general'
  const budget = typeof stepsLeft === 'number'
    ? '\nBUDGET: ' + Math.max(0, Math.floor(stepsLeft)) + ' runtime steps remain. Prefer convergence over exploration when the budget is low.'
    : ''

  return [
    '# GENERAL AGENTIC RUNTIME CONTRACT v' + protocolVersion,
    ...COMMON_RULES.map((rule, i) => (i + 1) + '. ' + rule),
    '',
    ...FAILURE_MEMORY_RULES.map((rule, i) => 'F' + (i + 1) + '. ' + rule),
    '',
    DOMAIN_RULES[safeDomain],
    budget,
    '',
    'SELF-LEARNING BOUNDARY: trajectory data may teach the agent only through grounded evidence. Never turn an unverified failure, guess, or model-only claim into a reusable fact.',
    'CONTEXT BOUNDARY: context compression may summarize history, but must preserve the objective, unresolved criteria, decisive observations, and next actionable state.'
  ].join('\n')
}

export default { AUTONOMY_DOMAINS, AGENTIC_PROTOCOL_VERSION, buildAutonomyContractSection }
