# Session 2026-09-19 — Boot overlay masih nyantol (ronde 2)

## Fakta dari harness log (dev, bukan tebakan)

- `answers/turn-end/reasoning.jsonl` 2026-09-19: turn greeting `completed`.
- `setIsBooting` hanya dipanggil dengan `false` (3 situs); tak ada yang
  mengembalikan `true`. ChatProvider tunggal.

## Akar sebenarnya

StrictMode dev: mount → cleanup (`clearTimeout` fallback 6 detik ikut
dibatalkan) → re-effect, tapi `hasGreetedRef.current` sudah `true` sehingga
cabang greeting + fallback TIDAK dibuat ulang. Overlay nyangkut selamanya
walau greeting selesai (harness buktikan completed).

## Perbaikan

- Effect fallback mandiri di luar guard: `isBooting → false` setelah 6 detik,
  selalu aktif tiap mount ulang. Greeting effect tetap seperti semula.
- Lint 0 errors.

## Catatan

Screenshot ronde 1 kemungkinan diambil sebelum restart dengan kode fallback
pertama. Bila setelah restart + fix ini masih nyangkut, baca console
`[useAbelinkAgent]` — bukan menebak lagi.
