# Release Automation — MARK Linux

## Normal Release Path

```
Release PR (head: release/vX, label: release) merged → linux
↓
release-finalize.yml (finalize job)
  → validate release PR (branch starts with release/v, has release label)
  → node scripts/release-helper.mjs finalize
    → check version sync
    → check tag doesn't exist
    → check version is newer than last release
    → create tag vX
    → git push origin vX
    → gh workflow run release.yml --ref vX -f tag=vX
↓
release.yml
  → guard: tag matches tauri.conf.json
  → verify: gitleaks + vitest + vite build + cargo check
  → publish: tauri build → GitHub Release
```

**Important:** `git tag` + `git push` is NOT the normal release trigger. The release build starts when `release.yml` is explicitly dispatched via `workflow_dispatch`. This is required because `GITHUB_TOKEN` does not trigger downstream workflows from tag pushes.

## Manual Promotion (Emergency/Hotfix)

Manual finalization is available via `workflow_dispatch` on `release-finalize.yml` with `ref` input.

**Mandatory safety checks (all enforced in CI):**

1. `git rev-parse --verify ref` — ref resolves to a valid commit
2. `git merge-base --is-ancestor ref origin/linux` — ref belongs to the `linux` release line
3. `semver.valid(version)` — version is valid SemVer
4. `bun run sync-version --check` — all manifests are synchronized
5. `git tag -l tag` not found — tag does not already exist
6. `semver.gt(version, lastRelease)` — version is newer than the last release
7. `releases.json` contains the version entry — release metadata exists

Manual promotion requires:
- `ref` on the `linux` branch
- A matching entry in `src/data/releases.json`
- All manifest files synchronized to the version
- The tag must not already exist

## Release PR Preparation

The prepare stage runs on every push to `linux`:

```
push → linux
↓
release-prepare.yml
  → node scripts/release-helper.mjs prepare
    → check last reachable tag (git tag --merged HEAD)
    → find releasable commits since last tag
    → calculate next alpha version
    → idempotency: check releases.json for existing version entry
    → if release PR exists (release/vX branch):
      → checkout release/vX BEFORE any file mutation
      → merge origin/linux (fetch + -X theirs)
      → regenerate releases.json, whats-new.json, manifests
      → commit if changed
      → push normally (no force)
      → update PR metadata
    → if no release PR:
      → create release/vX branch from linux HEAD
      → generate files
      → commit + push + create PR with `release` label
```

## Workflow Permissions

| Workflow          | Permission        | Reason                          |
|-------------------|-------------------|---------------------------------|
| release-finalize  | `contents: write`  | tag creation                    |
| release-finalize  | `actions: write`   | dispatch release.yml            |
| release           | `contents: write`  | GitHub Release creation         |
| release           | `actions: write`   | (reserved for future use)       |

## Idempotency Guarantees

- **`releases.json` is the durable state marker.** If the version entry exists, the release was already prepared — no `alpha.N+1` is created.
- **Tag existence is checked** before creation (`git tag -l`).
- **Version comparison** ensures only newer versions can be finalized.
- **Concurrency is scoped per release branch** (`release-finalize-${head.ref || inputs.ref}`).
- **Release workflow concurrency** is scoped by tag name (`release-${tag}`).

## Tag → Release Workflow Chain

```
tag created (v1.0.0-alpha.2)
    ↓
gh workflow run release.yml --ref v1.0.0-alpha.2 -f tag=v1.0.0-alpha.2
    ↓
release.yml guard job:
  → validate tag format (SemVer + v prefix)
  → checkout tag
  → sync-version --check
  → compare tag version == tauri.conf.json version
    ↓
release.yml verify job:
  → gitleaks scan
  → vitest run
  → vite build
  → benchmark smoke (bun evaluation/smoke.mjs)
  → cargo check
    ↓
release.yml publish job:
  → cargo build (Tauri AppImage + deb)
  → upload artifacts
  → gh release create v1.0.0-alpha.2 --verify-tag --generate-notes
```

## Toolchain Notes (Rust + Bun)

- Semua runner CI memakai `bun install --frozen-lockfile` (bukan `bun install`)
  agar CI gagal cepat bila `bun.lock` tidak sinkron dengan `package.json`.
- Semua script first-party (`.mjs`) dijalankan dengan `bun` (bukan `node`) sesuai
  toolchain Rust + Bun: `bun run sync-version`, `bun evaluation/smoke.mjs`, dst.
- Dependensi dipantau Dependabot mingguan untuk tiga ekosistem: `cargo`
  (`src-tauri/`), `npm` (bun.lock), dan `github-actions` — lihat
  `.github/dependabot.yml`. Alert CVE (mis. protobufjs) harus diselesaikan
  sebelum merge; jangan abaikan dengan komentar Socket tanpa justifikasi.
- Tidak ada dependensi dev yang hanya dipakai runner (semua package LLM-eval,
  termasuk `deepeval`, bersifat dynamic-import opsional — tidak masuk
  `package.json` sehingga tidak membebani SBOM/audit produksi).
