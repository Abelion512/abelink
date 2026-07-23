## Plan: RSI-Coding Loop — Mark Improves Itself via CLI Tools

**RSI (Recursive Self Improvement):** Mark menggunakan Claude Code, Z.ai, Hermes, AGY untuk memodifikasi kodenya sendiri. Hasil eksekusi disimpan sebagai "learn" memory — besok Mark recall pengalaman itu dan improve lagi. Loop.

---

### Filosofi
Semua infrastruktur sudah siap:
- `native-tools.js` → exec shell (`run-powershell`)
- `useMarkPlan.js` → agentic loop + memory persist
- `vectorMemory.js` → "learn" type RAG
- `planning.js` → tool routing + system prompt injection

**Hanya perlu:** Tambah tool `run-cli`, register, inject RSI prompt.

---

### Files (3 files, zero new deps)

#### 1. `src/main/native-tools.js` — Add `run-cli`

```js
'run-cli': {
  needsApproval: false,
  handler: async (query) => {
    const parts = query.split('||')
    const cmd = parts[0].trim()
    const cwd = parts[1]?.trim() || process.cwd()
    const timeout = parseInt(parts[2]) || 180000

    const { stdout, stderr } = await execPromise(cmd, { 
      cwd, timeout, maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, HOME: process.env.HOME }
    })
    return { 
      success: true,
      output: stdout.trim() || '(no stdout)',
      stderr: stderr?.trim() || null
    }
  }
}
```

---

#### 2. `src/renderer/src/api/ai/planning.js`

**RSI section injected ke system prompt (di `!options.disableTools` block):**

```
# RSI (RECURSIVE SELF IMPROVEMENT) — Stage 4 Agent Engineering
KAMU ADALAH SELF-IMPROVING AGENT. Tool `run-cli` adalah PRIMARY tool untuk:
  - Improve kodemu sendiri via Claude Code: `claude -p "task" --bare`
  - Quick coding via Z.ai: `zai-cli "task"`
  - Autonomous task chains via Hermes: `hermes "task"`
  - Git: commit, branch, push hasil improvement
  - Build & test: `npm run build`, `npm test`
  - Eksekusi perintah server apa pun

RSI LOOP RULES:
  1. JALANKAN → EVALUASI → SIMPAN → ITERASI
  2. Setelah sukses, SELALU simpan sebagai "learn" memory: 
     { "memory": { "type": "learn", "summary": "ringkasan", "memory": "perintah + hasil", "action": "insert" } }
  3. Saat error/gagal, simpan juga learn memory dengan apa yang SALAH agar tidak diulang.
  4. Sebelum menulis kode, cek "learn" memory dulu via memory-search.
```

**Add `'run-cli'` ke tool enum** (line ~394).

**Add description di tool list:**
```
- run-cli: Eksekusi perintah shell. Format: "command||cwd||timeout".
  Gunakan untuk: Claude Code, Z.ai, Hermes CLI, git, npm, build, test, deploy.
  Output stdout + stderr. Tanpa approval — eksekusi langsung.
```

---

#### 3. `src/renderer/src/hooks/agent/useMarkPlan.js`

Add `'run-cli'` ke native tools array:
```js
] else if (
  [
    'read-file', 'write-file', 'replace-lines', 'delete-file',
    'list-dir', 'grep-search', 'run-powershell', 'run-cli',
    ...
  ].includes(tool)
)
```

---

### RAG Pipeline (Zero Code Change — Already Works)
1. AI output → `memory: { type: "learn", action: "insert" }`
2. `useMarkPlan.js` line 227 → `insertMemory(memoryData)` → vectorized
3. Next RSI loop → `memory-search` query → cosine similarity → recall

---

### Prioritas
1. `native-tools.js` — +15 lines
2. `planning.js` — register + RSI prompt
3. `useMarkPlan.js` — add to list
4. Build: `npm run build`