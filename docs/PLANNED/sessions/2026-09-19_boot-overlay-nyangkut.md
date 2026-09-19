# Session 2026-09-19 — Boot overlay nyangkut di hello

## Gejala (screenshot user)

Hello tampil penuh tapi overlay tak pernah turun. Layar hitam + hello statis.

## Akar

`useAbelinkAgent.js`: `setIsBooting(false)` hanya di `finally` greeting AI
(`handlePlanningCommand` + 800ms). Bila provider lambat/gagal/timeout,
overlay `isBooting` di AbelinkHome nyangkut selamanya.

## Perbaikan

- Fallback paksa: `setTimeout(() => setIsBooting(false), 6000)` saat boot mulai.
- `clearTimeout` di finally (greeting cepat → jalur normal) + cleanup unmount.
- Lint 0 errors.

## Catatan

Hello kini animasi tanpa syarat (keputusan user) — yang terlihat "statis" di
screenshot adalah frame akhir animasi yang selesai tapi overlay tak turun.
Setelah fix ini overlay turun maks 6 detik.
