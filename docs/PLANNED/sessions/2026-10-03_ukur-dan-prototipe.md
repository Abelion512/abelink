# SESSION LOG — 2026-10-03 (ukur beban + prototipe server+WebUI + prinsip agent mutlak)

## Keputusan owner (permanen)
1. **Prinsip agent mutlak**: Abelink tidak bisa dikendalikan agent lain (hanya collaboration); sebaliknya Abelink bisa kontrol agent lain. Ditulis di PLAN MCP §3 (commit `6532c5d3`). Konsekuensi: P3 MCP server DITOLAK selamanya; M1/M2 client tetap valid.
2. **Keduanya berurutan**: ukur dulu → prototipe. Gate ditegakkan controller (Fase B tidak di-dispatch sebelum Fase A lulus review).

## PR merged
| PR | Isi | Squash |
| --- | --- | --- |
| #132 | Fase A: baseline beban berat mesin owner | `271022b1` |
| #133 | Fase B: prototipe server+WebUI berdampingan | `e890de5b` |

## Angka kunci (semua dari perintah nyata)
- Baseline mesin: RAM 5887/7789 MB, swap 3170/6143 MB — tekanan SEBELUM Abelink (keluhan valid).
- Brave nyata: 18 proses, 1840.2 MB. GUI Tauri penuh blocked-with-evidence (risiko OOM).
- Boot engine headless: 3.6 dtk. `browser:read-dom` tanpa ekstensi: hang 90s (fail-SLOW by design — kandidat fix kecil).
- Prototipe server (Bun, 127.0.0.1:49719): RSS 45–61 MB. Satu orde di bawah satu renderer Brave.

## Preseden upstream terverifikasi
- github.com/Mazees/mark-agent: WebUI (Express+WS `/stream`, Edge App Mode) + daemon native tetap (Win32/C#). Yang pindah web = UI saja. Windows-only — tidak ada pelajaran GNOME.
- Pola yang ditiru prototipe: UI web + otomasi tetap native.

## Tindak lanjut (bukan sekarang)
1. Fail-fast `browser:*` saat `connected:false` (sekarang tunggu 90s).
2. Uji camera E2E prototipe di mesin berkamera.
3. AGENTS.md:54 daftar 12 vs 14 stores.
4. Double-submit form Enter (bug laten pre-existing, dilestarikan ratchet).

## Verifikasi akhir
- `typecheck:node` exit 0, status bersih, HEAD `e890de5b` sync origin/main.
