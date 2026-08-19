#!/usr/bin/env node
/**
 * mark update — auto-stash local changes, pull official (upstream), then pop stash.
 * Resolves merge conflicts by reporting them; does NOT auto-resolve.
 *
 * Usage:
 *   node scripts/mark-update.mjs                # safe path: pull upstream, merge into local
 *   node scripts/mark-update.mjs --rebase       # rebase your local commits atop upstream
 *   node scripts/mark-update.mjs --sync-linear  # create Linear issues for pending commits
 *   node scripts/mark-update.mjs --list         # print pending commits table
 *   node scripts/mark-update.mjs --tag          # create atm/<short-hash> tags for ATM commits
 *   node scripts/mark-update.mjs --changelog    # auto-update CHANGELOG.md from upstream-diff-report.json
 *   node scripts/mark-update.mjs --whats-new    # generate whats-new.json for in-app display
 *   node scripts/mark-update.mjs --restore-stash  # restore a previously stashed update
 *
 * Flags can be combined:
 *   node scripts/mark-update.mjs --sync-linear --tag --changelog --whats-new
 *
 * Environment:
 *   MARK_UPDATE_REMOTE=upstream  (default) or 'origin'
 *   MARK_UPDATE_BRANCH=master    (default)
 *   NO_STASH=1                   # skip stash (use only if you have no local changes or manage them)
 */
import { spawnSync, execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const REMOTE = process.env.MARK_UPDATE_REMOTE || 'upstream';
const BRANCH = process.env.MARK_UPDATE_BRANCH || 'master';
const DO_REBASE = process.argv.includes('--rebase');
const SYNC_LINEAR = process.argv.includes('--sync-linear');
const DO_LIST = process.argv.includes('--list');
const DO_TAG = process.argv.includes('--tag');
const DO_CHANGELOG = process.argv.includes('--changelog');
const DO_WHATS_NEW = process.argv.includes('--whats-new');

const REPORT_PATH = path.join(REPO_ROOT, 'upstream-diff-report.json');

function run(cmd, opts = {}) {
  const res = spawnSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', shell: true, ...opts });
  if (res.error) throw res.error;
  return { stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), status: res.status };
}

function git(args, allowFail = false) {
  const cmd = `git ${args}`;
  const res = run(cmd);
  if (!allowFail && res.status !== 0) {
    throw new Error(`git failed: ${cmd}\n${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function hasChanges() {
  return git('status --porcelain', true) !== '';
}

function getConflicts() {
  const r = git('diff --name-only --diff-filter=U', true);
  return r ? r.split('\n').filter(Boolean) : [];
}

function banner(msg) {
  console.log(`\n▶ ${msg}`);
}

function stashInfo() {
  const list = git('stash list', true);
  console.log('🗂️ Stashes:', list || '(none)');
}

function readReportForFlags() {
  return readReport();
}

function readPackageVersion() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
}

function bumpVersion(version, hasATM) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (!hasATM) return version;
  return `${major}.${minor}.${patch + 1}`;
}

function tagATMCommits(report) {
  const commits = report.commits || [];
  const atmCommits = commits.filter(c => c.overall === 'ATM');
  let count = 0;
  for (const c of atmCommits) {
    // Check if commit exists in current HEAD ancestry
    const exists = git(`cat-file -t ${c.hash} 2>/dev/null`, true).trim() === 'commit';
    if (exists) {
      git(`tag atm/${c.hash} ${c.hash}`, true);
      console.log(`  🏷️  tagged ${c.hash} → atm/${c.hash}`);
      count++;
    } else {
      console.log(`  ⏭️  ${c.hash} not in history, skipped`);
    }
  }
  console.log(`\n✅ Tagged ${count} ATM commit(s).`);
}

function updateChangelog(report) {
  const commits = report.commits || [];
  const today = new Date().toISOString().split('T')[0];
  const currentVersion = readPackageVersion();

  const atmCommits = commits.filter(c => c.overall === 'ATM');
  const autoCommits = commits.filter(c => c.overall === 'AUTO');
  const skippedCommits = commits.filter(c => c.overall === 'MIXED' || c.overall === 'REVIEW');

  const hasATM = atmCommits.length > 0;
  const newVersion = bumpVersion(currentVersion, hasATM);

  // Read existing changelog
  const changelogPath = path.join(REPO_ROOT, 'CHANGELOG.md');
  let existing = '';
  if (existsSync(changelogPath)) {
    existing = readFileSync(changelogPath, 'utf8');
  }

  const newEntry = [];
  newEntry.push(`## [${newVersion}] - ${today}`);
  newEntry.push('');

  if (atmCommits.length > 0) {
    newEntry.push('### ATM');
    for (const c of atmCommits) {
      newEntry.push(`- [ATM] ${c.msg} (${c.hash})`);
    }
    newEntry.push('');
  }

  if (autoCommits.length > 0) {
    newEntry.push('### AUTO');
    for (const c of autoCommits) {
      newEntry.push(`- [AUTO] ${c.msg} (${c.hash})`);
    }
    newEntry.push('');
  }

  if (skippedCommits.length > 0) {
    newEntry.push('### SKIPPED');
    for (const c of skippedCommits) {
      newEntry.push(`- [${c.overall}] ${c.msg} (${c.hash})`);
    }
    newEntry.push('');
  }

  // Insert after first `##` header (after Unreleased section)
  let updated = existing;
  if (existing.includes('## [Unreleased]')) {
    updated = existing.replace('## [Unreleased]', `## [Unreleased]\n\n${newEntry.join('\n')}`);
  } else {
    updated = `${newEntry.join('\n')}\n${existing}`;
  }

  writeFileSync(changelogPath, updated);
  console.log('\n✅ CHANGELOG.md updated.');

  // Also bump package.json version
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`   package.json version → ${newVersion}`);
}

function writeWhatsNew(report) {
  const commits = report.commits || [];
  const currentVersion = readPackageVersion();

  const atmCommits = commits.filter(c => c.overall === 'ATM');
  const autoCommits = commits.filter(c => c.overall === 'AUTO');
  const hasATM = atmCommits.length > 0;
  const newVersion = bumpVersion(currentVersion, hasATM);
  const today = new Date().toISOString().split('T')[0];

  const changes = [];
  for (const c of atmCommits) {
    changes.push({
      type: 'ATM',
      msg: c.msg,
      files: Object.keys(c.files || {}).flatMap(cat =>
        (c.files[cat] || []).map(f => `${cat}:${f}`)
      ),
    });
  }
  for (const c of autoCommits) {
    changes.push({
      type: 'AUTO',
      msg: c.msg,
      files: Object.keys(c.files || {}).flatMap(cat =>
        (c.files[cat] || []).map(f => `${cat}:${f}`)
      ),
    });
  }

  const whatsNew = {
    version: newVersion,
    date: today,
    changes,
  };

  const outPath = path.join(REPO_ROOT, 'src/renderer/src/data/whats-new.json');
  writeFileSync(outPath, JSON.stringify(whatsNew, null, 2));
  console.log(`\n✅ whats-new.json written: ${outPath}`);
}

function readReport() {
  if (!existsSync(REPORT_PATH)) {
    console.error('❌ Report not found:', REPORT_PATH);
    console.error('   Run: node scripts/auto-detect-upstream.mjs');
    process.exit(1);
  }
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

function linearAvailable() {
  try { execFileSync('linear', ['--version'], { stdio: 'pipe' }); return true; }
  catch { return false; }
}

function linearCreateArgs(commit) {
  const title = `[${commit.overall}] ${commit.msg}`;
  const files = Object.entries(commit.files || {})
    .flatMap(([cat, arr]) => arr.map(f => `  [${cat}] ${f}`))
    .join('\n');
  const description = [
    commit.github_url,
    '',
    commit.summary,
    '',
    'Files:',
    files || '  (none)',
  ].join('\n');
  return [
    'issue', 'create',
    '--title', title,
    '--description', description,
    '--project', 'mark-agent-for-linux',
    '--team', 'Abelion Space',
    '--label', commit.overall,
  ];
}

function execLinear(args) {
  try {
    return execFileSync('linear', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return (e.stdout?.toString() || '') + '\n' + (e.stderr?.toString() || '');
  }
}

function listPending() {
  const report = readReport();
  const pending = (report.commits || []).filter(c => c.status === 'todo' && !c.linear_issue_id);
  if (!pending.length) {
    console.log('✅ No pending commits to sync.');
    return;
  }
  console.log(`\n📋 ${pending.length} pending commit(s):\n`);
  console.log('  OVERALL  HASH             TITLE');
  console.log('  -------- ---------------  ----------------------------------------');
  for (const c of pending) {
    console.log(`  ${c.overall.padEnd(8)} ${c.hash.slice(0, 14).padEnd(15)} ${c.msg}`);
  }
}

function syncLinear() {
  const report = readReport();
  const commits = report.commits || [];
  const pending = commits.filter(c => c.status === 'todo' && !c.linear_issue_id);

  if (!pending.length) {
    console.log('✅ Nothing to sync — all commits already have Linear issues.');
    return;
  }

  if (!linearAvailable()) {
    console.error('⚠️  `linear` CLI not found. Install: https://www.linear.app/cli');
    console.error('   Then run: node scripts/mark-update.mjs --sync-linear');
    console.error('\n   Commits that would be created:');
    pending.forEach(c => console.error(`   • [${c.overall}] ${c.msg}  (${c.github_url})`));
    process.exit(1);
  }

  console.log(`🔗 Syncing ${pending.length} commit(s) to Linear...\n`);
  for (const commit of pending) {
    console.log(`→ [${commit.overall}] ${commit.msg}`);
    const out = execLinear(linearCreateArgs(commit));
    const idMatch = out.match(/ISS-\d+|[A-Z]{2,}-\d+/);
    const issueId = idMatch ? idMatch[0] : null;

    if (!issueId) {
      console.error('  ⚠️  Could not parse issue id from output:');
      console.error('  ' + out.split('\n').slice(0, 3).join('\n  '));
      continue;
    }
    console.log(`  ✓ ${issueId}  ${commit.github_url}`);

    const idx = commits.findIndex(c => c.hash === commit.hash);
    if (idx >= 0) {
      commits[idx].linear_issue_id = issueId;
      commits[idx].status = 'in_progress';
    }
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('\n📄 Report updated:', REPORT_PATH);
}

async function main() {
  if (!existsSync(path.join(REPO_ROOT, '.git'))) {
    console.error('❌ Not a git repo:', REPO_ROOT);
    process.exit(1);
  }

  banner('Fetching official repo...');
  git(`fetch ${REMOTE}`);

  const didStash = !process.env.NO_STASH && hasChanges();
  if (didStash) {
    banner('Local changes detected → stashing...');
    git(`stash push -m "mark-update auto-stash: $(date -u +%Y%m%dT%H%M%SZ)"`);
    stashInfo();
  } else {
    console.log('✅ No local changes to stash.');
  }

  // Pull
  banner(didStash ? 'Pulling upstream (clean tree)' : 'Pulling upstream...');
  try {
    if (DO_REBASE) {
      git(`rebase ${REMOTE}/${BRANCH}`);
    } else {
      git(`merge --no-ff ${REMOTE}/${BRANCH} -m "merge ${REMOTE}/${BRANCH} into local"`);
    }
  } catch (e) {
    const conflicts = getConflicts();
    if (conflicts.length > 0) {
      console.error('\n⚔️  MERGE CONFLICT — manual resolution required.');
      console.error('Conflicts in:');
      conflicts.forEach(f => console.error('  • ' + f));
      console.error('\nResolve, then continue:');
      console.error(DO_REBASE ? '  git rebase --continue' : '  git commit');
      console.error('After resolving, run: node scripts/mark-update.mjs --restore-stash');
      if (didStash) stashInfo();
      process.exit(1);
    }
    throw e; // unknown error
  }

  console.log('✅ Upstream merged into local.');

  // Restore stash
  if (didStash) {
    banner('Restoring stashed changes...');
    const popRes = git('stash pop', true);
    console.log(popRes.stdout || popRes.stderr || 'stash restored');
    const postConflicts = getConflicts();
    if (postConflicts.length > 0) {
      console.error('\n⚔️  CONFLICT while popping stash — manual resolution required.');
      console.error('Conflicts in:');
      postConflicts.forEach(f => console.error('  • ' + f));
      stashInfo();
      process.exit(1);
    }
  }

  banner('Update complete.');
  console.log(`Branch ${BRANCH} is up to date with ${REMOTE}/${BRANCH}.`);
}

if (DO_LIST) { listPending(); process.exit(0); }
if (SYNC_LINEAR) { syncLinear(); process.exit(0); }
if (DO_TAG || DO_CHANGELOG || DO_WHATS_NEW) {
  const report = readReportForFlags();
  if (DO_TAG) {
    banner('Tagging ATM commits...');
    tagATMCommits(report);
  }
  if (DO_CHANGELOG) {
    banner('Generating CHANGELOG.md...');
    updateChangelog(report);
  }
  if (DO_WHATS_NEW) {
    banner('Generating whats-new.json...');
    writeWhatsNew(report);
  }
}

// separate subcommand to restore stash later
if (process.argv[2] === '--restore-stash') {
  banner('Restoring stash...');
  const out = git('stash pop', true);
  console.log(out.stdout || out.stderr || 'done');
  const c = getConflicts();
  if (c.length) {
    console.error('⚔️ Conflicts:'); c.forEach(x => console.error('  • '+x));
    stashInfo();
    process.exit(1);
  }
  console.log('✅ Stash restored.');
  process.exit(0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
