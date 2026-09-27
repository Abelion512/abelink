# Session: Music Queue + Loop One/All + URL Exact-Play (2026-09-21)

## User asks (4)
1. Trajectory audit — done in plan phase: BUG A fix verified (turn-start.jsonl exists, 75 rows, but only session `1`; agentic-* sessions lack starts — namespace split follow-up), BUG B residual in browser bridge (outer success:true/inner false, out of isFailure reach), 2x verify-unavailable (sess 20/t4, 23/t5), diagnose script needs dev-path fallback.
2. URL sent but different song plays — root cause: no direct-play path (URL became a search string; played ID = search winner; mediaTools re-searched after user picked). YT vs YT Music share one ID space — hypothesis refuted.
3. Click play resumes last track — was missing (FAB toggles panel only, no persistence).
4. Queue mgmt (per-track Nx, drop, loop-all) + vague queries autoplay — was missing.

## Decisions (click-options)
- Loop-one default infinite; `one Nx` sets oneLimit (single mechanism).
- Resume: last track only (no queue persist — stale IDs).
- Vague: autoplay from memory, else ask-choice candidates (loop stays alive).
- Fan-out A+B then C (Stream A delegation failed 2x empty → self-implemented).

## Files changed (uncommitted)
- `src/hooks/agent/musicQuery.js` (+nextPlaybackStep pure + EN default 'Selected Song')
- `src/contexts/YoutubeMusicContext.jsx` (repeatMode/oneLimit/lastTrack persist via musicPlayback config key; ENDED branch; repeat-aware playTrack/enqueue; playUrl URL-ID precedence + full regex; jump() skips pending: placeholders; playPause resume-last; expose setRepeatMode/cycleRepeatMode/enqueueTrack)
- `src/components/YoutubeMusicPlayer.jsx` (Repeat/Repeat1 cycle button + badge, repeat-count badges, mode footer label, full EN strings)
- `src/hooks/agent/useAbelinkMusic.js` (Stream B: URL exact-play, 4 tools, vague policy)
- `src/api/tools/toolCatalog.js` + `group-tools.js` (music-loop/queue-add/remove/clear)
- `src/hooks/agent/plan/mediaTools.js` (picked.id direct-play)
- `tests/musicRepeat.test.mjs` (10) + `tests/musicAgentTools.test.mjs` (33)

## Verification
- Targeted: 43/43. Full: 131 files, 1389/1389. Lint: exit 0, 0 errors. Build: OK.
- Contract check: B's feature-detection now resolves to real engine APIs (no more honest-fallback messages).

## Follow-ups (not this session)
- Agentic-* turn-start namespace; browser outer/inner success; verify-unavailable x2; diagnose dev-path fallback.
- E2E manual: short track through all modes; URL paste exactness; reload resume.
