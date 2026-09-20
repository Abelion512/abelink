# Abelink Runtime Standards Adaptation

Date: 2026-09-21

## Principle

Abelink should **adopt proven engineering standards without importing foreign architectures wholesale**.

Many current Abelink components were created from scratch. The goal is therefore not "rewrite Abelink to look like Anthropic/OpenAI/Hermes/Kimi/etc." The goal is:

> preserve working local components, identify the invariant/interface they should satisfy, then adapt the implementation where the current behavior diverges from the stronger standard.

This is a compatibility/adaptation strategy, not a vendor lock-in strategy.

## Four adoption modes

| Mode | Meaning | Example |
| --- | --- | --- |
| Adopt | Existing implementation already matches the required invariant | Rust approval boundary remains outside model authority |
| Adapt | Keep the component but change its contract/representation | Browser observation -> semantic-first, task-relevant controls |
| Wrap | Keep local implementation and add a thin compatibility/evidence boundary | Existing tool results -> normalized evidence record |
| Replace | Remove a local implementation only when measurement shows it is materially inferior and replacement reduces complexity | Future candidate only; not assumed |

Default mode is **Adapt**, then **Wrap**. Replace is exceptional.

## Reference -> Abelink mapping

### Anthropic

Use for:
- context engineering
- tool/context selection
- long-running agent context management
- progressive disclosure patterns

Do not:
- copy Claude-specific runtime internals
- assume prompt changes alone solve runtime failures

Abelink adaptation:
- preserve existing planner/context compaction;
- improve evidence/state selection around the existing context path;
- measure whether semantic-first observations reduce context noise.

### OpenAI

Use for:
- agent tool boundaries
- tracing/observability concepts
- eval separation
- long-running task patterns
- structured tool/result interfaces

Do not:
- add an OpenAI SDK dependency just to reproduce architecture patterns.

Abelink adaptation:
- instrument existing tool execution and trajectory boundaries;
- record exact model/provider/version;
- keep the existing provider abstraction.

### Hermes Agent / Nous Research

Use for:
- skill progressive disclosure
- memory/skill separation
- practical autonomous CLI patterns
- tool/delegation boundaries

Do not:
- turn Abelink into a second Hermes coding agent.

Abelink adaptation:
- preserve the existing skills and memory stores;
- improve trajectory-derived learning evidence;
- delegate coding-agent execution to Opencode/Hermes where appropriate.

### NVIDIA AVO

Use for:
- propose -> execute -> observe -> evaluate -> revise
- iterative search/recovery pattern

Do not:
- add a second universal AVO loop.

Abelink adaptation:
- reuse existing ReAct/planner/supervisor ownership;
- add missing progress/evidence signals around the loop.

### UI-TARS / GUI-agent research

Use for:
- action grounding
- semantic UI representation
- visual/text/action separation

Do not:
- replace the Abelink browser extension with a separate GUI-agent stack without measurement.

Abelink adaptation:
- preserve the extension bridge and browser session model;
- prioritize page identity, semantic text, relevant state, and task-relevant controls;
- request screenshots only when text/DOM is insufficient.

### DeepSeek / Kimi / Qwen / Grok / other frontier models

Use for:
- model capability trends
- tool-use patterns
- public benchmark methodology
- stress-test ideas

Do not:
- encode vendor-specific model behavior as an Abelink runtime invariant;
- copy vendor benchmark numbers as Abelink results.

Abelink adaptation:
- keep model identity as an experimental variable;
- test compatibility using fixed fixtures and deterministic oracles;
- record exact resolved model identifiers.

### Tesla autonomy analogy

Use only for:
- fleet/data -> evaluation -> feedback-loop thinking
- importance of continuous measurement and failure data

Do not:
- treat the analogy as direct software-agent architecture evidence.

## What this means for PR #45

PR #45 should remain focused on its local runtime changes:

- autonomy contract
- progress evaluation
- trajectory learning evidence
- semantic-first browser observation

Those are adaptations of broader patterns, not copies.

PR #45 should not absorb:
- a new universal agent loop
- a new model SDK
- a replacement planner
- a replacement memory system
- a replacement browser stack
- a second benchmark framework

## What this means for PR #46

PR #46 should measure whether the adapted contracts actually improve Abelink.

The test question is:

> Does the existing Abelink implementation become more reliable after adapting it to the relevant standard?

Not:

> Can Abelink look architecturally similar to another agent?

Required evidence:
- baseline vs candidate
- task-level world-state verification
- evidence provenance
- recovery behavior
- efficiency/latency
- regression visibility
- cross-model compatibility where useful

## Customization rules

1. **Preserve local invariants first.** Do not break Rust approval, watchdog, workspace containment, provider abstraction, or existing verifier ownership merely to match an external architecture.
2. **Prefer thin boundaries.** Introduce an adapter/normalizer before adding a new subsystem.
3. **Reuse existing data.** Existing trajectory, tool-result, benchmark, memory, and skill stores are inputs; do not create parallel stores without a measured need.
4. **Separate semantics from implementation.** A standard may require an invariant without requiring the same code structure.
5. **Measure before replacement.** A scratch-built component can remain if it meets the contract and performs adequately.
6. **Keep provider-neutral runtime contracts.** Model differences are experimental variables, not hardcoded architecture rules.
7. **No architecture prestige.** A component is not valuable because Anthropic, OpenAI, Kimi, DeepSeek, or anyone else uses a similar idea. It is valuable when it improves measured behavior or preserves an important invariant.

## Decision record

As of 2026-09-21:

- Abelink is treated as a **locally engineered runtime with standards-aligned contracts**.
- External systems are references for invariants, interfaces, evaluation methods, and failure modes.
- Existing from-scratch implementations are not presumed wrong.
- Divergence from a reference is acceptable when the local contract is explicit and benchmark evidence supports it.
- PR #46 is the measurement gate for deciding which adaptations are actually worth keeping.
