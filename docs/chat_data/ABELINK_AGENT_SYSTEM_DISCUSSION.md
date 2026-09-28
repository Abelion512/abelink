# Abelink Agent System: Consolidated Architecture Discussion

**Dokumen status:** Working Architecture Notes / Conversation Consolidation  
**Tanggal:** 2026-09-28  
**Scope:** Agentic RAG, Agentic AI, execution architecture, verification, recursive self-improvement, Jev AI, engine selection, publishability, dan prinsip pengembangan Abelink.

---

## 0. Tujuan Dokumen

Dokumen ini merangkum seluruh poin penting dari percakapan mengenai bagaimana konsep Agentic RAG, Agentic AI, multi-agent, memory, graph, verification, self-improvement, Jev AI, dan model LLM dipetakan ke Abelink.

Dokumen ini **bukan daftar dependency yang wajib dipasang**. Materi eksternal diperlakukan sebagai reference architecture dan vocabulary. Implementasi Abelink tetap boleh berbeda selama kontrak perilaku, evidence, verification, dan hasil benchmark mendukungnya.

Prinsip utama:

> **Abelink adalah Agent Execution System yang dapat mengganti atau menggabungkan berbagai decision/reasoning engine. LLM bukan satu-satunya core.**

---

# 1. Posisi Abelink Saat Ini

Abelink masih berada dalam fase eksperimen arsitektur untuk mencari engine dan kombinasi engine yang paling efisien terhadap task nyata.

Jangan mengunci asumsi:

```text
Abelink = LLM Agent
```

Model yang lebih tepat:

```text
                    ABELINK AGENT SYSTEM
                             |
                     Execution Runtime
                             |
              +--------------+--------------+
              |              |              |
           Reasoner       Decision      Deterministic
             LLM            Jev             Rules
              |              |              |
              +--------------+--------------+
                             |
                          Action
                             |
                         Observation
                             |
                        Verification
```

Engine yang dapat dibandingkan:

```text
Engine A = LLM untuk semua decision
Engine B = LLM + Jev
Engine C = Jev + deterministic rules + skill
Engine D = deterministic skill -> Jev escalation -> LLM escalation
Engine E = graph/policy -> Jev -> LLM hanya jika diperlukan
```

Pemilihan engine harus didasarkan pada pengukuran, bukan branding atau asumsi.

Dimensi evaluasi minimum:

- task success
- verified success
- latency
- token/cost
- tool-call accuracy
- recovery
- repeated actions
- stagnation
- human intervention
- kemampuan menyelesaikan task nyata tanpa user menjadi operator manual

---

# 2. Hardware Constraint

Target pengembangan pribadi saat ini:

```text
Laptop: Asus Vivobook A412F
OS: Linux Mint Cinnamon
```

Konsekuensinya:

- Abelink **tidak boleh mengasumsikan local frontier LLM inference kuat atau murah**.
- Remote/cloud LLM inference merupakan jalur normal.
- Agent architecture harus mengurangi ketergantungan pada generation text yang mahal jika task dapat diselesaikan dengan deterministic procedure, Jev, skill, graph, atau direct tool execution.
- Architecture harus memanjakan model yang tersedia, bukan memaksa model kecil melakukan reasoning yang tidak perlu.

Jadi efisiensi sistem tidak hanya berarti “model lebih pintar”, tetapi juga:

```text
less unnecessary generation
less unnecessary context
less unnecessary tool calls
less unnecessary reasoning
more deterministic execution
more reuse of verified procedures
```

---

# 3. Core Principle: Inspect -> Build -> Verify -> Loop

Abelink diarahkan ke loop sistem berikut:

```text
Inspect
   -> Build / Act
   -> Verify
   -> Loop
        -> Self-Healing
        -> Improvement
```

Interpretasi detail:

```text
INSPECT
  ↓
memahami objective, environment, state, tools, evidence
  ↓
BUILD / ACT
  ↓
menjalankan pekerjaan nyata
  ↓
VERIFY
  ↓
apakah world-state benar-benar sesuai objective?
  ↓
+-----------------------+
|                       |
PASS                  FAIL
 |                       |
report            diagnose failure
                         ↓
                  fix / adapt / retry
                         ↓
                      VERIFY
```

Loop harus berhenti ketika:

- objective benar-benar terverifikasi, atau
- sistem secara nyata blocked, atau
- budget/policy/approval boundary menghentikan eksekusi.

---

# 4. Verification Is the Authority

Prinsip penting:

> **Model tidak berhak menyatakan dirinya selesai. System verification yang menentukan apakah task selesai.**

Model boleh menghasilkan:

```text
MODEL CLAIM
```

tetapi claim tersebut bukan proof.

Bentuk yang benar:

```text
MODEL CLAIM
    ↓
ignored as proof
    ↓
REAL EXECUTION
    ↓
TOOL RESULT
    ↓
WORLD STATE
    ↓
E2E VERIFIER
    ↓
verified / failed / unknown
```

State yang harus dibedakan:

| State | Arti |
|---|---|
| `verified` | Ada bukti eksekusi nyata bahwa objective terpenuhi |
| `failed` | Ada bukti nyata bahwa objective belum terpenuhi atau gagal |
| `unknown` | Data eksekusi tidak cukup untuk menyimpulkan |

Aturan keras:

```text
NO E2E DATA
    ↓
UNKNOWN
    ↓
NO VERDICT
    ↓
NO PROMOTION / NO SELF-IMPROVEMENT CLAIM
```

`unknown` tidak boleh dipaksa menjadi `pass`.

---

# 5. System Claim vs User Reality

Dua dunia harus dipisahkan:

```text
PASS menurut System Verifier
        !=
PASS menurut User Experience
```

Sebuah verifier bisa salah desain atau kurang observability. Karena itu verification sendiri harus dapat diuji terhadap world-state dan user-visible result.

Prinsip yang digunakan:

> **Pass menurut system belum otomatis berarti task benar-benar selesai menurut user.**

Namun perbaikannya bukan memberi kuasa kepada LLM untuk mengklaim selesai. Perbaikannya adalah meningkatkan E2E oracle, observability, dan verification terhadap world-state yang relevan.

---

# 6. Recursive Self-Improvement

Konsep self-improvement Abelink bukan neural-network training.

Bentuk yang dimaksud:

```text
experience
    ↓
trajectory
    ↓
observation
    ↓
verified outcome
    ↓
pattern / failure diagnosis
    ↓
candidate adaptation
    ↓
E2E re-test
    ↓
PASS -> promote
FAIL -> reject / revise
```

Istilah yang digunakan dalam dokumen Abelink:

> **Evidence-Grounded System Adaptation**

atau:

> **Runtime Capability Learning**

Keduanya merujuk pada pembelajaran kemampuan sistem dari trajectory dan hasil eksekusi nyata, bukan update neural weights.

### Hard boundary

LLM **tidak boleh menjadi saksi tunggal atas keberhasilannya sendiri**.

LLM juga tidak boleh mengangkat status dirinya melalui teks seperti:

```text
“I succeeded.”
“I fixed the system.”
“I improved my skill.”
“The task is complete.”
```

Kalimat tersebut boleh menjadi model output, tetapi **tidak mempunyai authority** atas state sistem.

---

# 7. Anti-Manipulation Rule untuk Fix Loop

Agentic loop harus dapat melakukan:

```text
FAIL
 ↓
diagnose
 ↓
fix
 ↓
re-run
 ↓
verify
 ↓
PASS / FAIL / UNKNOWN
```

Tetapi terdapat risiko besar: LLM dapat memanipulasi kondisi agar verifier terlihat PASS tanpa menyelesaikan objective sebenarnya.

Karena itu:

- Verifier harus menguji world-state, bukan cerita model.
- Test harus E2E bila memungkinkan.
- Oracle tidak boleh membaca final answer sebagai proof.
- Model tidak boleh menentukan sendiri acceptance criteria setelah melihat hasil.
- Fix loop tidak boleh memodifikasi verifier secara bebas untuk menghilangkan failure.
- Self-improvement tidak boleh memperkuat hasil yang belum diverifikasi.

Prinsip sederhananya:

> **Agent boleh memperbaiki dirinya agar lulus test. Agent tidak boleh memperbaiki test agar dirinya lulus.**

---

# 8. Agent Architecture Is More Accessible Than Frontier Model Training

Membangun model frontier dan membangun architecture agent adalah dua masalah berbeda.

Model frontier dibatasi oleh:

- hardware
- data
- compute
- training cost
- inference cost
- model architecture
- proprietary weights

Sedangkan agent architecture dapat dibangun menggunakan:

- open-source repositories
- papers
- public documentation
- reproducible benchmarks
- existing agent patterns
- modular tools

Jadi Abelink tidak perlu memiliki model frontier sendiri untuk mengeksplorasi architecture canggih.

Diferensiasi Abelink bukan sekadar:

> “Saya punya agent loop.”

Diferensiasi yang lebih relevan:

```text
how well the system
OBSERVES
ACTS
VERIFIES
LEARNS
RECOVERS
ADAPTS
```

---

# 9. LLM Is Important, But Not the Absolute Core

LLM tetap sangat berguna untuk open-ended reasoning, planning, synthesis, ambiguity, dan novel task.

Namun execution system tidak boleh mendesain seluruh pekerjaan seolah setiap task harus melewati text generation terlebih dahulu.

Contoh architecture:

```text
Task
 ↓
Deterministic procedure?
 ├─ YES -> Skill / Rule -> Tool
 |
 └─ NO
      ↓
    Jev decision
      ↓
    Known branch?
    ├─ YES -> Tool
    |
    └─ NO
         ↓
        LLM
         ↓
       Reason
         ↓
      Tool call
```

Dengan begitu:

- deterministic task tidak membutuhkan LLM
- repetitive task tidak membutuhkan LLM setiap kali
- known skill tidak membutuhkan classification berat
- Jev dapat menangani bounded decision tertentu
- LLM dipanggil saat benar-benar membutuhkan reasoning terbuka

---

# 10. Jev AI as Decision/Automation Layer

Jev tidak boleh diasumsikan otomatis lebih baik untuk semua task.

Hipotesis yang dapat diuji:

```text
Task distribution
  ├─ deterministic
  ├─ procedural
  ├─ bounded decision
  ├─ classification
  ├─ routing
  ├─ verification
  ├─ recovery decision
  └─ open-ended reasoning
```

Jev berpotensi sangat cocok untuk sebagian kategori bounded/repetitive.

LLM lebih tepat ketika menghadapi:

- ambiguity
- novel task
- open-ended reasoning
- complex planning
- synthesis
- generation

### Jev + Skill

Untuk repetitive task:

```text
successful execution
       ↓
record trajectory
       ↓
verified procedure
       ↓
skill
       ↓
future execution
       ↓
Jev / deterministic branch
       ↓
tool call
```

Dengan skill yang sudah terbukti, sistem tidak perlu melakukan classification atau reasoning ulang hanya untuk menemukan prosedur yang sebenarnya sudah diketahui.

---

# 11. Abelink Must Pamper the Model

Prinsip:

> **Jangan memaksa LLM mengerjakan pekerjaan yang dapat diselesaikan oleh layer deterministic, Jev, skill, graph, memory, atau direct tool call.**

Arsitektur ideal:

```text
Task
 ↓
Inspect context
 ↓
Can existing skill solve it?
 ├─ YES -> execute
 |
 └─ NO
      ↓
Can deterministic rule solve it?
 ├─ YES -> execute
 |
 └─ NO
      ↓
Can Jev make bounded decision?
 ├─ YES -> execute
 |
 └─ NO
      ↓
LLM reasoning
      ↓
Action
```

Ini bertujuan mengurangi:

- token usage
- latency
- unnecessary generation
- prompt overhead
- model failure surface

Dan meningkatkan:

- determinism
- repeatability
- automation speed
- resource efficiency

---

# 12. Agentic AI Must Remain an Executor, Not a Chatbot Wearing an Agent Costume

Anti-pattern:

```text
User gives task
 ↓
Agent explains steps
 ↓
User executes everything manually
```

Target behavior:

```text
USER OBJECTIVE
      ↓
UNDERSTAND
      ↓
PLAN
      ↓
ACT
      ↓
OBSERVE
      ↓
UPDATE STATE / GRAPH
      ↓
VERIFY
      ↓
       +------------------+
       |                  |
      DONE             NOT DONE
       |                  |
       ↓                  ↓
    REPORT        RETRIEVE / MODIFY
                          ↓
                         ACT
```

User hanya perlu masuk ketika:

- explicit permission diperlukan
- ambiguity membutuhkan human decision
- credential eksternal diperlukan
- irreversible action membutuhkan approval
- sistem benar-benar blocked

Bukan karena agent menyerahkan pekerjaan kembali ke user setelah menyusun tutorial.

---

# 13. Architecture Progression

Abelink dapat dipandang berkembang melalui:

```text
Prompt Engineering
        ↓
Context Engineering
        ↓
Harness Engineering
        ↓
Loop Engineering
        ↓
Graph Engineering
        ↓
System Adaptation
        ↓
Self-Improving Agent System
```

Verification harus menjadi cross-cutting layer:

```text
                 VERIFICATION
                      |
Prompt -> Context -> Harness -> Loop -> Graph
                                             ↓
                                        Adaptation
```

Tanpa verification, sistem dapat belajar dari kesalahan dan mengulanginya secara lebih konsisten.

---

# 14. Agentic RAG Is a Subsystem, Not Abelink's Entire Identity

Agentic RAG cocok diposisikan di dalam Abelink:

```text
                    ABELINK
                       |
                Agent Runtime
                       |
       +---------------+----------------+
       |               |                |
     Graph           Memory           Skills
       |               |                |
       +---------------+----------------+
                       |
                Decision Layer
              +--------+--------+
              |        |       |
             Rule     Jev     LLM
              |        |       |
              +--------+-------+
                       |
                    Action
                       |
                   Observe
                       |
                 Verification
                       |
                System State
                       |
              Learning/Adaptation
```

RAG berada terutama pada knowledge/memory substrate:

```text
Memory
 ├─ vector retrieval
 ├─ workspace retrieval
 ├─ episodic retrieval
 └─ graph retrieval
```

Agentic RAG bukan keseluruhan runtime.

---

# 15. Classic RAG -> Graph RAG -> Agentic RAG

### Classic RAG

Sudah ada secara konsep:

```text
Document
  ↓
ragPipeline
  ↓
chunking
  ↓
Orama / vector memory
  ↓
retrieved context
  ↓
LLM / decision engine
```

### Graph RAG Lite

Dapat ditambahkan tanpa langsung menggunakan database graph besar:

```text
Documents / conversations / tools
              ↓
        entity extraction
              ↓
       entity + relation
              ↓
          graph store
              ↓
     relation-aware retrieval
```

Graph RAG berguna ketika pertanyaan menekankan hubungan, misalnya:

```text
skill X -> tool Y -> failure Z
```

Graph storage dapat dimulai sederhana dan hanya dibuat jika benchmark menunjukkan kebutuhan.

### Agentic RAG

```text
Objective
  ↓
Reason / Plan
  ↓
Retrieval Router
  ├─ Memory
  ├─ Workspace
  ├─ Graph
  ├─ Browser/Web
  └─ MCP/Tools
  ↓
Evidence
  ↓
Action
  ↓
Observation
  ↓
Verification
  ↓
continue / retrieve / modify / stop
```

---

# 16. Multi-Agent Architecture

Multi-agent hanya digunakan ketika delegation benar-benar memberi keuntungan.

Pola:

```text
                 Main Agent
                     |
          +----------+----------+
          |          |          |
      Research     Browser      Local
       Agent        Agent       Agent
          \          |          /
           +---------+---------+
                     |
                  Merge
                     |
                 Verify
                     |
                  Result
```

Subagents harus digunakan terutama untuk:

- context isolation
- task specialization
- parallel work
- independent investigation
- delegated execution

Bukan karena jumlah agent terlihat lebih canggih.

---

# 17. Specialized Models

Tidak semua kategori model harus menjadi core Abelink.

### LLM

Core reasoning option, tetapi bukan absolute execution core.

### VLM

Relevan untuk browser/UI/image tasks ketika text/DOM tidak cukup.

### SLM

Menarik untuk:

- routing
- classification
- metadata extraction
- lightweight summarization
- local helper tasks

### MoE

Dipandang sebagai karakteristik architecture model. Abelink tidak perlu mengimplementasikan MoE sendiri.

### LAM

Lebih tepat dipahami sebagai action-oriented behavior yang dapat diwujudkan melalui runtime Abelink, bukan harus berupa dependency LAM khusus.

### MLM

Lebih relevan sebagai model/training objective daripada runtime agent architecture.

### SAM

Dapat menjadi optional computer-vision capability untuk segmentation.

### LCM

Research concept terkait language modeling pada sentence/concept representation space. Bukan core dependency Abelink.

---

# 18. AI Layers: Cara Memetakkannya ke Abelink

Jangan membuat folder architecture berdasarkan diagram "AI layers".

Pemetaan yang lebih praktis:

```text
ML / DL / Transformers
        ↓
Model Capability
   LLM / VLM / SLM
        ↓
Abelink Agent Runtime
   planning
   memory
   tools
   verification
   autonomy
        ↓
OS / Browser / MCP / External Systems
```

Abelink adalah orchestration/execution layer di atas model capability.

---

# 19. Essential AI Concepts Mapping

## Agentic Loops

Sudah menjadi prinsip inti:

```text
plan -> act -> observe -> verify -> continue/modify/stop
```

## MCP

Dipakai sebagai external capability boundary.

## Subagents

Dipakai untuk delegated reasoning/execution dengan context isolation.

## AI Gateway

Digunakan untuk provider/model/endpoint abstraction, bukan untuk menjadi second brain.

## Inference Economics

Dapat mencakup:

```text
token usage
cache state
provider pricing
latency
tool cost
reasoning effort
```

## Evals

Prefer:

```text
Deterministic Oracle
      +
LLM Judge (bila diperlukan)
      +
Trajectory Metrics
      +
Regression Comparison
```

Oracle tetap authoritative.

## Guardrails

Guardrails native Abelink dapat mencakup:

- Rust approval
- hardline
- capability policy
- path containment
- tool authorization
- objective verification

## Observability

Observability sudah menjadi measurement substrate dan tidak perlu otomatis diganti external vendor.

---

# 20. Avoid Dependency Checklist Engineering

Konsep berikut tidak harus dipasang hanya karena muncul di diagram:

```text
LangChain
LlamaIndex
Haystack
DSPy
Pinecone
Zep
Mem0
Letta
Langfuse
Phoenix
Guardrails AI
```

Prinsip:

> **Adopt the principle, not automatically the dependency.**

Abelink boleh memiliki implementasi native jika lebih cocok dengan:

- Linux-first architecture
- offline/local storage
- low-resource machine
- security boundaries
- deterministic testability
- existing runtime contracts

External library hanya diambil jika manfaat operasionalnya jelas dan dapat diukur.

---

# 21. Existing Abelink Concepts That Must Not Be Lost

Konsep berikut merupakan bagian penting dari arah architecture dan tidak boleh hilang ketika sistem terus berevolusi:

- satu execution runtime, bukan runtime duplikat per surface
- taskStore sebagai persistence authority
- facade tipis tanpa second state machine
- approval berada di execution boundary, bukan diberikan kepada model
- objective verifier sebagai authority untuk completion
- model final answer bukan proof
- progress evaluation
- trajectory supervision
- evidence-grounded skill promotion
- memory router
- unified memory tool
- dynamic/deferred tool loading
- skill folder + progressive disclosure
- MCP capability boundary
- browser semantic-first observation
- benchmark dan measurement plane
- explicit unknown state ketika evidence tidak cukup
- fail-fast capability signaling

---

# 22. User-Ready / Publish-Ready Standard

Abelink tidak boleh dianggap selesai hanya karena:

```text
feature exists
```

Standar yang lebih tepat:

```text
feature exists
    +
feature wired
    +
production path actually uses it
    +
E2E test exists
    +
failure path exists
    +
verification exists
    +
measurement exists
    +
no false success
```

Formulasi sederhananya:

> **“Abelink punya feature X” hanya sah jika X benar-benar dapat dipakai end-to-end dan hasilnya dapat dibuktikan.**

Karena pengguna pertama Abelink juga merupakan developer/owner yang menguji sistem sendiri, standar user-ready berlaku sejak penggunaan pribadi.

Private project bukan alasan untuk memalsukan completion.

---

# 23. Audit Mindset

Ketika sebuah fitur terlihat bagus dari luar, selalu tanyakan:

```text
Does it exist?
      ↓
Is it wired?
      ↓
Does the real runtime use it?
      ↓
Can it fail honestly?
      ↓
Can the system verify the result?
      ↓
Can E2E test prove it?
      ↓
Can the system recover?
      ↓
Can it learn from verified outcome?
```

Fitur yang berhenti di UI atau code path dangkal belum dianggap selesai.

---

# 24. Istilah Arsitektur yang Perlu Disimpan sebagai Vocabulary Abelink

## Agent Execution System

System runtime yang mengelola objective, decision engine, tools, observation, state, verification, recovery, dan adaptation.

## Evidence-Grounded System Adaptation

Adaptasi sistem berdasarkan pengalaman yang memiliki evidence nyata dari eksekusi dan verification.

## Runtime Capability Learning

Pembelajaran kemampuan runtime melalui trajectory, skill, procedure, routing, dan adaptation, bukan gradient descent terhadap neural weights.

## Recursive Self-Improvement

Loop:

```text
execute -> verify -> diagnose -> modify -> retest
```

dengan syarat setiap improvement harus diuji ulang melalui evidence.

## Verification Authority

Komponen system yang menentukan status completion berdasarkan observable world-state, bukan model claim.

## Model Claim

Pernyataan model tentang apa yang dilakukan atau dicapai. Tidak otomatis menjadi proof.

## Verified Outcome

Hasil yang didukung evidence eksekusi nyata yang memenuhi acceptance criteria.

## Unknown State

Keadaan ketika system tidak memiliki evidence cukup untuk menentukan pass/fail.

## Agent Self-Claim Isolation

Model tidak boleh menjadi authority atas keberhasilan, completion, atau promotion dirinya sendiri.

## Anti-Verifier Manipulation

Agent tidak boleh mengubah acceptance test secara opportunistic hanya untuk memperoleh PASS.

## Engine Arbitration

Pemilihan engine yang paling efisien untuk suatu task, berdasarkan benchmark dan evidence, bukan asumsi bahwa satu model harus menangani semua task.

## Model-Pampering Architecture

Arsitektur yang memindahkan pekerjaan deterministik/repetitif dari LLM ke rule, skill, graph, Jev, atau tool agar model digunakan hanya ketika reasoning diperlukan.

## Skill Reuse

Procedure yang sudah terverifikasi digunakan kembali untuk menghindari reasoning/classification yang tidak perlu.

## Agent-Not-Chatbot Principle

Agent harus melakukan pekerjaan nyata, bukan hanya mengembalikan tutorial yang kemudian harus dieksekusi manual oleh user.

## Agentic RAG

Retrieval yang menjadi bagian dari loop reasoning/action/observation/verification, bukan sekadar top-K retrieval lalu generation.

## Graph-Aware Retrieval

Retrieval yang memanfaatkan entity/relation structure untuk menjawab pertanyaan relational.

## User-Ready Capability

Capability yang benar-benar wired, operational, verified, tested, measurable, dan memiliki honest failure semantics.

---

# 25. Target Architecture Sederhana

```text
                         ABELINK
                            |
                    Agent Execution System
                            |
       +--------------------+--------------------+
       |                    |                    |
   Knowledge              Decision            Execution
       |                    |                    |
  +----+----+          +----+----+          +----+------+
  |    |    |          |    |    |          |    |      |
Vector Graph Memory   Rules Jev LLM       Tools Browser OS/MCP
  |    |    |          |    |    |          |    |      |
  +----+----+----------+----+----+----------+----+------+
                            |
                         Observe
                            |
                        Verify E2E
                            |
                 +----------+----------+
                 |                     |
              VERIFIED               FAIL
                 |                     |
              Finish             Diagnose/Fix
                                       |
                                    Retest
                                       |
                              Recursive Improvement
```

---

# 26. Non-Negotiable Invariants

1. **No evidence -> no authoritative success.**
2. **Model claim != system proof.**
3. **Unknown != Pass.**
4. **Agent may improve implementation, not rewrite reality to pass.**
5. **Self-improvement requires E2E re-test.**
6. **LLM is optional for tasks that can be solved deterministically.**
7. **Jev is an engine candidate, not a universal answer.**
8. **Skills should reduce repeated reasoning when procedures are already verified.**
9. **Agent must execute when it has authority, not return a manual checklist.**
10. **Architecture decisions should be benchmark-driven.**
11. **Features are not complete merely because their UI/code surface exists.**
12. **Private usage still counts as real user usage for quality standards.**
13. **Verification must be stronger than model narration.**
14. **The system may report what evidence supports, and must remain silent/unknown when evidence is insufficient.**

---

# 27. Final Direction

The broad direction is:

```text
Prompt Engineering
        ↓
Context Engineering
        ↓
Harness Engineering
        ↓
Loop Engineering
        ↓
Graph Engineering
        ↓
Agent Execution System
        ↓
Evidence-Grounded Adaptation
        ↓
Recursive Self-Improving System
```

With a cross-cutting rule:

```text
                 VERIFY EVERYTHING IMPORTANT
```

Abelink should therefore be optimized not for the appearance of AGI, nor for maximal model usage, nor for maximal feature count, but for a system that can:

```text
INSPECT
→ ACT
→ OBSERVE
→ VERIFY
→ RECOVER
→ IMPROVE
→ RETEST
→ REUSE
```

while preserving honest boundaries about what the system actually knows and what it merely claims.

---

# 28. Note on Conversation Context and Stale Project References

Project state evolves quickly. Historical conversation references such as an old PR number, benchmark state, or architecture snapshot should **not** be treated as current repository state unless re-inspected.

When discussing current Abelink implementation, prefer:

1. current repository contents
2. current branch/PR state
3. current tests/benchmarks
4. current architecture documents
5. historical conversation context only as background

A memory or prior conversation may preserve a useful design decision, but it should not silently substitute for current repository inspection.

---

## Appendix: One-Line Mental Model

> **Abelink is a model-agnostic agent execution system that uses the cheapest reliable decision path available, acts on the real world, verifies outcomes with evidence, repairs failures through closed-loop execution, and only learns from what the system can actually prove.**
