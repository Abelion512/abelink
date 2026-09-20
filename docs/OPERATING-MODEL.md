# Abelink Operating Model — Hermes × Anthropic × Abelink

Dokumen operasional: engineering principles yang diadopsi (bukan salinan
mentah Hermes/Claude Code). Prinsip Anthropic: sistem sederhana dan
composable; kompleksitas ditambah hanya bila terbukti membantu.
Security adalah SATU lapisan di dalam model ini
(lihat `docs/OPERATING-SECURITY.md`), bukan dokumen terpisah yang mengambang.

Sumber primer ( diverifikasi, bukan ingatan ):

- Hermes: `/media/abelion/Wave/.hermes/hermes-agent/AGENTS.md` (narrow waist,
  prompt caching sacred), `website/docs/user-guide/features/skills.md`
  (progressive disclosure, `~/.hermes/skills/`), `tools/approval_detection.py`
  (HARDLINE_PATTERNS), `agent/tool_guardrails.py` (loop guard),
  `agent/curator.py` + `tools/skill_usage.py` (lifecycle + reuse telemetry).
- Anthropic: Building Effective Agents (`/engineering/building-effective-agents`),
  Managed Agents — brain/hands/session (`/engineering/managed-agents`),
  Context Engineering (`/engineering/effective-context-engineering-for-ai-agents`),
  Advanced Tool Use (`/engineering/advanced-tool-use`),
  Agent Skills (`/engineering/equipping-agents-for-the-real-world-with-agent-skills`),
  Long-running Harness (`/engineering/effective-harnesses-for-long-running-agents`),
  Demystifying Evals (`/engineering/demystifying-evals-for-ai-agents`).

## 1. Brain / Hands / Session separation

Anthropic Managed Agents: brain (model+harness), hands
(`execute(name, input) → string`), session (append-only log). Masing-masing
bisa mati/diganti tanpa menghilangkan yang lain; harness crash → reboot dari
`getSession(id)`.

Mapping Abelink:

```text
                    ABELINK
                      │
                ┌─────▼─────┐
                │   BRAIN   │
                │ model +   │
                │ orchestr. │
                └─────┬─────┘
                      │
             execute(tool, input)
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     Tauri/Rust     Sidecar       MCP/tools
     OS actions     browser       external
                      │
                      ▼
                tool results

        ┌──────────────────────────┐
        │      SESSION LOG         │
        │ events / trajectory /    │
        │ checkpoints / artifacts  │
        └──────────────────────────┘
```

Kontrak yang ditegakkan:

- Hands boleh mati/diganti (sidecar restart, extension reconnect) tanpa
  kehilangan session — session hidup di Dexie + harness log, bukan di memori
  proses (`src/api/db.js`, `src/api/trajectory.js`).
- Brain boleh ganti model (multi-provider routing) tanpa mengubah hands —
  kontrak tool tetap (`src/api/tools/`, `sidecar/engine/registry.mjs`).
- Kredensial tidak pernah masuk sandbox/konteks model (prinsip vault
  Anthropic): token bridge di file 0600 + native host, bukan di prompt
  (`sidecar/main/browser/bridge-core.mjs`, `extension/native-host/`).

## 2. Context engineering + memory routing

Anthropic: just-in-time context — lightweight references (path, query, link)
di-load saat diperlukan, bukan semuanya di awal. Progressive disclosure
berlapis. Long-horizon: compaction + structured note-taking + sub-agent.

Mapping Abelink (sudah ada, tinggal dijadikan subsystem eksplisit):

```text
Memory Router
   ├─ session state        (chatTurns, Dexie sessions)
   ├─ workspace context    (workspaceRag, .abelink/)
   ├─ long-term memory     (Dexie memory + Orama)
   ├─ skill                (registry 1-baris → read-skill saat relevan)
   ├─ tool definition      (group-tools → read-tools saat relevan)
   └─ external source      (browser-search rantai 9Router → google → DDG)
```

Aturan: prompt rakitan per giliran (`planning.js`) hanya bawa pointer +
ringkasan; isi penuh selalu on-demand. Fakta sesi via working-memory
(`FAKTA SESAAT`), bukan hafalan model.

## 3. Dynamic tool discovery

Anthropic: definisi tool bisa makan 134K token; solusinya tool search +
deferred loading + contoh pemakaian (bukan cuma schema). Akurasi Opus naik
49% → 74% dengan tool search.

Mapping Abelink: registry 1-baris (skills/plugins/connectors) +
`read-tools`/`read-skill` sebagai deferred loading. Evolusi:

```text
Tool Registry
      │
      ▼
Tool Search (berdasarkan tugas, 3-5 relevan)
      │
      ├── filesystem, browser, github, android, music, research
      ▼
load only relevant tools
```

Prinsip: jangan inject 50 definisi tool untuk tugas yang butuh 3.

## 4. Skills sebagai procedural memory

Hermes: `Memory = what`, `Skill = how`. Skill = folder `SKILL.md` + skrip +
referensi, progressive disclosure 3 lapis, lifecycle
active/stale/archived + telemetry reuse (`use_count`,
`reuse_after_patch`), prune deterministik 14/30 hari, arsip bukan hapus.
Anthropic: Agent Skills sebagai standar portable (`agentskills.io`),
folder instruksi + skrip + resource yang ditemukan lalu di-load sesuai
kebutuhan; skill yang baik lahir dari evaluasi kegagalan agen.

Mapping Abelink:

```text
learnedSkills
     │
     ├── metadata (name, description, state, use_count)
     ├── trigger (kapan relevan — deskripsi 1-baris)
     ├── SKILL.md (content penuh, via read-skill)
     ├── references/ (menyusul)
     └── scripts/ (menyusul)
```

Aturan main (diadopsi):

- Skill baru lahir `trial`; aktif bila reuse > 0 atau lolos eval mini;
  kedaluwarsa 7 hari tanpa reuse → arsip (`db.js`
  `graduateTrialSkill`, `archiveStaleLearnedSkills`).
- Klaim "test hijau" wajib artefak vitest mentah (anti reward-hack DGM).
- Telemetri reuse (`bumpLearnedSkillUse` tiap read-skill sukses) adalah
  metrik "RSI bekerja atau tidak".

## 5. Long-horizon handoff

Anthropic: compaction saja tidak cukup; tiap sesi tinggalkan artefak jelas
(feature list JSON, progress file, git commit) agar sesi berikut tidak
menebak. Initializer menyiapkan; coding agent maju inkremental + verifikasi
end-to-end seperti user manusia.

Mapping Abelink (durable task + kontrak handoff):

```json
{
  "objective": "...",
  "done": [],
  "remaining": [],
  "blocked": [],
  "artifacts": [],
  "verified": [],
  "next_action": "...",
  "constraints": [],
  "last_failure": null
}
```

Aturan: sesi tidak pernah berakhir dengan "kira-kira selesai"; ada handoff
atau jujur blocked. `/goal` = kontrak misi (kriteria DONE + bukti per
langkah + snapshot-first + stop-loop konten kosong + floor budget 48).

## 6. Eval-driven development

Anthropic: eval sebagai loop inti (feature → eval → implement → run →
inspect trajectory → fix → regression). Task + trials + graders (code,
model, human) + transcript. Capability eval (pass rendah, hill to climb)
vs regression eval (~100%).

Mapping Abelink: AbelinkBench sudah ada (`evaluation/`: multi-run,
verifier deterministik, trajectory, anti-cheat, perbandingan regresi).
Yang ditegakkan:

```text
AbelinkBench
    │
    ├── outcome, trajectory, tool selection
    ├── context selection, recovery
    ├── verification, efficiency, termination
```

Manfaat: bedakan "model gagal" vs "tool routing salah" vs "verifier
salah". Setiap paket fitur: tambah/ubah eval dulu, hijau, baru merge
(`scripts/verify.sh`).

## 7. Evaluator-optimizer loop

Anthropic: satu proses generate, satu evaluasi + feedback, loop. Abelink:

```text
Planner → Executor → Result → Verifier/Critic → pass ? finish : replan
```

Sudah ada (`agentDecision` + `objectiveVerifier` + verification gate +
`taskOutcome`). Pertahankan: `answer !== completion`; klaim selesai tanpa
bukti = gagal verifikasi.

## 8. Explicit agent contract

```text
MODEL:        "I believe task is complete."
SYSTEM:       "Show me evidence."
TOOL/ENV:     actual state
VERIFIER:     verified / partial / failed / unavailable
ORCHESTRATOR: stop / continue / replan
```

## 9. Orchestrator memilih tingkat kompleksitas

```text
simple query   → single model call
tool task      → single agent loop
complex task   → planner + tools
large task     → orchestrator + workers
long-running   → durable task + multiple sessions
```

Jangan kerahkan planner + subagents + RAG + verifier untuk "jam berapa?".

## 10. Brain ganti model, hands tetap

```text
AgentRuntime
   ├── ModelAdapter, ToolAdapter, SessionAdapter
   ├── MemoryAdapter, VerifierAdapter
```

Local Qwen / Claude / Gemini / GPT / DeepSeek / model masa depan masuk
layer brain tanpa merusak execution. Sudah cocok dengan multi-provider
routing Abelink.

## Peta adopsi ringkas

| Area        | Hermes             | Anthropic              | Abelink         | Arah                   |
| ----------- | ------------------ | ---------------------- | --------------- | ---------------------- |
| Tool system | Toolsets           | Tool search / examples | Tool groups     | Dynamic discovery      |
| Memory      | Persistent memory  | Context engineering    | Dexie + Orama   | Memory router          |
| Skills      | Procedural memory  | Agent Skills           | learnedSkills   | Progressive disclosure |
| Sessions    | session search     | Long-running harness   | Durable tasks   | Explicit handoff       |
| Agents      | Delegation         | Orchestrator-workers   | Sub-agents      | Dependency-aware       |
| Verify      | task execution     | evals + env truth      | objectiveVerify | Trajectory-level       |
| Eval        | practical tests    | eval-driven dev        | AbelinkBench    | First-class CI         |
| Runtime     | provider agnostic  | brain/hands split      | multi-provider  | Stable interfaces      |
| Context     | bounded memory     | JIT context            | compaction+RAG  | Selective loading      |
| Extensibility | plugins/skills   | Skills/MCP             | plugins/MCP     | Keep core thin         |

Prioritas: (1) Brain/Hands/Session, (2) memory routing, (3) dynamic
discovery, (4) procedural skills, (5) handoff, (6) eval-driven, (7)
verification, (8) model-agnostic contracts. Sebagian besar sudah ada di
repo — kerja berikutnya menghubungkan, bukan menambah subsystem.
