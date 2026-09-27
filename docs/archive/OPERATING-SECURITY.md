# Security — Satu Lapisan dalam Operating Model

Bagian dari `docs/OPERATING-MODEL.md` (§1 Brain/Hands/Session). Bukan
dokumen terpisah yang mengambang: setiap kontrol di bawah menempel pada
satu interface model operasi.

Sumber: Hermes `tools/approval_detection.py` (HARDLINE_PATTERNS,
quote-masking, self-dir), `agent/tool_guardrails.py` (loop guard),
`tools/approval.py` (YOLO frozen, denial breaker), Anthropic Managed
Agents (vault di luar sandbox, session di luar harness).

## 1. Guardian 3-tier (sidecar, `sidecar/main/tools/_shared.mjs`)

Adopsi pola Hermes ( diverifikasi dari file ):

| Tier      | Arti                              | Contoh                                        |
| --------- | --------------------------------- | --------------------------------------------- |
| hardline  | Auto-deny, approval tak berlaku   | `rm -rf /`, mkfs, dd ke block device, fork bomb, kill init, shutdown |
| dangerous | Butuh approval                    | rm/rmdir, kill, chmod 777, chown, fdisk       |
| safe      | Langsung jalan                    | ls, git status, cat                           |

- Quote-masking ala Hermes: `echo "rm -rf /"` tidak memicu; shell
  carrier (`bash -c '...'`) dipindai mentah.
- Self-dir protection: tulis/hapus di direktori Abelink sendiri (data
  home, workspace, skills, `.abelink/`) butuh approval — agen tidak
  merusak dirinya diam-diam.
- Handler `run-shell` menolak hardline TANPA eksekusi (defense in depth
  di samping gate approval). Test: `tests/hermes-guardian.test.mjs`.

## 2. Approval gate native (Rust, `cmd_node_bridge.rs`)

`APPROVAL_ACTIONS`: skills:*, plugin:*, tg:start/stop,
google:connect/disconnect, capabilities:execute/authorize/revoke,
os:click/type/key/scroll/open. Keputusan via dialog `rfd` di Rust main
thread — di luar renderer/model. Keluarga kebijakan berjenjang di
`approval_policy.rs` (always/session/ask); read-only lolos via
`is_readonly_capability`.

Batasan dikenal: gate Rust belum kenal klasifikasi hardline sidecar
(dialog masih muncul sebelum handler menolak). Iterasi: teruskan
klasifikasi agar hardline ditolak tanpa dialog.

## 3. Watchdog independen (Rust, `watchdog.rs`)

Kill-switch ala CISA: penghitung di Rust, tak terjangkau agen/JS.

- 1000 aksi/sesi, 100 destruktif/sesi → cabut grant (kembali ask).
- 60 aksi/10 detik → tolak request (runaway), pulih saat laju turun.
- Engine tetap hidup; misi berhenti graceful via event.

## 4. Batas loop + circuit breaker (renderer/sidecar)

- Budget langkah effort (low 8 … ultra 256) + eskalasi satu-kali +16
  bila progres terdeteksi (`useAbelinkPlan.js`, `planStepBudget.js`).
- Circuit breaker repair: maks 2x per signature error, cooldown 1 jam
  (`selfHealingEngine.js`).
- Rem tab-storm browser: 3 launch/menit/sesi, 6 global
  (`launcher.mjs`).
- Cooldown search/DDG + anti-hammer Gemini (5 menit persisten).

## 5. Kredensial di luar jangkauan model

Prinsip vault Anthropic: token bridge di file 0600 + native host
(`bridge-core.mjs`, `extension/native-host/`), OAuth di vault sidecar,
git token saat init sandbox. Model tidak pernah melihat kredensial di
prompt; reseed token file saat sesi recreate (`ensureSession`).

## 6. Verifikasi anti reward-hack

- `test-evidence`: klaim "test hijau" wajib artefak vitest mentah
  (lesson DGM: model pernah fake log test + hapus marker deteksi).
- `claim-quoted`: klaim bernama wajib kutipan isi observasi.
- `[SEARCH-ERROR]` vs `[NO-RESULTS]`: senjata rusak ≠ info tidak ada.
- `answer !== completion`: MODEL_CLAIM vs SYSTEM VERIFICATION
  (`agentDecision` + `objectiveVerifier`).
