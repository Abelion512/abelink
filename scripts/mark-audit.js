#!/usr/bin/env node
// MARK runner helper - detects window status and logs

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const LOG_FILE = '/tmp/mark_audit.log'
const PID_FILE = '/tmp/mark.pid'

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const line = `[${ts}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

// Clear old state
try { fs.unlinkSync(PID_FILE) } catch (_) {}
try { fs.unlinkSync(LOG_FILE) } catch (_) {}

log('MARK START INIT')

// Start Tauri dev with full logging
const proc = execSync('nohup bash -lc "cd /media/abelion/Isaf/ican/project/AGENT/mark-agent-fork && RUST_LOG=debug npx tauri dev" 2>&1', {
  stdio: 'inherit',
  detached: true,
  windowsHide: true
})

log('Process started, monitoring...')
