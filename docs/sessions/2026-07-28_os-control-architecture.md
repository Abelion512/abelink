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
