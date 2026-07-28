# Session: OS Control Architecture — Transparent, Safe, Autonomous

**Date:** 2026-07-28
**Branch:** feat/model-fallback-abelink → new branch per layer
**Priority:** Capability + Transparency + Control — seimbang
**Reference:** research-map.md #11, #12, referensi-perubahan-sistem-prompt-ai.md

---

## Prinsip Utama

> **MARK boleh bekerja mandiri, tetapi manusia harus selalu memahami tujuan, batas, dan konsekuensi tindakannya.**

Capability + Transparency + Control harus seimbang. Agent yang bisa klik tombol tanpa transparency = malware yang bisa ngobrol.

---

## 10. Structured Session Knowledge

### Problem

Chat antara user dan MARK adalah **pengetahuan paling berharga** — reasoning, decisions, trade-offs, design patterns. Tapi saat ini cuma disimpan sebagai:
- Chat archive (summary 2-3 kalimat) — terlalu ringkas
- Session messages (raw text) — tidak terstruktur

### Solution: Knowledge Extraction

Setiap selesai sesi, AI extract bukan cuma "apa yang dibicarakan", tapi:

```json
{
  "sessionId": "2026-07-28-os-control",
  "topic": "OS Control Architecture",
  "decisions": [
    {
      "decision": "4-level control hierarchy",
      "rationale": "Vision mahal, native API zero cost. Default to Level 1.",
      "alternatives": ["Pure vision", "Pure CLI"],
      "tradeoff": "Reliability vs flexibility"
    },
    {
      "decision": "Self-preservation rule",
      "rationale": "Agent cannot delete itself. Non-negotiable.",
      "alternatives": ["Allow with approval"],
      "tradeoff": "Autonomy vs survival"
    }
  ],
  "patterns": [
    "Progressive Disclosure (Hermes): L0 always, L1 on demand",
    "Scoped Permissions: path risk overrides user approval",
    "Quarantine > Delete: preserve first, decide later"
  ],
  "gaps": [
    "5-Layer Memory not implemented",
    "Agent Kernel still monolithic",
    "No goal state machine"
  ],
  "codeChanges": [
    "ai-bridge.js: model combo, retry 10x, reasoning handler",
    "tool-registry.js: progressive disclosure + voice fast path"
  ],
  "keyInsight": "Chat reasoning > code output. Knowledge is the real product."
}
```

### Storage

```
~/.mark/knowledge/
├── sessions/
│   ├── 2026-07-28-os-control.json
│   ├── 2026-07-27-model-fallback.json
│   └── ...
├── decisions/
│   ├── all.jsonl          # Every decision ever made
│   └── by-topic/          # Indexed by topic
└── patterns/
    └── all.jsonl          # Reusable design patterns
```

### Use Cases

1. **Context Replay** — "Kemarin kita bahas OS control, apa yang sudah diputuskan?"
2. **Decision Audit** — "Kenapa pakai quarantine bukan delete?" → lihat reasoning
3. **Pattern Reuse** — "Pernahkah kita pakai progressive disclosure sebelumnya?" → ya, di tool-registry
4. **Gap Tracking** — "Apa yang belum di-implement dari diskusi kemarin?" → lihat gaps

### How It Works

```
Session ends
    ↓
AI extracts: decisions, patterns, gaps, code changes
    ↓
Save to ~/.mark/knowledge/sessions/{date}-{topic}.json
    ↓
Index decisions to ~/.mark/knowledge/decisions/all.jsonl
    ↓
Next session: load relevant knowledge
    ↓
AI has full context of past reasoning
```

---

## Vision

MARK = Personal Autonomous OS. AI agent yang **bisa bertindak di dunia digital** dengan:
- **Transparent process** — user tahu apa yang dilakukan
- **Privacy architecture** — data dibagi zona
- **Human safety boundary** — agent tahu kapan harus berhenti
- **Verification loop** — aksi diverifikasi sebelum lanjut

```
User Goal → Plan → Permission → Execute → Verify → Memory
                ↑                                ↓
           Transparency ←──────────────────── Audit
```

## Architecture: 4-Level Control Hierarchy

```
Level 1: Native OS API (default, zero cost)
  xdotool, wmctrl, xdg-open, gtk-launch, shell
  
Level 2: Accessibility Tree (structured, no vision)
  AT-SPI2, DBus interface
  
Level 3: Vision Computer Use (fallback only)
  Screenshot → Vision Model → Coordinate → Click
  
Level 4: Hybrid Router (picks best level per task)
  Intent → Router → Level 1/2/3 → Verify → Memory
```

**Rule:** Vision (Level 3) is LAST RESORT. Default to Level 1 (native API).

## Hardware Constraints

- 8GB RAM, no GPU
- X11 session (Cinnamon)
- Tools available: xdotool, wmctrl, xdg-open, gtk-launch

---

## 1. Transparent Process

User harus tahu apa yang MARK lakukan. Bukan "show thinking", tapi **show process**.

### UI: Mission Control Panel

```
┌─────────────────────────────────────────────────┐
│  MARK Activity                            10:31 │
├─────────────────────────────────────────────────┤
│  ✓ 10:31:02  User requested: "Find laptop"     │
│  ✓ 10:31:04  Plan: 5 subtasks created           │
│  ✓ 10:31:10  Tool: web.search                   │
│  ✓ 10:31:15  Found: 20 candidates               │
│  ✓ 10:31:20  Verification: sources checked      │
│  ⏸ 10:31:25  Waiting: user approval             │
└─────────────────────────────────────────────────┘
```

### What to show (NOT chain-of-thought)

| Show | Don't Show |
|------|-----------|
| Goal | Internal reasoning |
| Plan steps | Token counting |
| Tool used | Prompt engineering |
| Result | Model weights |
| Reason for decision | Temperature settings |

### Explainable Action

Setiap aksi harus punya:
```json
{
  "action": "delete_file",
  "reason": "User requested cleanup",
  "scope": "/home/user/temp",
  "risk": "orange",
  "approval": "required"
}
```

Jangan: `MARK deleted 50 files` → user panik.

---

## 2. Privacy Architecture

Privacy bukan fitur tambahan. Fondasi PAOS.

### Data Zones

```
┌─────────────────────────────────────────┐
│  MARK DATA ZONES                        │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ PUBLIC KNOWLEDGE                │    │
│  │ docs, articles, tutorials       │    │
│  │ → boleh cloud                   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ USER MEMORY                     │    │
│  │ preferences, habits, context    │    │
│  │ → enkripsi lokal                │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ SENSITIVE DATA                  │    │
│  │ email, files, camera, location  │    │
│  │ → LOCAL ONLY, jangan kirim API  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ SECRETS                        │    │
│  │ API keys, tokens, passwords     │    │
│  │ → TIDAK BOLEH masuk prompt/log  │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### Privacy Budget

Setiap tool punya privacy cost:

| Tool | Privacy Risk | Zone |
|------|:-----------:|------|
| `computer.open` (app) | Low | Public |
| `computer.list-windows` | Low | Public |
| `computer.screenshot` | Medium | User Memory |
| `computer.read-folder` | Medium | User Memory |
| `camera-look` | HIGH | Sensitive |
| `wa-send` | HIGH | Sensitive |
| `read-email` | CRITICAL | Sensitive |
| `api-key` | MAX | Secrets |

### Privacy Assessment Flow

```
Task → Privacy Assessment → Allow / Ask / Block
```

---

## 3. Human Safety Boundary

Agent harus punya "human override".

| Level | Action | Handler | Example |
|-------|--------|---------|---------|
| GREEN | Auto-execute | No prompt | open app, search web, play music |
| YELLOW | Log + notification | Silent | read folder, modify settings |
| ORANGE | Approval required | Modal | send email, delete file, purchase |
| RED | BLOCK | Hard stop | disable security, extract password, sudo |

### Existing Security (to keep)

- `isDangerousCommand()` — blocks rm, dd, shutdown, fork bombs
- `safeEnv()` — whitelist env vars for subprocess
- `checkToolApproval()` — approval modal for dangerous tools
- RSI audit log at `~/.mark/rsi-audit.log`

---

## 7. Scoped Permissions (Anti-Generalization)

### Problem

User approve `rm -rf node_modules` → agent generalize → `rm -rf docs/` → DATA LOSS.

**Never allow blanket permissions.** Every permission is scoped to:
- Specific path pattern
- Specific action
- Expiry time
- One-time or recurring

### Permission Scope Rules

```js
// BAD: blanket permission
{ action: "delete", scope: "/home/user" }  // DANGEROUS

// GOOD: scoped permission
{ 
  action: "delete", 
  path: "**/node_modules/**",        // pattern matching
  pathPattern: "reinstallable",       // risk category
  expiry: "30s",                      // time-limited
  oneTime: true                       // single use
}
```

### Path Risk Categories

| Category | Paths | Can rm -rf? | Risk |
|----------|-------|:-----------:|------|
| `reinstallable` | `node_modules/`, `.cache/`, `build/`, `dist/`, `.next/`, `__pycache__/` | ✅ Yes | LOW — reinstallable |
| `generated` | `*.log`, `*.tmp`, `.env.local`, `*.bak` | ✅ Yes | LOW — regenerable |
| `user-content` | `docs/`, `notes/`, `diary/`, `*.md` | ❌ NO | HIGH — unique |
| `source-code` | `src/`, `lib/`, `*.js`, `*.ts`, `*.py` | ❌ NO | CRITICAL — unique |
| `config` | `.gitconfig`, `package.json`, `tsconfig.json` | ❌ NO | CRITICAL — unique |
| `self` | MARK's own `src/`, `package.json`, `~/.mark/core` | ❌ **NEVER** | **SELF-PRESERVATION** — non-negotiable, even with user approval |
| `system` | `/etc/`, `/usr/`, `/var/` | ❌ BLOCK | MAX — never |

### Permission Resolution

```
User requests: rm -rf node_modules

Policy Engine:
  1. Parse target path
  2. Match against path risk categories
  3. "node_modules" → category: reinstallable → GREEN → auto-execute

User requests: rm -rf docs/

Policy Engine:
  1. Parse target path
  2. "docs" → category: user-content → RED → BLOCK
  3. "But user gave full access..." → DOESN'T MATTER
  4. Scoped permission cannot override path risk category
```

### Key Rules

1. **Permission is NOT authority** — approving one action doesn't approve all
2. **Path risk overrides user permission** — even if user says "yes", system blocks `docs/`
3. **Scope inherits narrowest** — `rm -rf *` in `~/project` only covers `reinstallable` + `generated`
4. **Time-limited** — permissions expire after N seconds/uses
5. **Audit all** — every permission grant/deny logged
6. **Self-preservation** — MARK CANNOT delete itself. `src/`, `node_modules/` (MARK's own), `package.json`, `~/.mark/` core files are ALWAYS RED. Even with user approval. This is non-negotiable.

### Permission Token Format

```json
{
  "id": "perm-20260728-001",
  "action": "delete",
  "path": "/home/user/project/**",
  "pathPattern": "reinstallable",    // only node_modules, build, dist, etc.
  "expiresAt": "2026-07-28T10:31:00Z",
  "maxUses": 1,
  "uses": 0,
  "grantedBy": "user",
  "reason": "User approved cleanup"
}
```

### What Gets Blocked (Even with "Full Access")

| Target | Why Blocked |
|--------|------------|
| `docs/`, `*.md` | User content, unique |
| `src/`, `*.js`, `*.ts` | Source code, unique |
| `.git/` | Version control, irreplaceable |
| `package.json`, `tsconfig.*` | Config, unique |
| `~/Documents/`, `~/Pictures/` | Personal files |
| `/etc/`, `/usr/` | System files |
| Any file with `important` in name | Heuristic safety |

### What Gets Auto-Approved (With Scoped Permission)

| Target | Why Safe |
|--------|----------|
| `node_modules/` | Reinstallable via `npm install` |
| `build/`, `dist/`, `.next/` | Rebuildable |
| `.cache/`, `__pycache__/` | Cache, auto-regen |
| `*.log`, `*.tmp` | Temporary files |
| `/tmp/` | System temp directory |

---

## 8. Quarantine vs Delete (Malware Dilemma)

### Problem

Path risk categories protect `docs/`, `src/`, `.git/`. Tapi apa isinya malware?

```
docs/
├── readme.md          ← penting
├── guide.pdf          ← penting
└── evil-script.js     ← MALWARE
```

Blokir semua? → malware tetap hidup.
Hapus semua? → file penting hilang.

### Solution: Quarantine, Bukan Delete

```
Delete Request
    ↓
Path Risk Check
    ↓
┌─────────────────────────────────────┐
│ reinstallable → auto-delete         │
│ everything else → QUARANTINE        │
└─────────────────────────────────────┘
    ↓
Quarantine Flow:
  1. Move to ~/.mark/quarantine/{timestamp}/
  2. Preserve directory structure
  3. Log: what, why, original path
  4. Notify user: "X files quarantined"
  5. User reviews → Restore or Delete permanently
```

### Quarantine Format

```
~/.mark/quarantine/
├── 2026-07-28T10-31-25/
│   ├── manifest.json        # What was moved and why
│   ├── home/user/project/
│   │   ├── docs/evil-script.js
│   │   └── src/suspicious.exe
│   └── metadata.json        # Timestamp, action, risk score
```

### Manifest

```json
{
  "id": "q-20260728-001",
  "timestamp": "2026-07-28T10:31:25Z",
  "action": "quarantine",
  "reason": "User requested rm -rf but path contains user-content",
  "files": [
    {
      "original": "/home/user/project/docs/evil-script.js",
      "quarantined": "~/.mark/quarantine/2026-07-28T10-31-25/home/user/project/docs/evil-script.js",
      "risk": "unknown",
      "size": 2048
    }
  ],
  "totalFiles": 3,
  "totalSize": 12580
}
```

### Escalation Path

```
Delete Request
    ↓
Risk Assessment
    ↓
┌──────────────────────────────────────────────────────┐
│ reinstallable (node_modules, build, .cache)          │
│   → AUTO DELETE (safe, reinstallable)                │
├──────────────────────────────────────────────────────┤
│ user-content / source / config                       │
│   → QUARANTINE (preserve, notify user)               │
├──────────────────────────────────────────────────────┤
│ uncertain / mixed (contains both safe and unsafe)    │
│   → SCAN → separate → delete safe → quarantine rest  │
├──────────────────────────────────────────────────────┤
│ system paths (/etc, /usr, /var)                      │
│   → HARD BLOCK (never touch)                         │
└──────────────────────────────────────────────────────┘
```

### User Override

Jika user **yakin** file itu malware dan mau hapus permanent:

```
MARK: "I quarantined 3 files from docs/. 
       Review: ~/.mark/quarantine/2026-07-28T10-31-25/
       
       [Restore All] [Delete Permanently] [Review Individually]"
```

User harus **explicitly** klik "Delete Permanently". Tidak ada auto-delete untuk quarantined files.

### Why Not Just Scan for Malware?

1. **Malware detection is hard** — false positives/negatives
2. **ClamAV is heavy** — 8GB RAM constraint
3. **Quarantine is safer** — preserve first, decide later
4. **User is the best scanner** — they know what's theirs

### Updated Flow

```
User: "rm -rf docs/"

MARK Policy Engine:
  1. "docs/" → category: user-content → not auto-delete
  2. Scan contents: 3 files
  3. 2 files look normal (.md, .pdf)
  4. 1 file looks suspicious (.js in docs/)
  5. QUARANTINE all 3 to ~/.mark/quarantine/
  6. Notify user with manifest
  7. User reviews → deletes or restores

Result: Nothing deleted permanently without user confirmation
```

---

## 4. Memory Consent

MARK jangan otomatis mengingat semuanya. Harus ada consent.

```
User: "Saya sedang mencari kerja."

MARK: Should I remember: "You are currently job hunting"?
      [Yes] [No] [This Session Only]
```

Perbedaan:
- Context sementara → auto-forget
- Memory permanen → ask consent

---

## 5. Sensor Indicators

Kamera, mikrofon, screen observation harus punya indikator visual.

```
🎤 Microphone active
📷 Camera active
👁 Screen observation active
```

Tidak boleh diam-diam. Ever.

---

## 6. Audit Log for Humans

```
~/.mark/
├── memory/
├── audit/
│   ├── actions.jsonl
│   ├── approvals.jsonl
│   └── security-events.jsonl
├── permissions/
└── policies/
```

User harus bisa:
- Lihat semua aksi
- Export
- Delete
- Filter by date/risk level

---

## Module Structure

```
src/main/computer/
  ├── index.js                    # Router — picks Level 1/2/3
  │
  ├── intent/
  │   └── semantic-actions.js     # "click submit" → {role:button, text:Submit}
  │
  ├── state/
  │   └── computer-state.js       # Active window, open apps, last action
  │
  ├── drivers/
  │   ├── x11.js                  # xdotool + wmctrl wrapper
  │   ├── dbus.js                 # DBus layer (MPRIS, notifications, power)
  │   └── wayland.js              # Future: Wayland compositor support
  │
  ├── policy/
  │   ├── policy-engine.js        # Risk assessment per action
  │   ├── permission-boundary.js  # Scope: ~/safe, /tmp, system
  │   └── capability-token.js     # Time-limited, scoped permissions
  │
  ├── router/
  │   └── computer-router.js      # Intent → best Level (1/2/3)
  │
  ├── level1/
  │   ├── window-manager.js       # wmctrl + xdotool window ops
  │   ├── keyboard-controller.js  # xdotool key/type
  │   ├── mouse-controller.js     # xdotool mouse move/click
  │   ├── app-launcher.js         # gtk-launch + xdg-open
  │   └── process-monitor.js      # ps, top, system info
  │
  ├── level2/
  │   └── accessibility-tree.js   # AT-SPI2 via DBus
  │
  ├── level3/
  │   └── screen-analyzer.js      # Screenshot → Vision → Coordinates
  │
  ├── verification/
  │   └── action-verifier.js      # Post-action: window? process? UI state?
  │
  ├── transparency/
  │   ├── mission-control.js      # Timeline UI for user
  │   └── explainable-action.js   # Every action has reason + scope + risk
  │
  ├── privacy/
  │   ├── data-zones.js           # Public/User/Sensitive/Secrets
  │   ├── privacy-budget.js       # Cost per tool
  │   └── memory-consent.js       # Ask before remembering
  │
  └── audit/
      ├── audit-log.js            # ~/.mark/audit/*.jsonl
      └── sensor-indicator.js     # Camera/mic/screen active indicator
```

---

## Task Breakdown

### Phase 1: Security Foundation (P0 — DO FIRST)

| # | Task | File | Effort |
|---|------|------|--------|
| 1.1 | **Policy Engine** — risk assessment per action type | `policy-engine.js` | High |
| 1.2 | **Permission Boundary** — scope: ~/safe, /tmp, system | `permission-boundary.js` | Medium |
| 1.3 | **Audit Logger** — structured JSON log per action | `audit-log.js` | Low |
| 1.4 | **Enhance `isDangerousCommand()`** — extend blocklist | `native-tools.js` | Low |
| 1.5 | **Approval Workflow** — integrate with existing `ApprovalContext` | `policy-engine.js` | Medium |

### Phase 2: Level 1 — Native OS Control (P1 — CORE)

| # | Task | File | Effort |
|---|------|------|--------|
| 2.1 | **Window Manager** — list/focus/close/minimize/maximize windows | `level1/window-manager.js` | Medium |
| 2.2 | **Keyboard Controller** — type text, key combos, shortcuts | `level1/keyboard-controller.js` | Low |
| 2.3 | **Mouse Controller** — move, click, scroll, drag | `level1/mouse-controller.js` | Low |
| 2.4 | **App Launcher** — detect installed apps, launch by name | `level1/app-launcher.js` | Medium |
| 2.5 | **Process Monitor** — list running apps, CPU/mem usage | `level1/process-monitor.js` | Low |
| 2.6 | **Expose as MARK tools** — `computer.open`, `computer.click`, `computer.type`, etc. | `native-tools.js` | Medium |

### Phase 3: Level 2 — Accessibility Tree (P1 — STRUCTURED)

| # | Task | File | Effort |
|---|------|------|--------|
| 3.1 | **AT-SPI2 Reader** — query accessibility tree via DBus | `level2/accessibility-tree.js` | High |
| 3.2 | **Element Finder** — find by role/name/description | `level2/accessibility-tree.js` | Medium |
| 3.3 | **Element Action** — click/type/focus by element ref | `level2/accessibility-tree.js` | Medium |

### Phase 4: Level 3 — Vision Fallback (P2 — FALLBACK)

| # | Task | File | Effort |
|---|------|------|--------|
| 4.1 | **Screen Analyzer** — screenshot → vision model → element map | `level3/screen-analyzer.js` | Medium |
| 4.2 | **Coordinate Mapper** — vision output → xdotool coordinates | `level3/screen-analyzer.js` | Low |
| 4.3 | **Vision Cache** — reuse screenshot within 2s window | `level3/screen-analyzer.js` | Low |

### Phase 5: Level 4 — Hybrid Router (P2 — ORCHESTRATION)

| # | Task | File | Effort |
|---|------|------|--------|
| 5.1 | **Computer Control Router** — intent → best level | `index.js` | Medium |
| 5.2 | **Action Verifier** — post-action screenshot/check | `verification/action-verifier.js` | Medium |
| 5.3 | **Fallback Chain** — Level 1 fail → Level 2 → Level 3 | `index.js` | Low |

### Phase 6: Integration (P3 — MARK TOOLS)

| # | Task | File | Effort |
|---|------|------|--------|
| 6.1 | **Tool Definitions** — JSON schema for each computer tool | `native-tools.js` | Low |
| 6.2 | **AI Planner Update** — add `computer.*` tools to planning prompt | `planning.js` | Low |
| 6.3 | **Session Doc Update** — document new capabilities | `docs/sessions/` | Low |

---

## Tool Definitions (Proposed)

```json
// GREEN — auto-execute
{"name": "computer.list-windows", "risk": "green"}
{"name": "computer.get-active-window", "risk": "green"}
{"name": "computer.list-processes", "risk": "green"}
{"name": "computer.screenshot", "risk": "green"}

// YELLOW — auto-execute + log
{"name": "computer.open", "risk": "yellow", "params": {"app": "string"}}
{"name": "computer.focus-window", "risk": "yellow", "params": {"title": "string"}}
{"name": "computer.click", "risk": "yellow", "params": {"x": "number", "y": "number"}}
{"name": "computer.type", "risk": "yellow", "params": {"text": "string"}}
{"name": "computer.key", "risk": "yellow", "params": {"combo": "string"}}

// ORANGE — approval required
{"name": "computer.close-window", "risk": "orange", "params": {"title": "string"}}
{"name": "computer.run-command", "risk": "orange", "params": {"cmd": "string"}}

// RED — blocked
{"name": "computer.sudo", "risk": "red", "blocked": true}
{"name": "computer.shutdown", "risk": "red", "blocked": true}
```

---

## Reference: Existing Security Code

| File | Function | Purpose |
|------|----------|---------|
| `native-tools.js:36-45` | `safeEnv()` | Whitelist env vars for subprocess |
| `native-tools.js:48-55` | `isDangerousCommand()` | Block rm, dd, shutdown, fork bombs |
| `native-tools.js:12-33` | RSI audit log | Log all CLI invocations to `~/.mark/rsi-audit.log` |
| `useMarkPlan.js:697-726` | `checkToolApproval()` | Approval modal for dangerous tools |
| `ApprovalContext.jsx` | `requestApproval()` | Promise-based approval dialog |

---

## Success Criteria

1. **Security:** Zero unapproved destructive actions
2. **Reliability:** Level 1 works 100% on X11 (your setup)
3. **Fallback:** Level 2/3 only when Level 1 can't handle
4. **Verification:** Every action verified before next step
5. **Audit:** Every action logged with timestamp, tool, params, result

---

## Notes

- AT-SPI2 (Level 2) may not work well on Cinnamon — needs testing
- Vision (Level 3) uses Gemini Flash Lite from model registry — already configured
- Hardware constraint: 8GB RAM, no GPU → minimize vision calls
- Wayland support: future phase (your setup is X11)
