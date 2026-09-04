#!/usr/bin/env node
/**
 * bump-version.mjs — semantic version bumper driven by conventional commits.
 *
 * Bump type from latest tag to current:
 *   fix:, patch:             → patch (5.0.0 → 5.0.1)
 *   feat:                    → minor (5.0.0 → 5.1.0)
 *   feat!: BREAKING CHANGE:  → major (5.0.0 → 6.0.0)
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major] [--dry-run]
 *
 * If no argument: auto-detect from commits since last tag.
 * --dry-run: print result, don't write files.
 */

import { spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

// Primary source of truth: tauri.conf.json (not package.json for version display)
function getCurrentVersion() {
  try {
    const toml = readFileSync(path.join(REPO, 'src-tauri/tauri.conf.json'), 'utf8')
    const conf = JSON.parse(toml)
    return conf.version
  } catch {
    // fallback to package.json if tauri.conf.json not available
    const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'))
    return pkg.version
  }
}

function git(args, opts = {}) {
  const res = spawnSync('git', args.split(' '), {
    cwd: REPO,
    encoding: 'utf8',
    shell: true,
    ...opts
  })
  if (res.error) throw res.error
  return (res.stdout || '').trim()
}

export function semverBump(current, type) {
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
  if (!match) throw new Error(`Invalid version: ${current}`)
  const [, major, minor, patch, prerelease] = match
  const [maj, min, pat] = [Number(major), Number(minor), Number(patch)]
  const next = {
    major: `${maj + 1}.0.0`,
    minor: `${maj}.${min + 1}.0`,
    patch: `${maj}.${min}.${pat + 1}`
  }[type]
  if (!next) throw new Error(`Unknown bump type: ${type}`)
  // preserve prerelease suffix if any
  return prerelease ? `${next}-${prerelease}` : next
}

function detectBumpType() {
  const lastTag = git('describe --tags --abbrev=0') || 'v0.0.0'
  const commits = git(`log ${lastTag}..HEAD --oneline --no-merges`)
  if (!commits) return 'patch'

  let hasMajor = false
  let hasMinor = false

  for (const line of commits.split('\n')) {
    const msg = line.toLowerCase()
    if (msg.includes('feat!:') || msg.includes('breaking change')) hasMajor = true
    else if (msg.startsWith('feat:') || msg.startsWith('feat(')) hasMinor = true
    else if (msg.startsWith('fix:') || msg.startsWith('fix(') || msg.startsWith('patch:')) continue
    // unknown prefix: treat as patch (conservative)
  }

  if (hasMajor) return 'major'
  if (hasMinor) return 'minor'
  return 'patch'
}

function updateTauriConf(next) {
  const confPath = path.join(REPO, 'src-tauri/tauri.conf.json')
  const conf = JSON.parse(readFileSync(confPath, 'utf8'))
  conf.version = next
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n')
}

function main() {
  const current = getCurrentVersion()
  const arg = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  const type = arg === 'major' || arg === 'minor' || arg === 'patch' ? arg : detectBumpType()

  const next = semverBump(current, type)

  if (dryRun) {
    console.log(`Current: v${current}`)
    console.log(`Next:    v${next}`)
    console.log(`Reason:  ${type} (${arg ? 'explicit' : 'auto-detected from commits'})`)
    return
  }

  updateTauriConf(next)

  // Update CHANGELOG.md [Unreleased] → [next]
  const changelogPath = path.join(REPO, 'CHANGELOG.md')
  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, 'utf8')
    const date = new Date().toISOString().slice(0, 10)
    const updated = changelog.replace(
      '## [Unreleased]',
      `## [Unreleased]\n\n## [${next}] - ${date}`
    )
    writeFileSync(changelogPath, updated)
  }

  console.log(`Bumped v${current} → v${next} (${type})`)
  console.log('Updated: src-tauri/tauri.conf.json, CHANGELOG.md')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
