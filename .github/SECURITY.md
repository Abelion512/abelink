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
- Local filesystem access boundaries
- Browser automation isolation (BrowserWindow sandbox)
- IPC bridge integrity (preload isolation)

## Threat model

- **Local first**: All secrets stored client-side in Electron's IndexedDB.
- **Electron sandbox**: Renderer processes have `sandbox: true` where possible.
  Main process `sandbox: false` by design (Node.js IPC required).
- **No telemetry**: Zero tracking, analytics, or external data exfiltration.
