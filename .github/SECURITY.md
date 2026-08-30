# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 4.x     | ✅ Active          |
| < 4.0   | ❌ Upstream legacy |

## Reporting a vulnerability

Mark Agent stores credentials (API keys, tokens) locally in Dexie/IndexedDB.
If you discover a credential leak, remote code execution, or sandbox escape:

1. **DO NOT** open a public GitHub issue.
2. Email the upstream maintainer or open a draft security advisory on this repo.

## What we protect

- AI provider API keys and tokens
- WhatsApp session credentials
- Local filesystem access boundaries (XDG workspace sandbox via `resolve_contained()`)
- Browser automation isolation (tauri-sidecar isolation)
- IPC bridge integrity (capabilities-based permission gates)

## Threat model

- **Local first**: All secrets stored client-side in IndexedDB (Dexie).
- **Tauri capabilities**: Renderer processes have explicit capability grants via `capabilities/default.json`.
  Main process uses `invoke()` gates; no unrestricted Node.js integration.
- **Path containment**: All filesystem operations use `resolve_contained()` to reject `~`, `..`, and absolute paths.
- **No telemetry**: Zero tracking, analytics, or external data exfiltration.
