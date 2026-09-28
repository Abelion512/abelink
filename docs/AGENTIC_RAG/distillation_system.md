# Abelink Distillation System: Working Architecture Notes

**Dokumen status:** Working Architecture Notes / Distillation, Trajectory, dan Model-Training Strategy  
**Tanggal:** 2026-09-28  
**Scope:** Model distillation, Agentic RAG distillation, agent trajectories, dataset collection, evaluation, system improvement, student-model training, export/normalization, session isolation, quantization metadata, dan pilot experiment Abelink.

---

# 0. Tujuan Dokumen

Dokumen ini merangkum batas definisi **distillation model** dan bagaimana konsep tersebut harus dipisahkan dari **system improvement**, **evaluation**, **benchmarking**, **memory**, dan **Agentic RAG** di Abelink.

Dokumen ini bukan instruksi bahwa Abelink harus langsung melakukan fine-tuning. Tujuannya adalah menyediakan vocabulary, boundary, data contract, dan eksperimen awal agar trajectory dari model dapat digunakan dengan benar tanpa menyebut setiap chat export sebagai distillation.

Prinsip utama:

> **Teacher output menjadi distillation hanya ketika output atau behavior teacher dipakai sebagai training signal/supervision untuk membuat student model belajar.**

Dengan kata lain:

```text
Teacher output → stored
                  ≠ distillation

Teacher output → analyzed → system changed
                  = system improvement

Teacher output → labeled/filtered → eval
                  = evaluation dataset

Teacher output → training signal → student learns
                  = distillation
```

---

# 1. Posisi Abelink terhadap Distillation

Abelink adalah **Agent Execution System**, bukan sekadar model dan bukan sekadar chatbot.

Arsitektur yang sudah ditetapkan untuk Abelink menempatkan learning terutama pada level runtime/system:

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
PASS → promote
FAIL → reject / revise
```

Ini adalah:

- **Evidence-Grounded System Adaptation**
- **Runtime Capability Learning**
- **Recursive Self-Improvement** pada level system/runtime

Bukan neural-weight training.

Distillation adalah jalur tambahan yang berbeda:

```text
Teacher
   ↓
verified / filtered outputs or trajectories
   ↓
distillation dataset
   ↓
Student training
   ↓
independent evaluation
```

---

# 2. Core Boundary: Kapan Sesuatu Disebut Distillation?

## 2.1 Bukan distillation

### Case A: Chat → export → perbaiki Abelink

```text
User
  ↓
Chat dengan Claude/GPT/etc.
  ↓
Conversation + hasil + feedback
  ↓
Export
  ↓
Analisis
  ↓
Perbaiki Abelink
```

Ini bukan distillation.

Data tersebut lebih tepat disebut:

- interaction traces / conversation logs
- behavioral dataset
- agent trajectory, bila ada action/observation/tool sequence
- evaluation data
- correction data / demonstration data bila berisi contoh perilaku yang diinginkan

Tujuannya adalah system engineering, evaluation, debugging, atau policy improvement.

### Case B: Chat → dataset → student fine-tuning

```text
Teacher output
      ↓
Dataset
      ↓
Student training
```

Ini masuk wilayah distillation ketika dataset tersebut memang digunakan untuk memindahkan capability/behavior/knowledge dari teacher ke student.

---

# 3. Prompt Bebas dan Distillation

Prompt tidak harus berasal dari benchmark resmi agar dapat digunakan dalam distillation.

Contoh:

```text
Prompt pool
   ↓
Teacher model
   ↓
Generated outputs
   ↓
Filtering / validation
   ↓
Student training
```

Prompt pool dapat berupa:

- synthetic prompts
- user-like tasks
- real task traces
- benchmark tasks
- failure cases
- generated variations
- Agentic RAG research requests

Boundary-nya bukan pada asal prompt.

Pertanyaan yang harus dijawab adalah:

> **Apakah output teacher digunakan sebagai target/supervision untuk melatih student?**

Jika tidak, jangan otomatis menyebutnya distillation.

---

# 4. Agentic RAG: Apa yang Dapat Didistillasi?

Agentic RAG dapat menghasilkan lebih dari final answer.

Contoh trajectory:

```text
User:
"Research apakah X benar."

Teacher Agent
   ↓
Search web
   ↓
Retrieve 12 documents
   ↓
Discard 5 low-quality sources
   ↓
Compare 7 sources
   ↓
Detect contradiction
   ↓
Search again
   ↓
Cite evidence
   ↓
Final answer
```

Trajectory yang dapat dipakai sebagai training signal dapat mencakup:

```json
{
  "prompt": "...",
  "retrieval": [],
  "tool_calls": [],
  "observations": [],
  "decisions": [],
  "final_answer": "...",
  "citations": []
}
```

Potential distillation targets:

| Target | Student belajar | Distillation? |
|---|---|---|
| Final answer | answer behavior | Ya |
| Answer + rationale/target explanation | reasoning pattern | Bisa |
| Query rewrite | retrieval behavior | Ya |
| Document selection | retrieval policy | Ya |
| Tool selection | tool-use policy | Ya |
| Retrieval iteration | iterative retrieval behavior | Ya |
| Full observable trajectory | agent behavior | Ya |
| Hanya log debugging | system analysis | Tidak |
| Hanya benchmark cases | measurement | Tidak |
| Hanya RAG database | external knowledge substrate | Tidak |

Catatan penting:

> **RAG database bukan student model.**

Menambahkan dokumen ke vector store, graph store, atau memory store tidak menjadi distillation hanya karena data tersebut berasal dari teacher.

---

# 5. Dua Kategori Distillation yang Perlu Dibedakan

## 5.1 Classical / white-box knowledge distillation

Teacher dan student dapat menggunakan distribusi/logits teacher sebagai training signal.

Konsep sederhananya:

```text
Teacher
  ↓
logits / probability distribution
  ↓
Student learns teacher distribution
```

Teacher tidak hanya memberi label keras seperti:

```text
answer = B
```

tetapi dapat memberi distribution seperti:

```text
B = 0.72
C = 0.18
A = 0.08
D = 0.02
```

Ini adalah bentuk klasik knowledge distillation.

## 5.2 Black-box LLM distillation

Pada API-only teacher, logits teacher biasanya tidak tersedia.

Pipeline lebih dekat ke:

```text
Prompt
  ↓
Teacher API
  ↓
Generated answer / trajectory
  ↓
Training dataset
  ↓
Student fine-tuning
```

Student belajar dari generated target melalui supervised training atau objective sejenis.

Istilah yang mungkin digunakan tergantung literature/framework:

- response distillation
- output distillation
- synthetic-data distillation
- behavior distillation
- trajectory / agent distillation

Untuk reasoning/agentic behavior, target dapat berupa output atau observable trajectory yang memang tersedia dan sengaja dijadikan supervision.

---

# 6. Distillation Tidak Sama dengan System Self-Improvement

Abelink memiliki dua jalur learning yang harus dipisahkan.

```text
                        ABELINK DATA
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
         System Eval    System Learning   Model Training
              │              │              │
              ↓              ↓              ↓
       regression set   policy/code fix   distillation
```

## 6.1 System improvement

```text
Claude research trace
        ↓
"Agent berhenti terlalu cepat"
        ↓
create eval case
        ↓
perbaiki orchestrator / verifier / retrieval / policy
        ↓
replay
        ↓
measure
```

Ini adalah **system improvement**.

## 6.2 Distillation

```text
Claude research trace
        ↓
validated trajectory
        ↓
teacher target dataset
        ↓
fine-tune student
```

Ini adalah **distillation**.

## 6.3 Evaluation dataset

```text
Claude research trace
        ↓
catalogue successful / failed runs
        ↓
benchmark / regression evaluation
```

Ini adalah **evaluation dataset**, bukan distillation.

---

# 7. Abelink Data Taxonomy

| Data | Tujuan | Istilah utama |
|---|---|---|
| Chat user + assistant | memahami interaction | Interaction trace |
| Conversation + action sequence | agent behavior analysis | Agent trajectory |
| Tool calls + hasil | execution analysis | Tool trajectory |
| Input + expected output | automated testing | Eval dataset |
| Bad answer + corrected answer | regression/training signal | Correction dataset |
| Banyak model dibandingkan pada task sama | model comparison | Benchmark dataset |
| Teacher target → student training | model capability transfer | Distillation dataset |
| Chat → ubah orchestrator/policy/code | runtime improvement | System optimization |
| Documents/indexes yang dipakai retrieval | external knowledge substrate | RAG corpus |
| Reusable verified procedure | execution reuse | Skill |

Satu raw trajectory dapat menghasilkan beberapa artefak berbeda, tetapi artefak tersebut tetap harus diberi label berdasarkan tujuan penggunaannya.

---

# 8. Agent Trajectory sebagai Raw Material

Trajectory sebaiknya dianggap sebagai **raw material**, bukan otomatis distillation data.

```text
Experience
   ↓
Raw trajectory
   ↓
Normalization
   ↓
Verification / evaluation
   ↓
Quality labeling
   ↓
┌───────────────┬──────────────────┬────────────────────┐
↓               ↓                  ↓
System eval     System learning    Distillation candidate
```

Satu trajectory yang sama dapat menghasilkan:

- regression case
- benchmark case
- failure taxonomy entry
- skill candidate
- routing signal
- retrieval analysis
- distillation sample

Tetapi hanya sample yang benar-benar dijadikan training supervision untuk student yang masuk kategori distillation.

---

# 9. Verification Boundary Sebelum Distillation

Teacher tidak selalu benar.

Risiko paling sederhana:

```text
Prompt
 ↓
Teacher hallucination
 ↓
Dataset
 ↓
Student training
```

Hasilnya dapat berupa:

```text
teacher error
     ↓
distilled error
```

Karena itu raw teacher output sebaiknya tidak dianggap ground truth hanya karena berasal dari model yang lebih besar.

Pipeline yang lebih aman:

```text
Prompt pool
   ↓
Teacher
   ↓
Trajectory
   ↓
Verifier / evaluator
   ↓
Evidence validation
   ↓
Dedup / quality filter
   ↓
Approved dataset
   ↓
Student training
   ↓
Independent eval
```

Bukan:

```text
Teacher
 ↓
Export everything
 ↓
Fine-tune
```

Untuk Abelink, verification tetap authority. Model claim bukan proof.

```text
MODEL CLAIM
    ↓
ignored as proof
    ↓
REAL EXECUTION
    ↓
TOOL RESULT / WORLD STATE
    ↓
E2E VERIFIER
    ↓
verified / failed / unknown
```

Aturan:

```text
NO EVIDENCE
    ↓
UNKNOWN
    ↓
NO AUTHORITATIVE SUCCESS
```

Trajectory yang belum terverifikasi tidak boleh diam-diam dipromosikan menjadi contoh "gold".

---

# 10. Data Collection Experiment untuk Abelink

Untuk eksperimen awal, tujuan utama bukan langsung melatih student.

Tujuan pertama adalah membangun **small Agentic RAG trajectory corpus** yang dapat:

- dibandingkan antar-model
- dianalisis failure pattern-nya
- dijadikan benchmark/eval
- menunjukkan candidate behavior untuk system improvement
- menghasilkan subset yang layak dipertimbangkan untuk distillation

---

# 11. Session Isolation

Untuk perbandingan model yang fair, setiap **task × model** sebaiknya dijalankan dalam **fresh/dedicated session**.

Contoh:

```text
TASK-001
  ├─ Model A → fresh session
  ├─ Model B → fresh session
  ├─ Model C → fresh session
  └─ Model D → fresh session

TASK-002
  ├─ Model A → fresh session
  ├─ Model B → fresh session
  └─ dst.
```

Jangan menggunakan satu session panjang untuk seluruh benchmark, karena context dari task sebelumnya dapat menjadi hidden variable.

### Long-horizon task

Long-horizon tetap boleh menggunakan satu session panjang, tetapi:

```text
1 task = 1 dedicated session
```

Tidak ada carry-over context dari task benchmark lain.

Ini membedakan:

```text
multi-task contamination
```

dari:

```text
long-horizon context retention
```

Yang pertama harus dihindari untuk baseline. Yang kedua justru dapat menjadi objek pengujian.

---

# 12. Model Identity dan Quantization

Untuk eksperimen jangka panjang, nama model saja tidak cukup.

Setiap run harus sedapat mungkin merekam model identity dan configuration yang benar-benar tersedia.

Untuk model local/inference yang mendukung quantization, quantization harus dianggap bagian dari variant/configuration identity.

Contoh:

```json
{
  "model": "Qwen-3-14B",
  "model_version": "...",
  "quantization": "Q4_K_M",
  "inference_engine": "llama.cpp",
  "context_window": 32768
}
```

Variant dapat diperlakukan seperti:

```text
same base model
├─ FP16
├─ Q8
├─ Q6
└─ Q4
```

Untuk remote/cloud model, catat informasi yang memang tersedia dari provider, misalnya:

- model identifier
- model/version identifier bila tersedia
- provider
- reasoning/configuration setting bila tersedia
- context configuration bila diketahui

Jangan mengarang metadata yang tidak diberikan sistem.

---

# 13. Raw Export vs Normalized Dataset

User **tidak perlu mengisi JSON normalized schema satu per satu secara manual**.

Target workflow:

```text
Run chats
   ↓
Raw export
   ↓
Normalization script / AI-assisted cleaning
   ↓
Normalized JSONL
```

Schema normalized adalah **data contract**, bukan form yang harus diisi tangan setiap kali selesai chatting.

---

# 14. Minimum Run Schema

Contoh target normalized record:

```json
{
  "task_id": "TASK-017",
  "model": "MODEL_A",
  "model_version": "...",
  "provider": "...",
  "quantization": null,
  "inference_engine": null,
  "context_window": null,
  "prompt": "...",
  "response": "...",
  "tool_calls": null,
  "sources": null,
  "latency_ms": null,
  "token_usage": null,
  "verification": {
    "status": "unknown"
  }
}
```

Aturan pengisian:

- Jika field memang tersedia, simpan nilainya.
- Jika field tidak tersedia dari raw export, gunakan `null` bila nilainya unknown/not collected.
- Gunakan `[]` bila maknanya memang "tidak ada item" dan struktur tersebut mendukung daftar kosong.
- Jangan menebak latency, token usage, source, tool call, atau retrieval behavior.

**Missing telemetry tidak boleh diubah menjadi invented telemetry.**

---

# 15. Agentic RAG Trajectory Schema

Untuk run yang memang menghasilkan execution telemetry, target schema dapat diperluas:

```json
{
  "task_id": "TASK-017",
  "retrieval_queries": [],
  "documents_selected": [],
  "documents_rejected": [],
  "tool_calls": [],
  "observations": [],
  "decisions": [],
  "final_answer": "...",
  "citations": []
}
```

Schema ini **bukan berarti semua chat provider pasti menyediakan semua field**.

Perbedaan penting:

```text
Chat export
   └─ biasanya conversation-level data

Agent runtime log
   └─ dapat menyediakan
       ├─ retrieval
       ├─ tools
       ├─ observations
       ├─ timing
       ├─ sources
       └─ verification
```

Karena itu:

> **Chat export ≠ complete agent trajectory.**

Jika provider tidak mengekspos retrieval/tool telemetry, record tersebut harus mempertahankan keterbatasannya.

---

# 16. Observable Trajectory vs Hidden Reasoning

Untuk dataset Agentic RAG Abelink, fokus pada data yang dapat diobservasi dan diverifikasi:

- task/prompt
- model identity/configuration
- retrieval queries bila tersedia
- selected/rejected documents bila tersedia
- tool calls bila tersedia
- tool results/observations yang tersedia
- citations
- final answer
- verification result
- latency/token telemetry bila tersedia

Jangan menganggap hidden chain-of-thought sebagai requirement untuk trajectory dataset.

Tujuan dataset Abelink adalah mengukur dan memperbaiki execution system, bukan sekadar mengarsipkan private internal reasoning.

---

# 17. Pilot Experiment: 10 Tasks

Eksperimen awal tidak perlu 100 atau 1000 task.

Target pilot:

> **10 task yang sengaja berbeda dan cukup representatif untuk menemukan data-contract dan failure pattern awal.**

Task sebaiknya mencakup kategori seperti:

```text
A. Simple factual RAG
B. Multi-source research
C. Conflicting sources
D. Long-context retrieval
E. Iterative retrieval
F. Tool selection
G. Evidence verification
H. Insufficient evidence / cannot answer
```

Sepuluh task tidak harus tepat satu per kategori. Tujuannya adalah diversity, bukan memenuhi checklist secara mekanis.

---

# 18. Example Task

```text
TASK-017

Research:
"Apakah klaim X didukung oleh evidence A, B, dan C?"

Constraints:
- gunakan sumber primer jika tersedia
- identifikasi conflict
- jangan menyimpulkan jika evidence tidak cukup
- sertakan evidence untuk setiap klaim utama
```

Prompt yang sama dapat diberikan ke beberapa model untuk comparison.

---

# 19. Multi-Model Run Matrix

Format eksperimen:

```text
10 tasks
×
N models
×
fresh session per task/model
```

Output awal:

```text
Raw run corpus
      ↓
Normalization
      ↓
Verification / labeling
```

Tidak perlu langsung melakukan fine-tuning.

---

# 20. Recommended End-to-End Data Pipeline

Pipeline operasional yang disarankan:

```text
1. Task Set
      ↓
2. Multi-Model Runs
      ↓
3. Fresh Session / Task Isolation
      ↓
4. Raw Export
      ↓
5. Normalize
      ↓
6. Evidence / Verification
      ↓
7. Quality Labels
      ↓
8. Split by Purpose
      ├─ Benchmark / Eval
      ├─ System Learning
      └─ Distillation Candidates
      ↓
9. Student Training (only for selected candidates)
      ↓
10. Independent Evaluation
```

---

# 21. Raw Dataset Is Not Yet a Distillation Dataset

Misleading pipeline:

```text
Prompt
 ↓
Teacher
 ↓
Export
 ↓
Fine-tune
```

Recommended pipeline:

```text
Prompt
 ↓
Teacher
 ↓
Raw trajectory
 ↓
Normalize
 ↓
Verify / evaluate
 ↓
Filter / deduplicate / label
 ↓
Approved teacher targets
 ↓
Student training
 ↓
Independent evaluation
```

Dengan demikian:

```text
Raw trajectory
      !=
Approved distillation sample
```

---

# 22. Distillation Candidate Selection

Contoh skala kecil untuk memahami pipeline:

```text
1000 tasks/runs
   ↓
5000 raw model runs
   ↓
3200 normalized/usable
   ↓
2100 high-quality
   ↓
800 benchmark-useful
   ↓
600 system-analysis useful
   ↓
300 candidate teacher samples
```

Angka tersebut hanya contoh struktur penyaringan, bukan target wajib.

Yang penting adalah bahwa **distillation subset adalah hasil seleksi**, bukan sinonim dari seluruh corpus.

---

# 23. Agentic RAG Distillation Targets

Student tidak harus belajar final answer saja.

Contoh capability targets:

```text
query
  ↓
retrieve

query + evidence
  ↓
reason / synthesize

state
  ↓
choose tool

evidence
  ↓
answer

failed retrieval
  ↓
retry / alternate retrieval
```

Ini membuat distillation menjadi **behavior/agent-policy transfer**, bukan sekadar chatbot response copying.

Namun setiap target harus dibatasi oleh data yang benar-benar tersedia dan tervalidasi.

---

# 24. Verification dan Gold-Data Policy

Abelink memiliki prinsip:

> **Model claim != system proof.**

Implikasinya terhadap distillation:

```text
Teacher says "success"
        !=
Verified success
```

Candidate target yang belum memiliki evidence cukup dapat diberi status:

```text
verified
failed
unknown
```

`unknown` tidak boleh dipromosikan menjadi `verified` hanya karena teacher confident.

Sesuai prinsip Abelink:

```text
NO E2E DATA
    ↓
UNKNOWN
    ↓
NO VERDICT
    ↓
NO PROMOTION / NO SELF-IMPROVEMENT CLAIM
```

Untuk distillation, ini berarti sample yang belum memiliki quality assurance tidak boleh diperlakukan secara otomatis sebagai gold target.

---

# 25. Distillation Tidak Menggantikan Agent Architecture

Model distillation tidak menggantikan execution architecture Abelink.

Target architecture tetap:

```text
                     ABELINK
                        |
                 Agent Execution System
                        |
        +---------------+----------------+
        |               |                |
    Knowledge        Decision         Execution
        |               |                |
   Vector/Graph/    Rule/Jev/LLM     Tools/Browser/OS/MCP
       Memory
        |               |                |
        +---------------+----------------+
                        |
                     Observe
                        |
                    Verify E2E
                        |
              +---------+---------+
              |                   |
           VERIFIED              FAIL
              |                   |
           Finish          Diagnose / Fix
                                  |
                                Retest
                                  |
                       Recursive Improvement
```

Student model hasil distillation hanya menjadi salah satu **decision/reasoning engine candidate**.

---

# 26. Model Distillation dan Model-Pampering Architecture

Abelink tetap perlu meminimalkan pekerjaan yang harus dilakukan LLM.

Distilling model yang lebih kecil tidak berarti semua pekerjaan harus dipindahkan kembali ke LLM.

Arsitektur tetap:

```text
Task
 ↓
Existing skill?
 ├─ YES → execute
 └─ NO
      ↓
Deterministic rule?
 ├─ YES → execute
 └─ NO
      ↓
Jev bounded decision?
 ├─ YES → execute
 └─ NO
      ↓
LLM / Student / Teacher
      ↓
Action
      ↓
Observation
      ↓
Verification
```

Student hasil distillation dapat mengurangi biaya pada sebagian decision path, tetapi tidak otomatis lebih baik daripada rule, skill, Jev, atau deterministic procedure.

---

# 27. Long-Term Distillation Strategy

Untuk jangka panjang, pipeline dapat berkembang menjadi:

```text
Experience
   ↓
Trajectory corpus
   ↓
Evaluation / verification
   ↓
Failure + capability taxonomy
   ↓
System improvement
   ↓
High-quality trajectory pool
   ↓
Distillation candidate selection
   ↓
Student model training
   ↓
Independent benchmark
   ↓
Compare:
   ├─ teacher
   ├─ student
   ├─ original Abelink runtime
   └─ distilled-agent runtime
```

Tujuannya bukan otomatis membuat student meniru semua teacher behavior.

Tujuannya adalah mengukur apakah capability tertentu dapat dipindahkan ke model yang lebih murah, lebih kecil, atau lebih cocok untuk execution path tertentu.

---

# 28. Inference Configuration Is Part of the Experiment

Untuk eksperimen jangka panjang, benchmark tidak hanya mengidentifikasi model name.

Configuration yang relevan dapat mencakup:

- model/version
- provider
- quantization
- inference engine
- context window
- reasoning effort/setting bila tersedia
- tool configuration
- retrieval configuration

Model yang sama dengan quantization/config berbeda dapat dianggap sebagai **experimental variants**.

Jangan menggabungkan hasilnya sebagai satu model identity jika configuration-nya materially berbeda.

---

# 29. Data Collection Rules

1. **Use the same task prompt across compared models** bila tujuan benchmark adalah comparison.
2. **Use fresh/dedicated session per task/model** untuk mencegah cross-task contamination.
3. **Long-horizon task tetap satu dedicated session** agar context retention dapat diuji.
4. **Raw export adalah source data.** Jangan edit manual sebelum preservation copy dibuat.
5. **Normalize setelah export secara batch**, bukan mengetik JSON satu per satu.
6. **Unknown telemetry tetap unknown.** Jangan mengarang tool calls, latency, token count, sources, atau retrieval traces.
7. **Quantization/configuration harus dicatat bila tersedia.**
8. **Distillation dataset adalah subset terpilih**, bukan seluruh raw corpus.
9. **Verification dilakukan sebelum sample dianggap high-quality/gold.**
10. **Student dievaluasi secara independen**, bukan hanya terhadap teacher-generated target.

---

# 30. Operational Workflow yang Praktis

Workflow untuk eksperimen pertama:

```text
Prepare 10 tasks
       ↓
Run each task on several models
       ↓
Fresh session per task/model
       ↓
Export raw data
       ↓
Store raw copy unchanged
       ↓
Run one batch normalization pass
       ↓
Inspect missing telemetry
       ↓
Verify / label outcomes
       ↓
Build eval dataset
       ↓
Analyze system failures and useful behaviors
       ↓
Extract distillation candidates only if student training is planned
```

User tidak perlu:

```text
chat
↓
copy JSON
↓
type metadata
↓
repeat forever
```

Workflow yang diinginkan:

```text
chat/export
    ↓
AI/script normalization
    ↓
structured dataset
```

---

# 31. What Counts as Success for This Experiment?

Pilot collection tidak dianggap selesai hanya karena file export berhasil dibuat.

Minimum:

```text
Task exists
    +
Same task can be replayed
    +
Raw export preserved
    +
Model identity captured
    +
Normalization works
    +
Unknown fields remain honest
    +
Verification/labeling exists
    +
Dataset can be split by purpose
```

Barulah dapat dinilai apakah data tersebut cukup berguna untuk:

- benchmark
- system improvement
- skill creation
- retrieval improvement
- policy improvement
- distillation

---

# 32. Common Misclassifications

| Situasi | Label yang tepat |
|---|---|
| Chat biasa disimpan | Interaction log |
| Chat dianalisis untuk memperbaiki Abelink | System improvement data |
| Tool/action sequence disimpan | Agent trajectory |
| Banyak model menjalankan task yang sama | Benchmark corpus |
| Input + expected output | Eval dataset |
| Teacher output diberikan ke human untuk review | Demonstration / review data |
| Teacher output menjadi target student training | Distillation |
| Dokumen ditambahkan ke vector DB | RAG corpus / knowledge store |
| Skill procedure dipromosikan setelah verification | Runtime capability learning |
| Model yang lebih kecil menggantikan sebagian teacher path | Potential deployment optimization |

---

# 33. Mental Model Utama

Gunakan empat pertanyaan ini:

```text
1. Apakah saya hanya menyimpan output?
   → bukan distillation

2. Apakah saya memakai output untuk memperbaiki system?
   → system improvement

3. Apakah saya memakai output untuk mengukur system/model?
   → evaluation / benchmark

4. Apakah student model belajar dari output tersebut?
   → distillation
```

Versi Agentic RAG:

```text
Teacher Agent
   ↓
observable trajectory
   ↓
verified / filtered
   ↓
┌───────────────────────────────┐
│                               │
│   system improvement          │   student training
│          ↓                    │          ↓
│  Abelink runtime              │   distilled model
│                               │
└───────────────────────────────┘
```

---

# 34. Non-Negotiable Boundaries

1. **Teacher output != distillation dataset automatically.**
2. **Raw export != verified target.**
3. **RAG corpus != student model.**
4. **System self-improvement != neural-weight training.**
5. **Model claim != verification proof.**
6. **Unknown != pass.**
7. **Missing telemetry != permission to invent telemetry.**
8. **Distillation subset != entire trajectory corpus.**
9. **Long-horizon task may use one long session, but benchmark tasks must not share context.**
10. **Quantization/configuration must remain visible when relevant to reproducibility.**
11. **Student must be evaluated independently after training.**
12. **Distillation does not imply the student is superior to the teacher.**
13. **A smaller model is useful only when its actual task performance and execution economics justify deployment on that path.**

---

# 35. Final Direction

Distillation di Abelink sebaiknya dipahami sebagai **optional model-learning layer di atas trajectory/evaluation infrastructure**, bukan sebagai definisi dari Abelink self-improvement.

Broad direction:

```text
Prompt / Task Set
        ↓
Multi-Model Agent Runs
        ↓
Raw Trajectory Corpus
        ↓
Normalization
        ↓
Verification / Evaluation
        ↓
Evidence-Grounded Dataset
        ↓
      +--------------------------+
      |                          |
      ↓                          ↓
System Improvement        Distillation Candidates
      ↓                          ↓
Policy / Skill / RAG       Student Training
/ Router / Verifier             ↓
      ↓                    Independent Eval
      +------------+-------------+
                   ↓
             Abelink Benchmark
```

Abelink tetap berorientasi pada:

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

Distillation menambahkan kemampuan untuk mengambil sebagian behavior yang telah diamati dan tervalidasi lalu mentransfernya ke student model.

Bukan berarti semua behavior harus didistillasi.

Bukan berarti teacher selalu benar.

Bukan berarti model menjadi core tunggal Abelink.

---

# 36. Vocabulary untuk Abelink

## Distillation Dataset
Subset trajectory/output yang sengaja dipilih dan diproses sebagai supervision untuk training student model.

## Teacher
Model/agent yang menghasilkan target atau behavior yang hendak dipelajari student.

## Student
Model yang dilatih untuk memperoleh capability/behavior tertentu dari teacher-generated supervision.

## Response Distillation
Distillation berbasis generated response/output dari teacher.

## Behavior Distillation
Transfer behavior seperti selection, routing, tool use, atau policy.

## Agent Distillation
Transfer behavior agent yang dapat mencakup planning, retrieval, tool use, recovery, atau observable trajectory.

## Agent Trajectory
Urutan observable state, action, tool call, observation, retrieval, dan outcome suatu agent run.

## RAG Corpus
Knowledge/document substrate yang digunakan oleh retrieval. Bukan student model.

## System Improvement
Perbaikan code, policy, retrieval, skill, verifier, router, atau runtime berdasarkan pengalaman/evidence.

## Runtime Capability Learning
Pembelajaran capability runtime tanpa gradient update pada model weights.

## Verified Teacher Target
Teacher-generated target yang telah melewati verification/quality control sesuai acceptance criteria yang tersedia.

## Independent Evaluation
Evaluasi student atau perubahan system dengan evaluasi yang tidak hanya bergantung pada teacher self-claim.

---

# 37. One-Line Mental Model

> **Agent trajectories are raw material; verified trajectories can become evaluation data, system-learning evidence, or distillation data depending on how they are used. Distillation begins when a student model is actually trained from teacher-generated supervision.**

---

# 38. Note on Experimental State

Eksperimen awal Abelink tidak perlu langsung dimulai dengan student training.

Urutan praktis yang disepakati:

```text
10 diverse tasks
   ×
several models
   ×
fresh session per task/model
   ↓
raw export
   ↓
batch normalization
   ↓
verification / labeling
   ↓
benchmark + system analysis
   ↓
only then evaluate whether a subset is worth distilling
```

Schema normalized adalah contract untuk automation, bukan pekerjaan manual per chat.

Jika export platform menyediakan field tambahan, field tersebut dapat dipertahankan. Jika tidak tersedia, jangan diinvent.


# 39. Benchmark v1 and Experiment Manifest

Eksperimen distillation Abelink sekarang memiliki dua artefak operasional yang terpisah tetapi saling terkait:

```text
abelink_agentic_rag_benchmark_v1.md
    ↓
exact task prompts + acceptance criteria + global output contract

experiment_manifest.json
    ↓
experiment metadata + task/configuration matrix + run/artifact contract
```

`abelink_agentic_rag_benchmark_v1.md` adalah **human-readable benchmark protocol**. Dokumen tersebut memuat 10 task final:

```text
TASK-001  Tauri 2 Capability and Permission Grounding
TASK-002  MCP Authentication Boundary
TASK-003  SQLite WAL and Network Filesystems
TASK-004  ONNX Runtime Node on Android/Termux
TASK-005  1M Context Capability Verification
TASK-006  Benchmark Score Does Not Automatically Prove AGI
TASK-007  Latest Release and Breaking-Change Investigation
TASK-008  Low-Resource Agent Execution Architecture
TASK-009  Retrieval Strategy Evidence Review
TASK-010  Adversarial Evidence and Overclaim Detection
```

Benchmark tersebut menggunakan output contract yang meminta answer/verdict, evidence table, observable retrieval/action summary, conflicts/gaps, dan source list. Private chain-of-thought bukan requirement.

`experiment_manifest.json` adalah **machine-readable experiment contract**, bukan hasil eksperimen. Manifest saat ini mendefinisikan:

```text
10 tasks
×
18 model/configuration candidates
```

Configuration dapat dibedakan berdasarkan:

- provider
- model label/version
- surface
- reasoning mode/effort
- web search availability
- quantization
- inference engine
- context configuration bila tersedia
- tool configuration bila relevan

Configuration yang belum dapat diverifikasi harus tetap `null`/unknown. Jangan mengisi metadata berdasarkan tebakan.

---

# 40. Export and Normalization Contract

Export harus dilakukan dengan urutan:

```text
MODEL RUN
   ↓
RAW EXPORT
   ↓
preserve unchanged
   ↓
BATCH NORMALIZATION
   ↓
NORMALIZED JSONL
   ↓
VERIFICATION / LABELING
```

Jangan mengetik normalized JSON satu per satu setelah setiap chat.

### Native Export

Jika platform menyediakan native conversation/data export, simpan hasil tersebut sebagai raw source.

### AI-Generated Export

Jika platform tidak menyediakan export yang memadai, model boleh diminta membuat structured export sebagai **derived artifact**. Namun:

```text
AI-generated export
    !=
raw transcript
```

AI-generated export harus diberi metadata `export_method` yang berbeda dan tidak boleh diperlakukan sebagai bukti bahwa semua field benar-benar ada di transcript asli.

### Missing Telemetry

Field berikut hanya boleh diisi jika benar-benar tersedia dari source:

```text
latency_ms
token_usage
tool_calls
retrieval_queries
documents_selected
documents_rejected
sources
citations
quantization
```

Jika tidak tersedia:

```text
missing ≠ zero
missing ≠ guessed
missing → null / empty collection sesuai semantics
```

### Observable Trajectory

Agentic RAG trajectory hanya mencatat actions/observations yang observable atau benar-benar tersedia dari export/runtime log.

Private chain-of-thought bukan field wajib dan tidak boleh direkonstruksi dari final answer.

---

# 41. Current Experimental State

Status eksperimen yang berlaku setelah benchmark v1:

```text
10 final benchmark tasks
        ↓
18 candidate model/configurations
        ↓
fresh session per task/configuration
        ↓
raw export
        ↓
batch normalization
        ↓
verification / labeling
        ↓
benchmark + system analysis
        ↓
distillation candidate selection
        ↓
student training only if justified
        ↓
independent evaluation
```

180 potential runs (`10 × 18`) adalah **full matrix**, bukan kewajiban untuk pilot pertama.

Pilot dapat menggunakan subset configuration terlebih dahulu untuk memvalidasi:

- prompt reproducibility
- export availability
- normalization contract
- telemetry coverage
- evidence verification
- dataset quality

Setelah pipeline terbukti bekerja, matrix dapat diperluas.

---

# 42. Artifact Boundary

Artefak eksperimen harus tetap dibedakan:

```text
abelink_agentic_rag_benchmark_v1.md
    = benchmark definition

experiment_manifest.json
    = machine-readable experiment configuration

raw/
    = immutable source exports

normalized/
    = normalized trajectory records

eval/
    = evaluation cases/results

distillation/
    = approved teacher-target candidates
```

Tidak boleh menganggap `experiment_manifest.json` sebagai dataset hasil run.

Tidak boleh menganggap seluruh `raw/` sebagai distillation corpus.

Tidak boleh memindahkan sample ke `distillation/` hanya karena teacher menghasilkan jawaban yang terlihat bagus. Sample harus memenuhi verification/quality criteria yang ditetapkan eksperimen.

---

# 43. Updated One-Line Operational Model

> **Run the same benchmark tasks in isolated sessions across explicit model/configuration variants, preserve raw exports, normalize without inventing telemetry, verify observable outcomes, then reuse validated trajectories separately for evaluation, system improvement, or student-model distillation.**
