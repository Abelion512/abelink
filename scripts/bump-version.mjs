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
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function git(args, opts = {}) {
  const res = spawnSync('git', args.split(' '), { cwd: REPO, encoding: 'utf8', shell: true, ...opts })
  if (res.error) throw res.error
  return (res.stdout || '').trim()
}

function semverBump(current, type) {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (type) {
    case 'major': return `${major + 1}.0.0`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'patch': return `${major}.${minor}.${patch + 1}`
  }
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

function main() {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'))
  const current = pkg.version
  const arg = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  const type = arg === 'major' || arg === 'minor' || arg === 'patch'
    ? arg
    : detectBumpType()

  const next = semverBump(current, type)

  if (dryRun) {
    console.log(`Current: v${current}`)
    console.log(`Next:    v${next}`)
    console.log(`Reason:  ${type} (${arg ? 'explicit' : 'auto-detected from commits'})`)
    return
  }

  pkg.version = next
  writeFileSync(path.join(REPO, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

  // Update CHANGELOG.md [Unreleased] → [next]
  const changelog = readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8')
  const date = new Date().toISOString().slice(0, 10)
  const updated = changelog.replace(
    '## [Unreleased]',
    `## [Unreleased]\n\n## [${next}] - ${date}`
  )
  writeFileSync(path.join(REPO, 'CHANGELOG.md'), updated)

  console.log(`Bumped v${current} → v${next} (${type})`)
  console.log('Updated: package.json, CHANGELOG.md')
}

main()
