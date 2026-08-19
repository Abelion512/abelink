#!/usr/bin/env node
/**
 * mark update — auto-stash local changes, pull official (upstream), then pop stash.
 * Resolves merge conflicts by reporting them; does NOT auto-resolve.
 *
 * Usage:
 *   node scripts/mark-update.mjs            # safe path: pull upstream, merge into local
 *   node scripts/mark-update.mjs --rebase   # rebase your local commits atop upstream
 *
 * Environment:
 *   MARK_UPDATE_REMOTE=upstream  (default) or 'origin'
 *   MARK_UPDATE_BRANCH=master    (default)
 *   NO_STASH=1                   # skip stash (use only if you have no local changes or manage them)
 */
import { spawnSync, execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const REMOTE = process.env.MARK_UPDATE_REMOTE || 'upstream';
const BRANCH = process.env.MARK_UPDATE_BRANCH || 'master';
const DO_REBASE = process.argv.includes('--rebase');
const SYNC_LINEAR = process.argv.includes('--sync-linear');
const DO_LIST = process.argv.includes('--list');

if (SYNC_LINEAR) syncLinear();
if (DO_LIST) listPending();

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

function readReport() {
  if (!existsSync(REPORT_PATH)) {
    console.error('❌ Report not found:', REPORT_PATH);
    console.error('   Run: node scripts/auto-detect-upstream.mjs');
    process.exit(1);
  }
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

function linearAvailable() {
  try { execSync('linear --version', { stdio: 'pipe' }); return true; }
  catch { return false; }
}

// Build Linear create command for one commit. --label accepted once per call.
function linearCreateCmd(commit) {
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
  // Quote each arg; description has newlines so single-quote the whole thing.
  return [
    'linear issue create',
    `--title ${JSON.stringify(title)}`,
    `--description ${JSON.stringify(description)}`,
    '--project "mark-agent-for-linux"',
    '--team "Abelion Space"',
    `--label "${commit.overall}"`,
  ].join(' ');
}

function cmdOutput(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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
  console.log('  OVERALL  HASH            TITLE');
  console.log('  -------- --------------- ----------------------------------------');
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
    console.error('⚠️  `linear` CLI not found. Install: https://linear.app/cli');
    console.error('   Then run: node scripts/mark-update.mjs --sync-linear');
    console.error('\n   Commits that would be created:');
    pending.forEach(c => console.error(`   • [${c.overall}] ${c.msg}  (${c.github_url})`));
    process.exit(1);
  }

  console.log(`🔗 Syncing ${pending.length} commit(s) to Linear...\n`);
  for (const commit of pending) {
    console.log(`→ [${commit.overall}] ${commit.msg}`);
    const out = cmdOutput(linearCreateCmd(commit));
    const idMatch = out.match(/ISS-\d+|[A-Z]{2,}-\d+/);
    const issueId = idMatch ? idMatch[0] : null;

    if (!issueId) {
      console.error('  ⚠️  Could not parse issue id from output:');
      console.error('  ' + out.split('\n').slice(0, 3).join('\n  '));
      continue;
    }
    console.log(`  ✓ ${issueId}  ${commit.github_url}`);

    // Update report in place.
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

main().catch(e => { console.error('❌', e.message); process.exit(1); });
