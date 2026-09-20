# Master Blueprint: Autonomous Worktree Engine & Unified Peer Gateway

**Status:** Approved via `/grill-me` (2026-09-17)  
**Tujuan:** Menjawab 9 pilar arsitektur Abelink (revisi aman, modularitas, flow konsisten, UI rapi, kemudahan pakai personal, perubahan terukur, ketahanan sistem, auto-worktree dev/prod, dan kolaborasi agent-to-agent via terminal PTY & web frontier).

---

## 1. Fondasi Universal: Git-Aware Auto-Worktree Engine

### Problem Statement
Saat agen AI (Abelink, sub-agent, atau terminal peer) melakukan refaktor atau coding, mutasi langsung pada branch aktif atau folder proyek berisiko merusak state dev/prod, menyebabkan merge collision, atau membuat build gagal di tengah jalan.

### Solusi Teknis
Setiap kali ada agen yang menyentuh kode proyek:
1. **Pendeteksian Otomatis:** Sistem mendeteksi target proyek adalah git repository.
2. **Isolasi Worktree:** Abelink secara otomatis membuat git worktree terisolasi di `.abelink/worktrees/<task-or-agent-id>`.
3. **Workspace Re-pointing:** Tool filesystem agen (`fs_read_file`, `fs_write_file`, `fs_list_dir`, `fs_grep_search`, command runner) diarahkan ke direktori worktree tersebut, bukan root proyek.
4. **Zero Main Pollution:** Branch `main` dan proses dev server utama tidak pernah tersentuh sampai seluruh verifikasi lulus.

---

## 2. Autonomous Worktree Quality Gate

### Siklus Verifikasi & Perubahan Terukur
Saat agen menyelesaikan tugas di worktree:
1. **Lokal Test & Lint Execution:** Runner otomatis menjalankan `bunx vitest run` dan `bun run lint` di dalam worktree tersebut.
2. **Self-Healing Retry Loop:** Bila terjadi kegagalan (test merah / syntax error / lint error), pesan error diumpankan kembali ke agen dengan batas maksimal 3 putaran perbaikan mandiri.
3. **Diff & Metric Impact Card:** Bila seluruh test hijau, sistem menghitung metrik perubahan:
   - Delta unit test (+N passing).
   - Delta latensi perf (via `perf-gate`).
   - Line diff (+insertions, -deletions).
4. **Atomic Fast-Forward / Squash Merge:** Setelah verifikasi lolos, perubahan di-merge ke branch target, dan worktree dibersihkan secara otomatis.

---

## 3. Unified Peer Gateway: Kolaborasi Agent-to-Agent

Abelink bertindak sebagai koordinator utama (Mission Control) yang dapat memimpin dan berdiskusi langsung dengan dua kelas agen eksternal:

### A. Local Terminal Engineers (OpenCode, Hermes)
- **Konektor:** PTY Subprocess Bridge (`src-tauri` / sidecar channel `peer:terminal`).
- **Antarmuka Pengguna:** Panel terminal `xterm.js` tersemat di UI untuk pemantauan real-time atau intervensi langsung oleh user.
- **Intercom Discussion Bus:** Percakapan teknis antara Abelink dan OpenCode/Hermes diparsing dan dirangkum ke dalam kartu diskusi Intercom, sehingga instruksi dan kesepakatan arsitektur tercatat transparan.

### B. Web Frontier Brainstorm Peers (ChatGPT, Claude.ai, DeepSeek)
- **Konektor:** Autonomous Browser Tab Bridge memanfaatkan browser extension Abelink yang sudah terpasang.
- **Alur Kerja:**
  1. Abelink membuka tab pinned atau menggunakan tab aktif untuk `chatgpt.com`, `claude.ai`, atau `chat.deepseek.com`.
  2. Menyuntikkan prompt diskusi atau pertanyaan arsitektur ke textarea chat web frontier.
  3. Mengamati streaming respons DOM hingga tanda selesai (done signal) terdeteksi.
  4. Menyaring hasil pemikiran model frontier dan memasukkannya langsung ke dalam sesi diskusi Abelink.

---

## 4. UI/UX: Apple-Style Unified Command Cockpit

*Catatan: Implementasi visual dipisahkan ke sesi deep-focus khusus di worktree `feat/apple-design`.*

### Spesifikasi Layout 3-Zona
- **Zona Kiri:** Chat & Intent (percakapan utama, perintah suara, persona Abelink).
- **Zona Tengah:** Interactive Workspace (live code viewer, worktree diff card, status quality gate).
- **Zona Kanan:** Mission Control & Peer Agents (subagents aktif, terminal peers OpenCode/Hermes, web frontier tabs).
- **Floating Status Dock:** Menampilkan metrik memori, status git worktrees aktif, dan koneksi engine.

---

## 5. Roadmap Implementasi Bertahap

```mermaid
graph TD
    Fase1[Fase 1: Auto-Worktree Engine & Quality Gate] --> Fase2[Fase 2: Unified Peer Gateway]
    Fase2 --> Fase3[Fase 3: Apple Cockpit UI Integration]
    
    subgraph "Fase 1 (Fondasi & Keamanan)"
        W1[Git-Aware Worktree Manager]
        W2[Workspace Redirection Hook]
        W3[Auto Quality Gate & Retry Loop]
    end
    
    subgraph "Fase 2 (Agent-to-Agent)"
        P1[Terminal PTY Bridge OpenCode/Hermes]
        P2[Embedded xterm.js Viewport]
        P3[Web Frontier Tab Bridge ChatGPT/Claude]
    end
    
    subgraph "Fase 3 (Visual & Ergonomi)"
        U1[Unified 3-Zone Cockpit]
        U2[Diff & Metric Impact Card UI]
        U3[Deep Focus feat/apple-design]
    end
```

### Urutan Eksekusi:
1. **Fase 1 (Next Up):** Implementasi `sidecar/engine/channels/worktree.mjs` + hooks workspace redirection + quality gate auto-test.
2. **Fase 2:** Implementasi PTY terminal bridge untuk agen lokal dan DOM injector untuk web frontier peers.
3. **Fase 3:** Sinkronisasi dan perakitan antarmuka di worktree `feat/apple-design`.
