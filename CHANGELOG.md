# Changelog MARK Linux

Dihasilkan otomatis oleh `scripts/release-helper.mjs` saat release prepare — jangan diedit manual.

## v1.0.0-alpha.3 — 4 September 2026

**Ringkasan:** 1 perbaikan dalam rilis ini.

### Perbaikan
- Release.yml — add workflow_dispatch + tag-aware guard/checkout for finalize chain

## v1.0.0-alpha.2 — 4 September 2026

**Ringkasan:** 23 fitur baru, 38 perbaikan dan 30 pembaruan dokumentasi.

### Fitur Baru
- Capability Manager — OpenConnector-style catalog/policy/audit engine channel
- Fase C3 stage 1 — real browser:* channels via extension bridge
- Drop-anywhere attachments, multi-select upload, real size preview, Telegram UI events via Tauri
- MarkBench Phase 2A-2D — auditable benchmark harness for Mark Linux
- Automated release system with prepare/finalize stages
- Initial release v1.0.0-alpha.1
- Automated release system with prepare/finalize stages
- Baseline for Tauri native Linux migration
- UI cleanup — telegram page isolation, WhatNew redesign, prune dead nav, add config sections
- Add X11/Wayland detection for PC automation
- Auto-detect hardware profile + lazy-load RAG/STT by default
- Awareness window tracker — replace sidecar window-tracker.js with xdotool
- PC automation os-* commands — replace sidecar stubs with xdotool
- Awareness window tracker — replace sidecar window-tracker.js with xdotool
- Awareness window tracker — replace sidecar window-tracker.js with xdotool
- Route run-shell/git/tasks to Rust commands
- Run_task/read_task_output/kill_task/list_tasks — replace task-daemon
- Git_status/diff/commit/revert — replace sidecar git-service with spawn git
- System_get_info — replace sidecar systemInfo with native /proc parser
- Tools_run_shell — replace sidecar run-shell with native Rust
- Tur setup minimal + lazy load menyeluruh + window controls wizard
- Deteksi model /v1/models + perbaiki blok save Groq & vision
- Custom API Anthropic-compatible + fallback SIMD dan kamera

### Perbaikan
- Release-prepare — git identity, label guard, staged-diff commit check, workflow_dispatch
- Resolve 18 lint errors including 6 runtime crash bugs
- Purge Windows-era shell remnants + fallback crash
- Strip data-URL prefix before base64 decode in sendPhoto path
- Restore native screenshot-to-tg, wire tg token, parallel hydrate
- Resolve 18 lint errors incl. 6 runtime crash bugs
- Remove electron imports from live channels — tg/awareness/google crash on first use
- Remove stale .gitignore dir rules that broke Release Prepare
- Remove no-op nested overrides breaking frozen-lockfile, pin Bun version
- Restore plugin/skills/tg channels with approval gates, dependency hardening, migration-gap
- Deterministic drain-exit, correlated ask_user, honest TG commands
- Real durations, executed verifier, persistent sidecar RPC
- Point homepage to mark-agent-linux fork
- Restore stale branches in tauri.yml
- Remove stray closing brace in dispatchReleaseWorkflow
- Gh workflow run --ref linux -f tag=TAG, remove dependency on master branch for workflow_dispatch
- Workflow_dispatch integration with explicit tag passing, actions:write permission, version-scoped concurrency, tag validation
- Explicitly dispatch release.yml via workflow_dispatch, add PR filter and manual validation guards
- Branch selection before file mutation in prepareRelease, add integration tests for PR update ordering
- Wire update checker into App lifecycle — startup init + cleanup on unmount
- Replace non-existent semver.format with string template in nextAlphaVersion, add 31 scenario tests
- Final hardening - semver in package.json, reachable tag detection, linux merge into release branch
- Idempotency via releases.json, after-merge re-release prevention, and tag-reachable-only tag detection
- Correct idempotency and update detection, add semver dependency
- Use htmlparser2 DOM parser for script/style sanitization
- Use full tag-matching regex for script/style stripping
- Improve HTML sanitization regex to match closing tags with optional whitespace
- Add permissions blocks to workflow, improve HTML sanitization regex
- Persona identity — strip upstream 'Mazees'/'Mada' defaults on linux fork
- Simplify Configuration labels, restore occupation, rename AI Engine to Model
- Remove easter egg, clean memory button, first-boot flow final
- FirstBootChoiceScreen as modal overlay, auto-skip config wizard
- Skip config wizard on first boot, sidebar nav + remove tour dead code
- Remove tour guide, cache camera enumeration, external links
- DevUrl 1420 to match vite default port
- Correct import path in autoProfile.js
- Wrap first-boot Configuration with HashRouter to prevent useNavigate crash
- PlayUrl missing destructure crash + WASM SIMD fallback + init spam

### Dokumentasi
- Finalize Fase C3 staged plan
- Route-level lazy loading + Prism language trimming
- Multi-run MarkBench orchestrator + release automation
- Modular channel registry + agent-oriented architecture
- Bun toolchain hardening, benchmark smoke gate, MarkBench
- Align AGENTS.md with #17, cache TG status guard, real benchmark scripts
- Restore src-tauri shell and release automation removed without justification
- Tighten branch strategy wording + branch guard
- Merge linux changes and resolve conflicts
- Document master and linux branch governance
- Update RELEASE-AUTOMATION.md with explicit workflow_dispatch chain and safety checks
- Visual parity audit — evidence-accurate
- Visual parity audit — evidence-accurate
- Visual parity audit — Electron vs Tauri/Linux
- Clarify linux-as-baseline — never open PRs against master
- Remove internal files from open-source repo
- Add cargo to , update AGENTS.md branch strategy, bump-version for Tauri
- Reconcile parity matrix
- Add parity audit matrix + validation report for Electron→Tauri port
- Linux branch coverage, upstream sync, dependabot, policy
- Add ROADMAP.md, refine .gitignore for mark-linux open-source
- Filter , tests, scripts, src-tauri, HTML trackers for open-source
- Replace auto-detect with first-boot resource mode chooser
- Clean up junk files from tracking, config identifier
- Remove migrated tools from ALLOWED_ACTIONS
- Remove migrated tools from ALLOWED_ACTIONS
- Restore tests/harness/ required by :harness workflow
- Update log deteksi model, blok groq, vision retry
- Rapikan struktur root + dokumen cara jalan lokal
- Catat hasil rilis perdana v1.0.0-alpha.1

## v1.0.0-alpha.1 — 26 Agustus 2026

**Ringkasan:** Initial alpha release of MARK Linux. First public release for Tauri-native Linux fork.

_Tidak ada perubahan pengguna yang tercatat._

