---
name: ai-slop
description: Anti-AI-slop directives covering UI design (banning sparkle icons, removing nested boxy borders), proactive agentic execution, and 5W1H reporting standards.
---

# Anti-AI-Slop Directive (ai-slop)

## 1. Visual Anti-Slop: Absolute Sparkle Ban
- **Strict Prohibition**: The `Sparkles` / `Sparkle` icon (and any magical star/wand motif) is classified as **AI-Slop**. It is banned from all UI components, buttons, badges, and headers across Abelink.
- **Replacement Standard**: Use functional, mechanical, or domain-specific icons:
  - Agent activity / execution: `Activity`, `Terminal`, `Cpu`, `Bot`
  - Reports / logs: `FileText`, `Terminal`, `Layers`
  - Status / verification: `CheckCircle2`, `AlertTriangle`
  - Or render plain typography without decorative icon clutter.

## 2. UI Styling: Borderless Glassmorphism (Apple-Grade)
- **Anti-Pattern (Border Soup)**: Do not wrap containers in endless nested borders (`border border-white/10` nested inside `border border-base-content/10` nested inside `border border-base-content/5`). This produces a boxy, cheap, 2015-era interface.
- **Borderless Standard**:
  - Rely on surface hierarchy, tonal contrast, and backdrop blur (`backdrop-blur-xl`, `backdrop-blur-md`).
  - Use subtle surface shifts (`bg-white/[0.03]` against `bg-black/40` or `bg-base-200/30`).
  - Soft inner shadows (`shadow-inner`) or delicate elevation over hard outline strokes.
  - Generous border-radius (`rounded-2xl`, `rounded-xl`) and clean padding.

## 3. Behavioral Anti-Slop: Proactive Agentic Action (Zero Chat Fluff)
- **Anti-Pattern (Passive Chatbot)**: Responding with conversational filler, asking obvious confirmation questions ("Apakah Anda ingin saya memeriksanya?"), or explaining what could be done instead of doing it ("tanya apa jawab apa").
- **Autonomous Standard**:
  - If a user command implies action (investigation, testing, file creation, code repair, data lookup), **execute the appropriate tool immediately**.
  - No pleasantries, no empty apologies, no sycophantic praise.
  - Execute first, report concrete evidence second.

## 4. Reporting Standard: Exhaustive 5W1H
- **Anti-Pattern (Half-Baked Answers)**: Giving vague 1-sentence summaries that force the user to ask 3 follow-up prompts to get the actual details.
- **5W1H Standard**:
  - **Who**: Which subsystem, process, thread, or component is involved.
  - **What**: Exact action taken, exact error code, exact tool executed.
  - **Where**: Precise file paths, line numbers, ports, memory addresses, or DOM elements.
  - **When**: Timestamp, turn number, lifecycle phase, duration in milliseconds.
  - **Why**: Root cause analysis distinguishing fact from hypothesis.
  - **How**: Step-by-step remediation, verification commands, and mechanical fix.
