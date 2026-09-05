# Model Capability Matrix 2026 — untuk MarkBench & prompt MARK

Sumber (dibaca 4 Sep 2026): Anthropic Fable/Mythos 5.1, OpenAI GPT-6 Astra,
Gemini 3.8 Flash (+ Cyber), GLM-5.3 / 5.3-Flash, Qwen 3.8-Max, Kimi K3,
DeepSeek V4 line. Dokumen ini menjawab: model mana yang bagaimana, dan apa
artinya untuk arsitektur MARK (tesis: **model fixed, architecture changes**).

---

## 1. Peta model per kategori (yang relevan untuk MARK)

| Kategori | Model terbaik | Skor kunci | Implikasi untuk MARK |
|---|---|---|---|
| Terminal / agentic coding | Fable 5.1 (55.8% TB 4.0; Mythos 5.1 60.9%), GLM-5.3 (open-weights terkuat), GPT-6 Astra (57.9%) | TB 4.0 | MarkBench TB 4.0 core set valid sebagai acuan; model coding `custom` endpoint (GLM/Qwen/DeepSeek open) sudah level frontier |
| Computer use | Fable 5.1: 77.9% (partial) / 41.7% (strict) OSWorld 2.0; Astra 72.6% | OSWorld 2.0 | MARK harus punya benchmark OS-control sendiri (MarkBench pilar OS) — xdotool path kita bisa diverifier deterministik |
| Workflow / automation | Fable 5.1: 31.4% AutomationBench (naik dari 17.1%) | AutomationBench | Bahkan frontier masih <35% — automation adalah area ARSITEKTUR bisa menang: recovery, retry, checkpoint (Durable Tasks) |
| Browser | Astra & Fable via WebArena/WebVoyager | — | Fase C3 extension bridge adalah prasyarat benchmark browser MARK |
| Research/long-horizon | Kimi K3 (BrowseComp 91.2, 1M ctx, open), Astra (1.05M ctx, effort `max`) | BrowseComp, HLE | Sub-agent pipeline MARK cocok: relay + wait_subagents = pola swarm; K3 open-weight bisa jadi model riset lokal |
| Cheap-fast workhorse | Gemini 3.8 Flash ($0.75/$3.75 per Mtok), GLM-5.3-Flash (DeepSWE 63.4 > Opus 4.8 58.0) | DeepSWE, harga | Target utama "model murah pintar" untuk wallet trading-support: open-weights China + Gemini Flash |
| Cyber | Gemini 3.8 Flash Cyber (Fairwind), GLM-5.3 (emergent cyber), Mythos 5.1 | CyberGym, CWE-Bench | MODEL TIDAK dipakai untuk offensive di MARK; pola safeguards yang bisa dicontek: akses berlapis (Lihat §3) |
| Vision | DeepSeek-V4-Flash-Vision-Exp, Gemini 3.8 multimodal | — | Kamera/vision MARK bisa pakai ini via custom endpoint |

## 2. Pola lintas vendor yang bisa langsung diterapkan ke MARK

1. **Effort levels (Fable 5.1, Astra, Gemini 3.8)**
   Semua vendor besar sekarang expose effort low/medium/high/max — model yang
   SAMA menghasilkan biaya beda jauh. Fable 5.1 di effort Low/Medium ≈ Fable 5
   full, dengan biaya jauh lebih murah.
   → **MARK menerapkan:** `effortLevel` (low/medium/high) di Configuration →
   Model, di-inject ke request body semua provider (`reasoning_effort` /
   `thinking.budget_tokens` / `reasoning_effort` tergantung protokol).
   Default low = hemat token untuk ReAct loop pendek; high untuk tugas berat.

2. **Cache reads menentukan biaya agentic (Anthropic)**
   Harga agentic turun 45% karena cache reads. Aplikasi dengan konteks
   stabil + append-only hemat besar.
   → MARK: prompt MARK stabil (persona/skills) di depan, observasi
   append-only di belakang — struktur prompt kita sudah cache-friendly.
   Backlog: pastikan provider `custom` Anthropic-protocol memakai cache
   control block untuk system prompt.

3. **"Works harder" sebagai desain (Gemini 3.8)**
   3.8 Flash lebih teliti karena ekstra reasoning step + iterasi tool —
   justru model kecil bisa menang kalau ARSITEKTUR mengizinkan lebih banyak
   langkah murah.
   → Ini validasi tesis MARK: no-turn-limit sub-agent + retry + verification
   steps (skill `execution-discipline`) = model kecil naik kelas.

4. **Safeguards berlapis berdasarkan domain (Mythos vs Fable, Flash Cyber Fairwind)**
   Vendor memisahkan model/akses untuk kemampuan berbahaya, dengan program
   trusted-access. Pola untuk MARK: graduated approval per family (sudah ada)
   + capability scopes (sudah ada) = versi lokal dari pola vendor.

5. **Long-running readability (Jane Street quote)**
   "Prior models became hard to follow the longer they worked; 5.1 remains
   readable over long multi-step tasks."
   → MARK: intermediate_answer + execution steps HUD (SubagentIntercom)
   menjaga readability; skill `execution-discipline` memaksa thought/answer
   terpisah. Sudah sejalan.

6. **Open-weights gap menutup (GLM-5.3, Kimi K3, Qwen, DeepSeek)**
   Model China open-weight sekarang menyamai frontier di coding/agentic.
   → MARK harus first-class di LM Studio / custom endpoint (sudah) dan
   benchmark-nya harus bisa jalan pada model lokal (MarkBench adapter sudah
   provider-agnostic via sidecar).

## 3. Pemetaan ke MarkBench (matrix existing diperbarui)

Angka referensi frontier (Sep 2026) untuk kalibrasi harapan saat full-run
dijalankan dengan model tertentu:

- TB 4.0: Fable 5.1 55.8% / Mythos 60.9% / Astra 57.9% — model `custom`
  open-weight (GLM-5.3) diklaim kompetitif.
- OSWorld 2.0: strict 36-42% di vendor terbaik → benchmark OS MARK harus
  fokus ke subset deterministik (xdotool primitives) agar bisa diverifier.
- AutomationBench: 31.4% terbaik → area terbesar untuk menang lewat
  arsitektur (recovery, checkpoints, approval UX).

Prioritas implementasi benchmark tidak berubah: TB 4.0 → OS subset →
browser (Fase C3) → MARK-Eval. Tambahan: laporkan skor **per effort level**
(low/medium/high) di report MarkBench agar perbandingan architecture-vs-model
adil.

## 4. Rekomendasi model default MARK (per use case)

| Use case | Rekomendasi | Alasan |
|---|---|---|
| Harian (chat, tool kecil) | Gemini 3.8 Flash / GLM-5.3-Flash (API murah) | Harga terendah per kualitas |
| Trading-support wallet (mandiri biaya) | GLM-5.3-Flash / Qwen 3.8-Flash open-weight via LM Studio | Biaya marginal ≈ listrik; wallet BISA mensubsidi |
| Coding berat / misi panjang | Fable 5.1 (effort high) / Kimi K3 (1M ctx) | Long-horizon terbaik |
| Riset multi-sumber | Kimi K3 / Astra (effort max) | BrowseComp & context panjang |
| Lokal 100% offline | GLM-5.3-Flash / Qwen 3.8-Flash-Next via LM Studio | Open weights, jalan di 12-24GB RAM |
