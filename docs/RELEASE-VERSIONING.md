# Release Versioning (SemVer + Extension)

Skema penomoran rilis ABELINK Linux mengikuti [Semantic Versioning 2.0.0](https://semver.org)
(`MAJOR.MINOR.PATCH` + label pra-rilis), dengan pola kanal pra-rilis ala
[semantic-release](https://semantic-release.org) (`2.0.0-beta.1 -> beta.2`,
basis dikunci per siklus, counter monoton) dan
[changesets prereleases](https://changesets.dev/guide/prereleases)
(`-next.0 -> -next.1`, monoton).

## 1. Skema versi app

Format kanal alpha: `MAJOR.MINOR.PATCH-alpha.N`.

| Jenis commit | Bump basis | Contoh dari `1.0.0-alpha.4` |
| --- | --- | --- |
| `fix:`, `security:`, `perf:`, `patch:` | PATCH | `1.0.1-alpha.5` |
| `feat:` | MINOR (PATCH reset 0) | `1.1.0-alpha.5` |
| `feat!:`, `BREAKING CHANGE:` | MAJOR (MINOR+PATCH reset 0) | `2.0.0-alpha.5` |

Aturan counter: **global monoton, tidak reset**. Basis boleh turun antar
rilis (`1.1.0-alpha.5` lalu `1.0.1-alpha.6` valid per SemVer §11 karena
basis dibandingkan dulu), tapi pipeline selalu menghitung kandidat DARI
baseline (= rilis maksimum terakhir), jadi hasil tak pernah mundur.

Hanya `feat`/`fix`/`security` yang releasable (tanpa satupun → tidak ada
rilis). Versi stabil (tanpa suffix) DITOLAK pipeline — promosi stabil manual.

## 2. Pemetaan versi extension

[Chrome mewajibkan](https://developer.chrome.com/docs/extensions/reference/manifest/version)
`version` berupa 1-4 integer (0-65535, tanpa nol depan, tak boleh semua nol);
string SemVer pra-rilis TIDAK valid di sana. Pemetaan (`scripts/ext-version.mjs`):

| Versi app | `version` | `version_name` |
| --- | --- | --- |
| `1.0.0-alpha.4` | `1.0.0.4` | `1.0.0-alpha.4` |
| `1.1.0-alpha.5` | `1.1.0.5` | `1.1.0-alpha.5` |
| `1.0.0` | `1.0.0` | `1.0.0` |

Counter = identifier numerik terakhir label pra-rilis (`beta.11` → `11`;
tanpa angka → `0`). Counter > 65535, semua-nol, dan bukan-SemVer DITOLAK.
Chrome membandingkan per angka dari kiri, jadi update otomatis tetap jalan.

Single source of truth tetap `src-tauri/tauri.conf.json`; `bun run
sync-version` mempropagasi ke `package.json`, `src-tauri/Cargo.toml`, dan
`extension/manifest.json` (`version` + `version_name`).

## 3. Alur 3 tahap (tidak berubah, hanya penomoran yang cerdas)

1. **Prepare** (`release-prepare.yml`, tiap push `main`/`linux`):
   `release-helper.mjs prepare` → baseline = max(tag reachable, releases.json)
   → bump tertinggi dari commit → branch `release/vX` + regenerasi
   `releases.json`/`whats-new.json`/`CHANGELOG.md` + sync-version → PR
   berlabel `release`. Idempoten: versi sudah ada → PR lama di-update.
2. **Finalize** (`release-finalize.yml`, saat PR rilis di-merge):
   guard (sync ok, tag belum ada, versi lebih baru) → `git tag vX` + push →
   dispatch eksplisit `release.yml` (push tag via GITHUB_TOKEN tak memicu event).
3. **Publish** (`release.yml`, tag `v*`): guard tag==versi → verify
   (gitleaks, vitest, vite, smoke, cargo, sidecar) → AppImage+deb + SLSA +
   GitHub Release (`--prerelease` otomatis untuk tag ber-tanda `-`).

## 4. Gerbang & pengecualian

Gerbang menolak: manifest tak sinkron, tag ganda, versi tak lebih baru,
tanpa commit releasable (hening, bukan error), metadata rilis hilang
(finalize manual). `bump-version.mjs` tetap sebagai helper manual terpisah
(patch/minor/major eksplisit atau auto-deteksi, `--dry-run` didukung).
