# Mark Linux — Roadmap & Arah Pengembangan

> **Branch:** linux · **Target:** v1.0.0 · **Updated:** 2026-08-30

---

## Visi

MARK Linux adalah desktop assistant native untuk Linux — ringan, offline-first, dan mengintegrasikan AI multimodal (teks, suara, kamera) langsung di desktop tanpa cloud dependency untuk operasi dasar.

---

## Fase Saat Ini: Stabilisasi (v1.0.0-alpha.x)

- [x] Tauri v2 migration (Rust backend + React 19 frontend)
- [x] Native Linux integration (tray, xdotool, window tracker, shortcuts)
- [x] Core AI: multimodal (vision, voice, RAG, memory)
- [x] Auto-profile: deteksi RAM native (/proc/meminfo) — FITUR TIDAK PERNAH
      HILANG di RAM kecil; profil hanya mengatur eager vs lazy loading
- [x] UX cleanup: simplified config, first-boot flow, keyboard nav

**Next milestone:** packaging (AppImage, .deb) + auto-update CI.

---

## Fase Berikutnya: v1.x Roadmap

### 1. Packaging & Distribusi
- AppImage + .deb builds via GitHub Actions
- Auto-update mechanism (Tauri updater plugin)
- Distribution ke AUR / PPA

### 2. Capability & Connector Ecosystem (general-pluggable)
- Capability Manager jadi poros pluggability — MARK tidak condong ke satu
  task. Referensi desain: Claude connectors/plugins/marketplace (catalog ->
  connection/scope -> action schema -> execution -> policy -> audit).
- [x] Channel `capabilities:*` (list/inspect/guide/execute/connections/
  authorize/revoke/audit) + gate approval NATIVE rfd untuk execute/
  authorize/revoke (cmd_node_bridge.rs APPROVAL_ACTIONS)
- [x] Tool group `connectors` untuk agent (connector-list/inspect/guide/
  run/status) + bridge renderer (listCapabilities, executeCapability, dst.)
- [ ] Katalog connector lebih kaya (calendar/mail/storage via google-service)
- [ ] Remote connector manifest (manifestUrl ter-validasi, verifikasi manifest)
- [ ] UI halaman Connectors (browse catalog, authorize scope, audit viewer)
- [ ] Lazy-load MCP server connections (load-when-needed) — isolated failure
  per connector (single server down ≠ app crash)

### 3. Configuration UX
- Scroll-spy + keyboard navigation di sidebar
- Search/filter settings
- Collapse sidebar di layar sempit

### 4. Documentation & Onboarding
- First-run tour yang akurat
- FAQ yang relevan dengan Linux deployment
- README quickstart aligned dengan `verify.sh`

### 5. What's New Otomatis
- Generator changelog dari conventional commits
- Multi-release modal di-app
- Unit test untuk parser generator

---

## Arsitektur

```
┌─────────────────────────────────────┐
│  React 19 + Vite 7 (Frontend)      │
│  - HashRouter (offline-safe)        │
│  - Dexie (IndexedDB)                │
│  - Transformers.js (embeddings)     │
├─────────────────────────────────────┤
│  Tauri v2 IPC (Rust backend)        │
│  - Window management                │
│  - xdotool automation               │
│  - Global shortcuts                 │
│  - System info / FS commands        │
├─────────────────────────────────────┤
│  Node.js Sidecar Engine             │
│  - AI provider routing              │
│  - RAG pipeline                     │
│  - Telegram integration             │
│  - Window tracker daemon            │
├─────────────────────────────────────┤
│  External Services (optional)       │
│  - Gemini / Groq / OpenAI           │
│  - Telegram Bot API                 │
│  - MCP Servers (lazy)               │
└─────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS (daisyUI) |
| Desktop | Tauri 2.0 (Rust) |
| AI Runtime | Node.js sidecar engine |
| AI Models | Gemini, Groq, OpenAI-compatible, LM Studio |
| Embeddings | Transformers.js (hash fallback) |
| Storage | Dexie (IndexedDB) + Postgres (optional) |
| Search | Orama / custom RAG |
| Automation | xdotool, xprintidle (Linux native) |

---

## Kontribusi

Buka issue di https://github.com/Abelion512/mark-agent-linux — branch target: `linux`.
