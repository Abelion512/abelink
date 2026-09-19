# Session 2026-09-18 — Full Apple References Compliance (F1-F9)

## Keputusan: semua ikut references.md

Success hijau kembali untuk status genuine (batalkan NOL-hijau sebagian).

## Eksekusi (5 workers + integrasi sendiri)

- F1 font: Poppins dihapus (bun remove), stack SF Pro Display/Text + Inter,
  7 inline dibersihkan, .font-display -0.02em. Sisa: sidecar OAuth HTML + docs.
- F4 success: hijau kembali di 14 file (dots, badges, Tersalin/Copied, memory,
  plugin, logs, Tier1, Trajectory). Aksi tetap biru. Token --ref-* appended.
- F2 radius: owned scope bersih; sendiri: App, CameraPreview, ResponseArea,
  CodeBlock, Plugin/Youtube bubbles. ChatList speech-tail -sm = pola HIG, kept.
- F3 z: skala 0-5; sendiri: voice modal z-100→40. Liar = nol.
- F5 modal: role/aria/grabber/focus OK (ConfirmModal, Approval×2, HistoryDrawer).
- F6 toast: bottom-end + 3s (Knowledge, StatusIndicator, VAD, Home).
- F7 motion: durasi liar hilang; spring 200/18; ambient dikecualikan.
- F8 aria: 13 titik tombol ikon; WindowControls 28px = standar OS (exempt 44px).

## Verifikasi

- lint 0 errors; smoke OK; test 968-969/969 (capabilities flaky load,
  isolated 24/24 hijau); build pass 3m16s.
- grep: Poppins nol (src+pkg), rounded liar nol (kecuali speech-tail),
  z liar nol, success visual = status genuine saja.
