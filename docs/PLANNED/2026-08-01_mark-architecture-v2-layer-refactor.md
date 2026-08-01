# Mark Architecture v2 — Layer Refactor Plan

**Tanggal**: 2026-08-01
**Status**: PLANNED
**Target**: Mark Agent (Electron) — perbaikan workflow agentic berdasarkan referensi Anthropic/Claude 5-gen + Kimi + Hermes + Loop Engineering.

## Masalah Terdiagnosa (dari log 2026-08-01)

| # | Problem | Bukti Log | Dampak |
|---|---------|-----------|--------|
| 1 | System prompt bloat 15K+ token dikirim tiap turn | `Prompt: ~67769 tokens` | `finish: length` (truncated) 11x beruntun → infinite retry |
| 2 | No context compaction | Messages 16→52, token 11K→62K | Context rot, latensi naik, biaya naik |
| 3 | No stop condition | TikTok scrape 20+ retry gagal | Token burn tanpa progress |
| 4 | Tool silent failure | `run-cli` gagal → coba `run-shell` → format salah | Loop tak produktif |
| 5 | Monolithic orchestrator | Mark sendiri debug TikTokApi/Playwright/stealth | Context kotor, fokus hilang |

## Prinsip Desain (YAGNI)

1. **Simplest thing that works** (Anthropic) — workflow dulu, agent loop hanya jika perlu.
2. **Gather → Act → Verify → Repeat** (Claude Agent SDK) — desain siklus, bukan prompt.
3. **Context = finite resource** (Context Engineering) — smallest high-signal token set per turn.
4. **Stopping conditions** (Harness) — retry bound, token budget, no-progress detector.
5. **Start single-agent, evolve** (Kimi K2.5 Agent Swarm / Anthropic Research) — sub-agent hanya untuk task berat.

## 4 Layer Arsitektur

```
L1 PROMPT   → L2 CONTEXT  → L3 HARNESS  → L4 AGENTIC
(instruksi)   (window)       (runtime)      (orchestrasi)
```

### L1: Prompt — potong 80% (Fable 5 pattern)

- `MARK_SOUL.md` (identity, bahasa, tone) — loaded sekali, cached.
- Relational traits (warmth/sarcasm/trust/energy) → parameter numerik, inject hanya saat berubah.
- Rules → pindah ke skill files, progressive disclosure (`skill_view` on demand).
- Contoh: `Persona+Rules+Emotions` ~10K token → `<2K`.

### L2: Context — 3 primitive (Claude Cookbook)

| Primitive | Trigger | Implementasi |
|-----------|---------|--------------|
| Compaction | >30K token | Summary preservasi: decisions, active_topic, mood |
| Tool-result clearing | >5 turns | Drop payload, keep `tool_use` record |
| Memory | model-driven | `~/.mark/memory/` + FTS5 (Hermes pattern) |

### L3: Harness — loop + guardrails

```
1. GATHER   — soul.md (cached) + skills aktif + context pipeline
2. ACT      — tool namespace `mark_*`, deferred tool schemas, parallel safe
3. VERIFY   — result meaningful? progress? no-progress detector (3x = abort)
4. STOP     — task done | max 15 iterasi | token budget | user interrupt
```

- Poka-yoke tools: argument validasi, error message actionable (bukan silent null).
- Tool response truncate >25K token.

### L4: Agentic — orchestrator-worker (bertahap)

- Fase 1 (sekarang): single-agent + sub-agent untuk scraping/research berat.
- Fase 2: worker pool — Terminal/File, Web/Research, Data.
- Fase 3 (jika perlu): evaluator-optimizer loop (Anthropic harness design).

## Roadmap Eksekusi

| # | Change | Layer | Effort | Priority |
|---|--------|-------|--------|----------|
| 1 | Potong system prompt 80% | L1 | 1 hari | P0 |
| 2 | Context pipeline (compaction + clearing) | L2 | 2 hari | P0 |
| 3 | Stop conditions + no-progress detector | L3 | 0.5 hari | P1 |
| 4 | Tool redesign (namespace, deferred, poka-yoke) | L3 | 1 hari | P1 |
| 5 | Sub-agent delegation | L4 | 2 hari | P2 |
| 6 | Memory system (skills + FTS5) | L2-4 | 2 hari | P2 |

**Total**: ~8 hari. Item 1+2 solve ~80% masalah.

## Referensi Utama

### Anthropic Engineering
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/engineering/harness-design-long-running-apps
- https://www.anthropic.com/engineering/managed-agents
- https://www.anthropic.com/engineering/multi-agent-research-system

### Claude 5-gen / Fable
- https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models
- https://claude.com/blog/harnessing-claudes-intelligence
- https://www.anthropic.com/research/claude-fable-5-mythos-5
- https://www.anthropic.com/news/fable-safeguards-jailbreak-framework

### Cookbook / Internals
- https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- https://github.com/anthropics/claude-cookbooks (context_engineering_tools.ipynb)
- https://github.com/jalehvesical21/claude-code-decompiled (system prompt engineering)

### Kimi / Moonshot
- https://arxiv.org/pdf/2602.02276 (K2.5 Agent Swarm + PARL)
- https://arxiv.org/html/2507.20534 (K2: Open Agentic Intelligence)
- https://github.com/MoonshotAI/Kimi-K3 (1M context, KDA)

### Hermes Agent (pattern memory)
- https://github.com/nousresearch/hermes-agent
- https://deepwiki.com/NousResearch/hermes-agent

### Loop Engineering
- https://www.aibuilderclub.com/blog/loop-engineering-anthropic-playbook
- https://chenguangliang.com/en/posts/blog186_prompt-context-harness-agentic-layers/
