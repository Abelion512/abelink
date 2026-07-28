# Changelog

## [4.0.0] - 2026-07-28

### Added
- **Linux fork initial release** - port dari Mazees/mark-agent v3.x Windows
- **PC Agent** (pc-agent.js, linux-agent.sh, read-ui.py, screenshot-ocr.py) - AT-SPI + xdotool desktop automation
- **9Router support** - primary AI endpoint via localhost:20128, model combo abelink
- **Model Registry** (model-registry.json) - JSON-driven, fallback chain, analytics
- **Context Compactor** - smart compression replaces hard truncation
- **Fallback Serializer** - multi-format output parser (JSON -> XML -> KV -> Regex)
- **MPRIS service** - D-Bus media keys integration for Linux
- **Last.fm service** - scrobbling integration
- **Setup script** (scripts/setup-linux-pc-agent.sh) - auto-install Linux deps

### Changed
- **.gitignore** - rewritten (57->107 lines): lockfiles, Electron packaging, AI agent workspaces
- **.github/** - new: CI build/release, dependabot, issue templates, SECURITY.md, FUNDING
- **AGENTS.md** - updated for Linux environment, fork-specific paths
- **docs/** - restructured: installation guide, system architecture, feature spec, task analysis
- **README.md** - updated for Linux edition, Indonesian docs

### Fixed
- **ai-bridge.js** - top-level await fix, jsonrepair import, multi-provider retry
- **pc-agent.js** - template literal syntax in command builder
- **index.js** - Ctrl+Shift+S emergency stop shortcut for PC agent
- Build pipeline - Electron 39 compatibility, asarUnpack for ffmpeg/yt-dlp

## [3.x] - Upstream (Mazees/mark-agent)

Versi Windows original. Lihat [changelog upstream](https://github.com/Mazees/mark-agent/releases).
