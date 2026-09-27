# Session Log: PR Sweep + Verifikasi Performa (2026-09-27)

## Tujuan
"Merge semua open PR dan fix CI dan conflict dan testing e2e apakah membawa improvement nyata pada performance." Metode per PR (instruksi owner): merge lokal -> e2e -> (gagal? fix -> verifikasi -> e2e ulang) -> verifikasi efek perubahan -> push -> CI -> merge.

## Hasil Merge (urutan eksekusi)
- **#58** perf lazy-load sidecar (`7b02367`): konflik 5 file (bunfig/package/telegram/PROJECT-STATUS/bun.lock). E2e hijau. Verifikasi startup A/B/A/B (probe `/tmp/sidecar-probe.mjs`, time-to-ready via event `engine:ready` + RTT `capabilities:list`): klaim improvement TIDAK terbukti (netral di runtime hangat, ~390-430ms semua arm; angka 865ms batch pertama = artefak cache dingin). Tanpa regresi -> layak merge. Perf gate merah ternyata juga merah di main (baseline stale, lihat bawah).
- **#59** docs triase (`382801e`): merge bersih, e2e hijau, CI docs-only skip by design (paths-ignore).
- **#63** docs identity + LICENSE proprietary (`c964e28`): 7 konflik. **Keputusan owner via klarifikasi: lisensi memang milik Abelion, merge penuh termasuk penggantian LICENSE** (from MARK Agent Source Available License -> Abelink Proprietary License v1.0). Awas orientasi: di merge ini ours=PR, theirs=main. Resolusi: modul inti ambil main (RC3 anti-latch, path NMH NativeMessagingHosts), blok identitas ambil PR.
- **#57 + #56**: auto-MERGED oleh GitHub tanpa aksi — branch-nya leluhur ancestral dari branch #58 (stacked), konten terverifikasi ada di main (transformers ^4.3.0, tests/setup-bun.js, test:known-issues).
- **#60** feat local restore (`ca7805b`): merge paling sulit, 3 iterasi fix. Iterasi 1: commit merge masuk dengan sisa marker konflik di 9 file (daftar konflik terpotong `tail -15`, `git add -A` meng-commit marker) — tertangkap loop e2e (28 file fail). Iterasi 2: resolusi manual per file (sidecar/tools = main, CapabilitiesHub = PR) -> masih 6 fail: duplikat `checkTools` di tools/index.js (sisa auto-merge di luar marker) + trio browser butuh evolusi RC3/G1 main. Iterasi 3: tools/index + bridge-core + native-host = utuh main, CapabilitiesHub = utuh main (main ternyata sudah punya versinya sendiri yang ter-wire di Configuration.jsx). Deliverable #60 yang selamat: oauth-provider.mjs, mcp-client.mjs, Trajectory.jsx + src/api/trajectory.js, background.js bridge-token, capabilities test (+3 test).
- **#44** release v1.2.0-alpha.6 (`2068a4e`): akar UNSTABLE bukan test gagal, melainkan **semua run Tauri CI status `action_required` (workflow waiting approval, 0s)**. Fix: approve run via `gh api .../actions/runs/<id>/approve`. Remote release branch bergerak sendiri (otomasi owner) -> push rejected -> re-merge dari head terbaru, ternyata otomasi sudah merge main post-#60 sendiri.
- **#67** release v1.3.0-alpha.7 (`fdc4ba1`): PR baru otomasi release muncul saat bekerja; prosedur sama, CI butuh approve juga.

## Fix Infrastruktur
- **CI bun version mismatch**: bun.lock regenerasi lokal (bun 1.4.2) = format text lockfile v2 yang tidak bisa diparse bun 1.3.14 di CI ("Unknown lockfile version" -> 3 job gagal di install). Fix `1d85454`: pin `bun-version: 1.3.14 -> 1.4.2` di 4 workflow (tauri, release, release-prepare, release-finalize). Binary bun 1.3.14 (default + baseline) SIGILL di CPU owner, jadi menyamakan CI ke versi lokal adalah satu-satunya jalan konsisten. Validasi: `bun install --frozen-lockfile` di workspace bersih hijau.
- **Baseline perf stale di-refresh** (commit terpisah): baseline 2026-09-17 sudah tidak valid setelah planning.js tumbuh ~40KB -> 64KB (workload `prompt-assembly-scan` mengukur operasi string atas isi file). Setelah refresh: gate LOLOS, parser ~-50%, url-guard stabil.

## Data Performa (probe sidecar startup, median)
- Baseline main (pre-#58): ready 396.8ms, rtt 25.2ms.
- Post-#58 (A/B/A/B): ready ~390-430ms, rtt ~25-31ms — netral; fluktuasi antar batch (575ms) = noise mesin, bukan efek kode.
- Kesimpulan jujur untuk #58: klaim "pangkas startup" tidak reproducible di runtime `bun` hangat (import telegraf/googleapis murah); PR tetap merge karena bersih dan tidak menambah beban startup.

## Keadaan Akhir
- main = `fdc4ba1` (v1.3.0-alpha.7), nol open PR, nol branch remote (hanya main).
- Suite final: 1772 passed / 16 skipped known-issues (1788 total, 161 file). Lint 0 error / 43 warnings.
- Backup pra-rewrite: `/tmp/abelink-backup-prerewrite.bundle` (46MB, complete history, verified) — jembatan aman FASE 2.

## FASE 2 (pending, butuh konfirmasi akhir owner)
Pembersihan commit mazees via history rewrite (git-filter-repo) SETELAH semua PR merged, dengan opsi: (a) rewrite in-place + force-push (repo private, single remote), atau (b) hapus repo + buat repo baru (hapus repo via GitHub settings oleh owner; `gh repo delete` tidak dieksekusi agent). Local disetarakan setelahnya. Backup bundle sudah dibuat.

## Batasan Dikenal
- Probe startup ad hoc di /tmp, bukan bagian repo; kalau mau digabung ke perf gate perlu work terpisah.
- Perf-gate workload `prompt-assembly-scan` sensitif ukuran file planning.js — baseline akan stale lagi tiap file tumbuh besar; kandidat perbaikan: workload berbasis prompt nyata, bukan isi file.
- PR #44/#67 butuh approve manual workflow setiap push (first-time contributor workflow approval untuk actor/non-branch); diulang tiap release otomatis.
