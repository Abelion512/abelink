# Abelink Agentic RAG Benchmark v1

## 0. Purpose

This benchmark measures observable Agentic RAG behavior across different model/configuration combinations. It is designed as an experimental dataset collection protocol, not as a model ranking system.

Each task is intended to test one or more of:

- retrieval quality
- iterative retrieval
- source authority
- evidence verification
- conflict handling
- uncertainty handling
- tool selection
- long-horizon research
- structured synthesis
- resistance to misleading premises

The benchmark must not require private chain-of-thought. Models should report only observable retrieval/tool actions when the interface exposes them, plus evidence and conclusions.

## 1. Global Output Contract

Every task uses the following output contract unless the task explicitly adds a requirement.

1. **Answer / verdict**: give the best-supported result.
2. **Evidence table**: map each major claim to supporting evidence and source.
3. **Retrieval/action summary**: summarize only actual observable searches, retrieval actions, or tool calls performed. Do not invent hidden actions.
4. **Conflicts / gaps**: identify disagreements, missing evidence, or unresolved uncertainty.
5. **Source list**: provide direct source references/URLs when available, prioritizing primary sources.
6. **Confidence semantics**: distinguish `verified`, `partially_supported`, and `unknown` where appropriate.
7. Do not reveal private chain-of-thought. Concise reasoning summaries are sufficient.
8. Do not fabricate citations, tool calls, source contents, versions, or telemetry.
9. If a requested tool is unavailable, continue with accessible evidence and explicitly record the limitation.
10. Do not ask the user to perform the research manually. The benchmark evaluates autonomous execution.

## 2. Benchmark Prompts

### TASK-001 | Tauri 2 Capability and Permission Grounding

**Capability:** official-document retrieval, security boundary identification, evidence mapping.

**Prompt:**

Research the current Tauri 2 documentation and determine how frontend code is allowed to invoke Rust-side commands/capabilities, and how Tauri's capability/permission model controls access to privileged functionality.

Use primary sources first. Prefer official Tauri documentation and official repository/source files over blog posts. Do not rely on a single page if the behavior spans multiple concepts.

Acceptance criteria:
- Identify the relevant official concepts and how they relate.
- Explain the boundary between frontend code, Rust commands, and capability/permission configuration.
- Include at least two primary Tauri sources when available.
- Distinguish documented guarantees from your inference.
- If the current documentation is ambiguous, state `unknown` rather than filling the gap from memory.

### TASK-002 | MCP Authentication Boundary

**Capability:** multi-source retrieval, specification reading, distinction between protocol requirements and implementation-specific behavior.

**Prompt:**

Research the current Model Context Protocol documentation/specification and determine what authentication/security behavior is required by the protocol itself versus what is optional or implementation-specific.

Focus on the boundary between the MCP protocol contract, server/client implementations, and deployment-specific authentication such as OAuth or other mechanisms.

Acceptance criteria:
- Start with the current MCP specification or official specification documentation.
- Check at least one additional official MCP source or implementation document.
- Explicitly separate normative requirements from examples, recommendations, and implementation choices.
- Identify at least one plausible but incorrect overgeneralization and explain why it is too broad.
- Cite the evidence for each major claim.

### TASK-003 | SQLite WAL and Network Filesystems

**Capability:** conflict resolution, primary-source grounding, operational risk identification.

**Prompt:**

Investigate the claim: `SQLite WAL mode is safe to use across arbitrary network filesystems.`

Do not accept the claim at face value. Find the authoritative SQLite documentation about WAL and filesystem/network constraints, then inspect relevant supporting or contradictory technical sources as needed.

Acceptance criteria:
- Determine whether the claim is universally true, conditionally true, or unsupported.
- Identify the conditions or environment boundaries that materially change the answer.
- Prioritize SQLite's own documentation.
- Report conflicting claims found in secondary sources instead of silently choosing one.
- End with a precise operational conclusion for an application developer.
- Use `unknown` for any filesystem-specific case that cannot be established from evidence.

### TASK-004 | ONNX Runtime Node on Android/Termux

**Capability:** real-world compatibility research, issue retrieval, iterative investigation.

**Prompt:**

Investigate whether `onnxruntime-node` can be used reliably in a Node.js environment running on Android through Termux.

Research official ONNX Runtime Node documentation, package/platform support information, and relevant Android/Termux issues or reports. Separate official support from community workarounds.

Acceptance criteria:
- Identify the official supported platform assumptions for `onnxruntime-node`.
- Determine whether Android/Termux is officially supported, indirectly usable, or effectively unsupported for the relevant package path.
- If issues or workarounds exist, distinguish reproducible technical evidence from anecdotal reports.
- Explain why native dependency compatibility can fail even when Node.js itself runs successfully.
- Give a final status using `verified`, `partially_supported`, or `unknown` and explain the evidence.

### TASK-005 | 1M Context Capability Verification

**Capability:** current model documentation retrieval, version discrimination, advertised versus actual surface capability.

**Prompt:**

As of the date you run this task, verify which of the currently available models/configurations you can document as supporting a 1 million token context window.

Do not infer support from model family reputation or third-party claims alone. Check current provider documentation or product documentation and distinguish:
- advertised maximum context
- API/model support
- application/UI support
- preview or experimental status
- unknown or undocumented limits

Acceptance criteria:
- Verify at least three models if accessible evidence exists.
- Record the exact model/version name from the source.
- Distinguish the model's theoretical context limit from what the specific application surface actually exposes.
- Flag stale, contradictory, or ambiguous documentation.
- Do not turn a missing limit into a guessed number.

### TASK-006 | Benchmark Score Does Not Automatically Prove AGI

**Capability:** definition grounding, benchmark-author retrieval, epistemic boundary.

**Prompt:**

Investigate the claim: `A model that achieves 100% on a single benchmark has demonstrated AGI.`

Do not answer from intuition alone. Research the benchmark's own stated purpose/limitations when a concrete benchmark is used in your evidence, and consult relevant primary or authoritative sources about what benchmark performance can and cannot establish.

Acceptance criteria:
- Separate the measurable benchmark result from the much broader AGI claim.
- Identify what evidence would still be missing before the AGI claim could be established.
- Prefer benchmark authors, official technical reports, or primary research over commentary.
- Distinguish definitions, empirical results, and interpretations.
- Do not replace the question with a generic opinion about AGI.

### TASK-007 | Latest Release and Breaking-Change Investigation

**Capability:** tool selection, repository retrieval, multi-source change impact analysis.

**Prompt:**

Choose one well-maintained open-source software project with a current public Git repository and investigate its latest stable release as of your run date.

Determine:
1. the latest stable release and release date,
2. the most important user-facing changes,
3. any breaking changes or migration requirements,
4. whether the official changelog is consistent with the release metadata,
5. whether there are open issues or official notices that materially affect upgrading.

Acceptance criteria:
- Use the project's official repository/release metadata and changelog.
- Check at least one additional authoritative project source when useful.
- Do not rely only on a search-result snippet.
- Explicitly identify any unresolved mismatch between sources.
- Make the upgrade implications concrete rather than merely summarizing the release notes.

### TASK-008 | Low-Resource Agent Execution Architecture

**Capability:** long-horizon research, multi-source synthesis, architecture reasoning.

**Prompt:**

Research how a Linux-first agent running on a laptop with about 8 GB RAM can reduce unnecessary LLM generation while still supporting web research, tool execution, memory, and verification.

Compare at least three documented architecture approaches or projects. Focus on observable architecture patterns such as deterministic procedures, skills, routing, retrieval, tool use, verification, caching, and selective model escalation.

Acceptance criteria:
- Use at least three authoritative sources across projects or technical references.
- Separate documented architecture from your own synthesis.
- Identify where deterministic execution can replace LLM generation.
- Discuss tradeoffs involving latency, token usage, reliability, and capability.
- Produce a compact architecture recommendation without claiming that one universal architecture is best for every workload.

### TASK-009 | Retrieval Strategy Evidence Review

**Capability:** research synthesis, evidence quality, retrieval-method comparison.

**Prompt:**

Research the evidence for lexical retrieval, vector retrieval, and hybrid retrieval in RAG systems.

Focus on when each retrieval strategy is likely to help, where it can fail, and what evidence supports the tradeoffs. Prefer primary research papers, official documentation, and reproducible benchmark reports.

Acceptance criteria:
- Compare all three retrieval strategies explicitly.
- Include evidence for both strengths and failure modes.
- Distinguish empirical benchmark evidence from design intuition.
- Identify cases where hybrid retrieval adds complexity without a demonstrated benefit.
- End with criteria for deciding whether a system should add hybrid retrieval, rather than assuming it is always superior.

### TASK-010 | Adversarial Evidence and Overclaim Detection

**Capability:** adversarial retrieval, disconfirmation search, source authority, uncertainty handling.

**Prompt:**

Investigate the claim: `A high benchmark score is enough evidence to conclude that an agent system is autonomous, reliable, and production-ready.`

Treat the claim as potentially misleading. Actively search for evidence that could falsify or narrow it. Look for evaluation methodology, failure rates, human intervention requirements, recovery behavior, verification design, and evidence of real-world execution.

Acceptance criteria:
- Separate benchmark score from production capability.
- Search specifically for failure evidence and limitations, not only supporting evidence.
- Identify at least three dimensions that a benchmark score alone cannot establish.
- Distinguish measured results from marketing or interpretation.
- State what additional evidence would be required for a defensible production-readiness claim.

## 3. Run Protocol

- One fresh session per task/configuration.
- Use the exact same task text for every model/configuration that runs that task.
- Do not carry chat history from another task.
- Long-horizon tasks remain in one dedicated session until completion.
- Do not manually rewrite the model response before raw export.
- Export the raw result first. Normalization happens after collection in batch.
- Record model, model version, surface, reasoning mode, web/search capability, quantization, inference engine, and other exposed configuration metadata.
- When telemetry is unavailable, use `null` or an explicit unavailable state. Never infer it from the text output.
- When a platform has no native export, a model-generated structured export may be used only as a derived artifact and must be stored separately from the raw transcript.

## 4. Interpretation Boundaries

Raw chat/export data is not automatically distillation data.

- Raw conversation or trajectory: interaction/trajectory corpus.
- Labeled cases used to measure behavior: evaluation dataset.
- Verified failures used to change Abelink code/policy/skills: system-learning data.
- Teacher-derived targets used to train a student model: distillation data.

A trajectory only becomes a distillation example when it is intentionally used as a training signal for a student model.
