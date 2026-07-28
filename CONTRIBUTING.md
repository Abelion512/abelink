# Contributing to Mark Agent (Linux Fork)

## Quick Start

```bash
git clone https://github.com/Abelion512/mark-agent.git
cd mark-agent
npm ci
npm run dev          # dev server (Vite HMR + Electron)
npm run build:linux  # production build -> dist/
```

## Branch Convention

| Prefix   | Purpose                          |
|----------|----------------------------------|
| `feat/*` | New feature                      |
| `fix/*`  | Bug fix                          |
| `docs/*` | Documentation only               |
| `chore/*`| Tooling, deps, CI, refactoring   |

Base branch: `main`. Rebase before PR.

## PR Workflow

1. Open PR against `main` with descriptive title
2. CI runs: `npm ci` -> `npm run lint` -> `npm run build`
3. At least 1 review approval required
4. Squash-merge with conventional commit message

## Code Style

- **Linter:** ESLint (`npm run lint` / `eslint --cache .`)
- **Formatter:** Prettier (`npm run format` / `prettier --write .`)
  - singleQuote, noSemi, printWidth 100, trailingComma none
- **Electron boundary:** No `fs`/`path` in renderer/ - IPC via preload only
- **CSS:** Tailwind 4 + DaisyUI 5 (`forest` theme). No ad-hoc CSS files.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  `type(scope): description` — e.g., `feat(ai-bridge): add 9Router provider`

## Architecture Rules

- Read `AGENTS.md` before modifying core agent files
- Main <-> Renderer communication **must** go through `preload/index.js` IPC
- All dangerous OS operations **must** trigger approval dialogs
- No third-party analytics/tracking — privacy-first app

## Linux-Specific Notes

- **Linux-only fork**. No Windows/macOS compatibility patches.
- System deps: `libgtk-3-dev`, `libnotify-dev`, `libnss3`, `xdotool`, `tesseract-ocr`
- `pc-agent.js` uses AT-SPI D-Bus + xdotool. Wayland support via ydotool.
- See `scripts/setup-linux-pc-agent.sh` for automated dep installation.
