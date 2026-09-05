// MarkBench Benchmark Matrix — peta benchmark multi-layer (bukan satu angka
// sakral). Usulan GPT-5.6 Luna, diadaptasi untuk mark-agent-linux.
//
// Tesis owner: "Model memang tidak bisa dirubah, tapi architecture and
// infrastructure bisa dibuat lebih smart." Benchmark publik mengukur
// capability model; MARK-Eval (mark-eval.mjs) mengukur kualitas arsitektur.
//
// STATUS jujur per entri:
//   implemented = runner + verifier deterministik ada di repo ini
//   planned     = terdaftar + kontrak metrik, runner menyusul
//
// CORE SET fase awal (5): Terminal-Bench 4.0, OSWorld 2.0, WebArena-Verified,
// WorkArena++, AutomationBench — sesuai rekomendasi.

export const BENCHMARK_MATRIX = [
  // ---- Coding / Terminal ----
  {
    id: 'terminal-bench-4.0',
    layer: 'coding',
    name: 'Terminal-Bench 4.0',
    priority: 'P0',
    status: 'implemented',
    what: 'coding, shell, system tasks',
    runner: 'evaluation/terminal-bench.mjs',
    metrics: ['task_success', 'steps', 'time', 'tool_calls', 'retries', 'token_usage'],
    note: 'Runner adaptasi TB-style dengan sentinel anti-cheat; upgrade verifikator ke skema TB 4.0 long-horizon menyusul.'
  },
  {
    id: 'swe-bench',
    layer: 'coding',
    name: 'SWE-bench / SWE-bench Verified',
    priority: 'P1',
    status: 'planned',
    what: 'repo-level software engineering',
    metrics: ['resolved_rate', 'patch_quality', 'test_pass']
  },
  {
    id: 'deepswe-1.1',
    layer: 'coding',
    name: 'DeepSWE v1.1',
    priority: 'P1',
    status: 'planned',
    what: 'agentic coding',
    metrics: ['task_success', 'steps', 'retries']
  },

  // ---- Browser ----
  {
    id: 'webarena-verified',
    layer: 'browser',
    name: 'WebArena-Verified',
    priority: 'P0',
    status: 'planned',
    what: 'browser navigation, forms, websites (environment terkontrol)',
    metrics: ['task_success', 'browser_actions', 'time', 'policy_violations'],
    note: 'Butuh environment WebArena lokal (docker) + adapter browser:* Fase C3.'
  },
  {
    id: 'webvoyager',
    layer: 'browser',
    name: 'WebVoyager',
    priority: 'P0',
    status: 'planned',
    what: 'live-web browsing (website nyata berubah-ubah)',
    metrics: ['task_success', 'browser_actions', 'recovery_from_layout_change']
  },
  {
    id: 'workarena-pp',
    layer: 'browser',
    name: 'WorkArena++',
    priority: 'P0',
    status: 'planned',
    what: 'knowledge-worker browser workflows (compositional: planning+reasoning+memory)',
    metrics: ['task_success', 'steps', 'planning_quality', 'memory_usage']
  },
  {
    id: 'browsergym',
    layer: 'browser',
    name: 'BrowserGym suite',
    priority: 'P1',
    status: 'planned',
    what: 'unified browser-agent evaluation harness',
    metrics: ['task_success', 'browser_actions']
  },

  // ---- OS / Computer Use ----
  {
    id: 'osworld-2.0',
    layer: 'os',
    name: 'OSWorld 2.0',
    priority: 'P0',
    status: 'planned',
    what: 'desktop GUI, files, apps, cross-app workflows (long-horizon)',
    metrics: [
      'success',
      'steps',
      'time',
      'tool_calls',
      'retries',
      'failure_recovery',
      'human_intervention',
      'policy_violations'
    ],
    note: 'Pas dengan tool os-* native (xdotool) + emergency stop Ctrl+Shift+S.'
  },
  {
    id: 'osworld-offline-subsets',
    layer: 'os',
    name: 'OSWorld offline/verified subsets',
    priority: 'P0',
    status: 'planned',
    what: 'reproducible GUI regression tanpa network',
    metrics: ['task_success', 'determinism']
  },

  // ---- General Agent ----
  {
    id: 'gaia',
    layer: 'general',
    name: 'GAIA',
    priority: 'P1',
    status: 'planned',
    what: 'reasoning + tools + multimodal + web research',
    metrics: ['task_success', 'levels_1_3', 'tool_calls']
  },
  {
    id: 'tau2-bench',
    layer: 'general',
    name: 'tau2-bench',
    priority: 'P1',
    status: 'planned',
    what: 'tool use + user interaction + policy (dynamic conversation)',
    metrics: ['task_success', 'policy_compliance', 'replanning_rate']
  },

  // ---- Professional Work ----
  {
    id: 'automationbench',
    layer: 'automation',
    name: 'AutomationBench',
    priority: 'P0',
    status: 'planned',
    what: 'end-to-end professional automation (model+tools+planning+workflow)',
    metrics: ['task_success', 'end_to_end_time', 'human_intervention', 'cost']
  },
  {
    id: 'crmarena-pro',
    layer: 'automation',
    name: 'CRMArena / CRMArena-Pro',
    priority: 'P2',
    status: 'planned',
    what: 'CRM/business workflows',
    metrics: ['task_success', 'data_integrity']
  },

  // ---- MARK-specific ----
  {
    id: 'mark-eval',
    layer: 'mark',
    name: 'MARK-Eval',
    priority: 'P0',
    status: 'implemented',
    what: 'memory, planning, safety, recovery, efficiency — arsitektur, bukan model',
    runner: 'evaluation/mark-eval.mjs',
    metrics: [
      'plan_quality',
      'unnecessary_steps',
      'dead_end_rate',
      'correct_tool_selection',
      'tool_argument_accuracy',
      'tool_chain_efficiency',
      'recovery_success_rate',
      'memory_conflict_resolution',
      'temporal_memory',
      'safe_action',
      'scope_violation',
      'tokens_per_task',
      'tool_calls_per_task'
    ]
  }
]

// Core set = 5 pilar (Luna): TB 4.0, OSWorld 2.0, WebArena-Verified,
// WorkArena++, AutomationBench + MARK-Eval (milik sendiri).
export const CORE_SET = [
  'terminal-bench-4.0',
  'osworld-2.0',
  'webarena-verified',
  'workarena-pp',
  'automationbench',
  'mark-eval'
]

// Leaderboard-style summary (Luna): bukan "MARK score = 73%", tapi matrix
// per-layer dengan metadata arsitektur agar "model capability != agent
// capability" terbukti.
export function summarizeMatrix(runReports = {}) {
  const rows = BENCHMARK_MATRIX.map((b) => {
    const report = runReports[b.id] || null
    return {
      id: b.id,
      layer: b.layer,
      name: b.name,
      priority: b.priority,
      status: b.status,
      score: report?.score ?? null,
      metrics: report?.metrics ?? null
    }
  })
  return {
    schemaVersion: 1,
    kind: 'markbench-matrix',
    generatedAt: new Date().toISOString(),
    coreSet: CORE_SET,
    rows,
    meta: {
      model: 'user-configured',
      architecture: 'MARK Linux (Tauri v2 + sidecar + MMS)',
      tools: [
        'shell',
        'filesystem',
        'browser',
        'os-automation',
        'vision',
        'search',
        'memory',
        'trading-support'
      ]
    }
  }
}

// CLI: `bun evaluation/matrix.mjs` — cetak matrix + status.
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = summarizeMatrix()
  console.log('MarkBench Benchmark Matrix')
  console.log('─'.repeat(78))
  for (const r of summary.rows) {
    const score = r.score !== null ? `${(r.score * 100).toFixed(1)}%` : '-'
    console.log(
      `[${r.status === 'implemented' ? 'READY' : 'PLAN '}] ${r.name.padEnd(32)} ${r.layer.padEnd(11)} ${r.priority}  ${score}`
    )
  }
  console.log('─'.repeat(78))
  console.log(`Core set: ${summary.coreSet.join(', ')}`)
}
