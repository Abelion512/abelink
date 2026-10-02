# Session 2026-10-02 — Ratchet any 2/5: `sidecar/main/tools/browserTools.ts`

Program: turunkan baseline any per zona dengan menangani file terpadat satu per
satu, baseline dikecilkan di PR yang sama (aturan `scripts/ci/any-ratchet.sh`).

## Apa & kenapa

File terpadat ke-2 di zona kontrak: **87 `any`** di 787 baris. Berbeda dari
PR 1, file ini **bukan registry murni** — dia lapisan tool yang memanggil
bridge, extension, jaringan, dan pihak ketiga. Jadi biayanya lebih tinggi:
hampir setiap `any` mewakili data yang datang dari luar tipe.

Yang membuat file ini amenable: **21 dari 87 `any` berasal dari satu pola
yang sama persis** — `handler: async (query: any, config: any)`. Sekali
`browserTools` diberi tipe `ToolEntry`, sisa handler ikut bertipe lewat
kontekstual typing tanpa disentuh satu per satu.

## Kontrak yang ditegakkan (bukan ditebak)

Ditelusuri ke call-site nyata, bukan diasumsikan:

| Kontrak | Bukti |
| --- | --- |
| `handler(query: string, config: object)` | `sidecar/engine/channels/ai.ts:118` — `tool.handler(query, config)`; `engine/channels/os.ts:40` — `tool.handler((query as string) ?? '')` |
| `ToolResult` punya `success` + `message`/`error` + `data` | ai.ts:118 melakukan `as { success?: unknown }` |
| `browserTools` adalah map entri tool | `sidecar/main/node-tools.ts:9,17` menyebarkannya ke `NATIVE_TOOLS` |

Tipe baru: `ToolQuery`, `ToolConfig`, `ToolResult`, `ToolHandler`, `ToolEntry`,
`DispatchResponse`, `EnsureBrowserUpResult`, `Loose`, plus helper `errMessage()`.

## Dua keputusan yang perlu dijelaskan

**1. `catch (e: any)` → `catch (e)` + helper `errMessage()`.**
`catch` tanpa anotasi memberi `unknown` di bawah `strict`. Kode lama melakukan
`e.message` atau `e?.message || String(e)`. Ketiganya tidak kompatibel dengan
`unknown`, jadi dibuat satu helper:

```ts
const errMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String((e as Loose | null)?.message ?? e ?? '')
```

Perilaku dipertahankan: `Error` tetap memakai `.message`, objek biasa tetap
diambil `.message`-nya, nilai lain tetap `String(...)`. Ini pola yang sama
dipakai TypeScript sendiri saat compounding unknown errors.

**2. `resolveExtractQuery` diubah ke discriminated union.**
File ini masih `query: any` dan mengembalikan objek yang **tidak punya
diskriminan** — `ok` di-infer sebagai `boolean`, sehingga `if (!resolved.ok)`
tidak pernah menyempit dan `resolved.error` selalu error. Diubah ke:

```ts
| { ok: true; url: string; error?: undefined }
| { ok: true; url: null; via: 'extension'; error?: undefined }
| { ok: false; error: string }
```

`error?: undefined` di cabang sukses dipilih **karena zona beku K9**: test
kontrak `tests/browser-extract-contract.test.ts:8` membaca `r.error` tanpa
narrowing. Menambah `error?: undefined` membuat pembacaan itu tetap valid di
level tipe, jadi **ekspektasi test tidak perlu disentuh** — diskriminan `ok`
sekaligus working.

## Perubahan lain yang tidak mengubah perilaku

- `ensureExtensionUp`: `if (r.ok)` → `if (r.ok && r.session)`. Sebelumnya
  `r.session` bertipe `any` sehingga `undefined` lolos; sekarang narrowed.
  Jalur `ok && !session` jatuh ke `lastReason` — yang memang kontrak lamanya.
- `browser-read` representation: `process.env.ABELINK_BROWSER_OBSERVATION as any`
  → tanpa cast. `resolveObservationRepresentation` sudah menerima
  `string | undefined`.
- `_query` pada `browser-ask-user`, `reject` pada `new Promise` htmlparser2,
  dan `config` tak terpakai: dibersihkan agar 0 warning baru.
- `payload: Record<string, any>` → `Loose`.

## Referensi

- TypeScript 3.0 release notes, `unknown` dan narrowing:
  *"Anything is assignable to unknown, but unknown isn't assignable to anything
  but itself and any without a type assertion or a control flow based
  narrowing."* Dasar untuk `unknown` + helper, bukan `any` yang dibiarkan.
  <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html>
- TypeScript handbook, narrowing via discriminated unions. Dasar untuk
  `ExtractQueryResult` dan `error?: undefined`.
  <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>
- Prinsip repo sendiri: `eslint.config.ts` `no-explicit-any: 'warn'` +
  `scripts/ci/any-ratchet.sh` (W9).

## Baseline

| Zona | Sebelum | Sesudah |
| --- | --- | --- |
| contract | 2029 | **1941** |
| tests | 208 | 208 |
| max | 2237 | **2149** |

## Verifikasi

- 3x tsc exit 0 (payung, node, tests). `extract-query.ts` ikut turun ke 0.
- eslint kedua file: **0 warning** (sebelumnya 87+4 any).
- vitest penuh: **1836 pass / 16 skip** (168 file). Nol regresi.
- `bun evaluation/smoke.ts` LOLOS.
- `bun run build` (vite) sukses.
- `any-ratchet.sh` exit 0 setelah baseline dikecilkan.
- CJK scan bersih.

## Batasan

- `bridge-core.ts` masih `dispatchCommand(sessionId: any, type: any, payload: any)`
  dan `listSessions()` tanpa tipe. Hasilnya di-cast di call-site
  (`as DispatchResponse`) — jujur, karena bentuk wire response memang belum
  bertipe. Itu file Domains berikutnya, bukan dalam PR ini.
- `NATIVE_TOOLS: Record<string, any>` di `node-tools.ts` masih longgar;
  mengetiknya berarti ikut mengetik 6 domain tool sekaligus.
- Kemampuan modul tidak berubah. Semua test browser
  (`browser-e2e`, `browser-snapshot`, `browserReadRecovery`,
  `browser-extract-contract`) hijau tanpa perubahan ekspektasi.