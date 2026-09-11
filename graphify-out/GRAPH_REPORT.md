# Graph Report - mark-agent-linux  (2026-09-11)

## Corpus Check
- 380 files · ~617,810 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2972 nodes · 6008 edges · 175 communities (151 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `400fbbc9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bench-contract.test.mjs
- telegram-service.js
- catalog.mjs
- os.rs
- background.js
- react
- cmd_node_bridge.rs
- release-helper.mjs
- tauri-bridge.js
- vitest
- linux-daemon.py
- cmd_misc.rs
- pc-agent.js
- toolDispatcher.js
- MarkHome.jsx
- package.json
- dependencies
- InputBar.jsx
- subagentExecutor.js
- Abelink Cognitive Runtime — Fase 2 Design (A+C: Trajectory Search + Real-Activity Bench)
- oramaStore.js
- trajectory.js
- Configuration.jsx
- approval_policy.rs
- mission_scope.rs
- server.mjs
- mark-update.mjs
- vectorMemory.js
- mark-eval.mjs
- registry.mjs
- mark-adapter.mjs
- scripts
- ai-bridge.js
- getAllConfig
- db.js
- googleTools.mjs
- effort-fixtures.mjs
- cmd_fs.rs
- manifest.json
- watchdog.rs
- BudgetSnapshot
- sttRouter.js
- agentDecision.js
- useMarkPlan.js
- selfModel.js
- bot.rs
- run.mjs
- plugin-loader.js
- tauri.conf.json
- bridge-core.mjs
- smoke.mjs
- effortSystem.js
- run_task
- stress-watermark-v2.harness.mjs
- devDependencies
- Freebuff conversation
- services.mjs
- effortEstimator.test.js
- perf-gate.mjs
- browserTools.mjs
- Mark-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification
- MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure
- terminal-bench.mjs
- git.rs
- MARK Linux: Electron → Tauri Validation Report
- BudgetState
- startTelegramBot
- updateChecker.js
- skills.mjs
- deepeval-runner.mjs
- dev.sh
- taint-gate.mjs
- workspace-rag.js
- File Structure
- stress-watermark.harness.mjs
- Parity Matrix (A-F Status Legend)
- ChatStudio.jsx
- Session Log: Mark-Linux Effort System Integration
- Workflow
- MARK Smart Orchestrator Architecture Design Document
- native-host.mjs
- launcher.mjs
- sync-version.mjs
- PR2 — Long-Horizon Abelink (gaya AVO)
- Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes
- rsi-evaluate.js
- rsi-evaluate.mjs
- wallet.js
- tools_run_shell
- @huggingface/transformers
- auto-detect-upstream.mjs
- build-manifest.mjs
- MARK Smart Orchestrator Architecture Design Document
- Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5)
- planning.js
- Evaluasi Arah Arsitektur Masa Depan (RFC)
- rules
- mark-audit.js
- Mark Linux — Roadmap & Arah Pengembangan
- default.json
- MemoryVisualizer.jsx
- dev-sh.test.bash
- mark-bridge-host.mjs
- popup.js
- bump-version.mjs
- linux-action.sh
- ApprovalContext.jsx
- gemini-web.js
- release-scenarios.test.mjs
- pre-commit
- pre-push
- setup-linux-pc-agent.sh
- verify.sh
- ocr-region.sh
- read-ui.sh
- abelink
- driverTour.js
- Architecture Learnings — dari Anthropic Research ke MARK
- useVAD.js
- Agent Contribution Guidelines (Abelink OS)
- resolveTrustedBroadcastTargets
- create_music_window
- Changelog MARK Linux
- Contributing to Abelink (Linux Edition)
- 14. AUTO Policy Semantics
- Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4)
- Release Automation — MARK Linux
- Session Log: Take-over Effort System + Bench + Smart Orchestrator
- Mark Browser Extension (Fase C3 — Jalur A)
- AI Context & Planning (AGENTS.md)
- Migration Gaps — Electron → Tauri (fase A/B)
- MarkBench — Harness Evaluasi Mark Linux
- Abelink: Autonomous AI OS Companion (Linux Edition)
- semver-lite.mjs
- MARK Linux — Architecture (agent-oriented)
- Fitur Inti
- App.jsx
- Model Capability Matrix 2026 — untuk MarkBench & prompt MARK
- Catatan Keamanan (Vulnerability Triage)
- Security Policy
- PROJECT-STATUS — Mark Agent Linux
- 3. Project Architecture & File Structure
- 2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native)
- 62. AUTO Policy Tests
- Reference Library — ATM (Amati, Tiru, Modifikasi)
- 4. What must be added to MARK for automation
- Architecture Benchmark — `evaluation/bench/`
- turnPairMigrator.js
- MARK Linux — Documentation Index
- 6. Evaluation model
- Assistant
- generateVector
- os.mjs
- useMemoryGroomer.js
- capabilities.md
- Knowledge.jsx
- bench-gate.mjs
- media.mjs
- Session Log — PR2: Long-Horizon Fase A (Offline)
- RelationalGrowth.jsx
- LiteModeContext.jsx
- errorGuard.js
- run-bench-sweep.sh
- builtinPlugins.js
- browserReadFetch
- overrides
- rules/graphify.md
- workflows/graphify.md

## God Nodes (most connected - your core abstractions)
1. `Freebuff conversation` - 131 edges
2. `Mark-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification` - 73 edges
3. `react` - 70 edges
4. `vitest` - 59 edges
5. `useMarkPlan()` - 49 edges
6. `getAllConfig()` - 29 edges
7. `fetchAI()` - 28 edges
8. `scripts` - 26 edges
9. `BudgetSnapshot` - 26 edges
10. `runSubagentTurn()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `T()` --indirect_call--> `S()`  [INFERRED]
  tests/browser-bridge.test.mjs → src/api/selfModel.js
- `check()` --calls--> `BudgetSnapshot`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js
- `runTask()` --calls--> `BudgetState`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js
- `runTask()` --calls--> `EscalationEvent`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js
- `runTask()` --calls--> `resolve_effort()`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js

## Import Cycles
- None detected.

## Communities (175 total, 17 thin omitted)

### Community 0 - "bench-contract.test.mjs"
Cohesion: 0.07
Nodes (79): BOUNDARY_REQUIREMENTS, buildTrajectory(), createStubBoundary(), describeBoundary(), EXECUTION_BOUNDARY_API, isCompleted(), isFailed(), makeFinalStatus() (+71 more)

### Community 1 - "telegram-service.js"
Cohesion: 0.09
Nodes (26): telegraf, ADMIN_IDS_FILE, adminChatIdsSet, agent, askUserWaiters, authorizedAdminIds, broadcastToAdminsSidecar(), CHAT_IDS_FILE (+18 more)

### Community 2 - "catalog.mjs"
Cohesion: 0.08
Nodes (40): browserExtensionConnector, CONNECTORS, fsConnector, getActionGuide(), getConnector(), listConnectors(), registerConnector(), shellToolConnector (+32 more)

### Community 3 - "os.rs"
Cohesion: 0.15
Nodes (40): Command, awareness_clear_buffer(), awareness_get_buffer(), get_active_window_linux(), get_idle_seconds_linux(), AppHandle, Arc, Mutex (+32 more)

### Community 4 - "background.js"
Cohesion: 0.12
Nodes (39): act(), actionFn(), activeGroups, apiGet(), apiPost(), base(), closeActiveGroupTabs(), closeGroupTabs() (+31 more)

### Community 5 - "react"
Cohesion: 0.11
Nodes (20): lucide-react, react, react-markdown, react-syntax-highlighter, rehype-external-links, remark-gfm, saveConfiguration(), TelegramBot (+12 more)

### Community 6 - "cmd_node_bridge.rs"
Cohesion: 0.10
Nodes (36): Child, ChildStdin, PendingRequests, action_family(), approval_reason(), confirm_on_main_thread(), error_message(), frame() (+28 more)

### Community 7 - "release-helper.mjs"
Cohesion: 0.13
Nodes (35): buildChanges(), buildPRBody(), CHANGELOG_PATH, classifyChange(), commitAndPushIfChanged(), CONF_PATH, createReleasePR(), __dirname (+27 more)

### Community 8 - "tauri-bridge.js"
Cohesion: 0.08
Nodes (28): friendlyAiFetchError(), TRANSLATIONS, append(), enabled(), harnessEnabled, logBenchmarkResource(), logBenchmarkResult(), logBenchmarkRun() (+20 more)

### Community 9 - "vitest"
Cohesion: 0.07
Nodes (34): vitest, DEFAULT_PLAN_STEPS, rankNextStrategy(), STRATEGIES, ABANDON_REPEAT, BUDGET_SILENCE_STEPS_LEFT, buildHint(), createTrajectorySupervisor() (+26 more)

### Community 10 - "linux-daemon.py"
Cohesion: 0.12
Nodes (32): capture_screen(), emit(), ensure_target_window_focused(), flush(), get_target_window_title(), get_window_rect(), handle_click(), handle_double_click() (+24 more)

### Community 11 - "cmd_misc.rs"
Cohesion: 0.15
Nodes (33): b64_encode(), copy_dir_recursive(), is_private_host(), misc_ensure_extension_files(), misc_fetch_web_resource(), misc_get_documents_path(), misc_get_lite_mode(), misc_native_confirm() (+25 more)

### Community 12 - "pc-agent.js"
Cohesion: 0.06
Nodes (70): execFilePromise, getGitDiff(), getGitStatus(), gitCommit(), gitRevert(), runGit(), getNativeToolsDefinition(), askUserPC() (+62 more)

### Community 13 - "toolDispatcher.js"
Cohesion: 0.12
Nodes (19): AGENT_CANDIDATES, buildCodingCommand(), detectInstalledAgents(), core_tools, browserExtensionStatusLine(), group_tools(), GROUP_TOOLS_DEFINITION, group_tools_flat (+11 more)

### Community 14 - "MarkHome.jsx"
Cohesion: 0.12
Nodes (14): BrowserPreviewWidget(), DraggableHoloCard(), FloatingMenu(), formatHistoryContent(), HistoryDrawer(), JarvisOrb(), CubeVisualizer(), ProcessPanel() (+6 more)

### Community 15 - "package.json"
Cohesion: 0.07
Nodes (28): author, description, homepage, name, type, version, daisyui, dexie (+20 more)

### Community 16 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, axios, dexie, dexie-export-import, driver.js, duck-duck-scrape, @fontsource/poppins, googleapis (+24 more)

### Community 17 - "InputBar.jsx"
Cohesion: 0.15
Nodes (19): react-dom, getCachedSkills(), invalidateSkillsCache(), wireInvalidation(), ConfirmModal(), DropAnywhere(), formatFileSize(), getFileIcon() (+11 more)

### Community 18 - "subagentExecutor.js"
Cohesion: 0.11
Nodes (29): currentBenchArch(), aggregateCriteria(), buildReplanObservation(), classifyObjectiveKind(), deriveSuccessCriteria(), evaluateEvidence(), findLastIdx(), gateCompletion() (+21 more)

### Community 19 - "Abelink Cognitive Runtime — Fase 2 Design (A+C: Trajectory Search + Real-Activity Bench)"
Cohesion: 0.11
Nodes (18): 10. Harness & rollout, 11. Rejected alternatives, 1. Problem & goal, 2. Constraints (locked from brainstorm), 3. Architecture, 4. Trajectory search memory (`trajLineage.js`), 5. Scoring function (`scoring.js`), 6. Strategy library (`strategyLib.js`) (+10 more)

### Community 20 - "oramaStore.js"
Cohesion: 0.16
Nodes (18): ARCHIVE_SCHEMA, deleteArchiveFromOrama(), deleteMemoryFromOrama(), deleteTurnPairsBySessionFromOrama(), DOCUMENT_SCHEMA, ensureArchiveIndex(), ensureIndices(), ensureMemoryIndex() (+10 more)

### Community 21 - "trajectory.js"
Cohesion: 0.17
Nodes (27): _buffer, clearTrajectoryBuffer(), getTrajectoryBuffer(), _listeners, loadTrajectoryBuffer(), logReasoning(), logStep(), logSubAgentSpawn() (+19 more)

### Community 22 - "Configuration.jsx"
Cohesion: 0.08
Nodes (16): react-router-dom, Configuration, ConfigSidebar(), isItDomain(), IT_KEYWORDS, sections, sectionsLogged, DataControlsSection() (+8 more)

### Community 23 - "approval_policy.rs"
Cohesion: 0.13
Nodes (24): approval_policy_get(), approval_policy_grant_session(), approval_policy_reset_session(), approval_policy_set(), default_policy(), effective_policy(), grant_session(), load_state() (+16 more)

### Community 24 - "mission_scope.rs"
Cohesion: 0.17
Nodes (28): canonicalize_for_check(), check_canonical(), check_path(), check_tool(), clear_restores_open(), clear_scope(), dir_prefix_and_symlink_escape(), empty_tools_deny_all() (+20 more)

### Community 25 - "server.mjs"
Cohesion: 0.16
Nodes (22): ensureBridge(), finishSessionTask(), run(), shutdownBrowserChannels(), sleep(), BROWSER_BRIDGE, getSession(), getSessionGroups() (+14 more)

### Community 26 - "mark-update.mjs"
Cohesion: 0.12
Nodes (27): banner(), bumpVersion(), DO_CHANGELOG, DO_LIST, DO_REBASE, DO_TAG, DO_WHATS_NEW, execLinear() (+19 more)

### Community 27 - "vectorMemory.js"
Cohesion: 0.15
Nodes (23): loadVectorPolicy(), rowModelCompatible(), searchArchives(), searchDocuments(), searchMemoriesInOrama(), searchTurnPairsInOrama(), cosineSimilarity(), emitLiteAuto() (+15 more)

### Community 28 - "mark-eval.mjs"
Cohesion: 0.21
Nodes (25): aggregateMarkEval(), countToolCalls(), ERROR_OBSERVATION_RE, evalEfficiency(), evalHumanInterventionRate(), evalMemory(), evalObjectiveCompletion(), evalPlanning() (+17 more)

### Community 29 - "registry.mjs"
Cohesion: 0.14
Nodes (19): ytmusic-api, getAi, getNt, getManager, lazyManager(), getYtm, getTg, latestConfig (+11 more)

### Community 30 - "mark-adapter.mjs"
Cohesion: 0.11
Nodes (26): AGENT_ARCH_VERSION, AGENT_ARCH_VERSION_sync, BENCH_SCHEMA_VERSION, BENCH_SCHEMA_VERSION_sync, createSidecar(), __dirname, EFFORT_VALUES, EFFORT_VALUES_sync (+18 more)

### Community 31 - "scripts"
Cohesion: 0.08
Nodes (26): scripts, app, bench:quick, bench:save, benchmark:adapter, benchmark:deepeval, benchmark:echo, benchmark:run (+18 more)

### Community 32 - "ai-bridge.js"
Cohesion: 0.23
Nodes (12): jsonrepair, activeAbortControllers, cleanAndParse(), createLMStudioOfflineError(), fetchAI(), globalConfig, isLMStudioOfflineError(), listCustomModels() (+4 more)

### Community 33 - "getAllConfig"
Cohesion: 0.12
Nodes (22): getBestMusicMatch(), getYoutubeSummary(), normMusic(), QUERY_NOISE, queryTokens(), trustworthyTopHit(), VERSION_KEYWORDS, cleanTtsText() (+14 more)

### Community 34 - "db.js"
Cohesion: 0.15
Nodes (10): DEFAULT_TRAITS, getAppConfig(), getSession(), setAppConfig(), VALID_TYPES, applyProfile(), detectHardwareProfile(), getActiveProfile() (+2 more)

### Community 35 - "googleTools.mjs"
Cohesion: 0.14
Nodes (28): RFC-2822, googleapis, open, createEvent(), deleteEvent(), getCalendarApi(), listEvents(), copyFile() (+20 more)

### Community 36 - "effort-fixtures.mjs"
Cohesion: 0.19
Nodes (20): baseResult(), BudgetExhausted, check(), finish(), LEVEL_BY_VALUE, parseLevel(), readAttemptCount(), runTask() (+12 more)

### Community 37 - "cmd_fs.rs"
Cohesion: 0.20
Nodes (27): Into, ensure_workspace(), err(), fs_delete_file(), fs_detect_legacy_profiles(), fs_grep_search(), fs_import_pick_and_read(), fs_list_dir() (+19 more)

### Community 38 - "manifest.json"
Cohesion: 0.09
Nodes (21): action, default_icon, default_popup, default_title, background, service_worker, 16, 32 (+13 more)

### Community 39 - "watchdog.rs"
Cohesion: 0.18
Nodes (15): Instant, Breach, destructive_cap_fires_once_then_latches(), hard_rate_wins_and_self_heals(), normal_use_never_trips(), record_action(), FnOnce, Option (+7 more)

### Community 41 - "sttRouter.js"
Cohesion: 0.19
Nodes (14): dexie-export-import, openai, pcmToWav(), transcribeAudioGroq(), initWorker(), loadWhisper(), requestResolvers, transcribeAudioLocal() (+6 more)

### Community 42 - "agentDecision.js"
Cohesion: 0.22
Nodes (17): classifyMainDecision(), classifySubagentAnswer(), explicitState(), hasActionShape(), INTENT, isBlockedText(), isExplicitSelfTerminate(), isQuestionText() (+9 more)

### Community 43 - "useMarkPlan.js"
Cohesion: 0.12
Nodes (35): createSelfRepairMission(), getErrorSignature(), isRepairAllowed(), MAX_REPAIR_ATTEMPTS, recordRepairAttempt(), REPAIR_COOLDOWN_MS, repairHistory, db (+27 more)

### Community 44 - "selfModel.js"
Cohesion: 0.15
Nodes (14): describeLevel(), getTraitContext(), APP_IDENTITY, getSelfIdentityBlock(), BROWSER_ENV, DESIGN, ERROR_HANDLING, getSelfModelBlock() (+6 more)

### Community 45 - "bot.rs"
Cohesion: 0.30
Nodes (18): call_api(), Arc, Mutex, Option, Result, Self, State, String (+10 more)

### Community 46 - "run.mjs"
Cohesion: 0.26
Nodes (15): normalizeEffort(), aggregateRuns(), avg(), buildReportShell(), compareReports(), detectCheat(), main(), parseArgs() (+7 more)

### Community 47 - "plugin-loader.js"
Cohesion: 0.20
Nodes (15): execFilePromise, getPluginsDir(), isValidNpmDependency(), loadedPlugins, loadPlugins(), openInFileManager(), pluginCreate(), pluginDelete() (+7 more)

### Community 48 - "tauri.conf.json"
Cohesion: 0.11
Nodes (18): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+10 more)

### Community 49 - "bridge-core.mjs"
Cohesion: 0.13
Nodes (33): browserConfig, deriveGroupName(), dispatchCommand(), dropSession(), ensureSession(), getBrowserConfig(), GROUP_COLORS, handshake() (+25 more)

### Community 50 - "smoke.mjs"
Cohesion: 0.10
Nodes (18): BENCHMARK_MATRIX, CORE_SET, summarizeMatrix(), agg, aggNull, cur, gitTmp, matrixIds (+10 more)

### Community 51 - "effortSystem.js"
Cohesion: 0.15
Nodes (10): AGENT_ARCH_VERSION, BENCH_SCHEMA_VERSION, CANONICAL, EFFORT_VALUES, EscalationEvent, ModelProviderAdapter, resolve_auto(), ResolvedEffort (+2 more)

### Community 52 - "run_task"
Cohesion: 0.32
Nodes (16): kill_task(), list_tasks(), read_task_output(), AppHandle, Arc, HashMap, Mutex, Option (+8 more)

### Community 53 - "stress-watermark-v2.harness.mjs"
Cohesion: 0.15
Nodes (14): attacker, bigSkill, bodyHash(), buildCanonical(), coreSkill, createSkill(), genuineSkill, keyring (+6 more)

### Community 54 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, daisyui, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, fake-indexeddb, prettier (+8 more)

### Community 55 - "Freebuff conversation"
Cohesion: 0.02
Nodes (127): 10. Risks to avoid, 11. Summary, 1. Perbandingan Arsitektur: Bagaimana "Model Kecil" Menjadi Cerdas, 1. Principles worth adopting from your brief, 1. What “full automation” actually requires, 2. Desain Arsitektur "Smart Orchestrator" untuk Model Lokal, 2. Mapping to MARK’s current architecture, 2. Reference architecture (+119 more)

### Community 56 - "services.mjs"
Cohesion: 0.18
Nodes (10): getGsvc, getPl, getTracker, getWs, activeWindow(), buffer, getSystemIdleSeconds(), pushToBuffer() (+2 more)

### Community 57 - "effortEstimator.test.js"
Cohesion: 0.24
Nodes (14): EFFORT_LEVELS, EFFORT_VALUES, estimateEffort(), resolveEffortLevel(), SIGNALS, SYSTEM_DEFAULT_EFFORT, SYSTEM_DEFAULT_EFFORT_sync, AUTO_MAX (+6 more)

### Community 58 - "perf-gate.mjs"
Cohesion: 0.17
Nodes (7): BASELINE_PATH, median(), results, ROOT, runWorkload(), saveMode, WORKLOADS

### Community 59 - "browserTools.mjs"
Cohesion: 0.20
Nodes (18): closeBrowser(), downloadFile(), executeAction(), executeScript(), extractData(), getOrCreateBrowser(), getSession(), navigateTo() (+10 more)

### Community 60 - "Mark-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification"
Cohesion: 0.03
Nodes (71): 10. HIGH Policy, 11. xHIGH Policy, 12. MAX Policy, 13. ULTRA Policy, 15. Capability Matrix, 16. Numeric Score Bounds, 17. Runtime Hard Bounds, 18. Execution-Step Budgets (+63 more)

### Community 61 - "MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure"
Cohesion: 0.05
Nodes (36): Appendix: Reconciled Parity Items (from previous audit contradictions), Appendix: Workflow Coverage Matrix, Classification of Previous Audit Claims, Critical Gaps, Future Improvements (P2+), MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure, Must Document (P1), Must Fix Before Linux Release (P1) (+28 more)

### Community 62 - "terminal-bench.mjs"
Cohesion: 0.19
Nodes (12): CORP_TASKS, corpReportTextOnly(), hasGitCommitWithMessage(), hasToolEvidence(), isErrorResult(), isSuccessCall(), readArtifact(), VERIFY_WORLD (+4 more)

### Community 63 - "git.rs"
Cohesion: 0.47
Nodes (12): git(), git_commit(), git_diff(), git_revert(), git_status(), GitResult, resolve_cwd(), AppHandle (+4 more)

### Community 64 - "MARK Linux: Electron → Tauri Validation Report"
Cohesion: 0.08
Nodes (24): 1. Window Transparency — **Platform Limitation** (Distinguish native vs blur), 2. Camera / Microphone — **PARTIAL** (not "not ported"), 3. Save File Dialog — **NEW FEATURE / NOT PARITY GAP** (reclassified from P0), 4. Auto-launch at Login — **INTENTIONAL LINUX DIFFERENCE** (not "missing"), 5. Fullscreen Toggle — **FULLY IMPLEMENTED** (not "UI wiring missing"), 6. Vibrancy/Blur Effects — **Platform Limitation**, 7. Window Opacity via CSS Var — **KNOWN TAURI v1 API GAP** (reclassified from migration issue), Auto-launch (Linux): (+16 more)

### Community 66 - "startTelegramBot"
Cohesion: 0.19
Nodes (12): abortAllFetches(), ensureTrustedAdmin(), getConnectionStatus(), resolveAskUser(), resolveContainedSavePath(), sanitizeFileName(), saveChatIdsToFile(), sendAgentExecutionDone() (+4 more)

### Community 67 - "updateChecker.js"
Cohesion: 0.30
Nodes (9): checkForUpdate(), fetchReleases(), getCache(), getChannel(), initUpdateChecker(), isNewer(), maybeNotify(), selectChannelRelease() (+1 more)

### Community 69 - "deepeval-runner.mjs"
Cohesion: 0.50
Nodes (3): NOTE: metrics require a DeepEval model/API key at runtime; without one this, runAllWithDeepEval(), runWithDeepEval()

### Community 70 - "dev.sh"
Cohesion: 0.58
Nodes (10): die(), ensure_bun(), ensure_deps(), ensure_sidecar(), free_cargo_lock(), free_dev_port(), log(), ok() (+2 more)

### Community 71 - "taint-gate.mjs"
Cohesion: 0.33
Nodes (9): checkTaintGate(), isStateChangingTool(), isTaintingTool(), isTurnTainted(), markTurnTainted(), resetTurnTaint(), setTurnId(), STATE_CHANGING_TOOLS (+1 more)

### Community 72 - "workspace-rag.js"
Cohesion: 0.27
Nodes (12): chunkFileContent(), CODE_EXTENSIONS, ensureMarkWorkspace(), getFileHash(), getWorkspaceDir(), IGNORE_DIRS, indexWorkspace(), scanDir() (+4 more)

### Community 73 - "File Structure"
Cohesion: 0.15
Nodes (12): Abelink Cognitive Runtime Fase 2 Implementation Plan, File Structure, Global Constraints, Self-Review, Task 1: `scoring.js` + pins, Task 2: `trajLineage.js` + pins, Task 3: `strategyLib.js` + pins, Task 4: Supervisor Fase 1→2 (additive extend) + pins (+4 more)

### Community 74 - "stress-watermark.harness.mjs"
Cohesion: 0.18
Nodes (5): attackerKeys, GENUINE, genuineSig, { privateKey, publicKey }, NOTE: Node 24+ — use modern sign/verify API (createSign deprecated for Ed25519)

### Community 75 - "Parity Matrix (A-F Status Legend)"
Cohesion: 0.11
Nodes (18): Changes Implemented (from audit), Confirmed Classification Summary (Canonical), Future Improvements (Optional), Known Platform Limitations, MARK Linux: Electron → Tauri Parity Audit, Must Document, Must Fix Before Linux Release, Parity Matrix (A-F Status Legend) (+10 more)

### Community 76 - "ChatStudio.jsx"
Cohesion: 0.25
Nodes (15): @monaco-editor/react, createSession(), deleteSession(), getAllSessions(), getChatData(), renameSession(), saveSession(), setSessionWorkspace() (+7 more)

### Community 77 - "Session Log: Mark-Linux Effort System Integration"
Cohesion: 0.13
Nodes (14): File yang Diubah, Finalisasi, Hasil, Keputusan Arsitektural, Keterbatasan / Tidak Diselesaikan di Sesi Ini, Laporan Mesin (§72), Notes Tambahan, Penutup (+6 more)

### Community 79 - "MARK Smart Orchestrator Architecture Design Document"
Cohesion: 0.13
Nodes (14): 10. Observability and Benchmarking, 11. Mapping to MARK, 12. Suggested Implementation Order, 13. Success Criteria, 1. Purpose, 2. Design Principles, 3. High-Level Architecture, 4. ReAct Loop Design (+6 more)

### Community 80 - "native-host.mjs"
Cohesion: 0.21
Nodes (7): ensureNativeHost(), EXTENSION_ID, MANIFEST_BODY(), NATIVE_HOST_NAME, NATIVE_HOST_VERSION, HOST, ROOT

### Community 81 - "launcher.mjs"
Cohesion: 0.29
Nodes (6): ensureBrowserUp(), LAUNCH_POLL_MS, LAUNCH_WAIT_MS, openInOsBrowser(), runOs(), waitForConnected()

### Community 82 - "sync-version.mjs"
Cohesion: 0.22
Nodes (8): cargoRaw, checkOnly, conf, drift, pkg, pkgRaw, pkgSection, verLine

### Community 83 - "PR2 — Long-Horizon Abelink (gaya AVO)"
Cohesion: 0.20
Nodes (9): Fase A — Fondasi offline (agent, tanpa LLM), Fase B — Pengukuran (USER menjalankan, agent tidak bisa), Fase C — Tuning dari data (agent), Fase D — Non-goal PR2, Jejak keputusan, Konteks (baca dulu), Kriteria terima, PR2 — Long-Horizon Abelink (gaya AVO) (+1 more)

### Community 84 - "Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes"
Cohesion: 0.22
Nodes (8): Agent Learnings, Callback, File Invariants, Files Modified, Ringkasan, Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes, Temuan dan Fix, Verification Checklist

### Community 85 - "rsi-evaluate.js"
Cohesion: 0.29
Nodes (6): analyze(), AUDIT, now, pctl(), rows, WINDOW_DAYS

### Community 86 - "rsi-evaluate.mjs"
Cohesion: 0.29
Nodes (6): analyze(), AUDIT, now, pctl(), rows, WINDOW_DAYS

### Community 87 - "wallet.js"
Cohesion: 0.21
Nodes (18): BUDGET_POLICIES, checkModelBudget(), DEFAULT_POLICY, estimateCost(), getModelBudgetStatus(), setAllocationWithPricing(), addLedgerEntry(), getBalance() (+10 more)

### Community 88 - "tools_run_shell"
Cohesion: 0.43
Nodes (7): is_dangerous(), AppHandle, Option, Result, String, ToolResult, tools_run_shell()

### Community 89 - "@huggingface/transformers"
Cohesion: 0.25
Nodes (3): @huggingface/transformers, simdSupported, WHISPER_MODELS

### Community 90 - "auto-detect-upstream.mjs"
Cohesion: 0.62
Nodes (6): classifyCommit(), classifyFile(), getDiffFiles(), getNewCommits(), main(), run()

### Community 91 - "build-manifest.mjs"
Cohesion: 0.29
Nodes (4): manifest, manifestPath, root, skillsDir

### Community 92 - "MARK Smart Orchestrator Architecture Design Document"
Cohesion: 0.14
Nodes (14): 10. Observability and Benchmarking, 11. Mapping to MARK, 12. Suggested Implementation Order, 13. Success Criteria, 1. Purpose, 2. Design Principles, 3. High-Level Architecture, 4. ReAct Loop Design (+6 more)

### Community 93 - "Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5)"
Cohesion: 0.22
Nodes (8): Agent Learnings, Callback, File Invariants, Files Modified, Ringkasan, Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5), Temuan dan Fix, Verification Checklist

### Community 94 - "planning.js"
Cohesion: 0.10
Nodes (32): formatAwarenessContent(), getAwarenessResponse(), buildOptimizedChatSession(), compactCodeBlocks(), IMAGE_PLACEHOLDER, stripDataUrls(), stripImageContent(), cleanAndParse() (+24 more)

### Community 95 - "Evaluasi Arah Arsitektur Masa Depan (RFC)"
Cohesion: 0.15
Nodes (13): 1. Opsi A: Tetap Arsitektur Hybrid (Status Quo Dioptimalkan), 3. Opsi C: Migrasi Menjadi Web Murni (Pure Web / PWA), 4. Matriks Perbandingan, 5. Rekomendasi Strategis (The Pragmatic Hybrid Evolution), Analisis Jangka Panjang (Long-Term ROI), Deskripsi Teknis, Deskripsi Teknis, Evaluasi Arah Arsitektur Masa Depan (RFC) (+5 more)

### Community 96 - "rules"
Cohesion: 0.33
Nodes (5): extends, rules, subject-case, type-enum, @commitlint/config-conventional

### Community 97 - "mark-audit.js"
Cohesion: 0.33
Nodes (4): { execSync }, fs, path, proc

### Community 98 - "Mark Linux — Roadmap & Arah Pengembangan"
Cohesion: 0.15
Nodes (12): 1. Packaging & Distribusi, 2. Capability & Connector Ecosystem (general-pluggable), 3. Configuration UX, 4. Documentation & Onboarding, 5. What's New Otomatis, Arsitektur, Fase Berikutnya: v1.x Roadmap, Fase Saat Ini: Stabilisasi (v1.0.0-alpha.x) (+4 more)

### Community 99 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 100 - "MemoryVisualizer.jsx"
Cohesion: 0.18
Nodes (15): react-force-graph-2d, deleteChatArchive(), getAllChatArchives(), getAllMemory(), getRelevantMemory(), ForceGraph2D, GRAPH_ROOTS, LiteGraphView() (+7 more)

### Community 101 - "dev-sh.test.bash"
Cohesion: 0.73
Nodes (5): dev-sh.test.bash script, create_fake_cargo_process(), test_cargo_in_src_tauri_is_killed(), test_cargo_inside_project_is_killed(), test_cargo_outside_project_not_killed()

### Community 102 - "mark-bridge-host.mjs"
Cohesion: 0.60
Nodes (4): buf, handle(), tokenFile(), writeMsg()

### Community 103 - "popup.js"
Cohesion: 0.80
Nodes (4): autoConnect(), refresh(), refreshTask(), setPill()

### Community 104 - "bump-version.mjs"
Cohesion: 0.39
Nodes (7): detectBumpType(), getCurrentVersion(), git(), main(), REPO, semverBump(), updateTauriConf()

### Community 105 - "linux-action.sh"
Cohesion: 0.70
Nodes (4): err(), get_flag(), pos(), linux-action.sh script

### Community 106 - "ApprovalContext.jsx"
Cohesion: 0.33
Nodes (9): addAlwaysAllowedPath(), getAlwaysAllowedPaths(), ApprovalContext, ApprovalProvider(), familyOfTool(), getFolderFromPath(), getPathFromQuery(), loadAlwaysTools() (+1 more)

### Community 107 - "gemini-web.js"
Cohesion: 0.39
Nodes (7): findRc(), GEMINI_WEB_MODELS, __geminiWebTest, generateGeminiResponse(), httpPost(), isSorryPage(), sorryError()

### Community 122 - "driverTour.js"
Cohesion: 0.36
Nodes (6): driver.js, filterExistingSteps(), isElementVisible(), startDriverTour(), hiddenEl, visibleEl

### Community 123 - "Architecture Learnings — dari Anthropic Research ke MARK"
Cohesion: 0.17
Nodes (11): 1. Patterns and Problems in Emerging Multiagent Systems (Frontier Red Team, 13 Agu 2026), 1a. Low variance / conformity failure, 1b. Epistemic failures (trust calibration), 1c. Coordination via shared forum, 1d. Incompatible goals → turf war, 2. Teaching Claude Why (Alignment, 8 Mei 2026), 3. How Claude Code is Used in Practice (Economics, 16 Jun 2026), 4. A global workspace in language models (Interpretability, 6 Jul 2026) (+3 more)

### Community 124 - "useVAD.js"
Cohesion: 0.44
Nodes (7): micCoolingDown(), noteMicFailure(), resetMicFailure(), resolveMicConstraints(), SpotlightBar(), resampleTo16k(), useVAD()

### Community 125 - "Agent Contribution Guidelines (Abelink OS)"
Cohesion: 0.20
Nodes (10): 1. Prinsip Fundamental (Epistemic Grounding), 2. Batas Arsitektur (Architectural Boundaries), 3. Aturan Manifest & Single Source of Truth, 4. Kebijakan Repositori Privat & Aset, 5. Gerbang Verifikasi (Verification Gates), 6. Standar Pesan Commit (Conventional Commits), A. Frontend Layer (`src/`), Agent Contribution Guidelines (Abelink OS) (+2 more)

### Community 126 - "resolveTrustedBroadcastTargets"
Cohesion: 0.33
Nodes (7): getGlobalConfig(), escapeHtml(), loadLatestResult(), resolveTrustedBroadcastTargets(), sendInlineKeyboard(), sendProgress(), sendReport()

### Community 127 - "create_music_window"
Cohesion: 0.48
Nodes (11): anchor_window_bottom_right(), create_music_window(), music_player_command(), music_player_hide(), music_player_play_url(), music_player_show(), music_player_toggle(), AppHandle (+3 more)

### Community 128 - "Changelog MARK Linux"
Cohesion: 0.22
Nodes (8): Changelog MARK Linux, Dokumentasi, Fitur Baru, Perbaikan, Perbaikan, v1.0.0-alpha.1 — 26 Agustus 2026, v1.0.0-alpha.2 — 4 September 2026, v1.0.0-alpha.3 — 4 September 2026

### Community 129 - "Contributing to Abelink (Linux Edition)"
Cohesion: 0.22
Nodes (9): Alternatif: `bun run dev:smart` (bootstrap otomatis), Architecture Rules, Branch Convention, Code Style, Contributing to Abelink (Linux Edition), Kebijakan Repositori Privat, Linux-Specific Notes, PR Workflow (+1 more)

### Community 130 - "14. AUTO Policy Semantics"
Cohesion: 0.22
Nodes (9): 14.1 Default Initial Level, 14.2 Classification Inputs, 14.3 Classification Output, 14.4 AUTO Escalation, 14.5 AUTO Downgrade, 14.6 AUTO and Hard Limits, 14.7 AUTO and Explicit User Selection, 14.8 AUTO Resolution Metadata (+1 more)

### Community 131 - "Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4)"
Cohesion: 0.22
Nodes (8): Aturan pengerjaan fase baru, Fase B5 — Dialog & screenshot native (Rust), Fase B6 — Desktop automation (os:*) native Rust, Fase C3 — Browser automation multi-session (browser:*), Fase C4 — Plugin execution sandbox (Web Worker), Lanjutan B5 — Screenshot & Telegram send native — SELESAI (2026-09-03), Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4), Pembersihan dead code era Electron — SELESAI (2026-09-03)

### Community 132 - "Release Automation — MARK Linux"
Cohesion: 0.22
Nodes (8): Idempotency Guarantees, Manual Promotion (Emergency/Hotfix), Normal Release Path, Release Automation — MARK Linux, Release PR Preparation, Tag → Release Workflow Chain, Toolchain Notes (Rust + Bun), Workflow Permissions

### Community 133 - "Session Log: Take-over Effort System + Bench + Smart Orchestrator"
Cohesion: 0.22
Nodes (8): File yang Diubah (sesi ini saja), Hasil, Keputusan Arsitektural, Keterbatasan, Laporan Mesin (§72), Ringkasan, Session Log: Take-over Effort System + Bench + Smart Orchestrator, Status Penutupan Sesi

### Community 134 - "Mark Browser Extension (Fase C3 — Jalur A)"
Cohesion: 0.20
Nodes (9): Arsitektur, Auto-launch browser via OS (aktif default), Cara pakai (dev), E2E manual (checklist, ±10 menit), Keterbatasan saat ini (jujur), Mark Browser Extension (Fase C3 — Jalur A), Model keamanan, Perilaku grup tab + penutupan (+1 more)

### Community 135 - "AI Context & Planning (AGENTS.md)"
Cohesion: 0.25
Nodes (8): 1. Project Overview, 2. Technology Stack & Core Dependencies, 4. Key Implementation Invariants & Gotchas, 5. Development Guidelines for AI Agents, AI Context & Planning (AGENTS.md), Critical Constants & Thresholds (verified against current files), Multi-Agent Sub-Agent Architecture, Objective Completion & Verification Layer (agentDecision.js + objectiveVerifier.js)

### Community 136 - "Migration Gaps — Electron → Tauri (fase A/B)"
Cohesion: 0.25
Nodes (7): Dead code era Electron — SUDAH DIBUANG (2026-09-03), Diperbaiki di PR ini (dipulihkan dari modul era Electron), Jalur Telegram native yang pernah mati — DIPULIHKAN (2026-09-03), Metode audit (untuk reproduce), Migration Gaps — Electron → Tauri (fase A/B), Sengaja ditunda (stub eksplisit, jangan dianggap bug), Verdict merge-readiness PR #16

### Community 137 - "MarkBench — Harness Evaluasi Mark Linux"
Cohesion: 0.25
Nodes (7): Komponen, MarkBench — Harness Evaluasi Mark Linux, Menjalankan, Orchestrator (`benchmark:run`), Prinsip (anti-fabrikasi), Roadmap, Task suite

### Community 138 - "Abelink: Autonomous AI OS Companion (Linux Edition)"
Cohesion: 0.25
Nodes (8): Abelink: Autonomous AI OS Companion (Linux Edition), Arsitektur Sistem, Kebutuhan Sistem (Linux Mint / Ubuntu / Debian / Arch), Lisensi & Atribusi, Perintah Pengembangan, Prasyarat & Instalasi, Setup Cepat, Standar Kontribusi & Kebijakan Repositori

### Community 139 - "semver-lite.mjs"
Cohesion: 0.56
Nodes (7): compare(), compareIdentifiers(), eq(), gt(), lt(), parse(), valid()

### Community 140 - "MARK Linux — Architecture (agent-oriented)"
Cohesion: 0.29
Nodes (6): 1. Peta Runtime (tiga dunia), 2. Sidecar Channel Registry (sidecar/engine/), 3. Pola Arsitektur yang Diadopsi (dari pola Agent Skills / plugin Claude), 4. Alur Data Kritis, 5. Batasan yang Masih Sengaja Dibiarkan (jangan "perbaiki" diam-diam), MARK Linux — Architecture (agent-oriented)

### Community 141 - "Fitur Inti"
Cohesion: 0.29
Nodes (7): 1. Multi-Provider Hybrid AI Routing, 2. Autonomous Multi-Agent (Mission Control), 3. Durable Agent Tasks, 4. Epistemic Grounding & Hybrid Memory System, 5. Desktop Awareness & OS Automation, 6. Voice & Audio Pipeline, Fitur Inti

### Community 142 - "App.jsx"
Cohesion: 0.09
Nodes (17): ChatStudio, Guidebook, Subagents, Trajectory, CameraPreview(), AutomationHUD(), GlobalCameraManager(), WhatNew() (+9 more)

### Community 143 - "Model Capability Matrix 2026 — untuk MarkBench & prompt MARK"
Cohesion: 0.33
Nodes (5): 1. Peta model per kategori (yang relevan untuk MARK), 2. Pola lintas vendor yang bisa langsung diterapkan ke MARK, 3. Pemetaan ke MarkBench (matrix existing diperbarui), 4. Rekomendasi model default MARK (per use case), Model Capability Matrix 2026 — untuk MarkBench & prompt MARK

### Community 144 - "Catatan Keamanan (Vulnerability Triage)"
Cohesion: 0.33
Nodes (5): Catatan Keamanan (Vulnerability Triage), Diperbaiki (commit ini), Diterima (risk-accepted) — `minimatch@3.0.8` via `yt-search`, Diterima (risk-accepted) — `sharp@0.34.5` via `@huggingface/transformers`, Proses

### Community 145 - "Security Policy"
Cohesion: 0.33
Nodes (5): Reporting a vulnerability, Security Policy, Supported versions, Threat model, What we protect

### Community 146 - "PROJECT-STATUS — Mark Agent Linux"
Cohesion: 0.33
Nodes (5): Keputusan terakhir, Kesehatan terakhir (terverifikasi 2026-09-07), Langkah berikut, Milestone saat ini, PROJECT-STATUS — Mark Agent Linux

### Community 148 - "3. Project Architecture & File Structure"
Cohesion: 0.40
Nodes (5): 3. Project Architecture & File Structure, Build, Verify & CI, `sidecar/`: Node Engine (fase A/B), `src/`: React 19 Renderer (UI + Core Logic), `src-tauri/`: Rust Shell (Tauri v2)

### Community 149 - "2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native)"
Cohesion: 0.40
Nodes (5): 2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native), Analisis Jangka Panjang (Long-Term ROI), Deskripsi Teknis, Kekurangan (Cons), Kelebihan (Pros)

### Community 150 - "62. AUTO Policy Tests"
Cohesion: 0.40
Nodes (5): 62. AUTO Policy Tests, AUTO can escalate, AUTO is not a fixed policy, AUTO respects hard limits, Explicit level bypasses AUTO

### Community 151 - "Reference Library — ATM (Amati, Tiru, Modifikasi)"
Cohesion: 0.40
Nodes (4): Aturan pakai (load when needed), Kaitan, Peta referensi, Reference Library — ATM (Amati, Tiru, Modifikasi)

### Community 152 - "4. What must be added to MARK for automation"
Cohesion: 0.50
Nodes (4): 4.1 Run control interface, 4.2 Structured trajectory output, 4.3 Run isolation, 4. What must be added to MARK for automation

### Community 153 - "Architecture Benchmark — `evaluation/bench/`"
Cohesion: 0.50
Nodes (3): Architecture Benchmark — `evaluation/bench/`, File, Menjalankan

### Community 154 - "turnPairMigrator.js"
Cohesion: 0.35
Nodes (10): sanitizeTurnForStorage(), saveBatchChatTurns(), saveChatTurn(), insertBatchTurnPairsToOrama(), insertTurnPairToOrama(), cleanMessageContent(), extractTurnPairsFromSession(), indexSingleTurn() (+2 more)

### Community 156 - "6. Evaluation model"
Cohesion: 0.67
Nodes (3): 6.1 Verifier-based, 6.2 Rubric-based, 6. Evaluation model

### Community 157 - "Assistant"
Cohesion: 0.67
Nodes (3): Assistant, Prompt benchmark yang saya sarankan, Trajectory: dimana dan apa yang harus ada

### Community 158 - "generateVector"
Cohesion: 0.24
Nodes (9): summarizeAndArchive(), insertChatArchive(), insertArchiveToOrama(), searchDocumentWithOrama(), generateVector(), getExtractor(), cosineSimilarity(), generateVector() (+1 more)

### Community 159 - "os.mjs"
Cohesion: 0.67
Nodes (3): COLON_TO_DASH, getTools(), runDash()

### Community 160 - "useMemoryGroomer.js"
Cohesion: 0.22
Nodes (14): buildGroomerPrompt(), groomerSchema, parseGroomerResponse(), runBatchConsolidation(), deleteMemory(), getMemory(), getValidType(), insertMemory() (+6 more)

### Community 162 - "Knowledge.jsx"
Cohesion: 0.39
Nodes (10): bulkInsertDocuments(), deleteDocumentByName(), getAllDocuments(), deleteDocumentFromOrama(), ensureDocumentIndex(), insertDocumentChunksToOrama(), ingestDocument(), splitTextIntoChunks() (+2 more)

### Community 163 - "bench-gate.mjs"
Cohesion: 0.22
Nodes (8): agg, cheatDetected, cheatTask, compareArgIdx, failedDims, latRuns, saveMode, tested

### Community 164 - "media.mjs"
Cohesion: 0.25
Nodes (4): youtube-transcript-plus, yt-search, getYt, getYts

### Community 165 - "Session Log — PR2: Long-Horizon Fase A (Offline)"
Cohesion: 0.29
Nodes (6): Agent Learnings, File Invariants, Files Modified, Ringkasan, Session Log — PR2: Long-Horizon Fase A (Offline), Temuan dan Fix

### Community 166 - "RelationalGrowth.jsx"
Cohesion: 0.36
Nodes (8): getRelationship(), saveRelationship(), RelationalGrowth, describeLevel(), describePersonality(), RelationalGrowth(), TRAIT_META, TraitRing()

### Community 167 - "LiteModeContext.jsx"
Cohesion: 0.43
Nodes (4): LiteBadge(), LiteModeContext, LiteModeProvider(), useLiteMode()

### Community 168 - "errorGuard.js"
Cohesion: 0.40
Nodes (4): errorLog, initErrorGuard(), KNOWN_FIXES, pushLog()

### Community 170 - "builtinPlugins.js"
Cohesion: 0.67
Nodes (4): BUILTIN_PLUGIN_DEFAULTS, getBuiltinPluginsPrompt(), getCavemanReportRules(), resolvePluginToggles()

### Community 171 - "browserReadFetch"
Cohesion: 0.40
Nodes (5): axios, htmlparser2, extractUrl(), browserReadFetch(), webFetch()

### Community 172 - "overrides"
Cohesion: 0.50
Nodes (4): overrides, adm-zip, dompurify, tar

## Knowledge Gaps
- **912 isolated node(s):** `@commitlint/config-conventional`, `type-enum`, `subject-case`, `saveMode`, `compareArgIdx` (+907 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1186 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `bench-contract.test.mjs`, `catalog.mjs`, `tauri-bridge.js`, `semver-lite.mjs`, `pc-agent.js`, `toolDispatcher.js`, `package.json`, `InputBar.jsx`, `subagentExecutor.js`, `oramaStore.js`, `Configuration.jsx`, `server.mjs`, `vectorMemory.js`, `mark-eval.mjs`, `mark-adapter.mjs`, `ai-bridge.js`, `getAllConfig`, `db.js`, `effort-fixtures.mjs`, `sttRouter.js`, `agentDecision.js`, `builtinPlugins.js`, `useMarkPlan.js`, `selfModel.js`, `bridge-core.mjs`, `effortEstimator.test.js`, `startTelegramBot`, `taint-gate.mjs`, `native-host.mjs`, `launcher.mjs`, `wallet.js`, `planning.js`, `bump-version.mjs`, `gemini-web.js`, `release-scenarios.test.mjs`, `driverTour.js`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `useMemoryGroomer.js`, `getAllConfig`, `Knowledge.jsx`, `MemoryVisualizer.jsx`, `RelationalGrowth.jsx`, `LiteModeContext.jsx`, `ApprovalContext.jsx`, `useMarkPlan.js`, `ChatStudio.jsx`, `MarkHome.jsx`, `App.jsx`, `package.json`, `InputBar.jsx`, `subagentExecutor.js`, `trajectory.js`, `Configuration.jsx`, `useVAD.js`, `planning.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useMarkPlan()` (e.g. with `deleteMemory()` and `insertMemory()`) actually correct?**
  _`useMarkPlan()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@commitlint/config-conventional`, `type-enum`, `subject-case` to the rest of the system?**
  _912 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bench-contract.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06767109295199183 - nodes in this community are weakly interconnected._
- **Should `telegram-service.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08505747126436781 - nodes in this community are weakly interconnected._