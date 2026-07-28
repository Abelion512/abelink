# Universal Session Knowledge Schema

> Standard format untuk menyimpan pengetahuan dari chat dengan agent apapun.
> Bukan cuma MARK — Hermes, Z.ai, Claude Code, Gemini, DeepSeek, ChatGPT, dll.

---

## Problem

```
User chat dengan 7+ agent berbeda:
  Hermes     → architecture decisions
  Z.ai       → code review insights
  Claude Code → implementation patterns
  Gemini     → research findings
  DeepSeek   → reasoning patterns
  ChatGPT    → design discussions
  MARK       → autonomous agent decisions

Semua chat terfragmentasi. Pengetahuan hilang.
```

## Solution: Universal Schema

```json
{
  "$schema": "session-knowledge-v1",
  "id": "sk-2026-07-28-001",
  "timestamp": "2026-07-28T10:30:00Z",
  "agent": {
    "name": "claude-code",
    "model": "claude-sonnet-4-20250514",
    "platform": "zcode"
  },
  "user": "abelion",
  "project": "mark-agent-fork",
  "session": {
    "topic": "OS Control Architecture",
    "duration_minutes": 45,
    "message_count": 32
  },

  "knowledge": {
    "decisions": [
      {
        "id": "dec-001",
        "decision": "4-level control hierarchy",
        "rationale": "Vision mahal (token + latency), native API zero cost. Default Level 1.",
        "alternatives": ["Pure vision agent", "Pure CLI agent", "Hybrid all-levels"],
        "tradeoff": "Reliability vs flexibility vs cost",
        "confidence": "high",
        "reversible": false
      }
    ],
    "patterns": [
      {
        "id": "pat-001",
        "name": "Progressive Disclosure (Hermes pattern)",
        "description": "L0 (name+1line) always loaded, L1 (full details) on demand",
        "appliedTo": ["tool-registry.js", "agent-skills-loader.js"],
        "source": "Hermes Agent docs"
      }
    ],
    "insights": [
      {
        "id": "ins-001",
        "insight": "Chat reasoning > code output. Knowledge is the real product.",
        "context": "Discussion about session knowledge preservation"
      }
    ],
    "gaps": [
      {
        "id": "gap-001",
        "gap": "5-Layer Memory not implemented",
        "priority": "high",
        "effort": "high",
        "references": ["research-map.md #18"]
      }
    ],
    "errors": [
      {
        "id": "err-001",
        "error": "Cannot read properties of undefined (reading 'slice')",
        "cause": "Response format mismatch — content field was null for reasoning models",
        "fix": "Added msg.reasoning fallback in extractAIContent()",
        "preventedBy": "Always check response structure before accessing nested fields"
      }
    ]
  },

  "codeChanges": [
    {
      "file": "src/main/ai-bridge.js",
      "lines_changed": 292,
      "summary": "Model combo registry, retry 10x, reasoning handler, RSI logging"
    }
  ],

  "references": [
    {
      "type": "documentation",
      "url": "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills",
      "relevance": "Progressive disclosure pattern"
    },
    {
      "type": "code",
      "file": "src/main/tool-registry.js",
      "relevance": "Implementation of progressive disclosure"
    }
  ],

  "meta": {
    "version": "1.0.0",
    "format": "session-knowledge",
    "exportable": true
  }
}
```

---

## Storage Structure

```
~/.mark/knowledge/
├── sessions/
│   ├── 2026-07-28/
│   │   ├── os-control-architecture.json
│   │   ├── model-fallback-abelink.json
│   │   └── ...
│   ├── 2026-07-27/
│   │   └── ...
│   └── ...
├── decisions/
│   └── all.jsonl              # Every decision, indexed
├── patterns/
│   └── all.jsonl              # Every pattern, indexed
├── insights/
│   └── all.jsonl              # Every insight, indexed
├── errors/
│   └── all.jsonl              # Every error+fix, indexed
└── cross-agent/
    ├── hermes-sessions.jsonl  # Sessions from Hermes
    ├── claude-sessions.jsonl  # Sessions from Claude Code
    ├── gemini-sessions.jsonl  # Sessions from Gemini
    └── ...
```

---

## Cross-Agent Aggregation

### How It Works

```
Chat dengan Hermes (di Hermes app)
    ↓
Export session knowledge (manual atau auto)
    ↓
Import ke ~/.mark/knowledge/cross-agent/hermes-sessions.jsonl
    ↓
Indexed by topic, pattern, decision

Chat dengan Claude Code (di ZCode)
    ↓
Auto-extract (ZCode integration)
    ↓
Save to ~/.mark/knowledge/cross-agent/claude-sessions.jsonl

Chat dengan MARK (built-in)
    ↓
Auto-extract (MARK agent loop)
    ↓
Save to ~/.mark/knowledge/sessions/{date}/{topic}.json
```

### Query Across All Agents

```
User: "Pernahkah kita bahas progressive disclosure?"

MARK searches:
  1. ~/.mark/knowledge/sessions/ (MARK sessions)
  2. ~/.mark/knowledge/cross-agent/ (all agents)
  3. Returns: "Ya, di 3 sesi berbeda:
     - Hermes (2026-07-25): Hermes Skills System docs
     - Claude Code (2026-07-28): tool-registry.js implementation
     - MARK (2026-07-28): Progressive Disclosure + Voice Fast Path"
```

---

## Integration Points

### For MARK (Auto-Extract)

```js
// Di useMarkPlan.js, setelah session selesai:
if (sessionDecisions.length > 0) {
  const knowledge = extractSessionKnowledge(sessionDecisions, sessionChanges)
  await saveSessionKnowledge(knowledge)
}
```

### For External Agents (Manual Export)

```
1. User chat dengan Hermes tentang arsitektur
2. User: "export session knowledge"
3. Hermes export JSON → user copy ke ~/.mark/knowledge/cross-agent/
4. MARK index dan searchable
```

### For ZCode (Future Integration)

```
ZCode auto-detects session end
    ↓
Extracts decisions, patterns, insights
    ↓
Saves to ~/.mark/knowledge/cross-agent/zcode-sessions.jsonl
    ↓
No manual intervention needed
```

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **No knowledge loss** | Semua chat tersimpan, tidak hilang |
| **Cross-agent continuity** | Hermes tau apa yang Claude Code putuskan |
| **Decision audit** | "Kenapa kita pilih X?" → lihat reasoning |
| **Pattern reuse** | "Pernahkah pakai pattern ini?" → ya, di 3 sesi |
| **Error prevention** | "Pernahkah error ini terjadi?" → ya, dan ini fix-nya |
| **Onboarding** | Agent baru bisa baca semua knowledge sebelum mulai |

---

## Example: Query Flow

```
User: "Apa yang sudah kita putuskan tentang OS control?"

MARK:
  1. Search ~/.mark/knowledge/sessions/ for "OS control"
  2. Found: 3 sessions (Hermes, Claude Code, MARK)
  3. Extract decisions:
     - 4-level hierarchy (Hermes, 2026-07-25)
     - Self-preservation rule (MARK, 2026-07-28)
     - Scoped permissions (Claude Code, 2026-07-28)
  4. Present to user with source attribution
```
