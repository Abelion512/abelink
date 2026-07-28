# Arsitektur Mark Agent

## Model Proses

```
+-----------------------------------------------------------+
|                     MAIN PROCESS                           |
|  Electron (Node.js)                                        |
|  index.js -> window mgmt, tray, IPC handlers (35+)         |
|  ai-bridge.js -> HTTP client multi-provider                |
|  pc-agent.js -> AT-SPI/xdotool desktop automation          |
|  browser-agent.js -> hidden BrowserWindow                   |
|  plugin-loader.js -> plugin lifecycle management            |
|                                                             |
|  +-------------------------------------------------------+ |
|  |  PRELOAD (contextBridge)                              | |
|  |  window.api -> 60+ methods via IPC                    | |
|  +-------------------------------------------------------+ |
+---------------------------+-------------------------------+
                            | IPC
+---------------------------v-------------------------------+
|                    RENDERER PROCESS                        |
|  React 19 + Vite 7                                        |
|  useMarkPlan.js -> ReAct loop engine (787+ lines)         |
|  planning.js -> intent vector routing (8 categories)      |
|  vectorMemory.js -> Transformers.js WASM embeddings        |
|  db.js -> Dexie IndexedDB (6 stores)                      |
|                                                             |
|  Pages: MarkHome, Config, Plugins, LiveAudio, Guidebook,   |
|         Knowledge, RelationalGrowth, WhatsappBot           |
+-----------------------------------------------------------+
```

Komunikasi Main <-> Renderer **harus** lewat IPC via preload. Tidak ada akses `fs`/`path` langsung dari renderer.

## Siklus Agent (ReAct Loop)

```
Input User
  |
  v
[1] planning.js - klasifikasi intent (vector similarity >= 0.35)
  |
  v
[2] getNextAction() - bangun system prompt + memory context
  |
  v
[3] AI Response (JSON): { thought, action, answer, mood, memory }
  |
  v
[4] useMarkPlan.js - dispatch tool (browser, file, WA, music, dll)
  |
  v
[5] Evaluasi -> [2] atau selesai -> output ke user
```

**Thresholds kunci:**
- Vector similarity intent routing: **0.35**
- Max retries per plan: **2**
- Cloud rate limit delay: **3000ms**
- Awareness cooldown: **9 menit**

## AI Pipeline

### Multi-Provider Architecture

```
+----------+
|   User   |
+----+-----+
     |
     v
+----------+     +------------------+
|   UI     |---->|  ai-bridge.js    |
| (React)  | IPC |  fetchAI()       |
+----------+     |  retry: 10x      |
                 |  backoff: exp    |
                 |  fallback: auto  |
                 +--------+---------+
                          |
            +-------------+-------------+
            |             |             |
      +----------+  +----------+  +----------+
      | 9Router  |  | LM Studio|  |  Groq    |
      | :20128   |  | :1234    |  | (cloud)  |
      +----------+  +----------+  +----------+
            |
      +----------+
      | Fallback  | <- openai/gpt-oss-20b (saat 429/503)
      +----------+
```

### JSON Parsing Resilience (3-tier fallback)
1. `json_schema` -> structured output
2. `json_object` -> response format
3. Unrestricted -> schema di system prompt

Parser: `cleanAndParse()` - direct parse -> strip markdown -> substring -> clean control chars -> jsonrepair

### Model Registry
File: `~/.config/mark-agent/model-registry.json` - 100% JSON-driven, zero hardcoded models.
Struktur: `models{}`, `combos{}` (fallback chain), `analytics{}` (usage stats).

## Memory System

```
+-------------------------------------------------------+
|                    DEXIE (IndexedDB)                    |
|  +----------+ +----------+ +----------+ +----------+  |
|  |  memory   | | sessions | |  config  | |chatArchive|  |
|  |(vectors)  | |          | |(25+fields)| |          |  |
|  +----------+ +----------+ +----------+ +----------+  |
|  +----------+ +----------+                             |
|  | documents| |relations| (4 traits)                   |
|  +----------+ +----------+                             |
+----------------------------+--------------------------+
                             |
                             v
+-------------------------------------------------------+
|              ORAMA (in-memory search)                   |
|  archiveIndex + documentIndex                          |
|  Hybrid full-text + vector search (384d)               |
|  Threshold: 0.25                                       |
+-------------------------------------------------------+
                             ^
+-------------------------------------------------------+
|          TRANSFORMERS.JS (WASM - lokal)                |
|  Model: paraphrase-multilingual-MiniLM-L12-v2          |
|  Dimensi: 384, Max token: 512                          |
|  Jalan di CPU via ONNX WASM - tanpa GPU               |
+-------------------------------------------------------+
```

### Alur Retrieval
1. `getRelevantMemory()` -> profile + preference (direct vector match)
2. `searchExtendedMemory()` -> notes + learn (threshold 0.3, top 3)
3. `searchArchives()` + `searchDocuments()` -> Orama hybrid (threshold 0.25)
4. `getUnifiedContext()` -> merge -> inject ke system prompt

## OS Interface (Linux)

### PC Agent (pc-agent.js)
- **AT-SPI** (D-Bus accessibility tree) - baca elemen UI, daftar window
- **xdotool** - klik, ketik, shortcut (X11)
- **ydotool** - fallback untuk Wayland
- **Tesseract OCR** - baca teks dari screenshot

### Browser Agent (browser-agent.js)
- **Hidden BrowserWindow** (show: false) - browser fisik, bukan headless
- **DOM Parser** - tag 80 elemen interaktif dengan data-mark-id
- **Unblock mode** - tampilkan window untuk CAPTCHA/login manual
- **Popup blocker** via setWindowOpenHandler

## Keamanan

| Layer | Mekanisme |
|-------|-----------|
| **IPC** | preload contextBridge - hanya method tertentu terekspos |
| **Dangerous ops** | Approval dialog modal (file write, shell, delete) |
| **Electron sandbox** | Renderer sandbox:true (main process false by design) |
| **Database** | Lokal IndexedDB - no telemetry/analytics |
| **Plugin** | Skrip Node.js di ~/Documents/Mark Plugins/ |

## Konstanta Kritis

| Konstanta | Nilai | Lokasi |
|-----------|-------|--------|
| Vector similarity (memory) | 0.3 | vectorMemory.js |
| Vector similarity (orama) | 0.25 | oramaStore.js |
| Intent routing | 0.35 | planning.js |
| Max trait drift | 0.01 | relationship.js |
| Awareness cooldown | 9 menit | useAwareness.js |
| Cloud rate limit | 3000ms | ai-bridge.js |
| RAG chunk size | 500 chars, 50 overlap | ragPipeline.js |
| DOM parser max elements | 80 | browser-agent.js |
| VAD speech threshold | RMS > 0.015 | useVAD.js |
| Chat archive threshold | 10 messages | useChatArchiver.js |
