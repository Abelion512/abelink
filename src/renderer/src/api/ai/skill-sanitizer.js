// src/renderer/src/api/ai/skill-sanitizer.js
// Content safety scanner for SKILL.md — runs AFTER cryptographic verification.
// This is the malware defense layer: signature proves provenance, this proves content.

const INJECTION_PATTERNS = [
  /ignore\s+all/i, // ponytail: general catch-all first; specific pattern below
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|commands|directives)/i,
  /you\s+are\s+(now|an?\s+AI|a\s+free|required\s+to)/i,
  /override\s+(all\s+)?(instructions|commands|rules|policies)/i,
  /new\s+(instructions|commands|directives|rules)/i,
  /system\s+prompt/i,
  /revert\s+(to\s+)?(default|original\s+mode)/i,
  /DANGER:|WARNING:|CRITICAL:/i,
  /act\s+as\s+(if|though)\s+you\s+are/i,
  /disregard\s+(all\s+)?(previous|above)/i,
  /set\s+(your|the)\s+(system|role|persona)/i,
  /reveal\s+(your|the)\s+(system|instructions|prompt)/i,
]

const OBFUSCATION_PATTERNS = [
  // Base64 blobs ≥ 72 chars total including padding (potential encoded instructions)
  { re: /[A-Za-z0-9+/]{60,}={0,2}/g, name: 'base64' },
  // Hex-encoded strings
  { re: /(?:\\x[0-9a-fA-F]{2}){20,}/g, name: 'hex-escape' },
  // Unicode homoglyph flooding (Cyrillic/Greek in otherwise-ASCII content)
  { re: /[а-яА-ЯЀ-Яα-ωΑ-Ω]{10,}/g, name: 'homoglyph' },
]

export function checkObfuscation(content) {
  const warnings = []
  for (const { re, name } of OBFUSCATION_PATTERNS) {
    const matches = content.match(re)
    if (matches) warnings.push(`obfuscation:${name}:${matches.length} match(es)`)
  }
  return warnings
}

export function checkInjection(content) {
  const matches = []
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) matches.push(pattern.source)
  }
  return matches
}

export function sanitizeSkillContent(content) {
  const warnings = []
  warnings.push(...checkObfuscation(content))

  // Detect injections in original content before filtering
  const initialInj = checkInjection(content)
  if (initialInj.length > 0) warnings.push(`injection:${initialInj.length}`)

  const lines = content.split('\n')
  const filteredLines = lines.filter(line => {
    if (/^#\s.*(instruction|command|override|system)/i.test(line)) return false
    for (const re of INJECTION_PATTERNS) if (re.test(line)) return false
    return true
  })

  const remaining = filteredLines.join('\n')
  const inj = checkInjection(remaining)
  if (inj.length > 0) warnings.push(`injection survived:${inj.length}`)

  return {
    safe: warnings.length === 0,
    content: `<skill_data type="instructions" safe="${warnings.length === 0}">\n${filteredLines.join('\n')}\n</skill_data>`,
    warnings
  }
}

export function classifyContentRisk(content) {
  const obf = checkObfuscation(content)
  const inj = checkInjection(content)
  if (obf.length > 2 || inj.length >= 3) return 0  // block
  if (obf.length > 0 || inj.length > 0) return 1  // warn
  return 2                                        // pass
}
