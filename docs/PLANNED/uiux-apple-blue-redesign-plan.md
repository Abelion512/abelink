# UIUX Apple Blue Redesign — Plan & Status

Branch: `feat/apple-design`. Status: implemented, uncommitted, verified (lint 0 errors, build pass,
tests 888/889 — 1 flaky timing fail di `tests/capabilities.test.mjs`, passes isolated).

Keputusan: primary Apple blue (#0071e3/#0a84ff), hijau hanya status sukses; dark-only;
Orb Jarvis satu signature; menu sidebar = isi hamburger persis.

## 1. Sidebar persisten + collapse (DONE)

- `src/components/core/AppSidebar.jsx` (baru): menu sama persis FloatingMenu
  (What's New, Configuration, Sub-Agents, Knowledge, Guidebook, Memory Map,
  Relational Growth, History, Telegram Bot + dot live, footer collapse).
- Collapse `localStorage abelink:sidebar-collapsed`; floating expand 36px pill glass +
  inline SVG SidebarSimpleBoldIcon; Ctrl+B; aria-expanded/controls/testid;
  <760px drawer + X; reduced-motion OK.
- `src/App.jsx`: AppSidebar di MainLayout; konten dibungkus flex-1.
- `src/pages/AbelinkHome.jsx`: FloatingMenu dilepas; `abelink:open-history`
  listener ditambah; FloatingMenu.jsx dibiarkan (deprecated bertahap).

## 2. Green → blue + kontras (DONE)

- `src/assets/main.css`: theme `forest`→`abelink`; driver popover #1eb854→#0a84ff.
- `index.html`: data-theme abelink. `AGENTS.md`, `CONTRIBUTING.md` diperbarui.
- 16 file: aksi success→primary/info; hijau dipertahankan hanya status sukses
  (connected dots, ok logs, copied, Terhubung); teks white/30-40 → white/60+.

## 3. Tool calls Gaia (DONE)

- `src/components/core/ToolCallsSection.jsx` (baru, named): header "Used N tools"
  + stacked icons + rows expandable inputs/output; entry
  {tool_name, tool_category, message, inputs, output}; Lucide map
  (brand Github tidak ada di lucide 1.34 → GitBranch).
- ThinkingBubble / ProcessPanel / PlanningBubble memakai komponen ini;
  mapping dari shape {tool, query, status, fullResult, resultSummary} tanpa ubah pipeline.

## 4. Boot hello-effect (DONE)

- `src/components/core/AppleHello.jsx` (manual port varian English, durationScale 0.8).
- `src/components/core/BootScreen.jsx` (default): caption white/60 + recovery block.
- Deps: `motion` (tak ada `cn` — template strings).

## 5. DotGridSpotlight (DONE)

- `src/components/core/DotGridSpotlight.jsx`: canvas, DPR cap 1.5, hidden-tab guard,
  cleanup penuh; dark-only biru; dipasang di overlay sub-page App.jsx
  pointer-events-none.

## 6. ElasticSlider (DONE)

- `src/hooks/useControllableState.js` + `src/components/core/ElasticSlider.jsx`
  (rubber-band, decile snap, role=slider + keyboard, reduced-motion).
- `VoiceVideoSection.jsx` (ttsRate/ttsPitch), `GeneralSection.jsx`
  (windowOpacity, --win-alpha + syncConfig dipertahankan).

## 7. Usage heatmap lokal (DONE)

- `src/components/core/UsageHeatmap.jsx`: agregat Dexie `chatTurns.timestamp` +
  `agentTasks.createdAt`, grid SVG 365 hari, level kuartil, fill winter-blue,
  cache localStorage 24 jam, empty state.
- Section "Abelink Usage" di `RelationalGrowth.jsx`. Tanpa network, tanpa migrasi Dexie.

## 8. MobiusLoader (DONE)

- `src/components/core/MobiusLoader.jsx` (named, {size, className});
  menggantikan loading-infinity (App Suspense), dual-ring ThinkingBubble,
  test-voice spinner; reduced-motion statis.

## 9. TOC minimap ChatStudio (DONE)

- `src/components/core/TocMinimap.jsx` (`TocMinimap` + `toMinimapAnchorId`);
  anchor `msg-<id>` di ChatList rows; items dari currentDisplayMessages
  (user depth 2, assistant depth 3, 60 char); observer + smooth scroll +
  reduced-motion fallback.

## Verifikasi

- `bun run lint`: 0 errors (971 warnings = baseline repo).
- `bun run build`: pass (2m49s).
- `bun run test`: 888/889; 1 fail flaky `capabilities.test.mjs` shell-tool timing —
  passes isolated (24/24) dengan dan tanpa perubahan → unrelated.
- Tidak ada dep selain `motion` + `date-fns` (bun add).

## Tindak lanjut (PR ke main)

- Screenshot tiap item; hapus FloatingMenu.jsx bila sidebar stabil;
  pertimbangkan store Dexie persisten untuk usage bila agregat melambat.
