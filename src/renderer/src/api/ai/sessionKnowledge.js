const DECISION_KEYWORDS = ['putuskan', 'pilih', 'pakai', 'decide', 'choose', 'use', 'apply']
const PATTERN_KEYWORDS = ['pattern', 'approach', 'cara kerja', 'method', 'technique']
const ERROR_KEYWORDS = ['error', 'fix', 'bug', 'solve', 'resolved', 'solusi']
const INSIGHT_KEYWORDS = ['insight', 'kenyataannya', 'ternyata', 'realize', 'discover']
const GAP_KEYWORDS = ['belum', 'gap', 'missing', 'todo', 'need to']

function matchesKeywords(text, keywords) {
  return keywords.some((kw) => text.includes(kw))
}

export function extractSessionKnowledge(chatData, activeTopic) {
  const decisions = []
  const patterns = []
  const insights = []
  const gaps = []
  const errors = []

  for (const msg of chatData) {
    if (msg.role !== 'ai') continue
    const text = (msg.content || '').toLowerCase()
    const slice = msg.content.slice(0, 200)
    const ts = msg.timestamp

    if (matchesKeywords(text, DECISION_KEYWORDS)) {
      decisions.push({ decision: slice, timestamp: ts })
    }
    if (matchesKeywords(text, PATTERN_KEYWORDS)) {
      patterns.push({ description: slice, timestamp: ts })
    }
    if (matchesKeywords(text, ERROR_KEYWORDS)) {
      errors.push({ content: slice, timestamp: ts })
    }
    if (matchesKeywords(text, INSIGHT_KEYWORDS)) {
      insights.push({ insight: slice, timestamp: ts })
    }
    if (matchesKeywords(text, GAP_KEYWORDS)) {
      gaps.push({ gap: slice, timestamp: ts })
    }
  }

  return {
    $schema: 'session-knowledge-v1',
    id: `sk-${Date.now()}`,
    timestamp: new Date().toISOString(),
    agent: { name: 'mark', model: 'abelink' },
    project: 'mark-agent-fork',
    session: {
      topic: activeTopic || 'General',
      message_count: chatData.length
    },
    knowledge: { decisions, patterns, insights, gaps, errors }
  }
}
