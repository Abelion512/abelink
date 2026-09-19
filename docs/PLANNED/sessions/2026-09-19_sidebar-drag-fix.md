# Session 2026-09-19 — Sidebar tak bisa diklik + perubahan tak terlihat

## Temuan

1. Drag strip transparan (AbelinkHome h-14 z-30 full-width) menutupi tombol
   sidebar (z-30 setara) → klik = drag window. Fix: sidebar + tombol expand
   naik ke z-40 + `WebkitAppRegion: 'no-drag'` eksplisit.
2. Sidebar default collapse bila flag lama '1' → user hanya lihat tombol kecil.
   Fix: abaikan flag lama sekali (seen-v2), default terbuka.
3. Semua wiring UI terverifikasi ada: AppSidebar, BootScreen+MotionConfig,
   AppleHello, MobiusLoader, ToolCallsSection, TocMinimap, UsageHeatmap,
   DotGridSpotlight, ElasticSlider. Lint 0 errors, vite build sukses.
4. findMessageIndex sudah diimpor (fix error console kemarin).
5. Dev server jalan dari direktori benar; HMR di-touch ulang.

## Aksi user

Restart `bun run app` (atau reload window dev). Sidebar harus langsung
terlihat di kiri. Bila masih tombol kecil saja, berarti localStorage
COLLAPSE_KEY sudah seen-v2 + '1' → klik tombol / Ctrl+B.
