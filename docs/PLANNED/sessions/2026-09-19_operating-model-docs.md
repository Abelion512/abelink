# Session Log: operating model docs (Hermes × Anthropic × Abelink)

Tanggal: 2026-09-19 | Branch: `docs/hermes-anthropic-operating-model`

## Sumber ( diverifikasi, bukan ingatan )
- Hermes lokal: AGENTS.md (narrow waist, cache sacred), skills.md
  (progressive disclosure, ~/.hermes/skills), approval_detection.py
  (1482 baris, HARDLINE_PATTERNS), tool_guardrails.py (632 baris,
  loop guard saja — koreksi asumsi), curator.py + skill_usage.py
  (lifecycle + reuse_after_patch).
- Anthropic (6 halaman, fetch penuh): managed-agents (brain/hands/
  session, Apr 2026), context-engineering (JIT, Sep 2025), advanced-
  tool-use (tool search/programmatic/examples, Nov 2025), agent-skills
  (progressive disclosure, Okt 2025), harnesses (initializer + coding
  agent, Nov 2025), evals (task/trial/grader/transcript, Jan 2026).

## Dokumen ditulis (4)
- `docs/OPERATING-MODEL.md` — 10 area + peta adopsi + prioritas.
- `docs/OPERATING-SECURITY.md` — security sebagai SATU lapisan
  (guardian 3-tier, approval native, watchdog, loop caps, vault,
  anti-hack).
- `docs/OPERATING-DECISIONS.md` — 9 ADR (termasuk D7 CDP ditunda, D9
  identifier).
- `docs/OPERATING-ADOPTION.md` — status hijau/kuning/merah + 10 backlog.

## Prinsip penulisan
- Adopsi principles, bukan salinan mentah (runtime beda).
- Tiap klaim pola menunjuk file Hermes/Anthropic + file Abelink.
- Yang ditolak dicatat dengan alasan (bagian merah).
