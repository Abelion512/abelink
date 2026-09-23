# CLI Permission Modes — Auto Default (bukan Manual)

Date: 2026-09-22
Status: design + implementasi CLI. Rust `default_policy` SUDAH auto
(ALWAYS untuk mutasi non-kritis sejak f86b17b); yang diubah sesi ini
adalah default CLI + docs + pesan jujur.

## Keputusan owner (locked)

- Default = **auto**, bukan manual. Agent multi-agent diberi goal lalu
  ditinggal; long-horizon tidak boleh mati karena nunggu Enter approval.
- Profil agentic AI dipertahankan: supervisor + verifier + audit tetap jalan
  di mode auto. Yang dihapus = interupsi, bukan pengawasan.

## Tabel mode (ATM Claude Code, tanpa classifier khayalan)

| Mode | Perilaku | Implementasi Abelink |
|---|---|---|
| `manual` | Tanya tiap aksi sensitif | Dialog rfd (GUI) / fail-closed (CLI). Hanya via flag eksplisit. |
| `auto` (DEFAULT) | Tanpa prompt rutin; safety check latar | Rust policy ALWAYS + supervisor/verifier/audit harness. Pengganti classifier = modul governance ASLI, bukan model kedua. |
| `accept-edits` | Auto tulis file + shell read-only dalam workspace | Perluasan `--approve-all` scope workspace (belum — tetap full). |
| `dont-ask` | Butuh prompt → deny (untuk CI) | Fail-closed sekarang, dijadikan mode eksplisit `--deny-all`. |
| `bypass` | Semua, hanya container terisolasi | DITOLAK: flag `--yolo/--allow-all` tetap forbidden (exit 3). |

## Yang TIDAK PERNAH auto (semua mode)

- Hardline (wipe root/home, mkfs, dd block device, fork bomb, kill init).
- Deny rules eksplisit + critical paths (`~/.ssh`, `.env`, rc files,
  credential stores, `/etc/shadow`, dst).
- Pesan blokir WAJIB jujur: sebut alasan (self-target vs sensitif) +
  saran (`--workspace`, `--approve-all`, `lanjutkan` hanya bila interaktif).

## Batas jujur (bukan klaim)

- Claude Code `auto` memakai classifier model kedua. Abelink TIDAK punya
  itu — "safety check latar" = supervisor trajectory + verification gate +
  audit harness log + approval policy. Trust + audit, bukan review model.
- Tanpa sandbox/container, `auto` = trust penuh dalam workspace. User yang
  butuh isolasi pakai worktree/profil terpisah (lihat engine-roadmap).

## Perubahan sesi ini

- CLI: tanpa `--approve-all`/`--deny-all`/`--permission-mode manual` =
  auto (proceed, logged). `--deny-all` = dont-ask. `--approve-all` tetap
  eksplisit (compat). Hardline tidak pernah relay.
- Rust: sinkronkan `dangerous_defaults_to_ask` test dengan `default_policy`
  aktual (ALWAYS) — test lama assert ASK, source sudah ALWAYS sejak f86b17b.
- Pesan blokir: bedakan self-target vs sensitif + saran konkret.
- NEEDS_USER di headless: terminal jujur (blocked + exit code), bukan
  suruhan `ketik 'lanjutkan'` yang tak terbaca siapa pun.
