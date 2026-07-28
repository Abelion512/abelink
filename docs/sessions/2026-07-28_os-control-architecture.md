# Session: OS Control Architecture — Security-First Computer Control

**Date:** 2026-07-28
**Branch:** feat/model-fallback-abelink → new branch per layer
**Priority:** SECURITY FIRST — OS access = high risk
**Reference:** research-map.md #11 (Subprocess Safety), #12 (Browser DOM), referensi-perubahan-sistem-prompt-ai.md (Trust Boundary + Verification)

---

## Vision

MARK = Personal Autonomous OS. Bukan cuma AI assistant yang ngobrol, tapi AI agent yang **bisa bertindak di dunia digital** dengan verification loop.

```
User Goal → Intent Planner → Computer Control Router → Action → Verification → Memory
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

## Security Architecture (P0)

### Threat Model

| Threat | Risk | Mitigation |
|--------|------|------------|
| Accidental `rm -rf /` | HIGH | Policy Engine + dangerous command block |
| Unauthorized file access | HIGH | Permission boundaries per directory |
| Unintended system changes | HIGH | Approval workflow for destructive ops |
| Prompt injection → OS exec | CRITICAL | Input sanitization + policy gate |
| Privilege escalation | CRITICAL | Never run as root, audit all exec |

### Security Layers

```
LLM Output
    ↓
Intent Parser (extract action type)
    ↓
Policy Engine (allow/deny/approve?)
    ↓
Permission Check (scope: user dir? system? global?)
    ↓
Action Executor (sandboxed)
    ↓
Verification (did it work? revert if wrong?)
    ↓
Audit Log (every action logged)
```

### Risk Levels

| Level | Action | Example | Handler |
|-------|--------|---------|---------|
| GREEN | Read-only, safe | list-dir, get window name, screenshot | Auto-execute |
| YELLOW | Reversible, user-scope | write file, open app, click | Auto-execute + log |
| ORANGE | Semi-destructive | delete file, replace lines | Approval required |
| RED | System-wide, irreversible | sudo, shutdown, format | BLOCK + approval |

### Existing Security (to keep)

- `isDangerousCommand()` — blocks rm, dd, shutdown, fork bombs
- `safeEnv()` — whitelist env vars for subprocess
- `checkToolApproval()` — approval modal for dangerous tools
- RSI audit log at `~/.mark/rsi-audit.log`

---

## Module Structure

```
src/main/computer/
  ├── index.js                 # Router — picks Level 1/2/3
  ├── policy-engine.js         # Risk assessment + approval
  ├── permission-boundary.js   # Directory/scope permissions
  ├── audit-log.js             # Structured action logging
  │
  ├── level1/
  │   ├── window-manager.js    # wmctrl + xdotool window ops
  │   ├── keyboard-controller.js  # xdotool key/type
  │   ├── mouse-controller.js  # xdotool mouse move/click
  │   ├── app-launcher.js      # gtk-launch + xdg-open
  │   └── process-monitor.js   # ps, top, system info
  │
  ├── level2/
  │   └── accessibility-tree.js  # AT-SPI2 via DBus
  │
  ├── level3/
  │   └── screen-analyzer.js   # Screenshot → Vision → Coordinates
  │
  └── verification/
      └── action-verifier.js   # Post-action verification
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
