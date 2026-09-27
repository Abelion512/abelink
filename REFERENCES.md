# REFERENCES — Wajib Baca Sebelum Edit (DO NOT DELETE)

> File ini TIDAK BOLEH dihapus. Agent (manusia/AI) yang mau **mengedit kode
> WAJIB** membaca file ini + `AGENTS.md` + `package.json` sebelum menyentuh
> apa pun. Read-only yang tidak butuh konteks boleh skip.
>
> Aturan pakai: **ATM (Amati, Tiru, Modifikasi)** — contekan pola, bukan
> vendor massal. Contek pola yang lolos filter privacy-first (tanpa cloud
> wajib, tanpa telemetry). Klaim fakta dari riset tunduk pada aturan
> sitasi di bawah — URL karangan = halusinasi.

## 1. Tabel sinkron (sumber → domain → status)

| Sumber | Domain | Ambil apa untuk Abelink | Kapan dimuat | Status |
|---|---|---|---|---|
| [hermes-agent](https://github.com/NousResearch/hermes-agent) | CLI engine, skills, memory, guardian | `agentRunner` murni + choke point hooks, skill lifecycle + reuse telemetry, guardian 3-tier | Fase engine/CLI/skills/guardian | applied |
| [Anthropic engineering](https://www.anthropic.com/engineering) + [docs](https://platform.openai.com/docs) | Praktik agent production | Context engineering, brain/hands/session, eval-driven dev, citations + character-offset grounding | Berkelanjutan | applied |
| [OpenAI Cookbook](https://cookbook.openai.com/) | Pola implementasi agent | Tool-use, structured output, tracing, browser/computer use | Fase planner/capabilities | unused |
| Moonshot (Kimi/kimi.moonshot.cn) | Model + metodologi eval | Multi-run averaging ala Terminal-Bench, perilaku model Moonshot via `planning.js` | Fase benchmark/model | unused |
| Gemini (Google) | Model + web RPC | Gemini Web RPC engine (`sidecar/main/services/gemini-web.js`), perilaku model Gemini | Berkelanjutan | applied |
| Qwen (Alibaba) | Model lokal | Kandidat LLM lokal via LM Studio / OpenAI-compatible endpoint | Fase model lokal | unused |
| jev-ai / typesense | TBD — konfirmasi owner | TBD | TBD | unused |
| artificialanalysis | TBD — konfirmasi owner | Benchmark model pembanding (bukan klaim tanpa run) | Fase benchmark | unused |
| [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | Arsitektur agent terbuka | Pola orkestrasi yang lolos filter privacy-first | Fase arsitektur | unused |
| opencode | Coding-agent / delegasi coding | Workflow coding + TUI; BUKAN diduplikasi di runtime Abelink (boundary: Abelink = orkestrasi umum) | Fase TUI/coding-delegation | unused |
| [build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) | Build-from-scratch | Hanya bila ATM tak cukup dan owner setujui bangun dari nol | Kasus-per-kasus | unused |
| Basis warisan (diarsipkan) | SEJARAH | Basis fondasi awal; identitas aktif sudah Abelink milik Abelion Group | Arsip — jangan jadikan acuan pola baru | archived |

`TBD` = belum terkonfirmasi, jangan karang URL. Update baris + status di PR
yang sama saat sebuah sumber mulai dipakai.

## 2. Aturan sitasi riset (anti-halusinasi, mengikat)

Setiap klaim faktual hasil riset agent WAJIB ketiganya, tanpa kecuali:

1. **URL visitable manusia** — dibuka di browser = ketemu. Tanpa URL = bukan bukti.
2. **Verbatim quote** — kutipan eksak yang cocok dengan isi URL tersebut.
3. **Passage ID `[P-X]`** — terikat ke URL + quote di atas.

Fail-closed: sitasi tanpa URL, URL mati, atau quote tak cocok = klaim
**ditolak**; agent jujur "sumber tak terverifikasi", bukan karang pengganti.
Mengarang URL/kutipan/passage = pelanggaran kontrak
(`docs/AGENT_CONTRIBUTION_GUIDELINES.md` §6).

## 3. Kaitan

- Peta lama per-fase: `docs/REFERENCE-LIBRARY.md` (load-when-needed, kolom status).
- Data utama anti over-engineering: `docs/abelink-5w1h.html` (FROZEN).
- Kontrak runtime: `AGENTS.md`. Indeks dokumen: `docs/README.md`.
