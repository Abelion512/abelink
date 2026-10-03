# DESIGN.md — WebUI Abelink (jalur web berdampingan)

Status: **keputusan owner 2026-10-03** | Mentahan: `design/abelink_ai_os_dashboard.html` (mockup statis 104KB) | Prototipe: `prototype/` (PR #133)

## 1. Keputusan: LAYAK DICOBA, dengan 3 syarat

1. **Berdampingan, bukan pengganti.** Desktop Tauri tetap default. Web = opt-in (`prototype/`). Alasan: approval gate `rfd`, token 0600, dan `os:*` tidak bisa pindah ke browser.
2. **Tanpa framework build.** Mockup = 1 file HTML + Tailwind CDN + JS inline. Tetap begitu — tidak ada Vite/npm untuk WebUI. Alasan: dep nol (terbukti di PR #133, `bun.lock` kosong), server `node:http` stdlib.
3. **Mock OUT, endpoint IN, satu per satu.** Setiap angka hardcode diganti `fetch()` ke server lokal hanya bila endpoint-nya sudah ada dan jujur. Tidak ada mock baru.

## 2. Penyesuaian mockup → design system Abelink (wajib)

Design system bawaan (`src/assets/main.css`, tema DaisyUI `abelink`): aksen **#0a84ff** (Apple blue), `depth: 0`, `noise: 0`, glassmorphism TANPA border bersarang, font Inter + JetBrains Mono, radius box 14px. Anti-AI-slop (AGENTS.md §5): tanpa Sparkles, tanpa `border-white/10` berlapis.

| Mentahan | Penyesuaian |
| --- | --- |
| Palet gold/amber (`#f5b942`-ish, blur amber) | Ganti aksen ke **#0a84ff**; gradient dusk dipertahankan tapi di-tone-down (backdrop, bukan fokus) |
| `border-white/10` bersarang (153, 317, 385, 396, …) | Hapus border bersarang → tonal contrast + `backdrop-blur-xl` + `rounded-2xl` (aturan Borderless Glassmorphism) |
| Backdrop Unsplash city (URL luar) | Ganti gradient lokal/CSS saja — WebUI lokal tidak boleh bergantung network luar (privacy-first; CSP juga akan menolak) |
| Font Inter + JetBrains Mono (Google Fonts CDN) | Pertahankan stack font, tapi self-host atau fallback sistem bila offline (offline-first) |
| Canvas stardust 20 partikel | Boleh hidup, tapi matikan bila `prefers-reduced-motion` |
| 6 halaman (home/projects/memory/studio/network/settings) | Fase 1: hidupkan **home + settings** saja (vertex: health + sesi + config). 4 halaman lain tetap tampil tapi datanya "belum tersambung" jujur, bukan angka palsu |

## 3. Peta endpoint (server `prototype/server.ts`)

| Widget mockup | Endpoint | Status |
| --- | --- | --- |
| Status server, jam | `GET /health` | ✅ ada (PR #133) |
| Daftar sesi | `GET /api/chat-readonly` | ⚠️ sintetis — labeli "contoh" sampai jembatan Dexie dispek |
| Camera preview | lokal `getUserMedia` (tanpa server) | ⚠️ wiring ada, belum E2E |
| Memory/RAG, git, telemetri, terminal, musik, cuaca | belum ada | ❌ widget tampil "belum tersambung", JANGAN angka hardcode dipertahankan sebagai fakta |
| Aksi tulis apa pun | tidak ada | ❌ DILARANG sampai approval-gate dispek (zona beku) |

## 4. Batasan jujur (non-negotiable)
- Tidak ada angka palsu: mock yang belum tersambung dilabeli, bukan dibiarkan terlihat nyata.
- Tidak ada jalur tulis (task create, command exec, config save) tanpa spek approval.
- Tidak ada koneksi keluar browser (CDN/framing luar dihapus bertahap; target akhir 100% lokal).
  Pengecualian Fase 1: Tailwind CDN (`cdn.tailwindcss.com`) BOLEH tetap — fungsional
  (tanpa build step, self-host = tulis ulang CSS manual), bukan dekoratif. Tech debt
  tercatat: lepas di Fase 2 via vendoring. Fonts + Unsplash WAJIB sudah hapus di Fase 1.
- `prototype/**` tetap di luar `include` tsconfig (asuransi: tsc single-file + eslint) sampai diputuskan naik kelas jadi kode produksi.

## 5. Referensi
- Mentahan: `design/abelink_ai_os_dashboard.html` (frozen, jangan edit langsung — salinan kerja di `prototype/webui/`).
- Design system: `src/assets/main.css` (tema `abelink` = sumber kebenaran visual).
- Arsitektur: `docs/PLANNED/2026-10-03_server-webui-prototype.md`.
- Angka: `docs/PLANNED/2026-10-03_heavy-load-measurement.md`.
