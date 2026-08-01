# Referensi: Perubahan Sistem Prompt AI - Diskusi MARK & Arsitektur Agent Modern

> **Sumber:** ChatGPT Share Link - https://chatgpt.com/share/6a674deb-e370-83ec-8bd1-66fa7196f83d
> **Tanggal:** 27 Juli 2026
> **Topik:** Evolusi arsitektur AI dari sistem prompt menuju Agent Runtime / Agent OS

---

## Ringkasan Eksekutif

Pergeseran fundamental di frontier lab (OpenAI, Anthropic, Google DeepMind, xAI, NVIDIA):
1. System prompt semakin pendek - model capable tanpa instruksi panjang
2. State pindah ke memory/policy engine/orchestration layer
3. LLM menjadi cognitive service - bukan pusat arsitektur
4. Agent Runtime gantikan chatbot - goal-oriented

---

## Isi Percakapan

### 1. Kenapa Frontier Lepas System Prompt Kaku

- **Brittleness**: prompt panjang mudah tergeser konteks
- **LLM lebih capable**: kemampuan sudah di training/alignment
- **Agent butuh state**: memory, planner, tool state, execution history
- **Logika bisnis**: pindah ke orchestration/middleware/router
- **Keamanan**: prompt injection / extraction attacks

### 2. Arsitektur Baru

User > Intent Parser > Planner > Memory > Router > Policy Engine > Tool Exec > LLM > Critic > Verifier > Output

LLM = satu node, bukan pusat.

### 3. MARK Positioning

| Project | Fokus |
|---------|-------|
| Claude Code | Coding Agent |
| Codex CLI | Coding + Dev |
| OpenHands | Software Engineering |
| Hermes | General Autonomous Agent |
| **MARK** | **Personal Autonomous OS (PAOS)** |

Goal Session > Chat Session:
```
Goal: Belikan SSD terbaik
  Planner: Done
  Marketplace: Running
  Review: Waiting
  Approval: Pending
```

### 4. Agent Kernel

Goal Manager, Planner, Workflow Runtime, Context Assembler, Memory Manager, Tool Bus, Model Router, Policy Engine, Approval Manager, Event Bus, Scheduler, Reflection Engine, Verifier.

LLM = Reason(), Summarize(), Plan(), Code(), Vision()

### 5. 5-Layer Memory

1. Working Memory - temporary
2. Episodic Memory - pengalaman
3. Semantic Memory - pengetahuan
4. Procedural Memory - cara
5. Relational Memory - gaya interaksi

### 6. Revisi README MARK (16 Poin)

1. Emosi > Simulated Emotion System
2. Bertindak manusia > Autonomous Agent | JARVIS benchmark
3. Personal AI Assistant > PAOS (merge)
4. Agentic Planning > Execution Graph
5. "Memikirkan strategi" > planner+reasoning+tool+verification
6. Infinite Memory > Persistent Vector Memory
7. Injection RAG > Knowledge Retrieval
8. Live Thought Process > Reasoning Trace
9. Relational Growth > Relationship Modeling
10. Awareness > guardrails + boundary
11. File Handling > permission runtime
12. Web Browsing > Goal > Browser > DOM > Verify
13. Deep Web Search > Autonomous Research
14. Plugin > Manifest > Permission > Sandbox
15. README user-facing, docs/ untuk teknis
16. Opening: PAOS berorientasi tujuan

---

## Deep Research

### AIOS: LLM Agent OS
arXiv 2403.16971 - Kernel pisahkan resource LLM dari apps, 2.1x faster

### AgentOS: NL-Driven Ecosystem
arXiv 2603.08938 - GUI > NUI, Skills-as-Modules, PKG, Semantic Firewall

### NVIDIA ToolOrchestra
arXiv 2511.21689 - Orchestrator-8B: 37.1% HLE > GPT-5 35.1%, biaya 30%

### NVIDIA AI-Q Blueprint
Two-tier: Intent > Shallow/Deep Research > Verification

### Frontier Model Forum
6 labs safety frameworks, threshold-based

### Prompt Security
2505.23817 (SPE-LLM 99% ASR), 2505.11459 (ProxyPrompt), 2509.21884 (SysVec), 2408.02416 (Prompt Leakage), 2505.06493 (Poisoning)

### Memory Research
2407.04363 (AriGraph KG+episodic), 2502.06975 (episodic 5 properti), 2502.12110 (A-Mem Zettelkasten)

---

## Evidence: Kerja Kita

**Sesi:** 20260725_101240_6535b994

**Timeline:**
- 25 Jul: Arsitektur MARK
- 27 Jul 15:40: ChatGPT frontier analysis
- 27 Jul 19:18: Revisi JARVIS benchmark + PAOS

**Referensi terverifikasi:** AIOS, AgentOS, ToolOrchestra, FMF, security papers, memory papers, GitHub Abelion512

---

## Kesimpulan

Prompt engineering > System engineering. MARK = PAOS.

3 fondasi: Memory Architecture, Goal Execution Runtime, Trust Boundary + Verification.

Moat: memory, workflow, integration, user relationship, trust.
