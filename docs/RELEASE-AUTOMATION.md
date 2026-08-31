# MARK Linux Release Automation

## Architecture Overview

```
developer pushes → linux branch
        ↓
release-prepare.yml (on push linux)
        ↓
release-helper.mjs prepare
        ↓
Release PR created/updated
        ↓
maintainer merges PR
        ↓
release-finalize.yml (on PR merged)
        ↓
release-helper.mjs finalize
        ↓
tag v{alpha.N}
        ↓
release.yml (existing)
        ↓
Tauri build → AppImage + deb → GitHub Release
```

## Components

### 1. `scripts/release-helper.mjs`

Command-line tool with two modes:

- **`prepare`**: Analyzes unreleased commits, generates release data, creates/updates Release PR
- **`finalize`**: Verifies state, creates and pushes Git tag

### 2. `.github/workflows/release-prepare.yml`

Triggers on push to `linux` branch.

### 3. `.github/workflows/release-finalize.yml`

Triggers when a Release PR is merged to `linux`.

## Version Policy

### Alpha Channel (current)

- Baseline: `v1.0.0-alpha.1`
- `feat`, `fix`, `security` → increment alpha: `alpha.N` → `alpha.N+1`
- No auto-promotion to beta or stable

### Promotion

Manual via PR with commit:

```bash
git commit -m "chore(release): 1.0.0-beta.1"
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1
```

## Generation Flow

1. Find last tag: `git describe --tags --abbrev=0`
2. Get commits since: `git log <tag>..HEAD --oneline`
3. Classify commits by conventional commit type
4. Generate `src/data/releases.json` (historical)
5. Generate `src/data/whats-new.json` (latest projection)
6. Update `tauri.conf.json`, sync to `package.json` + `Cargo.toml`

## Release PR

- Branch: `release/v{version}`
- Label: `release`
- Auto-updated if exists
- Merges create tag + trigger build

## Update Detection (In-App)

See `src/api/updateChecker.js`

- Startup check + periodic (1 hour)
- Fetches releases via GitHub API
- Alpha channel users receive newer alpha releases
- Notifications via `mark:update-available` event