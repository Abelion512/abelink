# PLAN — Pemetaan design principles `chrome-devtools-mcp` ke tool browser Abelink

Status: **PLAN** (belum diimplementasikan) | Tanggal: 2026-10-02
Referensi primer: <https://github.com/ChromeDevTools/chrome-devtools-mcp>
(`docs/design-principles.md`, `docs/tool-reference.md`)
Peta repo: `docs/REFERENCE-LIBRARY.md` entri #15 (Chrome DevTools MCP)

## 0. Kenapa dokumen ini ada

`chrome-devtools-mcp` adalah implementasi referensi resmi Google untuk
"seperti apa kendali browser yang baik untuk agent". Repo ini sudah ada di peta
referensi kita sebagai **entri #15, status `unused`**. W0-W9 (program migrasi
TypeScript) baru saja selesai, jadi ini momen yang tepat: migrasi memberi kita
repo 100% TypeScript yang stabil, sekarang mari pakai standar yang benar untuk
lapisan browser.

Dokumen ini **bukan karangan sendiri**: setiap klaim di bawah
bersumber dari `docs/design-principles.md`/`tool-reference.md`, atau ditandai
sebagai temuan terhadap kode Abelink yang bisa diverifikasi.

## 1. Prinsip yang diambil, dan status Abelink sekarang

| Prinsip (kutipan resmi) | Status Abelink | Catatan |
| --- | --- | --- |
| **Agent-Agnostic API** — "Use standards like MCP. Don't lock in to one LLM." | ❌ belum | Tool browser adalah wire action `browser:*` milik Abelink. Sesuai arahan owner (MCP pluggable, stdio + Streamable HTTP) ini antrean tersendiri. |
| **Token-Optimized** — "LCP was 3.2s is better than 50k lines of JSON." | ✅ sudah aligns | `formatBrowserObservation` sudah semantic-first + cap (80 elemen, 5000 char teks). Ini yang paling matang. |
| **Small, Deterministic Blocks** — "Click, Screenshot, not magic buttons." | ❌ belum | `browser:action` adalah **satu** tool dengan 15+ sub-action di dalam `switch`. Ini justru "magic button"-nya. |
| **Self-Healing Errors** — "actionable errors that include context and potential fixes." | ❌ belum | Error sekarang `{ok:false, error:"<string>"}` polos, tanpa konteks atau saran pemulihan. |
| **Human-Agent Collaboration** — "readable by machines AND humans." | ⚠️ sebagian | Observasi memang terbaca manusia, tapi error tidak. |
| **Progressive Complexity** — "simple by default, advanced optional args." | ⚠️ sebagian | Tidak ada knob opsional; semua langsung. |
| **Reference over Value** — "return a file path, never the raw data stream." | ⚠️ sebagian | Hasil ke model sudah berupa **path** workspace dengan containment aktif — itu benar. Tapi data PNG base64 masih melintasi bridge lebih dulu (`data:image/png;base64,...` → tulis file di sidecar), jadi prinsipnya baru terpenuhi di hilir. `extract`/`script` juga masih bisa dump mentah. |

## 2. Kesenjangan kapabilitas (yang benar-benar hilang)

Diurutkan dari yang paling menghambat agent.

| Tool chrome-devtools-mcp | Status Abelink | Catatan |
| --- | --- | --- |
| `handle_dialog` | ❌ **tidak ada** | `alert()`/`confirm()`/`prompt()` membekukan halaman. Agent akan hang atau gagal klik apa pun. Ini celah paling berbahaya. |
| `list_console_messages` + `get_console_message` | ❌ **tidak ada** | Saat agent gagal, penyebabnya 90% ada di console. Blind spot besar. |
| `list_network_requests` + `get_network_request` | ❌ **tidak ada** | Debugging form/API impossible. |
| `fill_form` (batch) | ❌ **tidak ada** | Login 5 field = 5 putaran. Batch = 1. |
| `upload_file` | ❌ **tidak ada** | Hanya `download` yang ada. |
| `select_page` / `list_pages` | ⚠️ implisit | Tab dikelola lewat grup sesi + tab primer, tapi tidak ada cara **minta daftar** page yang masih hidup. |
| `press_key` | ⚠️ ada tapi tidak dipromosikan | `action==='press'` ada di extension, tidak ada di lapisan prompt. |
| `hover` | ⚠️ parsial | Tidak ada sebagai aksi tersendiri. |
| `drag` | ❌ **tidak ada** | Drag-and-dropmustahil sekarang. |
| `emulate` (viewport/CPU/network) | ❌ **tidak ada** | Tidak bisa menguji responsif atau kondisi lambat. |
| `click_at` (koordinat) | ❌ **tidak ada** | Di Abelink sengaja tidak ada (vision). Catat: chrome-devtools-mcp menaruhnya di balik flag `--experimentalVision`. |
| `performance_*`, `lighthouse_audit` | ❌ **tidak ada** | Prioritas rendah untuk agent generalis. |
| `take_snapshot` | ✅ setara | `browser:read-dom` + `action==='snapshot'` sudah mengembalikan teks semantik + `data-abelink-id` per elemen — analog `uid`. |

## 3. Yang harus DIJAGA (keunggulan Abelink, jangan dibongkar)

`chrome-devtools-mcp` menjalankan Chrome-nya sendiri via puppeteer. Abelink
menempel ke **profil dan login yang sudah ada** milik user. Itu keunggulan yang
tidak bisa ditiru tanpa kehilangan privasi:

- `browser:ask` — bertanya ke user lewat overlay. Tidak ada padanannya di sana.
- Overlay co-pilot + tombol **Stop** (HITL discipline).
- Sesi-grup + tab identity (anti-curi tab).
- Bridge lokal `127.0.0.1`, token lokal, tanpa telemetri.
- `browser:status` / `browser:reconnect` sebagai kondisi Jujur.

Prinsip "agent-agnostic" di sini **tidak berarti mengganti arsitektur kita**:
artinya jangan mengunci kapabilitas browser ke satu bentuk prompt.

## 4. Perubahan konkret per tool

### Prioritas P0 — menutup lubang yang bisa menggigit agent

**P0-1. `browser:action` dipecah jadi tool terpisah di lapisan prompt.**

Ini perubahan terbesar dan paling murah. Wire channel tetap satu (tidak menyentuh
kontrak beku bridge/approval), tapi **lapisan prompt**-mmwf-memperagakan sub-action
menjadi tool terpisah yang deterministik:

| Tool prompt baru | Sub-action yang dibungkus | Alasan |
| --- | --- | --- |
| `browser_click` | `click` | Sudah ada; jadikan tool mandiri. |
| `browser_fill` | `type` | Nama "fill" lebih jujur: set nilai, bukan ketik karakter per karakter. |
| `browser_press_key` | `press` | Sudah ada, tidak terpromosikan. |
| `browser_wait_for` | `wait-for` | Sudah ada; namanya sudah persis. |
| `browser_extract` | `extract` | — |
| `browser_evaluate` | `script` | Namakan `evaluate` agar agent tahu ini JS arbitrer. |
| `browser_screenshot` | `screenshot` | — |
| `browser_download` | `download` | — |
| `browser_ask_user` | `ask` | — |

Semuanya dapat parameter `includeSnapshot` (default **false**) sesuai referensi.

**P0-2. `browser_handle_dialog`** (BARU).
Chrome punya `chrome.webNavigation`-lapis dialog; dari service worker, dialog
native tidak bisa di-`alert` dari SW. Jalur yang mungkin: `scripting.executeScript`
memasang hook `window.onbeforeunload` + `chrome.scripting` untuk dialog. **Ini
perlu spike teknis lebih dulu** — jangan janjikan sebelum diuji. Kalau tidak
feasibel dari SW, alternatifnya: return error yang jujur + instruksi
`browser_evaluate` untuk memasang hook manual.

**P0-3. `browser_console`** (BARU).
`list` (N terakhir, dengan level + text) dan `get` (satu msgid). Data diambil
via `scripting.executeScript` dengan hook `console.*` yang di-cache per tab.
Biaya: hook harus dipasang **sebelum** navigasi, jadi kemungkinan perlu
`initScript`-style pre-load.

**P0-4. Error jadi self-healing.**
Envelope_error berubah dari `{ok:false, error:string}` menjadi:

```ts
{ ok: false,
  error:   string,   // ringkas, terbaca manusia
  cause:   string,   // apa yang sebenarnya gagal
  hint:    string,   // apa yang harus dicoba agent
  retryable: boolean }
```

Contoh nyata yang paling sering terjadi: `abelinkId` basi karena DOM berubah →
`hint: "kartu atau form berubah; panggil browser_read_dom lagi untuk id terbaru"`.
Nilai `hint` harus **dihasilkan di titik kegagalan**, bukan ditebak di prompt.

### Prioritas P1 — efisiensi putaran dan composite

**P1-1. `browser_fill_form`** (BARU). Array of `{ abelinkId, value }` dalam satu
panggilan. Login/registrasi/checkout turun dari 5+ putaran jadi 1.

**P1-2. `includeSnapshot` seragam.** Semua tool aksi punya parameter opsional
`includeSnapshot` (default false). Setelah klik, agent sering butuh tahu "tapi
halamannya berubah" —biaya untuk itu harus **dibeli secara sadar**, bukan
default.

**P1-3. `browser_list_pages` + `browser_select_page`.** Ability melihat tab yang
masih hidup milik sesi, dan memilih anchor. Saat ini tab primer dipilih diam-diam
oleh `targetTabForSession`; agent tidak pernah bisa bilang "pindah ke tab login".

**P1-4. `browser_upload_file`.** Duality dari `download` yang sudah ada.

**P1-5. `browser_hover` + `browser_drag`.** Dua aksi kecil yang sekarang mustahil.

### Prioritas P2 — observability & emulasi

**P2-1. `browser_network`** (list + get). Hanya kalau benar-benar dibutuhkan;
raw body harus lewat path file (prinsip *reference over value*), bukan inline.

**P2-2. `browser_emulate`** (viewport / CPU throttle / offline). Berguna untuk
menguji layout responsif dan kondisi lambat. Viewport paling murah dan paling
sering dipakai.

**P2-3. `click_at` (koordinat)** — **sengaja tidak diambil.** chrome-devtools-mcp sendiri
menaruhnya di balik `--experimentalVision`. Abelink sudah punya jalur vision
(`browser:snapshot` + OCR `os_ocr_region`). Menambahkan klik koordinat akan
membuka mode baru yang berduplikasi. Catat sebagai "sengaja tidak".

## 4b. Hasil verifikasi klaim (bukan asumsi)

Setiap klaim "tidak ada" di atas diverifikasi dengan `grep` terhadap kode nyata:

| Klaim | Perintah | Hasil |
| --- | --- | --- |
| Tidak ada penanganan dialog | `grep -ci "dialog\|onbeforeunload" extension/src/background.ts` | **0** |
| Tidak ada API console message | `grep -n "console\." extension/src/background.ts` | 6 hit, semua `console.log/warn` milik service worker sendiri — bukan capture console halaman |
| Tidak ada API network | `grep -ci "webRequest\|Network\."` | **0** |
| `press` tidak ada di lapisan prompt | `grep -c "'press'" src/api/tauri-bridge.ts` | **0** (ada di extension, tidak pernah dipromosikan) |
| Screenshot kembali sebagai path | `browserTools.ts` `browser-screenshot` | Benar — `return { success: true, data: guarded.path }` dengan `assertContained` |

## 5. Urutan pengerjaan yang disarankan

1. **P0-1** (pecah tool) — tanpa menyentuh wire. Perubahan kecil di lapisan
   prompt, langsung menurunkan beban prompt karena tiap deskripsi tool jadi jauh lebih pendek.
2. **P0-4** (error self-healing) — lompatan paling besar untuk agent yang
  -produktif, dan bisa dilakukan bersamaan dengan P0-1.
3. **P1-2** (`includeSnapshot`) — sepele, langsung.
4. **P0-2 / P0-3** — perlu spike teknis dulu (dialog dari SW, hook console
   pre-navigation). Buat spike sebelum menulis fitur.
5. **P1-1** (`fill_form`) — Setelah P0-1, jadi mudah.
6. Sisanya (P1-3..P2-2) menurut kebutuhan nyata.

## 6. Batasan & hal yang TIDAK boleh hilang

- **Kontrak beku tidak boleh disentuh.** Double-pipe delimiter `NATIVE_TOOLS`,
  `APPROVAL_ACTIONS` di `cmd_node_bridge.rs`, port 49712/49713, wire frame
  engine. Semua P0/P1 di atas murni lapisan prompt + isi `data`/`error`, bukan
  transport.
- **K9: ekspektasi test = kontrak.** `tests/browser-*.test.ts` membaca literal
  `background.ts` (`FLAVOR_PORTS`, `NATIVE_HOSTS`, `TAGGER_MAX`, dll). Perubahan
  P0-2/P0-3 yang menyentuh `background.ts` **wajib** mempertahankan literal itu.
- **Benchmark harus tetap bisa mengukur.** `ABELINK_BROWSER_OBSERVATION` dan
  fixture `representation` (`raw`|`semantic-first`) adalah sumbu eksperimen
  PR46. P0-1 tidak boleh mengubahnya; kalau P0-3 menambah kanal data baru,
  ukur dulu dampaknya ke token.
- **Privacy-first.** Tidak boleh menambah dependency cloud wajib. Snapshot
  console/network bisa membocorkan data sensitif user — harus punya batas
  ukuran dan tidak boleh masuk log harness tanpa disaring.

## 7. Yang TIDAK diambil dari chrome-devtools-mcp

- **`execute_3p_developer_tool` / `list_3p_developer_tools`** — kita sudah punya
  `capabilities` (`sidecar/main/capabilities/`). Menambah lapisan kedua hanya
  menduplikasi.
- **Memory tools (14 tool heapsnapshot)** — di luar cakupan.
- **PWA tools** — OS-level, bukan browser-agent.
- **WebMCP** — menarik secara teknis, tapi arahan owner soal MCP sudah punya arah
  sendiri (pluggable stdio + Streamable HTTP). Dicatat sebagai kemungkinan,
  bukan bagian plan ini.
