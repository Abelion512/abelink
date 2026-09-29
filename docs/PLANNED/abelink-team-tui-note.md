# Rencana: Abelink Team (multiagent + subagent di TUI)

> Status: DICATAT, belum dieksekusi (anti over-engineering, perintah owner 2026-09-29).
> Referensi: claude-team (multi-agent orchestration di TUI).

## Konsep
- CLI sebagai engine, TUI/GUI/gateway sebagai client (mindset owner).
- TUI tampilkan sub-agent yang berjalan (spawn, status, hasil) via engine
  yang sudah ada (agentRunner + subagent executor di sidecar).
- Tanpa bangun orkestrasi baru: expose yang sudah ada ke TUI.

## Prasyarat (belum diverifikasi)
1. Sidecar punya channel spawn/status sub-agent yang bisa dipanggil TUI.
2. Kontrak render: daftar sub-agent (id, status, task) di sidebar atau dialog.
3. Interaksi minimal: lihat hasil, hentikan bila perlu.

## Non-goal
- Sistem multi-agent baru; duplikasi logika orkestrasi di TUI.
- Eksekusi sebelum prasyarat 1 terpenuhi.
