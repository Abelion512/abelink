# PLAN — MCP pluggable (stdio + Streamable HTTP)

Status: **PLAN** (belum diimplementasikan) | Tanggal: 2026-10-02
Arahan owner: "MCP harus bisa lepas-pasang, transport stdio + Streamable HTTP"
Primary source: <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>

## 0. Kondisi sebenarnya saat ini (bukan asumsi)

Abelink **sudah punya** MCP client. Ini mengubah bentuk plan secara menentukan —
pekerjaan ini bukan "bangun MCP dari nol", melainkan "tutup satu celah transport
dan putuskan batas peran".

| Komponen | Status | Bukti |
| --- | --- | --- |
| MCP client, Streamable HTTP | ✅ **sudah jalan** | `sidecar/main/capabilities/mcp-client.ts` (173 baris), dipakai `manager.ts:137` saat `connector.transport === 'mcp'` |
| MCP client, **stdio** | ❌ **tidak ada** | Header file: *"SSE transport lawas dan stdio spawn BELUM didukung (gagal eksplisit, bukan diam)"* |
| Kepatuhan header protokol | ⚠️ parsial | Tidak ada `MCP-Protocol-Version` maupun `Mcp-Session-Id` di `mcp-client.ts` |
| Abelink sebagai **MCP server** | ❌ **tidak ada** | Tidak ada `tools/list`, `tools/call`, atau endpoint JSON-RPC di luar bridge browser |
| Model connector unified | ✅ sudah | `descriptor.ts` + `validation.ts` (validasi `inputSchema`) + audit log |

Katalog MCP yang sudah terdaftar: `google-calendar-mcp` (Streamable HTTP +
OAuth 2.0 Bearer) dan `context7`.

## 1. Pemetaan kontras: tool apa jadi apa

Ini inti pertanyaan owner. Tidak semua tool boleh keluar, dan tidak semua tool
perlu masuk lewat MCP.

| Permukaan Abelink | Peran MCP | Alasan |
| --- | --- | --- |
| `browser:*` (bridge lokal → extension) | **Internal saja** | Butuh token lokal 0600, pairing per-flavor, origin `chrome-extension://`. Mengeksposnya ke MCP client luar = memberi kendali browser user ke proses lain tanpa pagar. |
| `os:*` (pc-agent) | **Internal saja** | Akses desktop user. BUKAN untuk diekspos. |
| `fs:*` (workspace) | **Internal saja** | Terisolasi `resolve_contained`; keluarannya jadi lubang escape kalau dibungkus RPC. |
| `capabilities:*` (context7, calendar) | **MCP client** | Sudah jalan. Ini arah yang benar. |
| Tool MCP baru via stdio (filesystem, git, sqlite MCP) | **MCP client** | Menambah kapabilitas **tanpa kode Abelink baru**. Inilah arti "lepas-pasang". |
| `run-shell` / `git-commit` | **Internal, approval-gated** | Kalau nanti diekspos, approval native WAJIB tetap berlaku (lihat §4). |
| Tool baru (P0/P1 dari PLAN browser) | **Internal dulu** | Stabilisasi dulu di lapisan prompt sebelum jadi surface publik. |

**Prinsipnya:** MCP untuk **memasuk** (kapabilitas pihak ketiga), bukan untuk
**membocorkan keluar** (kapabilitas inti kita). Kontras ini yang harus dijaga.

## 2. Yang harus dikerjakan

### M1 — stdio transport di MCP client (P0, inti arahan owner)

Spec: *"Clients SHOULD support stdio whenever possible."* Abelink saat ini
menolak eksplisit. Implementasi:

```
sidecar/main/capabilities/mcp-transport-stdio.ts   (baru)
```

- `spawn(command, args)` per descriptor connector. `CapabilityDescriptor` punya
  `[key: string]: unknown`, jadi `command`/`args` **lolos tanpa perubahan skema** —
  tapi `validateDescriptor()` tidak menegakkannya. Menambahkannya sebagai
  kawalan wajib: konektor `transport: 'mcp'` + `command` harus punya `args`
  array dan `command` non-kosong, kalau tidak gagal saat validasi bukan saat spawn.
- Framing: **satu JSON-RPC message per baris**, `\n` sebagai delimiter.
  Spec: *"Messages are delimited by newlines, and MUST NOT contain embedded
  newlines."* JSON.stringify tidak pernah menghasilkan newline mentah, jadi
  compliant — tapi **wajib diuji**, bukan diasumsikan.
- `stderr` → logger sidecar. Spec: *"The server MAY write UTF-8 strings to
  stderr for logging purposes."* Kita meneruskan secara opsional.
- **Peringatan operasional:** server stdio yang salah konfigurasi akan
  menulis log ke stdout dan merusak protokol. Dokumentasikan di README
  capabilities bahwa stdout = kanal protokol, log harus ke stderr.
- Timeout dan `kill` saat capability dimatikan — agar tidak ada proses yatim
  (presedens: `cmd_node_bridge.rs` sudah pakai `killpg` untuk sidecar).
- **Privacy:** command + args bisa memuat token lewat argumen. Argumen tidak
  boleh masuk log harness (`appendAudit` sudah punya jalur redaksi — pakai itu).

### M2 — Kepatuhan protokol di Streamable HTTP yang sudah ada (P0, murah)

Spec mewajibkan hal-hal yang sekarang belum ada di `mcp-client.ts`:

| Kewajiban spec | Status | Perubahan |
| --- | --- | --- |
| Header `MCP-Protocol-Version` pada semua request setelah init | ❌ belum | Kirim hasil negosiasi initialize. Tanpa ini server harus diasumsikan 2025-03-26. |
| `Mcp-Session-Id` diteruskan di semua request berikutnya | ❌ belum | Simpan dari response initialize, kirim ulang. |
| Client harus dukung SSE **dan** JSON response | ✅ sudah | `_shared` sudah ambil frame SSE terakhir. |
| Backward-compat ke HTTP+SSE lawas | ❌ belum | Opsional; gagal eksplisit bila sampai ke sana, bukan diam. |

Ini bukan fitur baru — ini membuat client yang sudah ada **benar terhadap
spesifikasi**.

### M3 — `execute_3p` style passthrough (P2, kalau M1+M2 stabil)

Pola yang dipakai `chrome-devtools-mcp`: dua tool generik
(`list_3p_developer_tools` + `execute_3p_developer_tool`) sebagai pintu masuk
tool pihak ketiga yang tidak dideklarasikan satu per satu. Berguna kalau
jumlah konektor MCP bertambah dan tidak layak didaftar manual satu per satu.

Catatan: Abelink sudah punya layer `capabilities` sendiri dengan deskriptor +
validasi per konektor, jadi pola ini **tidak boleh diduplikasi** di lapisan
prompt — ia hanya relevan kalau daftar konektor menjadi terlalu besar untuk
dideklarasikan eksplisit.

**Syarat:** kalau capability MCP masuk lewat jalur ini, `validation.ts` yang ada
harus tetap dipakai. Jangan buat jalur pintas yang melewati validasi `inputSchema`.

## 3. Abelink sebagai MCP server (P3, opt-in — perlu keputusan owner)

chrome-devtools-mcp adalah **MCP server**. Kalau pemilik Abelink ingin agent
luar (Cursor, Claude Code, MCP client lain) bisa memakai browser Abelink, itu
butuh sisi server. Yang akan diekspos — dan hanya itu:

| Diekspos | Tidak diekspos |
| --- | --- |
| tool `browser_*` versi P0-1 (terpisah, deterministik) | `os:*` — akses desktop |
| `capabilities` yang sudah di-mount user | token bridge mentah, pairing blob |
| observasi browser (semantic-first) | `fs` di luar workspace |

Prioritas rendah: nilainya bergantung pada P0-1 yang belum dikerjakan, dan
menambah server berarti menambah permukaan keamanan.

## 4. Batasan keamanan yang tidak bisa dilanggar

1. **Approval gate tidak boleh hilang.** Kalau tool destruktif diekspos lewat
   MCP server, dialog `rfd` di `cmd_node_bridge.rs` harus tetap menyala.
   Kontrak beku: `APPROVAL_ACTIONS`. Kalau tidak bisa dijamin, **jangan** ekspos.
2. **Bind 127.0.0.1 saja.** Spec: *"When running locally, servers SHOULD bind
   only to localhost (127.0.0.1) rather than all network interfaces."*
   Presedens sudah ada: `bridge-core.ts` `HOST: '127.0.0.1'`.
3. **Validasi Origin.** Spec: *"Servers MUST validate the Origin header on all
   incoming connections to prevent DNS rebinding attacks."* Presedens sudah ada:
   `browser/server.ts` `checkOrigin()`. Jangan tulis ulang — reuse.
4. **Token hanya di file 0600**, tidak pernah ke renderer/log. Presedens:
   `native-host.ts` + `redactHeaders` di `mcp-client.ts`.
5. **Process group kill** untuk stdio child, mengikuti pola `killpg` yang sudah
   dipakai `cmd_node_bridge.rs` untuk sidecar.

## 5. Urutan pengerjaan

| # | Item | Nilai | Risiko |
| --- | --- | --- | --- |
| 1 | M2 (header protokol) | Murah, membenarkan yang sudah ada | rendah |
| 2 | M1 (stdio transport) | Inti arahan owner | sedang — butuh uji framing |
| 3 | Uji framing newline + proses yatim | Bukti M1 benar | — |
| 4 | M3 (passthrough P2) | Tergantung 1 + 2 | sedang |
| 5 | Sisi server (P3) | **Perlu keputusan owner dulu** | tinggi (permukaan keamanan) |

## 6. Bukti yang harus ada sebelum M1 dianggap selesai

- Test: dua message dalam satu `write` terbaca sebagai dua frame terpisah.
- Test: string berisi `\n` di dalam JSON **tidak** memotong frame.
- Test: server yang menutup stderr tidak membuat client hang.
- Test: `capability:disable` membunuh proses **dan** keturunannya.
- Test: argumen berisi string mirip token tidak muncul di log audit.

## 7. Yang sengaja TIDAK dikerjakan di plan ini

- **Server HTTP terpisah** — sidecar sudah dispatcher stdio. Menambah HTTP
  server berarti dua jalur identik; tidak ada kebutuhan yang belum terpenuhi.
- **Peluang MCP marketplace / dynamic discovery** — `catalog.ts` sudah cukup
  untuk kebutuhan sekarang; dynamis menambah mode kegagalan.
- **Mengubah tool native jadi MCP** — bertentangan dengan §1. Tool native yang
  butuh approval native tidak boleh melewati dialog tersebut.
