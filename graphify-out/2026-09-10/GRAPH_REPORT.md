# Graph Report - mark-agent-linux  (2026-09-10)

## Corpus Check
- 316 files · ~584,979 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2694 nodes · 5428 edges · 148 communities (128 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 59 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ba74eb3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bench-contract.test.mjs
- telegram-service.js
- catalog.mjs
- os.rs
- background.js
- TelegramBot.jsx
- cmd_node_bridge.rs
- release-helper.mjs
- tauri-bridge.js
- App.jsx
- linux-daemon.py
- cmd_misc.rs
- pc-agent.js
- useMarkPlan.js
- node-tools.js
- package.json
- dependencies
- InputBar.jsx
- planning.js
- react
- oramaStore.js
- trajectory.js
- Configuration.jsx
- approval_policy.rs
- mission_scope.rs
- runSubagentTurn
- mark-update.mjs
- vectorMemory.js
- mark-eval.mjs
- registry.mjs
- mark-adapter.mjs
- scripts
- App
- useMarkAgent.js
- db.js
- google-service.js
- effort-fixtures.mjs
- cmd_fs.rs
- manifest.json
- watchdog.rs
- BudgetSnapshot
- task-daemon.js
- vitest
- taskStore.js
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
- browser-agent.js
- Mark-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification
- MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure
- git.rs
- MARK Linux: Electron → Tauri Validation Report
- BudgetState
- updateChecker.js
- skills.mjs
- terminal-bench.mjs
- dev.sh
- taint-gate.mjs
- workspace-rag.js
- useAwareness.js
- stress-watermark.harness.mjs
- Parity Matrix (A-F Status Legend)
- SubagentIntercom.jsx
- Session Log: Mark-Linux Effort System Integration
- Workflow
- MARK Smart Orchestrator Architecture Design Document
- sync-version.mjs
- driverTour.js
- rsi-evaluate.js
- rsi-evaluate.mjs
- RelationalGrowth.jsx
- tools_run_shell
- @huggingface/transformers
- auto-detect-upstream.mjs
- build-manifest.mjs
- MARK Smart Orchestrator Architecture Design Document
- git-service.js
- core.js
- Evaluasi Arah Arsitektur Masa Depan (RFC)
- rules
- mark-audit.js
- Mark Linux — Roadmap & Arah Pengembangan
- default.json
- harness_append
- dev-sh.test.bash
- mark-bridge-host.mjs
- popup.js
- browserReadFetch
- linux-action.sh
- syntax-validator.js
- overrides
- pre-commit
- pre-push
- setup-linux-pc-agent.sh
- verify.sh
- ocr-region.sh
- read-ui.sh
- abelink
- Architecture Learnings — dari Anthropic Research ke MARK
- Agent Contribution Guidelines (Abelink OS)
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
- MARK Linux — Architecture (agent-oriented)
- Fitur Inti
- useVAD.js
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
- MARK Linux — Documentation Index
- 6. Evaluation model
- Assistant
- capabilities.md
- media.mjs

## God Nodes (most connected - your core abstractions)
1. `Freebuff conversation` - 131 edges
2. `Mark-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification` - 73 edges
3. `react` - 66 edges
4. `useMarkPlan()` - 46 edges
5. `vitest` - 41 edges
6. `getAllConfig()` - 29 edges
7. `scripts` - 26 edges
8. `fetchAI()` - 26 edges
9. `BudgetSnapshot` - 26 edges
10. `runTask()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `T()` --indirect_call--> `S()`  [INFERRED]
  tests/browser-bridge.test.mjs → src/api/selfModel.js
- `check()` --calls--> `BudgetSnapshot`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js
- `runTask()` --calls--> `BudgetState`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js
- `runTask()` --calls--> `consumeSubtask()`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js
- `runTask()` --calls--> `EscalationEvent`  [EXTRACTED]
  evaluation/effort-fixtures.mjs → src/api/ai/effortSystem.js

## Import Cycles
- None detected.

## Communities (148 total, 13 thin omitted)

### Community 0 - "bench-contract.test.mjs"
Cohesion: 0.07
Nodes (79): BOUNDARY_REQUIREMENTS, buildTrajectory(), createStubBoundary(), describeBoundary(), EXECUTION_BOUNDARY_API, isCompleted(), isFailed(), makeFinalStatus() (+71 more)

### Community 1 - "telegram-service.js"
Cohesion: 0.05
Nodes (58): jsonrepair, telegraf, abortAllFetches(), activeAbortControllers, cleanAndParse(), createLMStudioOfflineError(), fetchAI(), getGlobalConfig() (+50 more)

### Community 2 - "catalog.mjs"
Cohesion: 0.09
Nodes (35): browserExtensionConnector, CONNECTORS, fsConnector, getActionGuide(), getConnector(), listConnectors(), shellToolConnector, timeConnector (+27 more)

### Community 3 - "os.rs"
Cohesion: 0.15
Nodes (40): Command, awareness_clear_buffer(), awareness_get_buffer(), get_active_window_linux(), get_idle_seconds_linux(), AppHandle, Arc, Mutex (+32 more)

### Community 4 - "background.js"
Cohesion: 0.12
Nodes (39): act(), actionFn(), activeGroups, apiGet(), apiPost(), base(), closeActiveGroupTabs(), closeGroupTabs() (+31 more)

### Community 5 - "TelegramBot.jsx"
Cohesion: 0.11
Nodes (16): react-markdown, rehype-external-links, remark-gfm, saveConfiguration(), TelegramBot, CodeBlock, MemoryFooterBubble(), MessageBubble (+8 more)

### Community 6 - "cmd_node_bridge.rs"
Cohesion: 0.11
Nodes (33): Child, ChildStdin, PendingRequests, action_family(), approval_reason(), confirm_on_main_thread(), is_gated_action(), kill_engine() (+25 more)

### Community 7 - "release-helper.mjs"
Cohesion: 0.13
Nodes (35): buildChanges(), buildPRBody(), CHANGELOG_PATH, classifyChange(), commitAndPushIfChanged(), CONF_PATH, createReleasePR(), __dirname (+27 more)

### Community 8 - "tauri-bridge.js"
Cohesion: 0.09
Nodes (26): append(), enabled(), harnessEnabled, logBenchmarkResource(), logBenchmarkResult(), logBenchmarkRun(), logBenchmarkStep(), logBenchmarkTokens() (+18 more)

### Community 9 - "App.jsx"
Cohesion: 0.09
Nodes (20): addAlwaysAllowedPath(), getAlwaysAllowedPaths(), Configuration, Guidebook, Subagents, WindowControls(), WhatNew(), YoutubeMusicPlayer() (+12 more)

### Community 10 - "linux-daemon.py"
Cohesion: 0.12
Nodes (32): capture_screen(), emit(), ensure_target_window_focused(), flush(), get_target_window_title(), get_window_rect(), handle_click(), handle_double_click() (+24 more)

### Community 11 - "cmd_misc.rs"
Cohesion: 0.15
Nodes (33): b64_encode(), copy_dir_recursive(), is_private_host(), misc_ensure_extension_files(), misc_fetch_web_resource(), misc_get_documents_path(), misc_get_lite_mode(), misc_native_confirm() (+25 more)

### Community 12 - "pc-agent.js"
Cohesion: 0.20
Nodes (33): askUserPC(), closePCSession(), commandChain, dispatchDaemonCommand(), executeClick(), executeDoubleClick(), executeKey(), executeScroll() (+25 more)

### Community 13 - "useMarkPlan.js"
Cohesion: 0.14
Nodes (26): buildOptimizedChatSession(), compactCodeBlocks(), aggregateCriteria(), buildReplanObservation(), classifyObjectiveKind(), deriveSuccessCriteria(), evaluateEvidence(), findLastIdx() (+18 more)

### Community 14 - "node-tools.js"
Cohesion: 0.10
Nodes (19): copyFile(), createFile(), getDriveApi(), getDriveInfo(), listFiles(), moveFile(), readFile(), searchFiles() (+11 more)

### Community 15 - "package.json"
Cohesion: 0.06
Nodes (32): author, description, homepage, name, type, version, daisyui, dexie (+24 more)

### Community 16 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, axios, dexie, dexie-export-import, driver.js, duck-duck-scrape, @fontsource/poppins, googleapis (+24 more)

### Community 17 - "InputBar.jsx"
Cohesion: 0.12
Nodes (22): react-dom, getCachedSkills(), invalidateSkillsCache(), wireInvalidation(), BUILTIN_SKILLS, CapabilitiesHub(), PLANNED_MCP_CONNECTORS, ConfirmModal() (+14 more)

### Community 18 - "planning.js"
Cohesion: 0.15
Nodes (13): BUILTIN_PLUGIN_DEFAULTS, getBuiltinPluginsPrompt(), getCavemanReportRules(), resolvePluginToggles(), findSuspiciousName(), getNextAction(), pluginVectorCache, getAllLearnedSkills() (+5 more)

### Community 19 - "react"
Cohesion: 0.10
Nodes (17): react, react-router-dom, BrowserPreviewWidget(), DraggableHoloCard(), FloatingMenu(), formatHistoryContent(), HistoryDrawer(), JarvisOrb() (+9 more)

### Community 20 - "oramaStore.js"
Cohesion: 0.07
Nodes (49): @orama/orama, summarizeAndArchive(), bulkInsertDocuments(), deleteDocumentByName(), getAllDocuments(), insertChatArchive(), sanitizeTurnForStorage(), saveBatchChatTurns() (+41 more)

### Community 21 - "trajectory.js"
Cohesion: 0.16
Nodes (28): _buffer, clearTrajectoryBuffer(), getTrajectoryBuffer(), _listeners, loadTrajectoryBuffer(), logReasoning(), logStep(), logSubAgentSpawn() (+20 more)

### Community 22 - "Configuration.jsx"
Cohesion: 0.14
Nodes (19): openai, getAllConfig(), pcmToWav(), transcribeAudioGroq(), initWorker(), loadWhisper(), requestResolvers, transcribeAudioLocal() (+11 more)

### Community 23 - "approval_policy.rs"
Cohesion: 0.14
Nodes (24): approval_policy_get(), approval_policy_grant_session(), approval_policy_reset_session(), approval_policy_set(), default_policy(), effective_policy(), grant_session(), load_state() (+16 more)

### Community 24 - "mission_scope.rs"
Cohesion: 0.17
Nodes (28): canonicalize_for_check(), check_canonical(), check_path(), check_tool(), clear_restores_open(), clear_scope(), dir_prefix_and_symlink_escape(), empty_tools_deny_all() (+20 more)

### Community 25 - "runSubagentTurn"
Cohesion: 0.33
Nodes (7): runSubagentTurn(), core_tools, browserExtensionStatusLine(), group_tools(), GROUP_TOOLS_DEFINITION, group_tools_flat, checkTools()

### Community 26 - "mark-update.mjs"
Cohesion: 0.12
Nodes (27): banner(), bumpVersion(), DO_CHANGELOG, DO_LIST, DO_REBASE, DO_TAG, DO_WHATS_NEW, execLinear() (+19 more)

### Community 27 - "vectorMemory.js"
Cohesion: 0.16
Nodes (22): loadVectorPolicy(), rowModelCompatible(), searchArchives(), searchDocuments(), searchMemoriesInOrama(), searchTurnPairsInOrama(), cosineSimilarity(), emitLiteAuto() (+14 more)

### Community 28 - "mark-eval.mjs"
Cohesion: 0.21
Nodes (25): aggregateMarkEval(), countToolCalls(), ERROR_OBSERVATION_RE, evalEfficiency(), evalHumanInterventionRate(), evalMemory(), evalObjectiveCompletion(), evalPlanning() (+17 more)

### Community 29 - "registry.mjs"
Cohesion: 0.13
Nodes (18): ytmusic-api, getAi, getNt, getManager, lazyManager(), getYtm, getTg, latestConfig (+10 more)

### Community 30 - "mark-adapter.mjs"
Cohesion: 0.13
Nodes (21): AGENT_ARCH_VERSION, AGENT_ARCH_VERSION_sync, BENCH_SCHEMA_VERSION, BENCH_SCHEMA_VERSION_sync, createSidecar(), __dirname, EFFORT_VALUES, EFFORT_VALUES_sync (+13 more)

### Community 31 - "scripts"
Cohesion: 0.08
Nodes (26): scripts, app, bench:quick, bench:save, benchmark:adapter, benchmark:deepeval, benchmark:echo, benchmark:run (+18 more)

### Community 32 - "App"
Cohesion: 0.20
Nodes (12): getAppConfig(), setAppConfig(), App(), applyProfile(), detectHardwareProfile(), getActiveProfile(), getProfileConfig(), PROFILES (+4 more)

### Community 33 - "useMarkAgent.js"
Cohesion: 0.22
Nodes (11): getBestMusicMatch(), getYoutubeSummary(), cleanTtsText(), formatForTelegram(), playVoice(), db, insertMemory(), useApproval() (+3 more)

### Community 34 - "db.js"
Cohesion: 0.11
Nodes (21): DEFAULT_TRAITS, deleteChatArchive(), deleteMemory(), getAllChatArchives(), getCoreMemory(), getLearnedSkill(), getMainThread(), getMemory() (+13 more)

### Community 35 - "google-service.js"
Cohesion: 0.14
Nodes (20): RFC-2822, googleapis, open, getGsvc, createEvent(), deleteEvent(), getCalendarApi(), listEvents() (+12 more)

### Community 36 - "effort-fixtures.mjs"
Cohesion: 0.19
Nodes (19): baseResult(), BudgetExhausted, check(), finish(), LEVEL_BY_VALUE, parseLevel(), readAttemptCount(), runTask() (+11 more)

### Community 37 - "cmd_fs.rs"
Cohesion: 0.30
Nodes (22): Into, ensure_workspace(), err(), fs_delete_file(), fs_detect_legacy_profiles(), fs_grep_search(), fs_import_pick_and_read(), fs_list_dir() (+14 more)

### Community 38 - "manifest.json"
Cohesion: 0.09
Nodes (21): action, default_icon, default_popup, default_title, background, service_worker, 16, 32 (+13 more)

### Community 39 - "watchdog.rs"
Cohesion: 0.18
Nodes (15): Instant, Breach, destructive_cap_fires_once_then_latches(), hard_rate_wins_and_self_heals(), normal_use_never_trips(), record_action(), FnOnce, Option (+7 more)

### Community 41 - "task-daemon.js"
Cohesion: 0.29
Nodes (9): activeTasks, FINISHED_STATUSES, isFinishedStatus(), killBackgroundTask(), listBackgroundTasks(), readBackgroundTaskOutput(), reapOldestFinishedTasks(), scheduleFinishedTaskReap() (+1 more)

### Community 42 - "vitest"
Cohesion: 0.05
Nodes (53): vitest, detectBumpType(), getCurrentVersion(), git(), main(), REPO, semverBump(), updateTauriConf() (+45 more)

### Community 43 - "taskStore.js"
Cohesion: 0.19
Nodes (19): assertStepStatus(), assertTaskStatus(), cancelAgentTask(), checkpointAgentTaskStep(), createAgentTask(), getAgentTask(), getAgentTaskWithSteps(), makeId() (+11 more)

### Community 44 - "selfModel.js"
Cohesion: 0.16
Nodes (15): describeLevel(), getPersonaPrompt(), getTraitContext(), APP_IDENTITY, getSelfIdentityBlock(), BROWSER_ENV, DESIGN, ERROR_HANDLING (+7 more)

### Community 45 - "bot.rs"
Cohesion: 0.30
Nodes (18): call_api(), Arc, Mutex, Option, Result, Self, State, String (+10 more)

### Community 46 - "run.mjs"
Cohesion: 0.17
Nodes (17): agg, cheatDetected, cheatTask, compareArgIdx, failedDims, saveMode, smoke, t0 (+9 more)

### Community 47 - "plugin-loader.js"
Cohesion: 0.20
Nodes (15): execFilePromise, getPluginsDir(), isValidNpmDependency(), loadedPlugins, loadPlugins(), openInFileManager(), pluginCreate(), pluginDelete() (+7 more)

### Community 48 - "tauri.conf.json"
Cohesion: 0.11
Nodes (18): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+10 more)

### Community 49 - "bridge-core.mjs"
Cohesion: 0.05
Nodes (71): BASELINE_PATH, median(), results, ROOT, runWorkload(), saveMode, WORKLOADS, ensureBridge() (+63 more)

### Community 50 - "smoke.mjs"
Cohesion: 0.14
Nodes (15): BENCHMARK_MATRIX, CORE_SET, summarizeMatrix(), agg, aggNull, cur, matrixIds, matrixSummary (+7 more)

### Community 51 - "effortSystem.js"
Cohesion: 0.14
Nodes (11): AGENT_ARCH_VERSION, BENCH_SCHEMA_VERSION, CANONICAL, consumeSubtask(), EFFORT_VALUES, EscalationEvent, ModelProviderAdapter, resolve_auto() (+3 more)

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
Cohesion: 0.20
Nodes (9): getPl, getTracker, getWs, activeWindow(), buffer, getSystemIdleSeconds(), pushToBuffer(), run() (+1 more)

### Community 57 - "effortEstimator.test.js"
Cohesion: 0.25
Nodes (13): EFFORT_LEVELS, EFFORT_VALUES, estimateEffort(), resolveEffortLevel(), SIGNALS, SYSTEM_DEFAULT_EFFORT, SYSTEM_DEFAULT_EFFORT_sync, AUTO_MAX (+5 more)

### Community 59 - "browser-agent.js"
Cohesion: 0.35
Nodes (13): closeBrowser(), downloadFile(), executeAction(), executeScript(), extractData(), getOrCreateBrowser(), getSession(), navigateTo() (+5 more)

### Community 60 - "Mark-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification"
Cohesion: 0.03
Nodes (71): 10. HIGH Policy, 11. xHIGH Policy, 12. MAX Policy, 13. ULTRA Policy, 15. Capability Matrix, 16. Numeric Score Bounds, 17. Runtime Hard Bounds, 18. Execution-Step Budgets (+63 more)

### Community 61 - "MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure"
Cohesion: 0.05
Nodes (36): Appendix: Reconciled Parity Items (from previous audit contradictions), Appendix: Workflow Coverage Matrix, Classification of Previous Audit Claims, Critical Gaps, Future Improvements (P2+), MARK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure, Must Document (P1), Must Fix Before Linux Release (P1) (+28 more)

### Community 63 - "git.rs"
Cohesion: 0.47
Nodes (12): git(), git_commit(), git_diff(), git_revert(), git_status(), GitResult, resolve_cwd(), AppHandle (+4 more)

### Community 64 - "MARK Linux: Electron → Tauri Validation Report"
Cohesion: 0.08
Nodes (24): 1. Window Transparency — **Platform Limitation** (Distinguish native vs blur), 2. Camera / Microphone — **PARTIAL** (not "not ported"), 3. Save File Dialog — **NEW FEATURE / NOT PARITY GAP** (reclassified from P0), 4. Auto-launch at Login — **INTENTIONAL LINUX DIFFERENCE** (not "missing"), 5. Fullscreen Toggle — **FULLY IMPLEMENTED** (not "UI wiring missing"), 6. Vibrancy/Blur Effects — **Platform Limitation**, 7. Window Opacity via CSS Var — **KNOWN TAURI v1 API GAP** (reclassified from migration issue), Auto-launch (Linux): (+16 more)

### Community 67 - "updateChecker.js"
Cohesion: 0.30
Nodes (9): checkForUpdate(), fetchReleases(), getCache(), getChannel(), initUpdateChecker(), isNewer(), maybeNotify(), selectChannelRelease() (+1 more)

### Community 68 - "skills.mjs"
Cohesion: 0.20
Nodes (3): emitSkillsUpdated(), SKILLS_DIR, emit()

### Community 69 - "terminal-bench.mjs"
Cohesion: 0.27
Nodes (8): NOTE: metrics require a DeepEval model/API key at runtime; without one this, runAllWithDeepEval(), runWithDeepEval(), listTasks(), mkSentinel(), runAll(), runTask(), TASKS

### Community 70 - "dev.sh"
Cohesion: 0.58
Nodes (10): die(), ensure_bun(), ensure_deps(), ensure_sidecar(), free_cargo_lock(), free_dev_port(), log(), ok() (+2 more)

### Community 71 - "taint-gate.mjs"
Cohesion: 0.33
Nodes (9): checkTaintGate(), isStateChangingTool(), isTaintingTool(), isTurnTainted(), markTurnTainted(), resetTurnTaint(), setTurnId(), STATE_CHANGING_TOOLS (+1 more)

### Community 72 - "workspace-rag.js"
Cohesion: 0.27
Nodes (9): chunkFileContent(), CODE_EXTENSIONS, ensureMarkWorkspace(), getFileHash(), IGNORE_DIRS, indexWorkspace(), scanDir(), readWorkingMemory() (+1 more)

### Community 73 - "useAwareness.js"
Cohesion: 0.36
Nodes (9): formatAwarenessContent(), getAwarenessResponse(), getCurrentTimeInfo(), getAllMemory(), getRelevantMemory(), formatAwarenessContent(), isSimilarAwarenessMessage(), tokenizeForSimilarity() (+1 more)

### Community 74 - "stress-watermark.harness.mjs"
Cohesion: 0.18
Nodes (5): attackerKeys, GENUINE, genuineSig, { privateKey, publicKey }, NOTE: Node 24+ — use modern sign/verify API (createSign deprecated for Ed25519)

### Community 75 - "Parity Matrix (A-F Status Legend)"
Cohesion: 0.11
Nodes (18): Changes Implemented (from audit), Confirmed Classification Summary (Canonical), Future Improvements (Optional), Known Platform Limitations, MARK Linux: Electron → Tauri Parity Audit, Must Document, Must Fix Before Linux Release, Parity Matrix (A-F Status Legend) (+10 more)

### Community 76 - "SubagentIntercom.jsx"
Cohesion: 0.16
Nodes (22): lucide-react, createSession(), deleteSession(), getAllSessions(), getChatData(), getSession(), renameSession(), setSessionWorkspace() (+14 more)

### Community 77 - "Session Log: Mark-Linux Effort System Integration"
Cohesion: 0.13
Nodes (14): File yang Diubah, Finalisasi, Hasil, Keputusan Arsitektural, Keterbatasan / Tidak Diselesaikan di Sesi Ini, Laporan Mesin (§72), Notes Tambahan, Penutup (+6 more)

### Community 79 - "MARK Smart Orchestrator Architecture Design Document"
Cohesion: 0.13
Nodes (14): 10. Observability and Benchmarking, 11. Mapping to MARK, 12. Suggested Implementation Order, 13. Success Criteria, 1. Purpose, 2. Design Principles, 3. High-Level Architecture, 4. ReAct Loop Design (+6 more)

### Community 82 - "sync-version.mjs"
Cohesion: 0.22
Nodes (8): cargoRaw, checkOnly, conf, drift, pkg, pkgRaw, pkgSection, verLine

### Community 84 - "driverTour.js"
Cohesion: 0.36
Nodes (6): driver.js, filterExistingSteps(), isElementVisible(), startDriverTour(), hiddenEl, visibleEl

### Community 85 - "rsi-evaluate.js"
Cohesion: 0.29
Nodes (6): analyze(), AUDIT, now, pctl(), rows, WINDOW_DAYS

### Community 86 - "rsi-evaluate.mjs"
Cohesion: 0.29
Nodes (6): analyze(), AUDIT, now, pctl(), rows, WINDOW_DAYS

### Community 87 - "RelationalGrowth.jsx"
Cohesion: 0.33
Nodes (9): getRelationship(), saveRelationship(), RelationalGrowth, useRelationalGrowth(), describeLevel(), describePersonality(), RelationalGrowth(), TRAIT_META (+1 more)

### Community 88 - "tools_run_shell"
Cohesion: 0.43
Nodes (7): is_dangerous(), AppHandle, Option, Result, String, ToolResult, tools_run_shell()

### Community 90 - "auto-detect-upstream.mjs"
Cohesion: 0.62
Nodes (6): classifyCommit(), classifyFile(), getDiffFiles(), getNewCommits(), main(), run()

### Community 91 - "build-manifest.mjs"
Cohesion: 0.29
Nodes (4): manifest, manifestPath, root, skillsDir

### Community 92 - "MARK Smart Orchestrator Architecture Design Document"
Cohesion: 0.14
Nodes (14): 10. Observability and Benchmarking, 11. Mapping to MARK, 12. Suggested Implementation Order, 13. Success Criteria, 1. Purpose, 2. Design Principles, 3. High-Level Architecture, 4. ReAct Loop Design (+6 more)

### Community 93 - "git-service.js"
Cohesion: 0.52
Nodes (6): execFilePromise, getGitDiff(), getGitStatus(), gitCommit(), gitRevert(), runGit()

### Community 94 - "core.js"
Cohesion: 0.15
Nodes (20): cleanAndParse(), extractLenientField(), fetchAI(), buildGroomerPrompt(), groomerSchema, parseGroomerResponse(), runBatchConsolidation(), clampDrift() (+12 more)

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

### Community 100 - "harness_append"
Cohesion: 0.47
Nodes (5): harness_append(), harness_dir(), PathBuf, Result, String

### Community 101 - "dev-sh.test.bash"
Cohesion: 0.73
Nodes (5): dev-sh.test.bash script, create_fake_cargo_process(), test_cargo_in_src_tauri_is_killed(), test_cargo_inside_project_is_killed(), test_cargo_outside_project_not_killed()

### Community 102 - "mark-bridge-host.mjs"
Cohesion: 0.60
Nodes (4): buf, handle(), tokenFile(), writeMsg()

### Community 103 - "popup.js"
Cohesion: 0.80
Nodes (4): autoConnect(), refresh(), refreshTask(), setPill()

### Community 104 - "browserReadFetch"
Cohesion: 0.50
Nodes (4): axios, htmlparser2, browserReadFetch(), webFetch()

### Community 105 - "linux-action.sh"
Cohesion: 0.70
Nodes (4): err(), get_flag(), pos(), linux-action.sh script

### Community 106 - "syntax-validator.js"
Cohesion: 0.70
Nodes (4): checkBracketBalance(), checkXmlTagBalance(), runCheck(), validateFileSyntax()

### Community 107 - "overrides"
Cohesion: 0.50
Nodes (4): overrides, adm-zip, dompurify, tar

### Community 123 - "Architecture Learnings — dari Anthropic Research ke MARK"
Cohesion: 0.17
Nodes (11): 1. Patterns and Problems in Emerging Multiagent Systems (Frontier Red Team, 13 Agu 2026), 1a. Low variance / conformity failure, 1b. Epistemic failures (trust calibration), 1c. Coordination via shared forum, 1d. Incompatible goals → turf war, 2. Teaching Claude Why (Alignment, 8 Mei 2026), 3. How Claude Code is Used in Practice (Economics, 16 Jun 2026), 4. A global workspace in language models (Interpretability, 6 Jul 2026) (+3 more)

### Community 125 - "Agent Contribution Guidelines (Abelink OS)"
Cohesion: 0.20
Nodes (10): 1. Prinsip Fundamental (Epistemic Grounding), 2. Batas Arsitektur (Architectural Boundaries), 3. Aturan Manifest & Single Source of Truth, 4. Kebijakan Repositori Privat & Aset, 5. Gerbang Verifikasi (Verification Gates), 6. Standar Pesan Commit (Conventional Commits), A. Frontend Layer (`src/`), Agent Contribution Guidelines (Abelink OS) (+2 more)

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
Cohesion: 0.22
Nodes (8): Arsitektur, Cara pakai (dev), E2E manual (checklist, ±10 menit), Keterbatasan saat ini (jujur), Mark Browser Extension (Fase C3 — Jalur A), Model keamanan, Perilaku grup tab + penutupan, Skenario klik (E2E dengan browser)

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

### Community 140 - "MARK Linux — Architecture (agent-oriented)"
Cohesion: 0.29
Nodes (6): 1. Peta Runtime (tiga dunia), 2. Sidecar Channel Registry (sidecar/engine/), 3. Pola Arsitektur yang Diadopsi (dari pola Agent Skills / plugin Claude), 4. Alur Data Kritis, 5. Batasan yang Masih Sengaja Dibiarkan (jangan "perbaiki" diam-diam), MARK Linux — Architecture (agent-oriented)

### Community 141 - "Fitur Inti"
Cohesion: 0.29
Nodes (7): 1. Multi-Provider Hybrid AI Routing, 2. Autonomous Multi-Agent (Mission Control), 3. Durable Agent Tasks, 4. Epistemic Grounding & Hybrid Memory System, 5. Desktop Awareness & OS Automation, 6. Voice & Audio Pipeline, Fitur Inti

### Community 142 - "useVAD.js"
Cohesion: 0.17
Nodes (15): micCoolingDown(), noteMicFailure(), resetMicFailure(), resolveMicConstraints(), CameraPreview(), AutomationHUD(), SpotlightBar(), GlobalCameraManager() (+7 more)

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

### Community 156 - "6. Evaluation model"
Cohesion: 0.67
Nodes (3): 6.1 Verifier-based, 6.2 Rubric-based, 6. Evaluation model

### Community 157 - "Assistant"
Cohesion: 0.67
Nodes (3): Assistant, Prompt benchmark yang saya sarankan, Trajectory: dimana dan apa yang harus ada

### Community 163 - "media.mjs"
Cohesion: 0.25
Nodes (4): youtube-transcript-plus, yt-search, getYt, getYts

## Knowledge Gaps
- **827 isolated node(s):** `@commitlint/config-conventional`, `type-enum`, `subject-case`, `saveMode`, `compareArgIdx` (+822 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1077 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `bench-contract.test.mjs`, `catalog.mjs`, `tauri-bridge.js`, `useMarkPlan.js`, `node-tools.js`, `package.json`, `InputBar.jsx`, `planning.js`, `oramaStore.js`, `Configuration.jsx`, `runSubagentTurn`, `vectorMemory.js`, `mark-eval.mjs`, `mark-adapter.mjs`, `App`, `effort-fixtures.mjs`, `selfModel.js`, `bridge-core.mjs`, `effortEstimator.test.js`, `taint-gate.mjs`, `SubagentIntercom.jsx`, `driverTour.js`, `core.js`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `useMarkAgent.js`, `db.js`, `TelegramBot.jsx`, `App.jsx`, `useAwareness.js`, `SubagentIntercom.jsx`, `useMarkPlan.js`, `useVAD.js`, `package.json`, `InputBar.jsx`, `oramaStore.js`, `trajectory.js`, `Configuration.jsx`, `RelationalGrowth.jsx`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useMarkPlan()` (e.g. with `deleteMemory()` and `insertMemory()`) actually correct?**
  _`useMarkPlan()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@commitlint/config-conventional`, `type-enum`, `subject-case` to the rest of the system?**
  _827 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bench-contract.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06767109295199183 - nodes in this community are weakly interconnected._
- **Should `telegram-service.js` be split into smaller, more focused modules?**
  _Cohesion score 0.053075396825396824 - nodes in this community are weakly interconnected._