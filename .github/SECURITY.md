# Security Policy

## Supported versions

| Version        | Supported          |
| -------        | ------------------ |
| 1.0.0-alpha.x  | ✅ Active          |
| < 1.0.0-alpha  | ❌ Unsupported     |

## Reporting a vulnerability

Mark Agent stores credentials (API keys, tokens) locally in Dexie/IndexedDB.
If you discover a credential leak, remote code execution, or sandbox escape:

1. **DO NOT** open a public GitHub issue.
2. Email the maintainer or open a draft security advisory on Abelion512/mark-agent-linux.

## What we protect

- AI provider API keys and tokens
- Telegram bot token
- Local filesystem access boundaries (XDG workspace sandbox via `resolve_contained()`)
- Browser automation isolation (tauri-sidecar isolation)
- IPC bridge integrity (capabilities-based permission gates)

## Threat model

- **Local first**: All secrets stored client-side in IndexedDB (Dexie).
- **Tauri capabilities**: Renderer processes have explicit capability grants via `capabilities/default.json`.
  Main process uses `invoke()` gates; no unrestricted Node.js integration.
- **Path containment**: All filesystem operations use `resolve_contained()` to reject `~`, `..`, and absolute paths.
- **No telemetry**: Zero tracking, analytics, or external data exfiltration.
