// === Reflexion-lite: session failure memory (in-memory only, YAGNI persistence) ===
const MAX_LESSONS = 5
const INJECT_LIMIT = 3
const _lessons = [] // LRU: newest last

export function recordSessionLesson(lesson) {
  const entry = { ts: Date.now(), ...lesson }
  _lessons.push(entry)
  while (_lessons.length > MAX_LESSONS) _lessons.shift()
  return entry
}

export function getSessionLessons() {
  return [..._lessons]
}

export function injectSessionLessons(messages) {
  if (_lessons.length === 0) return messages
  const tail = _lessons.slice(-INJECT_LIMIT)
  const block = '[SESSION LESSONS]\n' + tail.map(l => `- ${l.lesson}`).join('\n')
  const msgs = [...messages]
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      msgs[i] = { ...msgs[i], content: `${block}\n\n${msgs[i].content}` }
      break
    }
  }
  return msgs
}

// === Existing knowledge extraction ===
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
