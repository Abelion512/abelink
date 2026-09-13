# Graph Report - abelink  (2026-09-13)

## Corpus Check
- 400 files · ~356,394 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3083 nodes · 6335 edges · 175 communities (155 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6c7cd7b5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bench-contract.test.mjs
- telegram-service.js
- catalog.mjs
- os.rs
- background.js
- ResponseArea.jsx
- cmd_node_bridge.rs
- release-helper.mjs
- tauri-bridge.js
- trajectorySupervisor.js
- linux-daemon.py
- cmd_misc.rs
- pc-agent.js
- useAbelinkPlan.js
- react
- package.json
- dependencies
- InputBar.jsx
- vitest
- Abelink Cognitive Runtime — Fase 2 Design (A+C: Trajectory Search + Real-Activity Bench)
- oramaStore.js
- limit-ladder.mjs
- ConfigSidebar.jsx
- approval_policy.rs
- mission_scope.rs
- 1. Functional Requirements
- 6. Core Modules
- vectorMemory.js
- abelink-update.mjs
- registry.mjs
- abelink-eval.mjs
- scripts
- ai-bridge.js
- tools.js
- db.js
- googleTools.mjs
- effort-fixtures.mjs
- cmd_fs.rs
- manifest.json
- watchdog.rs
- BudgetSnapshot
- Configuration.jsx
- agentDecision.js
- taskStore.js
- selfModel.js
- bot.rs
- abelink-adapter.mjs
- plugin-loader.js
- tauri.conf.json
- bridge-core.mjs
- smoke.mjs
- effortSystem.js
- tasks.rs
- stress-watermark-v2.harness.mjs
- devDependencies
- objectiveVerifier.js
- services.mjs
- effortEstimator.test.js
- perf-gate.mjs
- sessionCompactor.js
- Abelink-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification
- ABELINK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure
- tasks-limit.mjs
- git.rs
- ABELINK Linux: Electron → Tauri Validation Report
- BudgetState
- startTelegramBot
- Architecture
- skills.mjs
- deepeval-runner.mjs
- dev.sh
- taint-gate.mjs
- workspace-rag.js
- File Structure
- stress-watermark.harness.mjs
- Parity Matrix (A-F Status Legend)
- ChatStudio.jsx
- Session Log: Abelink-Linux Effort System Integration
- Grill-Abelion
- ABELINK Smart Orchestrator Architecture Design Document
- harness-diagnose.mjs
- launcher.mjs
- sync-version.mjs
- PR2 — Long-Horizon Abelink (gaya AVO)
- Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes
- ModelSection.jsx
- Roadmap
- trajectory.js
- tools_run_shell
- @huggingface/transformers
- auto-detect-upstream.mjs
- build-manifest.mjs
- Session Log: 2026-09-12 - Lint husus gate + sinkronisasi docs pasca simplifikasi
- Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5)
- fetchAI
- Evaluasi Arah Arsitektur Masa Depan (RFC)
- rules
- Levels
- Abelink Linux — Roadmap & Arah Pengembangan
- default.json
- CapabilitiesHub.jsx
- dev-sh.test.bash
- cmd_harness.rs
- popup.js
- bump-version.mjs
- linux-action.sh
- useAbelinkAgent.js
- gemini-web.js
- HistoryDrawer.jsx
- pre-commit
- pre-push
- setup-linux-pc-agent.sh
- verify.sh
- ocr-region.sh
- read-ui.sh
- Critic Model
- abelink
- Skill Model
- Architecture Learnings — dari Anthropic Research ke ABELINK
- useChat
- Agent Contribution Guidelines (Abelink OS)
- resolveTrustedBroadcastTargets
- create_music_window
- Changelog ABELINK Linux
- Contributing to Abelink (Linux Edition)
- 14. AUTO Policy Semantics
- Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4)
- Release Automation — ABELINK Linux
- Session Log: Take-over Effort System + Bench + Smart Orchestrator
- Abelink Browser Extension (Fase C3 — Jalur A)
- 4. Key Implementation Invariants & Gotchas
- Migration Gaps — Electron → Tauri (fase A/B)
- AbelinkBench — Harness Evaluasi Abelink Linux
- Abelink: Autonomous AI OS Companion (Linux Edition)
- Harness Log Schema v1 (untuk agent & manusia)
- ABELINK Linux — Architecture (agent-oriented)
- Fitur Inti
- App.jsx
- Model Capability Matrix 2026 — untuk AbelinkBench & prompt ABELINK
- Catatan Keamanan (Vulnerability Triage)
- Security Policy
- PROJECT-STATUS — Abelink Agent Linux
- AI Context & Planning (AGENTS.md)
- 2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native)
- 62. AUTO Policy Tests
- Reference Library — ATM (Amati, Tiru, Modifikasi)
- abelink-bridge-host.mjs
- Architecture Benchmark — `evaluation/bench/`
- turnPairMigrator.js
- ABELINK Linux — Documentation Index
- pdf-parse-shim.mjs
- tauri.dev.json
- generateVector
- os.mjs
- Abelink Project Discovery Outputs
- capabilities.md
- Knowledge.jsx
- bench-gate.mjs
- media.mjs
- Session Log — PR2: Long-Horizon Fase A (Offline)
- RelationalGrowth.jsx
- vite.config.js
- Grill-Abelion Reusable Skill
- run-bench-sweep.sh
- planning.js
- release-branch-order.test.mjs
- overrides
- rules/graphify.md
- workflows/graphify.md

## God Nodes (most connected - your core abstractions)
1. `Abelink-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification` - 73 edges
2. `react` - 71 edges
3. `vitest` - 65 edges
4. `useAbelinkPlan()` - 51 edges
5. `fetchAI()` - 30 edges
6. `getAllConfig()` - 29 edges
7. `scripts` - 27 edges
8. `BudgetSnapshot` - 26 edges
9. `runTask()` - 22 edges
10. `runSmoke()` - 20 edges

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

## Communities (175 total, 14 thin omitted)

### Community 0 - "bench-contract.test.mjs"
Cohesion: 0.07
Nodes (79): BOUNDARY_REQUIREMENTS, buildTrajectory(), createStubBoundary(), describeBoundary(), EXECUTION_BOUNDARY_API, isCompleted(), isFailed(), makeFinalStatus() (+71 more)

### Community 1 - "telegram-service.js"
Cohesion: 0.08
Nodes (27): telegraf, getTg, ABELINK_DATA_DIR, ADMIN_IDS_FILE, adminChatIdsSet, agent, askUserWaiters, authorizedAdminIds (+19 more)

### Community 2 - "catalog.mjs"
Cohesion: 0.07
Nodes (41): lazyManager(), browserExtensionConnector, CONNECTORS, fsConnector, getActionGuide(), getConnector(), listConnectors(), registerConnector() (+33 more)

### Community 3 - "os.rs"
Cohesion: 0.15
Nodes (40): Command, awareness_clear_buffer(), awareness_get_buffer(), get_active_window_linux(), get_idle_seconds_linux(), AppHandle, Arc, Mutex (+32 more)

### Community 4 - "background.js"
Cohesion: 0.09
Nodes (53): abelinkGroupDone(), abelinkGroupError(), act(), actionFn(), activeGroups, adoptOrphanTab(), apiGet(), apiPost() (+45 more)

### Community 5 - "ResponseArea.jsx"
Cohesion: 0.24
Nodes (9): react-markdown, rehype-external-links, remark-gfm, resolveChoice(), ChoiceButtons, CodeBlock, MessageBubble, PluginExecutionBubble() (+1 more)

### Community 6 - "cmd_node_bridge.rs"
Cohesion: 0.09
Nodes (39): Child, ChildStdin, PendingRequests, action_family(), approval_reason(), confirm_on_main_thread(), error_message(), frame() (+31 more)

### Community 7 - "release-helper.mjs"
Cohesion: 0.06
Nodes (57): buildChanges(), buildPRBody(), CHANGELOG_PATH, classifyChange(), commitAndPushIfChanged(), CONF_PATH, createReleasePR(), __dirname (+49 more)

### Community 8 - "tauri-bridge.js"
Cohesion: 0.08
Nodes (28): friendlyAiFetchError(), TRANSLATIONS, append(), logAnswer(), logBenchmarkResource(), logBenchmarkResult(), logBenchmarkRun(), logBenchmarkStep() (+20 more)

### Community 9 - "trajectorySupervisor.js"
Cohesion: 0.10
Nodes (22): getNextStrategy(), ABANDON_REPEAT, BUDGET_SILENCE_STEPS_LEFT, buildHint(), createTrajectorySupervisor(), DIRECTIVE, FAIL_STATES, HINT_COOLDOWN_TURNS (+14 more)

### Community 10 - "linux-daemon.py"
Cohesion: 0.12
Nodes (32): capture_screen(), emit(), ensure_target_window_focused(), flush(), get_target_window_title(), get_window_rect(), handle_click(), handle_double_click() (+24 more)

### Community 11 - "cmd_misc.rs"
Cohesion: 0.15
Nodes (33): b64_encode(), copy_dir_recursive(), is_private_host(), misc_ensure_extension_files(), misc_fetch_web_resource(), misc_get_documents_path(), misc_get_lite_mode(), misc_native_confirm() (+25 more)

### Community 12 - "pc-agent.js"
Cohesion: 0.07
Nodes (63): getNt, execFilePromise, getGitDiff(), getGitStatus(), gitCommit(), gitRevert(), runGit(), getNativeToolsDefinition() (+55 more)

### Community 13 - "useAbelinkPlan.js"
Cohesion: 0.21
Nodes (15): AGENT_CANDIDATES, buildCodingCommand(), detectInstalledAgents(), createSelfRepairMission(), getErrorSignature(), isRepairAllowed(), MAX_REPAIR_ATTEMPTS, recordRepairAttempt() (+7 more)

### Community 14 - "react"
Cohesion: 0.08
Nodes (22): react, mapChatItemToResponse(), YoutubeSearchBubble(), YoutubeSummaryBubble(), SttRouterConfig(), VoiceVideoSection(), DraggableHoloCard(), FloatingMenu() (+14 more)

### Community 15 - "package.json"
Cohesion: 0.07
Nodes (27): author, description, homepage, name, type, version, daisyui, dexie-export-import (+19 more)

### Community 16 - "dependencies"
Cohesion: 0.07
Nodes (30): dependencies, axios, dexie, dexie-export-import, duck-duck-scrape, @fontsource/poppins, googleapis, htmlparser2 (+22 more)

### Community 17 - "InputBar.jsx"
Cohesion: 0.13
Nodes (19): react-dom, ConfirmModal(), ContextGauge, DropAnywhere(), formatFileSize(), getFileIcon(), InputBar(), NATIVE_SKILL_LOW_TIER (+11 more)

### Community 18 - "vitest"
Cohesion: 0.11
Nodes (25): vitest, buildReplanObservation(), gateCompletion(), getLearnedSkill(), killSubagentExecution(), runSubagentTurn(), subagentAbortControllers, buildSubagentSystemPrompt() (+17 more)

### Community 19 - "Abelink Cognitive Runtime — Fase 2 Design (A+C: Trajectory Search + Real-Activity Bench)"
Cohesion: 0.11
Nodes (18): 10. Harness & rollout, 11. Rejected alternatives, 1. Problem & goal, 2. Constraints (locked from brainstorm), 3. Architecture, 4. Trajectory search memory (`trajLineage.js`), 5. Scoring function (`scoring.js`), 6. Strategy library (`strategyLib.js`) (+10 more)

### Community 20 - "oramaStore.js"
Cohesion: 0.14
Nodes (28): ARCHIVE_SCHEMA, deleteArchiveFromOrama(), deleteMemoryFromOrama(), deleteTurnPairsBySessionFromOrama(), DOCUMENT_SCHEMA, ensureArchiveIndex(), ensureIndices(), ensureMemoryIndex() (+20 more)

### Community 21 - "limit-ladder.mjs"
Cohesion: 0.13
Nodes (40): ARTIFACT_MARGIN, artifactsFromRungId(), buildLimitVerdict(), CHAIN_DIR, chainSum(), checkArtifactText(), checkDoneText(), classifyLimitFailure() (+32 more)

### Community 22 - "ConfigSidebar.jsx"
Cohesion: 0.29
Nodes (5): ConfigSidebar(), isItDomain(), IT_KEYWORDS, sections, sectionsLogged

### Community 23 - "approval_policy.rs"
Cohesion: 0.13
Nodes (24): approval_policy_get(), approval_policy_grant_session(), approval_policy_reset_session(), approval_policy_set(), default_policy(), effective_policy(), grant_session(), load_state() (+16 more)

### Community 24 - "mission_scope.rs"
Cohesion: 0.17
Nodes (28): canonicalize_for_check(), check_canonical(), check_path(), check_tool(), clear_restores_open(), clear_scope(), dir_prefix_and_symlink_escape(), empty_tools_deny_all() (+20 more)

### Community 25 - "1. Functional Requirements"
Cohesion: 0.07
Nodes (29): 1. Functional Requirements, 2. Non-Functional Requirements, 3. Data Requirements, 4. Security Requirements, 5. Acceptance Criteria, Abelink Personal Growth & Execution Layer, FR-001 Goals, FR-002 Objectives (+21 more)

### Community 26 - "6. Core Modules"
Cohesion: 0.07
Nodes (28): 10. MVP, 11. Principles, 1. Product Definition, 2. Problem, 3. Goals, 4. Non-Goals, 5. Primary User Journey, 6.10 Critic (+20 more)

### Community 27 - "vectorMemory.js"
Cohesion: 0.16
Nodes (13): cosineSimilarity(), emitLiteAuto(), fnv1a(), generateStorableVector(), getDirectExtractor(), getExtractor(), getWorker(), hashEmbedding() (+5 more)

### Community 28 - "abelink-update.mjs"
Cohesion: 0.12
Nodes (27): banner(), bumpVersion(), DO_CHANGELOG, DO_LIST, DO_REBASE, DO_TAG, DO_WHATS_NEW, execLinear() (+19 more)

### Community 29 - "registry.mjs"
Cohesion: 0.19
Nodes (13): ytmusic-api, getManager, getYtm, latestConfig, setLatestConfig(), handleLine(), fail(), handlers (+5 more)

### Community 30 - "abelink-eval.mjs"
Cohesion: 0.21
Nodes (25): aggregateAbelinkEval(), countToolCalls(), ERROR_OBSERVATION_RE, evalEfficiency(), evalHumanInterventionRate(), evalMemory(), evalObjectiveCompletion(), evalPlanning() (+17 more)

### Community 31 - "scripts"
Cohesion: 0.07
Nodes (27): scripts, app, app:raw, bench:quick, bench:save, benchmark:adapter, benchmark:deepeval, benchmark:echo (+19 more)

### Community 32 - "ai-bridge.js"
Cohesion: 0.19
Nodes (15): jsonrepair, getAi, activeAbortControllers, cleanAndParse(), createLMStudioOfflineError(), fetchAI(), globalConfig, isFreeModelId() (+7 more)

### Community 33 - "tools.js"
Cohesion: 0.19
Nodes (12): getBestMusicMatch(), getYoutubeSummary(), normMusic(), QUERY_NOISE, queryTokens(), trustworthyTopHit(), VERSION_KEYWORDS, cleanTtsText() (+4 more)

### Community 34 - "db.js"
Cohesion: 0.12
Nodes (20): DEFAULT_TRAITS, deleteChatArchive(), deleteMemory(), getAllChatArchives(), getAllDocumentsMeta(), getDocumentChunk(), getMemory(), getSession() (+12 more)

### Community 35 - "googleTools.mjs"
Cohesion: 0.14
Nodes (28): RFC-2822, googleapis, getGsvc, createEvent(), deleteEvent(), getCalendarApi(), listEvents(), copyFile() (+20 more)

### Community 36 - "effort-fixtures.mjs"
Cohesion: 0.19
Nodes (20): baseResult(), BudgetExhausted, check(), finish(), LEVEL_BY_VALUE, parseLevel(), readAttemptCount(), runTask() (+12 more)

### Community 37 - "cmd_fs.rs"
Cohesion: 0.30
Nodes (22): Into, ensure_workspace(), err(), fs_delete_file(), fs_detect_legacy_profiles(), fs_grep_search(), fs_import_pick_and_read(), fs_list_dir() (+14 more)

### Community 38 - "manifest.json"
Cohesion: 0.09
Nodes (21): action, default_icon, default_popup, default_title, background, service_worker, 16, 32 (+13 more)

### Community 39 - "watchdog.rs"
Cohesion: 0.18
Nodes (15): Instant, Breach, destructive_cap_fires_once_then_latches(), hard_rate_wins_and_self_heals(), normal_use_never_trips(), record_action(), FnOnce, Option (+7 more)

### Community 41 - "Configuration.jsx"
Cohesion: 0.12
Nodes (20): openai, getAllConfig(), pcmToWav(), transcribeAudioGroq(), initWorker(), loadWhisper(), requestResolvers, transcribeAudioLocal() (+12 more)

### Community 42 - "agentDecision.js"
Cohesion: 0.22
Nodes (17): classifyMainDecision(), classifySubagentAnswer(), explicitState(), hasActionShape(), INTENT, isBlockedText(), isExplicitSelfTerminate(), isQuestionText() (+9 more)

### Community 43 - "taskStore.js"
Cohesion: 0.17
Nodes (23): db, buildDurableStepCheckpoint(), assertStepStatus(), assertTaskStatus(), cancelAgentTask(), checkpointAgentTaskStep(), createAgentTask(), getAgentTask() (+15 more)

### Community 44 - "selfModel.js"
Cohesion: 0.16
Nodes (15): describeLevel(), getPersonaPrompt(), getTraitContext(), APP_IDENTITY, getSelfIdentityBlock(), BROWSER_ENV, DESIGN, ERROR_HANDLING (+7 more)

### Community 45 - "bot.rs"
Cohesion: 0.30
Nodes (18): call_api(), Arc, Mutex, Option, Result, Self, State, String (+10 more)

### Community 46 - "abelink-adapter.mjs"
Cohesion: 0.09
Nodes (43): AGENT_ARCH_VERSION, AGENT_ARCH_VERSION_sync, BENCH_SCHEMA_VERSION, BENCH_SCHEMA_VERSION_sync, createSidecar(), __dirname, EFFORT_VALUES, EFFORT_VALUES_sync (+35 more)

### Community 47 - "plugin-loader.js"
Cohesion: 0.20
Nodes (15): execFilePromise, getPluginsDir(), isValidNpmDependency(), loadedPlugins, loadPlugins(), openInFileManager(), pluginCreate(), pluginDelete() (+7 more)

### Community 48 - "tauri.conf.json"
Cohesion: 0.11
Nodes (18): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+10 more)

### Community 49 - "bridge-core.mjs"
Cohesion: 0.05
Nodes (77): axios, htmlparser2, ensureBridge(), finishSessionTask(), run(), shutdownBrowserChannels(), sleep(), BROWSER_BRIDGE (+69 more)

### Community 50 - "smoke.mjs"
Cohesion: 0.08
Nodes (23): BENCHMARK_MATRIX, CORE_SET, summarizeMatrix(), agg, aggNull, cur, emptyWork, gitTmp (+15 more)

### Community 51 - "effortSystem.js"
Cohesion: 0.13
Nodes (12): AGENT_ARCH_VERSION, AUTO_MAX, AUTO_MIN, AUTO_SCALE, BENCH_SCHEMA_VERSION, CANONICAL, EscalationEvent, ModelProviderAdapter (+4 more)

### Community 52 - "tasks.rs"
Cohesion: 0.23
Nodes (20): kill_all_tasks(), kill_all_tasks_kills_grandchildren_too(), kill_task(), list_tasks(), proc_gone(), read_task_output(), AppHandle, Arc (+12 more)

### Community 53 - "stress-watermark-v2.harness.mjs"
Cohesion: 0.15
Nodes (14): attacker, bigSkill, bodyHash(), buildCanonical(), coreSkill, createSkill(), genuineSkill, keyring (+6 more)

### Community 54 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, daisyui, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, fake-indexeddb, prettier (+8 more)

### Community 55 - "objectiveVerifier.js"
Cohesion: 0.25
Nodes (13): aggregateCriteria(), classifyObjectiveKind(), deriveSuccessCriteria(), escalateKindFromEvidence(), evaluateEvidence(), findLastIdx(), isMultiActionObjective(), KIND_VERIFY_HINT (+5 more)

### Community 56 - "services.mjs"
Cohesion: 0.20
Nodes (9): getPl, getTracker, getWs, activeWindow(), buffer, getSystemIdleSeconds(), pushToBuffer(), run() (+1 more)

### Community 57 - "effortEstimator.test.js"
Cohesion: 0.26
Nodes (12): EFFORT_LEVELS, EFFORT_VALUES, estimateEffort(), resolveEffortLevel(), SIGNALS, SYSTEM_DEFAULT_EFFORT, SYSTEM_DEFAULT_EFFORT_sync, EffortLevel (+4 more)

### Community 58 - "perf-gate.mjs"
Cohesion: 0.17
Nodes (7): BASELINE_PATH, median(), results, ROOT, runWorkload(), saveMode, WORKLOADS

### Community 59 - "sessionCompactor.js"
Cohesion: 0.32
Nodes (13): assembleCompactedPayload(), calculateMessageChars(), calculateSessionChars(), executeSessionCompaction(), getMessageId(), isSkipped(), MAX_SESSION_CHARS, PRESERVE_RECENT_TURNS (+5 more)

### Community 60 - "Abelink-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification"
Cohesion: 0.03
Nodes (71): 10. HIGH Policy, 11. xHIGH Policy, 12. MAX Policy, 13. ULTRA Policy, 15. Capability Matrix, 16. Numeric Score Bounds, 17. Runtime Hard Bounds, 18. Execution-Step Budgets (+63 more)

### Community 61 - "ABELINK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure"
Cohesion: 0.05
Nodes (36): ABELINK Linux: Final Audit — Application Parity + CI/CD + Release Infrastructure, Appendix: Reconciled Parity Items (from previous audit contradictions), Appendix: Workflow Coverage Matrix, Classification of Previous Audit Claims, Critical Gaps, Future Improvements (P2+), Must Document (P1), Must Fix Before Linux Release (P1) (+28 more)

### Community 62 - "tasks-limit.mjs"
Cohesion: 0.14
Nodes (20): artifactName(), buildChainPrompt(), LIMIT_TASKS, listLimitTasks(), pad3Name(), readWorldFile(), rungMaxTurns(), VERIFY_LIMIT (+12 more)

### Community 63 - "git.rs"
Cohesion: 0.47
Nodes (12): git(), git_commit(), git_diff(), git_revert(), git_status(), GitResult, resolve_cwd(), AppHandle (+4 more)

### Community 64 - "ABELINK Linux: Electron → Tauri Validation Report"
Cohesion: 0.08
Nodes (24): 1. Window Transparency — **Platform Limitation** (Distinguish native vs blur), 2. Camera / Microphone — **PARTIAL** (not "not ported"), 3. Save File Dialog — **NEW FEATURE / NOT PARITY GAP** (reclassified from P0), 4. Auto-launch at Login — **INTENTIONAL LINUX DIFFERENCE** (not "missing"), 5. Fullscreen Toggle — **FULLY IMPLEMENTED** (not "UI wiring missing"), 6. Vibrancy/Blur Effects — **Platform Limitation**, 7. Window Opacity via CSS Var — **KNOWN TAURI v1 API GAP** (reclassified from migration issue), ABELINK Linux: Electron → Tauri Validation Report (+16 more)

### Community 65 - "BudgetState"
Cohesion: 0.10
Nodes (3): Workflow, BudgetState, consumeWorkflowNode()

### Community 66 - "startTelegramBot"
Cohesion: 0.19
Nodes (12): abortAllFetches(), ensureTrustedAdmin(), getConnectionStatus(), resolveAskUser(), resolveContainedSavePath(), sanitizeFileName(), saveChatIdsToFile(), sendAgentExecutionDone() (+4 more)

### Community 67 - "Architecture"
Cohesion: 0.15
Nodes (12): 10. Compatibility, 1. Design Position, 2. Integration Boundary, 3. Suggested Module Layout, 4. Domain Contracts, 5. Critic Architecture, 6. Autonomy Architecture, 7. Focus Governance (+4 more)

### Community 68 - "skills.mjs"
Cohesion: 0.20
Nodes (3): emitSkillsUpdated(), SKILLS_DIR, emit()

### Community 69 - "deepeval-runner.mjs"
Cohesion: 0.50
Nodes (3): NOTE: metrics require a DeepEval model/API key at runtime; without one this, runAllWithDeepEval(), runWithDeepEval()

### Community 70 - "dev.sh"
Cohesion: 0.46
Nodes (13): die(), ensure_bun(), ensure_deps(), ensure_sidecar(), free_cargo_lock(), free_dev_port(), install_dev_desktop(), log() (+5 more)

### Community 71 - "taint-gate.mjs"
Cohesion: 0.33
Nodes (9): checkTaintGate(), isStateChangingTool(), isTaintingTool(), isTurnTainted(), markTurnTainted(), resetTurnTaint(), setTurnId(), STATE_CHANGING_TOOLS (+1 more)

### Community 72 - "workspace-rag.js"
Cohesion: 0.27
Nodes (12): chunkFileContent(), CODE_EXTENSIONS, ensureAbelinkWorkspace(), getFileHash(), getWorkspaceDir(), IGNORE_DIRS, indexWorkspace(), scanDir() (+4 more)

### Community 73 - "File Structure"
Cohesion: 0.15
Nodes (12): Abelink Cognitive Runtime Fase 2 Implementation Plan, File Structure, Global Constraints, Self-Review, Task 1: `scoring.js` + pins, Task 2: `trajLineage.js` + pins, Task 3: `strategyLib.js` + pins, Task 4: Supervisor Fase 1→2 (additive extend) + pins (+4 more)

### Community 74 - "stress-watermark.harness.mjs"
Cohesion: 0.18
Nodes (5): attackerKeys, GENUINE, genuineSig, { privateKey, publicKey }, NOTE: Node 24+ — use modern sign/verify API (createSign deprecated for Ed25519)

### Community 75 - "Parity Matrix (A-F Status Legend)"
Cohesion: 0.11
Nodes (18): ABELINK Linux: Electron → Tauri Parity Audit, Changes Implemented (from audit), Confirmed Classification Summary (Canonical), Future Improvements (Optional), Known Platform Limitations, Must Document, Must Fix Before Linux Release, Parity Matrix (A-F Status Legend) (+10 more)

### Community 76 - "ChatStudio.jsx"
Cohesion: 0.21
Nodes (15): lucide-react, createSession(), deleteSession(), getAllSessions(), getChatData(), renameSession(), setSessionWorkspace(), MemoryFooterBubble() (+7 more)

### Community 77 - "Session Log: Abelink-Linux Effort System Integration"
Cohesion: 0.13
Nodes (14): File yang Diubah, Finalisasi, Hasil, Keputusan Arsitektural, Keterbatasan / Tidak Diselesaikan di Sesi Ini, Laporan Mesin (§72), Notes Tambahan, Penutup (+6 more)

### Community 78 - "Grill-Abelion"
Cohesion: 0.17
Nodes (11): Anti-Patterns, Candidate Scoring, Core Principle, Evidence Model, Example Decision Pattern, Grill-Abelion, Interview Rules, Purpose (+3 more)

### Community 79 - "ABELINK Smart Orchestrator Architecture Design Document"
Cohesion: 0.13
Nodes (14): 10. Observability and Benchmarking, 11. Mapping to ABELINK, 12. Suggested Implementation Order, 13. Success Criteria, 1. Purpose, 2. Design Principles, 3. High-Level Architecture, 4. ReAct Loop Design (+6 more)

### Community 80 - "harness-diagnose.mjs"
Cohesion: 0.30
Nodes (10): harnessRoot(), main(), parseArgs(), PATTERNS, pickBusiestSession(), short(), harnessRoot(), main() (+2 more)

### Community 81 - "launcher.mjs"
Cohesion: 0.19
Nodes (12): ensureBrowserUp(), LAUNCH_COOLDOWN_MS, LAUNCH_MAX_PER_WINDOW, LAUNCH_POLL_MS, LAUNCH_WAIT_MS, launchState, nowMs(), openInOsBrowser() (+4 more)

### Community 82 - "sync-version.mjs"
Cohesion: 0.22
Nodes (8): cargoRaw, checkOnly, conf, drift, pkg, pkgRaw, pkgSection, verLine

### Community 83 - "PR2 — Long-Horizon Abelink (gaya AVO)"
Cohesion: 0.18
Nodes (10): Fase A — Fondasi offline (agent, tanpa LLM), Fase B — Pengukuran (USER menjalankan, agent tidak bisa), Fase C — Tuning dari data (agent), Fase D — Non-goal PR2, Jejak keputusan, Konteks (baca dulu), Kriteria terima, PR2 — Long-Horizon Abelink (gaya AVO) (+2 more)

### Community 84 - "Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes"
Cohesion: 0.22
Nodes (8): Agent Learnings, Callback, File Invariants, Files Modified, Ringkasan, Session Log — PR1: Trajectory Supervisor + CI Hijau + UX/Telegram Fixes, Temuan dan Fix, Verification Checklist

### Community 85 - "ModelSection.jsx"
Cohesion: 0.30
Nodes (9): detectProviderFromUrl(), KEYWORDS, KNOWN_PORTS, formatCacheAge(), isCustomEndpointPlausible(), modelsCacheKey(), ModelSection(), readModelsCache() (+1 more)

### Community 86 - "Roadmap"
Cohesion: 0.18
Nodes (10): Phase 0: Contract & Boundary, Phase 1: Execution Foundation, Phase 2: Learning & Assessment, Phase 3: Critic, Phase 4: Governance, Phase 5: Career Intelligence, Phase 6: Education & Scholarship, Phase 7: Self-Improvement (+2 more)

### Community 87 - "trajectory.js"
Cohesion: 0.05
Nodes (69): dexie, dropChoice(), MAX_CHOICE_OPTIONS, MAX_OPTION_LENGTH, parseChoiceQuery(), pending, pendingChoiceCount(), requestChoice() (+61 more)

### Community 88 - "tools_run_shell"
Cohesion: 0.43
Nodes (7): is_dangerous(), AppHandle, Option, Result, String, ToolResult, tools_run_shell()

### Community 89 - "@huggingface/transformers"
Cohesion: 0.25
Nodes (3): @huggingface/transformers, simdSupported, WHISPER_MODELS

### Community 90 - "auto-detect-upstream.mjs"
Cohesion: 0.50
Nodes (7): classifyCommit(), classifyFile(), getDiffFiles(), getNewCommits(), main(), REPO_ROOT, run()

### Community 91 - "build-manifest.mjs"
Cohesion: 0.29
Nodes (4): manifest, manifestPath, root, skillsDir

### Community 92 - "Session Log: 2026-09-12 - Lint husus gate + sinkronisasi docs pasca simplifikasi"
Cohesion: 0.20
Nodes (9): Agent Learnings, Callback, File Invariants, Files Modified, Ringkasan, Session Log: 2026-09-12 - Lint husus gate + sinkronisasi docs pasca simplifikasi, Temuan dan Fix, Update 2026-09-12 (lanjutan: clippy gate, artefak build, hapus avo) (+1 more)

### Community 93 - "Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5)"
Cohesion: 0.22
Nodes (8): Agent Learnings, Callback, File Invariants, Files Modified, Ringkasan, Session 2026-09-11 — Vision-bloat fix, capabilities overhaul, modularisasi agentic (F0–F5), Temuan dan Fix, Verification Checklist

### Community 94 - "fetchAI"
Cohesion: 0.10
Nodes (33): formatAwarenessContent(), getAwarenessResponse(), buildOptimizedChatSession(), compactCodeBlocks(), IMAGE_PLACEHOLDER, stripDataUrls(), stripImageContent(), cleanAndParse() (+25 more)

### Community 95 - "Evaluasi Arah Arsitektur Masa Depan (RFC)"
Cohesion: 0.15
Nodes (13): 1. Opsi A: Tetap Arsitektur Hybrid (Status Quo Dioptimalkan), 3. Opsi C: Migrasi Menjadi Web Murni (Pure Web / PWA), 4. Matriks Perbandingan, 5. Rekomendasi Strategis (The Pragmatic Hybrid Evolution), Analisis Jangka Panjang (Long-Term ROI), Deskripsi Teknis, Deskripsi Teknis, Evaluasi Arah Arsitektur Masa Depan (RFC) (+5 more)

### Community 96 - "rules"
Cohesion: 0.33
Nodes (5): extends, rules, subject-case, type-enum, @commitlint/config-conventional

### Community 97 - "Levels"
Cohesion: 0.22
Nodes (8): APPROVAL_REQUIRED, AUTO, Autonomy Policy, Decision Inputs, DENY, GUIDED, Levels, Rules

### Community 98 - "Abelink Linux — Roadmap & Arah Pengembangan"
Cohesion: 0.15
Nodes (12): 1. Packaging & Distribusi, 2. Capability & Connector Ecosystem (general-pluggable), 3. Configuration UX, 4. Documentation & Onboarding, 5. What's New Otomatis, Abelink Linux — Roadmap & Arah Pengembangan, Arsitektur, Fase Berikutnya: v1.x Roadmap (+4 more)

### Community 99 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 100 - "CapabilitiesHub.jsx"
Cohesion: 0.33
Nodes (7): @monaco-editor/react, getCachedSkills(), invalidateSkillsCache(), wireInvalidation(), BUILTIN_SKILLS, CapabilitiesHub(), PLANNED_MCP_CONNECTORS

### Community 101 - "dev-sh.test.bash"
Cohesion: 0.73
Nodes (5): dev-sh.test.bash script, create_fake_cargo_process(), test_cargo_in_src_tauri_is_killed(), test_cargo_inside_project_is_killed(), test_cargo_outside_project_not_killed()

### Community 102 - "cmd_harness.rs"
Cohesion: 0.33
Nodes (7): harness_append(), harness_dir(), rotation_chain(), PathBuf, Result, String, Vec

### Community 103 - "popup.js"
Cohesion: 0.62
Nodes (6): autoConnect(), readPort(), refresh(), refreshTask(), renderPorts(), setPill()

### Community 104 - "bump-version.mjs"
Cohesion: 0.39
Nodes (7): detectBumpType(), getCurrentVersion(), git(), main(), REPO, semverBump(), updateTauriConf()

### Community 105 - "linux-action.sh"
Cohesion: 0.70
Nodes (4): err(), get_flag(), pos(), linux-action.sh script

### Community 106 - "useAbelinkAgent.js"
Cohesion: 0.13
Nodes (20): addAlwaysAllowedPath(), getAlwaysAllowedPaths(), getCoreMemory(), YoutubeMusicPlayer(), ApprovalContext, ApprovalProvider(), familyOfTool(), getFolderFromPath() (+12 more)

### Community 107 - "gemini-web.js"
Cohesion: 0.39
Nodes (7): findRc(), GEMINI_WEB_MODELS, __geminiWebTest, generateGeminiResponse(), httpPost(), isSorryPage(), sorryError()

### Community 108 - "HistoryDrawer.jsx"
Cohesion: 0.39
Nodes (6): getMainThread(), saveMainThread(), formatHistoryContent(), HistoryDrawer(), ResponseArea(), useAbelinkState()

### Community 116 - "Critic Model"
Cohesion: 0.29
Nodes (6): Agent Critique Examples, Critic Model, Critique Record, Principles, Purpose, User Critique Examples

### Community 122 - "Skill Model"
Cohesion: 0.33
Nodes (5): Anti-Cheat Principle, Evidence Types, Skill Model, State Machine, Update Principle

### Community 123 - "Architecture Learnings — dari Anthropic Research ke ABELINK"
Cohesion: 0.17
Nodes (11): 1. Patterns and Problems in Emerging Multiagent Systems (Frontier Red Team, 13 Agu 2026), 1a. Low variance / conformity failure, 1b. Epistemic failures (trust calibration), 1c. Coordination via shared forum, 1d. Incompatible goals → turf war, 2. Teaching Claude Why (Alignment, 8 Mei 2026), 3. How Claude Code is Used in Practice (Economics, 16 Jun 2026), 4. A global workspace in language models (Interpretability, 6 Jul 2026) (+3 more)

### Community 124 - "useChat"
Cohesion: 0.23
Nodes (11): micCoolingDown(), noteMicFailure(), resetMicFailure(), resolveMicConstraints(), CameraPreview(), AutomationHUD(), SpotlightBar(), GlobalCameraManager() (+3 more)

### Community 125 - "Agent Contribution Guidelines (Abelink OS)"
Cohesion: 0.20
Nodes (10): 1. Prinsip Fundamental (Epistemic Grounding), 2. Batas Arsitektur (Architectural Boundaries), 3. Aturan Manifest & Single Source of Truth, 4. Kebijakan Repositori Privat & Aset, 5. Gerbang Verifikasi (Verification Gates), 6. Standar Pesan Commit (Conventional Commits), A. Frontend Layer (`src/`), Agent Contribution Guidelines (Abelink OS) (+2 more)

### Community 126 - "resolveTrustedBroadcastTargets"
Cohesion: 0.33
Nodes (7): getGlobalConfig(), escapeHtml(), loadLatestResult(), resolveTrustedBroadcastTargets(), sendInlineKeyboard(), sendProgress(), sendReport()

### Community 127 - "create_music_window"
Cohesion: 0.48
Nodes (11): anchor_window_bottom_right(), create_music_window(), music_player_command(), music_player_hide(), music_player_play_url(), music_player_show(), music_player_toggle(), AppHandle (+3 more)

### Community 128 - "Changelog ABELINK Linux"
Cohesion: 0.22
Nodes (8): Changelog ABELINK Linux, Dokumentasi, Fitur Baru, Perbaikan, Perbaikan, v1.0.0-alpha.1 — 26 Agustus 2026, v1.0.0-alpha.2 — 4 September 2026, v1.0.0-alpha.3 — 4 September 2026

### Community 129 - "Contributing to Abelink (Linux Edition)"
Cohesion: 0.22
Nodes (9): Architecture Rules, Baru pertama kali clone? Satu perintah cukup, Branch Convention, Code Style, Contributing to Abelink (Linux Edition), Kebijakan Repositori Privat, Linux-Specific Notes, PR Workflow (+1 more)

### Community 130 - "14. AUTO Policy Semantics"
Cohesion: 0.22
Nodes (9): 14.1 Default Initial Level, 14.2 Classification Inputs, 14.3 Classification Output, 14.4 AUTO Escalation, 14.5 AUTO Downgrade, 14.6 AUTO and Hard Limits, 14.7 AUTO and Explicit User Selection, 14.8 AUTO Resolution Metadata (+1 more)

### Community 131 - "Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4)"
Cohesion: 0.22
Nodes (8): Aturan pengerjaan fase baru, Fase B5 — Dialog & screenshot native (Rust), Fase B6 — Desktop automation (os:*) native Rust, Fase C3 — Browser automation multi-session (browser:*), Fase C4 — Plugin execution sandbox (Web Worker), Lanjutan B5 — Screenshot & Telegram send native — SELESAI (2026-09-03), Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4), Pembersihan dead code era Electron — SELESAI (2026-09-03)

### Community 132 - "Release Automation — ABELINK Linux"
Cohesion: 0.20
Nodes (9): Idempotency Guarantees, Manual Promotion (Emergency/Hotfix), Normal Release Path, Release Automation — ABELINK Linux, Release PR Preparation, Tag → Release Workflow Chain, Toolchain Notes (Rust + Bun), Versi vs Tag (catatan anti-stuck) (+1 more)

### Community 133 - "Session Log: Take-over Effort System + Bench + Smart Orchestrator"
Cohesion: 0.22
Nodes (8): File yang Diubah (sesi ini saja), Hasil, Keputusan Arsitektural, Keterbatasan, Laporan Mesin (§72), Ringkasan, Session Log: Take-over Effort System + Bench + Smart Orchestrator, Status Penutupan Sesi

### Community 134 - "Abelink Browser Extension (Fase C3 — Jalur A)"
Cohesion: 0.17
Nodes (11): Abelink Browser Extension (Fase C3 — Jalur A), Arsitektur, Auto-launch browser via OS (aktif default), Cara pakai (dev), Dua instansi: Prod + Dev, E2E manual (checklist, ±10 menit), Keterbatasan saat ini (jujur), Model keamanan (+3 more)

### Community 135 - "4. Key Implementation Invariants & Gotchas"
Cohesion: 0.40
Nodes (5): 4. Key Implementation Invariants & Gotchas, Critical Constants & Thresholds (verified against current files), Multi-Agent Sub-Agent Architecture, Objective Completion & Verification Layer (agentDecision.js + objectiveVerifier.js), Removed Layers (do not re-add without measurement)

### Community 136 - "Migration Gaps — Electron → Tauri (fase A/B)"
Cohesion: 0.25
Nodes (7): Dead code era Electron — SUDAH DIBUANG (2026-09-03), Diperbaiki di PR ini (dipulihkan dari modul era Electron), Jalur Telegram native yang pernah mati — DIPULIHKAN (2026-09-03), Metode audit (untuk reproduce), Migration Gaps — Electron → Tauri (fase A/B), Sengaja ditunda (stub eksplisit, jangan dianggap bug), Verdict merge-readiness PR #16

### Community 137 - "AbelinkBench — Harness Evaluasi Abelink Linux"
Cohesion: 0.25
Nodes (7): AbelinkBench — Harness Evaluasi Abelink Linux, Komponen, Menjalankan, Orchestrator (`benchmark:run`), Prinsip (anti-fabrikasi), Roadmap, Task suite

### Community 138 - "Abelink: Autonomous AI OS Companion (Linux Edition)"
Cohesion: 0.25
Nodes (8): Abelink: Autonomous AI OS Companion (Linux Edition), Arsitektur Sistem, Kebutuhan Sistem (Linux Mint / Ubuntu / Debian / Arch), Lisensi & Atribusi, Perintah Pengembangan, Prasyarat & Instalasi, Setup Cepat, Standar Kontribusi & Kebijakan Repositori

### Community 139 - "Harness Log Schema v1 (untuk agent & manusia)"
Cohesion: 0.33
Nodes (5): Caps (batas jujur, bukan sampling diam-diam), Envelope (wajib di setiap event), Harness Log Schema v1 (untuk agent & manusia), Kinds → kolom standar, Lokasi & artefak

### Community 140 - "ABELINK Linux — Architecture (agent-oriented)"
Cohesion: 0.29
Nodes (6): 1. Peta Runtime (tiga dunia), 2. Sidecar Channel Registry (sidecar/engine/), 3. Pola Arsitektur yang Diadopsi (dari pola Agent Skills / plugin Claude), 4. Alur Data Kritis, 5. Batasan yang Masih Sengaja Dibiarkan (jangan "perbaiki" diam-diam), ABELINK Linux — Architecture (agent-oriented)

### Community 141 - "Fitur Inti"
Cohesion: 0.29
Nodes (7): 1. Multi-Provider Hybrid AI Routing, 2. Autonomous Multi-Agent (Mission Control), 3. Durable Agent Tasks, 4. Epistemic Grounding & Hybrid Memory System, 5. Desktop Awareness & OS Automation, 6. Voice & Audio Pipeline, Fitur Inti

### Community 142 - "App.jsx"
Cohesion: 0.08
Nodes (22): react-router-dom, getAppConfig(), saveConfiguration(), setAppConfig(), App(), ChatStudio, Configuration, Guidebook (+14 more)

### Community 143 - "Model Capability Matrix 2026 — untuk AbelinkBench & prompt ABELINK"
Cohesion: 0.33
Nodes (5): 1. Peta model per kategori (yang relevan untuk ABELINK), 2. Pola lintas vendor yang bisa langsung diterapkan ke ABELINK, 3. Pemetaan ke AbelinkBench (matrix existing diperbarui), 4. Rekomendasi model default ABELINK (per use case), Model Capability Matrix 2026 — untuk AbelinkBench & prompt ABELINK

### Community 144 - "Catatan Keamanan (Vulnerability Triage)"
Cohesion: 0.33
Nodes (5): Catatan Keamanan (Vulnerability Triage), Diperbaiki (commit ini), Diterima (risk-accepted) — `minimatch@3.0.8` via `yt-search`, Diterima (risk-accepted) — `sharp@0.34.5` via `@huggingface/transformers`, Proses

### Community 145 - "Security Policy"
Cohesion: 0.33
Nodes (5): Reporting a vulnerability, Security Policy, Supported versions, Threat model, What we protect

### Community 146 - "PROJECT-STATUS — Abelink Agent Linux"
Cohesion: 0.33
Nodes (5): Keputusan terakhir, Kesehatan terakhir (terverifikasi 2026-09-07), Langkah berikut, Milestone saat ini, PROJECT-STATUS — Abelink Agent Linux

### Community 148 - "AI Context & Planning (AGENTS.md)"
Cohesion: 0.22
Nodes (9): 1. Project Overview, 2. Technology Stack & Core Dependencies, 3. Project Architecture & File Structure, 5. Development Guidelines for AI Agents, AI Context & Planning (AGENTS.md), Build, Verify & CI, `sidecar/`: Node Engine (fase A/B), `src/`: React 19 Renderer (UI + Core Logic) (+1 more)

### Community 149 - "2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native)"
Cohesion: 0.40
Nodes (5): 2. Opsi B: Rewrite Penuh ke Rust (Full Rust Native), Analisis Jangka Panjang (Long-Term ROI), Deskripsi Teknis, Kekurangan (Cons), Kelebihan (Pros)

### Community 150 - "62. AUTO Policy Tests"
Cohesion: 0.40
Nodes (5): 62. AUTO Policy Tests, AUTO can escalate, AUTO is not a fixed policy, AUTO respects hard limits, Explicit level bypasses AUTO

### Community 151 - "Reference Library — ATM (Amati, Tiru, Modifikasi)"
Cohesion: 0.40
Nodes (4): Aturan pakai (load when needed), Kaitan, Peta referensi, Reference Library — ATM (Amati, Tiru, Modifikasi)

### Community 152 - "abelink-bridge-host.mjs"
Cohesion: 0.53
Nodes (5): buf, handle(), tokenFile(), writeMsg(), xdgBase()

### Community 153 - "Architecture Benchmark — `evaluation/bench/`"
Cohesion: 0.50
Nodes (3): Architecture Benchmark — `evaluation/bench/`, File, Menjalankan

### Community 154 - "turnPairMigrator.js"
Cohesion: 0.29
Nodes (12): sanitizeTurnForStorage(), saveBatchChatTurns(), saveChatTurn(), insertBatchTurnPairsToOrama(), insertTurnPairToOrama(), cleanMessageContent(), extractTurnPairsFromSession(), indexSingleTurn() (+4 more)

### Community 157 - "tauri.dev.json"
Cohesion: 0.33
Nodes (5): app, enableGTKAppId, identifier, productName, $schema

### Community 158 - "generateVector"
Cohesion: 0.27
Nodes (8): summarizeAndArchive(), insertChatArchive(), insertArchiveToOrama(), searchDocumentWithOrama(), generateVector(), getExtractor(), generateVector(), loadVectorCore()

### Community 159 - "os.mjs"
Cohesion: 0.67
Nodes (3): COLON_TO_DASH, getTools(), runDash()

### Community 160 - "Abelink Project Discovery Outputs"
Cohesion: 0.40
Nodes (4): 1. Grill-Abelion, 2. Abelink Personal Growth & Execution Layer, Abelink Project Discovery Outputs, Recommended use

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
Cohesion: 0.33
Nodes (9): getRelationship(), saveRelationship(), RelationalGrowth, useRelationalGrowth(), describeLevel(), describePersonality(), RelationalGrowth(), TRAIT_META (+1 more)

### Community 167 - "vite.config.js"
Cohesion: 0.40
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 168 - "Grill-Abelion Reusable Skill"
Cohesion: 0.50
Nodes (3): Files, Grill-Abelion Reusable Skill, Usage

### Community 170 - "planning.js"
Cohesion: 0.20
Nodes (13): BUILTIN_PLUGIN_DEFAULTS, getBuiltinPluginsPrompt(), getCavemanReportRules(), resolvePluginToggles(), extractLenientField(), findSuspiciousName(), getNextAction(), getCurrentTimeInfo() (+5 more)

### Community 171 - "release-branch-order.test.mjs"
Cohesion: 0.67
Nodes (3): run(), setupRepo(), TEMP_DIR

### Community 172 - "overrides"
Cohesion: 0.50
Nodes (4): overrides, adm-zip, dompurify, tar

## Knowledge Gaps
- **894 isolated node(s):** `@commitlint/config-conventional`, `type-enum`, `subject-case`, `__dirname`, `ROOT` (+889 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1178 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `bench-contract.test.mjs`, `catalog.mjs`, `release-helper.mjs`, `tauri-bridge.js`, `trajectorySupervisor.js`, `pc-agent.js`, `useAbelinkPlan.js`, `App.jsx`, `package.json`, `InputBar.jsx`, `oramaStore.js`, `limit-ladder.mjs`, `ConfigSidebar.jsx`, `vectorMemory.js`, `pdf-parse-shim.mjs`, `abelink-eval.mjs`, `ai-bridge.js`, `tools.js`, `effort-fixtures.mjs`, `Configuration.jsx`, `agentDecision.js`, `planning.js`, `taskStore.js`, `release-branch-order.test.mjs`, `abelink-adapter.mjs`, `selfModel.js`, `bridge-core.mjs`, `objectiveVerifier.js`, `effortEstimator.test.js`, `sessionCompactor.js`, `startTelegramBot`, `taint-gate.mjs`, `launcher.mjs`, `ModelSection.jsx`, `trajectory.js`, `fetchAI`, `bump-version.mjs`, `gemini-web.js`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `ResponseArea.jsx`, `useAbelinkPlan.js`, `App.jsx`, `package.json`, `InputBar.jsx`, `vitest`, `turnPairMigrator.js`, `db.js`, `Knowledge.jsx`, `RelationalGrowth.jsx`, `Configuration.jsx`, `ChatStudio.jsx`, `ModelSection.jsx`, `trajectory.js`, `fetchAI`, `CapabilitiesHub.jsx`, `useAbelinkAgent.js`, `HistoryDrawer.jsx`, `useChat`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useAbelinkPlan()` (e.g. with `deleteMemory()` and `insertMemory()`) actually correct?**
  _`useAbelinkPlan()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@commitlint/config-conventional`, `type-enum`, `subject-case` to the rest of the system?**
  _894 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bench-contract.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06767109295199183 - nodes in this community are weakly interconnected._
- **Should `telegram-service.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08172043010752689 - nodes in this community are weakly interconnected._