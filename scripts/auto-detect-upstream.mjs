#!/usr/bin/env node
/**
 * Auto-detect upstream commits & classify diffs
 * Usage: node scripts/auto-detect-upstream.mjs [--apply-safe]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = '/media/abelion/Isaf/ican/project/AGENT/mark-agent-fork';
const UPSTREAM = 'upstream/master';
const LOCAL = 'linux';

function run(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (e) {
    return e.stdout?.toString() || e.stderr?.toString() || '';
  }
}

function getNewCommits() {
  const out = run(`git log --oneline ${LOCAL}..${UPSTREAM} 2>/dev/null`);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map(line => {
    const [hash, ...msg] = line.split(' ');
    return { hash, msg: msg.join(' ') };
  });
}

function getDiffFiles(commitHash) {
  const out = run(`git diff --name-only ${LOCAL}..${commitHash} 2>/dev/null`);
  return out.split('\n').filter(Boolean);
}

function classifyFile(file) {
  const safePatterns = [
    /^docs\//,
    /^README/,
    /^CHANGELOG/,
    /\.md$/,
    /^\.github\/workflows\//,
    /^scripts\/(?!auto-detect)/,
    /package\.json$/,
    /package-lock\.json$/,
    /\.gitignore$/,
  ];

  const atmPatterns = [
    /src\/renderer\/src\/api\/ai\//,
    /src\/renderer\/src\/hooks\/agent\//,
    /src\/renderer\/src\/components\/YoutubeMusicPlayer/,
    /src\/renderer\/src\/pages\/Configuration/,
    /tsconfig/,
    /\.eslintrc/,
  ];

  const isSafe = safePatterns.some(p => p.test(file));
  const isAtm = atmPatterns.some(p => p.test(file));

  if (isAtm) return 'ATM';
  if (isSafe) return 'AUTO';
  return 'REVIEW';
}

function classifyCommit(commit) {
  const files = getDiffFiles(commit.hash);
  const categories = { AUTO: [], ATM: [], REVIEW: [] };

  for (const file of files) {
    const cat = classifyFile(file);
    categories[cat].push(file);
  }

  const total = files.length;
  const atmCount = categories.ATM.length;
  const autoCount = categories.AUTO.length;

  let overall = 'REVIEW';
  if (atmCount === 0 && total > 0) overall = 'AUTO';
  else if (atmCount > 0 && autoCount === 0) overall = 'ATM';
  else if (atmCount > 0 && autoCount > 0) overall = 'MIXED';

  return {
    hash: commit.hash,
    msg: commit.msg,
    overall,
    files: categories,
    summary: `${total} files: ${autoCount} AUTO, ${atmCount} ATM, ${categories.REVIEW.length} REVIEW`
  };
}

function main() {
  const applySafe = process.argv.includes('--apply-safe');

  console.log('🔍 Fetching upstream...');
  run('git fetch upstream --quiet');

  const commits = getNewCommits();
  if (!commits.length) {
    console.log('✅ No new commits from upstream');
    return;
  }

  console.log(`\n📥 Found ${commits.length} new commit(s) from ${UPSTREAM}:\n`);

  const report = { auto: [], atm: [], mixed: [], review: [] };

  for (const commit of commits) {
    const cls = classifyCommit(commit);
    console.log(`  ${commit.hash} ${commit.msg}`);
    console.log(`    → ${cls.overall} | ${cls.summary}`);

    for (const [cat, files] of Object.entries(cls.files)) {
      if (files.length) {
        console.log(`      ${cat}: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
      }
    }
    console.log();

    report[cls.overall.toLowerCase()].push(cls);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Summary: ${report.auto.length} AUTO | ${report.atm.length} ATM | ${report.mixed.length} MIXED | ${report.review.length} REVIEW`);

  if (applySafe && report.auto.length > 0) {
    console.log('\n⚡ Applying AUTO commits...');
    for (const c of report.auto) {
      run(`git merge ${c.hash} --no-edit`);
      console.log(`  ✓ ${c.hash} ${c.msg}`);
    }
    console.log('Done. Run tests before push.');
  }

  // Write JSON report
  fs.writeFileSync(
    path.join(REPO_ROOT, 'upstream-diff-report.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), upstream: UPSTREAM, local: LOCAL, commits: report }, null, 2)
  );
  console.log('\n📄 Report saved: upstream-diff-report.json');
}

main();