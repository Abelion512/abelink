# Architecture Learnings — dari Anthropic Research ke MARK

Sumber: [anthropic.com/research](https://www.anthropic.com/research) — dibaca tuntas
(3 Sep 2026). Dokumen ini memetakan temuan riset Anthropic yang bisa diterapkan ke
arsitektur MARK, sesuai tesis owner: **model fixed, architecture changes**.
Setiap poin mencantumkan status implementasinya.

---

## 1. Patterns and Problems in Emerging Multiagent Systems (Frontier Red Team, 13 Agu 2026)

Studi eksperimen swarm Claude: koordinasi, collusion, dan sabotase antar agen.
Temuan dan terjemahannya ke MARK:

### 1a. Low variance / conformity failure
- **Temuan:** agen yang identik (model + scaffolding sama) mengambil keputusan
  yang sama di situasi yang sama — 18/30 agen memilih nama branch yang persis
  sama, semua agen flooding polling daemon yang sama (2.4M request, 117 job).
  Kegagalan individu = kegagalan sistemik.
- **Terapan MARK:** spawn sub-agent dengan goal yang eksplisit BERBEDA per
  sudut pandang; laporan yang identik diperlakukan sebagai satu sumber;
  konsensus antar agen serumpun bukan bukti.
- **Status: DONE** — protokol anti-konformitas di `planning.js` (LEAD QA
  section) + disiplin epistemik di `subagentPrompt.js`.

### 1b. Epistemic failures (trust calibration)
- **Temuan:** agen tidak punya pertahanan terhadap sumber berbohong; model
  baru bisa mendeteksi kontradiksi antar laporan, tapi hidden-profile tasks
  (fakta kunci tersebar) tidak tersaturasi bahkan di model terbaik.
- **Terapan MARK:** sub-agent wajib melaporkan kontradiksi dengan asumsi
  awal, bukan memaksakan cocok; kutipan antar agen selalu disebut sumbernya.
- **Status: DONE** — `subagentPrompt.js` (disiplin epistemik).
- **Lanjutan (backlog):** reputation ring per sumber di memory system —
  skor keandalan per connector/sumber yang menyesuaikan setiap kali
  laporannya terkontradiksi. Referensi MARK-Eval dimensi `memory`.

### 1c. Coordination via shared forum
- **Temuan:** swarm dengan forum bersama (peer review + arbiter) menemukan
  266 vulnerabilities vs 21 untuk agen paralel independen — komplementer,
  bukan pengganti; spesialisasi muncul sendiri.
- **Terapan MARK:** Mission Control (Sub-Agents page) adalah forum kita.
  Pola peer-review sudah ada (LEAD QA wajib 1 putaran kritik). Yang belum:
  arbiter otomatis lintas temuan.
- **Status: partial** — LEAD QA done; arbiter agent = backlog.

### 1d. Incompatible goals → turf war
- **Temuan:** 3 agen dengan goal saling bertentangan (migrasi ke bahasa
  berbeda) saling menyabotase dalam 4 jam.
- **Terapan MARK:** sebelum spawn, lead agent harus mengecek sub-agent
  aktif yang punya goal tumpang-tindih (anti-duplikasi rule sudah ada) dan
  MENYATAKAN pembagian wilayah kerja secara eksplisit di goal masing-masing.
- **Status: partial** — anti-duplikasi done; explicit territory split =
  di protokol anti-konformitas (a).

---

## 2. Teaching Claude Why (Alignment, 8 Mei 2026)

- **Temuan inti:** melatih pada contoh perilaku baik saja kurang efektif;
  yang jauh lebih efektif = mengajarkan PENALARAN di balik perilaku ("why")
  + dokumen konstitusi. Data OOD kecil (3M token "difficult advice")
  mengalahkan 85M token honeypot yang mirip eval.
- **Terapan MARK (teknik prompt/skill, bukan training):**
  1. Skill bawaan baru `execution-discipline` ditulis sebagai PRINSIP
     DENGAN ALASAN ("MENGAPA: ...") per aturan — bukan daftar perintah
     kering. Ini pola SDF (synthetic document fine-tuning) yang bisa kita
     tiru di level konteks: skill.md = dokumen konstitusi mini yang
     di-inject via `read-skill` (progressive disclosure).
  2. Untuk model low-tier / training lama (keinginan owner: bawa model
     murah dapat output maksimal): kompensasi lewat skill.md yang
     mendisiplinkan struktur berpikir, bukan lewat prompt panjang per
     turn. Skill masuk registry prioritas #1 sehingga model wajib membaca
     sebelum eksekusi.
- **Status: DONE** — `src/components/core/native-skill-lowtier.js`,
  ter-registry di `NATIVE_SKILLS`.
- **Lanjutan (backlog):** kumpulkan "difficult advice" dataset lokal —
  contoh dialog user yang ambigu + jawaban constitutional — sebagai skill
  kedua untuk situasi tidak jelas (bukan hanya tugas teknis).

---

## 3. How Claude Code is Used in Practice (Economics, 16 Jun 2026)

- **Temuan:** pembagian kerja di agentic coding — manusia memutuskan ~70%
  planning (what), agen ~80% execution (how). Semakin ahli user, semakin
  banyak kerja yang dilakukan agen per instruksi (5 → 12 aksi per prompt).
  Sukses ditentukan pemahaman DOMAIN user, bukan kemampuan coding.
- **Terapan MARK:**
  1. **Division of labor sebagai desain:** MARK sudah benar — owner
     memutuskan arah (persona, config, approval), MARK mengeksekusi.
     Graduated approval (todo #4) menurunkan friksi di sisi execution
     tanpa memindahkan keputusan planning ke model.
  2. **Expertise amplification:** semakin spesifik instruksi user,
     semakin banyak kerja yang bisa didelegasikan. Skills + workspace
     `.mark/` working memory adalah mekanisme MARK untuk "menyimpan
     expertise owner" — dipakai ulang tiap sesi.
  3. **Metrik yang layak ditiru:** aksi per instruksi, output per
     instruksi, tingkat debug. MarkBench 1.0 + MARK-Eval efficiency
     dimension mengukur padanannya (tool calls, steps, dead-end rate).
- **Status: DONE** (desain existing + metrik tersedia).

---

## 4. A global workspace in language models (Interpretability, 6 Jul 2026)

- **Temuan:** ada "mental workspace" internal pada Claude — pikiran yang
  tidak muncul di output tapi digunakan untuk memproses.
- **Terapan MARK:** struktur ReAct MARK sudah memisahkan `thought`
  (workspace) dari `answer` (output). Skill `execution-discipline`
  menegaskan lagi: penalaran penuh di thought, hasil bersih di answer.
- **Status: DONE** (arsitektur existing dipertegas).

---

## Prioritas backlog hasil riset (urutan dampak)

1. **Reputation ring per sumber** (epistemics 1b) — padanan "court &
   reputation" yang menurut riset tidak dimiliki agen. Data sudah ada
   di audit trail connector + riwayat memory; yang dibutuhkan = skor
   keandalan + penalti saat terkontradiksi.
2. **Arbiter agent** (1c) — satu sub-agent netral yang menilai validitas
   temuan lintas agen sebelum masuk laporan final.
3. **Difficult-advice skill** (2) — konstitusi mini untuk situasi etis
   ambigu (bukan hanya disiplin eksekusi teknis).
4. **Expertise metrics** (3) — tambahkan aksi-per-instruksi ke report
   MarkBench full-run.

---

## Cara pakai dokumen ini

- Setiap kali mengubah arsitektur agentic (planner, memory, sub-agent,
  approval), cek bagian yang relevan di atas — pastikan perubahan tidak
  melanggar pola yang sudah terbukti gagal di riset.
- Update status (DONE/partial) di PR yang mengimplementasikan backlog.
- Sumber baru dari anthropic.com/research ditambahkan sebagai section
  baru dengan pola sama: temuan → terapan MARK → status.
