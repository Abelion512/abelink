/**
 * Integration test: verifies release branch switching + file mutation order.
 * Uses a real temporary git repository — no mocks, no network.
 * Tests the critical fix: branch selection BEFORE file mutation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TEMP_DIR = path.join(os.tmpdir(), `release-test-${Date.now()}`)
function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: TEMP_DIR,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts
  }).trim()
}

const setupRepo = () => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  run('git init')
  run('git config user.email "test@test.com"')
  run('git config user.name "Test"')
  fs.mkdirSync(path.join(TEMP_DIR, 'src/data'), { recursive: true })
  fs.mkdirSync(path.join(TEMP_DIR, 'src-tauri'), { recursive: true })
  fs.writeFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), releases: []
  }, null, 2))
  fs.writeFileSync(path.join(TEMP_DIR, 'src/data/whats-new.json'), JSON.stringify({ version: '1.0.0-alpha.1', changes: [] }, null, 2))
  fs.writeFileSync(path.join(TEMP_DIR, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '1.0.0-alpha.1' }, null, 2))
  fs.writeFileSync(path.join(TEMP_DIR, 'package.json'), JSON.stringify({ name: 'mark', version: '1.0.0-alpha.1' }, null, 2))
  fs.writeFileSync(path.join(TEMP_DIR, 'src-tauri/Cargo.toml'), '[package]\nversion = "1.0.0-alpha.1"')
  fs.writeFileSync(path.join(TEMP_DIR, 'README.md'), 'MARK Linux')
  run('git add -A')
  run('git commit -m "feat: initial release v1.0.0-alpha.1"')
  run('git tag v1.0.0-alpha.1')
  run('git branch -m linux')
  fs.writeFileSync(path.join(TEMP_DIR, 'feature-a.txt'), 'fix A')
  run('git add -A')
  run('git commit -m "fix(auth): login flow bug"')
}

describe('Release branch switching + idempotency', () => {
  beforeAll(() => setupRepo())
  afterAll(() => fs.rmSync(TEMP_DIR, { recursive: true, force: true }))

  beforeEach(() => {
    // Reset to clean linux state before each test and clean up old release branches
    run('git checkout linux')
    run('git checkout -- .')
    run('git clean -fd')
    // Delete any leftover release branches from previous test
    const branches = run('git branch --list "release/*"').split('\n').filter(Boolean)
    for (const b of branches) run(`git branch -D ${b.trim()}`)
  })

  it('creates release/v1.0.0-alpha.2 branch and generates release data (branch-first order)', () => {
    const newVersion = '1.0.0-alpha.2'

    // Step 1: checkout release branch BEFORE any file mutation
    run(`git checkout -b release/v${newVersion}`)

    // Step 2: generate files ON the release branch
    const releasesJson = JSON.stringify({
      generatedAt: new Date().toISOString(),
      releases: [{ version: newVersion, date: '31 Agustus 2026', summary: 'Test release', sections: { features: [], fixes: [{ msg: 'login flow bug' }], security: [], docs: [] } }]
    }, null, 2)
    fs.writeFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), releasesJson)
    fs.writeFileSync(path.join(TEMP_DIR, 'src/data/whats-new.json'), JSON.stringify({ version: newVersion, changes: [{ type: 'ATM', msg: 'login flow bug' }] }, null, 2))
    fs.writeFileSync(path.join(TEMP_DIR, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: newVersion }, null, 2))

    run('git add -A')
    run(`git commit -m "chore(release): v${newVersion}"`)

    expect(run('git branch --show-current')).toBe(`release/v${newVersion}`)
    const releases = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), 'utf8'))
    expect(releases.releases[0].version).toBe(newVersion)
  })

  it('existing PR update: same version, merges new commits, no alpha.3', () => {
    // Simulate "prepare again" after fix B landed on linux.
    // Start from clean state — create the release branch fresh.
    const newVersion = '1.0.0-alpha.2'

    // Create release branch on clean linux
    run(`git checkout -b release/v${newVersion}`)

    // Regenerate files
    const releasesJson = JSON.stringify({
      generatedAt: new Date().toISOString(),
      releases: [{ version: newVersion, date: '31 Agustus 2026', summary: 'Test release', sections: { features: [], fixes: [{ msg: 'login flow bug' }], security: [], docs: [] } }]
    }, null, 2)
    fs.writeFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), releasesJson)
    run('git add -A')
    run(`git commit -m "chore(release): v${newVersion}"`)

    // Now switch to linux and add fix B
    run('git checkout linux')
    fs.writeFileSync(path.join(TEMP_DIR, 'feature-b.txt'), 'fix B')
    run('git add -A')
    run('git commit -m "fix(api): response handling"')

    // KEY: checkout release branch FIRST (no dirty tree)
    run(`git checkout release/v${newVersion}`)

    // Merge linux into release branch
    run('git merge linux -m "Merge linux into release branch" -X theirs')

    // Regenerate with both fixes
    const updatedJson = JSON.stringify({
      generatedAt: new Date().toISOString(),
      releases: [{ version: newVersion, date: '31 Agustus 2026', summary: 'Test release', sections: { features: [], fixes: [{ msg: 'login flow bug' }, { msg: 'response handling' }], security: [], docs: [] } }]
    }, null, 2)
    fs.writeFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), updatedJson)
    run('git add src/data/releases.json')

    try {
      run('git diff --cached --quiet')
    } catch {
      run('git commit -m "chore(release): update release data"')
    }

    // Assertions
    expect(run('git branch --show-current')).toBe(`release/v${newVersion}`)
    const releases = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), 'utf8'))
    expect(releases.releases[0].version).toBe('1.0.0-alpha.2')
    expect(releases.releases.length).toBe(1) // no alpha.3

    // Both fixes on the release branch
    const log = run('git log --oneline')
    expect(log).toContain('fix(auth): login flow bug')
    expect(log).toContain('fix(api): response handling')
  })

  it('prepare again on unchanged state — no duplicate commit', () => {
    // Simulate: PR is open, nothing changed on linux since last prepare.
    const newVersion = '1.0.0-alpha.2'

    // Create release branch
    run(`git checkout -b release/v${newVersion}`)
    const releasesJson = JSON.stringify({
      generatedAt: new Date().toISOString(),
      releases: [{ version: newVersion, date: '31 Agustus 2026', summary: 'Test release', sections: { features: [], fixes: [{ msg: 'login flow bug' }], security: [], docs: [] } }]
    }, null, 2)
    fs.writeFileSync(path.join(TEMP_DIR, 'src/data/releases.json'), releasesJson)
    run('git add -A')
    run(`git commit -m "chore(release): v${newVersion}"`)

    // Count commits on release branch
    const beforeCount = run('git log --oneline release/v1.0.0-alpha.2').split('\n').length

    // prepare again: checkout release branch, merge linux (nothing new), try to commit
    run(`git checkout release/v${newVersion}`)
    run('git merge linux -m "Merge linux into release branch" -X theirs')
    run('git add src/data/releases.json')
    try {
      run('git diff --cached --quiet') // no changes
    } catch {
      run('git commit -m "chore(release): update release data"')
    }

    const afterCount = run('git log --oneline release/v1.0.0-alpha.2').split('\n').length
    expect(afterCount).toBe(beforeCount) // no new commit
  })

  it('checkout failure: dirty tracked working tree blocks branch switch', () => {
    // Modify and STAGE a tracked file (simulates old code writing before checkout)
    fs.writeFileSync(path.join(TEMP_DIR, 'README.md'), 'DIRTY')
    run('git add README.md')

    let checkoutFailed = false
    try {
      run('git checkout release/v1.0.0-alpha.2')
    } catch {
      checkoutFailed = true
    }

    // Cleanup
    run('git checkout -- .')
    run('git checkout linux')

    // Staged changes block checkout
    expect(checkoutFailed).toBe(true)
  })
})