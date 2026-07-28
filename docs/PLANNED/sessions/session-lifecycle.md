# Session Lifecycle — Auto Knowledge Extraction

> Ketika sesi berakhir, pengetahuan TIDAK boleh hilang.
> Auto-extract, auto-save, auto-index.

---

## Trigger Points

| Trigger | Action | When |
|---------|--------|------|
| **Session end** | Full knowledge extraction | User close chat / app quit |
| **Significant decision** | Partial extraction | AI detects architecture/design decision |
| **Periodic** | Incremental save | Every 20 messages |
| **On-demand** | Manual save | User says "save session" |

---

## Auto-Extract Flow (MARK)

```
Session ends (user close / app quit)
    ↓
useMarkAgent.js: useEffect cleanup
    ↓
extractSessionKnowledge(chatData)
    ↓
  1. Scan messages for decisions (keywords: "putuskan", "pilih", "decide", "pakai")
  2. Scan for patterns (keywords: "pattern", "approach", "cara")
  3. Scan for errors (keywords: "error", "fix", "bug", "solve")
  4. Scan for insights (keywords: "insight", "kenyataannya", "ternyata")
  5. Scan for gaps (keywords: "belum", "missing", "gap", "todo")
    ↓
Build knowledge object
    ↓
Save to ~/.mark/knowledge/sessions/{date}/{topic}.json
    ↓
Index to ~/.mark/knowledge/decisions/all.jsonl
    ↓
Next session: auto-load relevant knowledge
```

---

## Implementation

### 1. Knowledge Extractor

```js
// src/renderer/src/api/ai/sessionKnowledge.js

export function extractSessionKnowledge(chatData, activeTopic) {
  const decisions = []
  const patterns = []
  const insights = []
  const gaps = []
  const errors = []

  for (const msg of chatData) {
    if (msg.role !== 'ai') continue
    const text = msg.content?.toLowerCase() || ''

    // Detect decisions
    if (text.includes('putuskan') || text.includes('pilih') || text.includes('pakai') || text.includes('decide')) {
      decisions.push({ decision: msg.content.slice(0, 200), timestamp: msg.timestamp })
    }

    // Detect patterns
    if (text.includes('pattern') || text.includes('approach') || text.includes('cara kerja')) {
      patterns.push({ description: msg.content.slice(0, 200), timestamp: msg.timestamp })
    }

    // Detect errors + fixes
    if (text.includes('error') || text.includes('fix') || text.includes('bug')) {
      errors.push({ content: msg.content.slice(0, 200), timestamp: msg.timestamp })
    }

    // Detect insights
    if (text.includes('insight') || text.includes('kenyataannya') || text.includes('ternyata')) {
      insights.push({ insight: msg.content.slice(0, 200), timestamp: msg.timestamp })
    }

    // Detect gaps
    if (text.includes('belum') || text.includes('gap') || text.includes('missing')) {
      gaps.push({ gap: msg.content.slice(0, 200), timestamp: msg.timestamp })
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
```

### 2. Auto-Save Hook

```js
// In useMarkAgent.js — cleanup on unmount
useEffect(() => {
  return () => {
    // Session ending — extract and save knowledge
    if (chatData.length > 5) { // Only if meaningful conversation
      const knowledge = extractSessionKnowledge(chatData, activeTopic)
      if (knowledge.knowledge.decisions.length > 0 || 
          knowledge.knowledge.insights.length > 0) {
        window.api.saveSessionKnowledge(knowledge)
      }
    }
  }
}, []) // Empty deps = runs on unmount only
```

### 3. IPC Handler

```js
// In index.js
ipcMain.handle('save-session-knowledge', async (_event, knowledge) => {
  const dir = join(homedir(), '.mark', 'knowledge', 'sessions', 
    new Date().toISOString().split('T')[0])
  mkdirSync(dir, { recursive: true })
  const fileName = `${knowledge.session.topic.replace(/\s+/g, '-').toLowerCase()}.json`
  writeFileSync(join(dir, fileName), JSON.stringify(knowledge, null, 2))
  return { saved: true, path: join(dir, fileName) }
})
```

---

## For External Agents (Hermes, Claude Code, etc.)

### Option A: Manual Export

```
User: "export session knowledge"
Agent: [generates JSON]
User: save ke ~/.mark/knowledge/cross-agent/
```

### Option B: CLI Tool (Future)

```bash
# From any agent's terminal:
mark-knowledge export --topic "OS Control" --agent hermes
mark-knowledge import ~/.mark/knowledge/cross-agent/hermes-session.json
mark-knowledge search "progressive disclosure"
```

### Option C: Plugin Integration

```
Hermes plugin → auto-export on session end
Claude Code hook → auto-export on session end
ZCode skill → auto-export on session end
```

---

## Query Flow

```
New session starts
    ↓
MARK loads relevant knowledge from ~/.mark/knowledge/
    ↓
Inject into system prompt:
  "# KNOWLEDGE FROM PAST SESSIONS
   - OS Control: 4-level hierarchy decided (Hermes, 2026-07-25)
   - Model Fallback: abelink combo decided (MARK, 2026-07-28)
   - Progressive Disclosure: L0/L1 pattern (Claude Code, 2026-07-28)"
    ↓
AI has full context of past reasoning
    ↓
No need to re-explain decisions
```

---

## Minimal Viable Implementation

1. `extractSessionKnowledge()` — keyword-based extraction
2. `saveSessionKnowledge()` — IPC to save JSON
3. Auto-save on session end (unmount hook)
4. Load relevant knowledge on session start
5. Manual import for external agents

**Skip for now:** CLI tool, plugin integrations, periodic save
