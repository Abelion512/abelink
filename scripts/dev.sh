#!/usr/bin/env bash
# dev.sh — Smart bootstrap + launch for MARK Linux dev workstation.
#
# What it does (idempotent, non-destructive, never modifies package.json or CI):
#   1. Ensures Bun is installed at $BUN_INSTALL (default ~/.bun), version-locked
#      to BUN_VERSION (kept in sync with .github/workflows/tauri.yml).
#   2. Ensures node_modules/ is present and fresh relative to bun.lock / package.json.
#   3. Detects and auto-clears leftover port 1420 / cargo build-lock holders from
#      previous dev sessions, with a concise log of what was killed.
#   4. Forwards to `bun run app` (i.e. `tauri dev`).
#
# Usage:
#   bash scripts/dev.sh                # full smart bootstrap + launch
#   bash scripts/dev.sh --no-launch    # only bootstrap (no tauri dev)
#   bash scripts/dev.sh --help
#
# Notes:
#   - Does NOT use sudo. Bun install writes to ~/.bun only. The full system
#     package install (gtk, xdotool, tesseract, etc.) stays in
#     scripts/setup-linux-pc-agent.sh, which we never invoke automatically
#     because it needs sudo and is opt-in.
#   - CI is unaffected: .github/workflows/tauri.yml uses oven-sh/setup-bun@v2
#     which is the canonical path on GitHub Actions. This script targets
#     developer workstations only.

set -euo pipefail

# --- config -------------------------------------------------------------------
BUN_VERSION="${BUN_VERSION:-1.3.14}"   # MUST match .github/workflows/tauri.yml
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
EXPECTED_PORT="${EXPECTED_PORT:-1420}" # vite dev port (see vite.config.js)
SCRIPT_NAME="$(basename "$0")"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- tiny logger --------------------------------------------------------------
c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'
c_blu=$'\033[34m'; c_dim=$'\033[2m';  c_rst=$'\033[0m'
log()  { printf '%s[%s]%s %s\n' "$c_blu" "$SCRIPT_NAME" "$c_rst" "$*"; }
ok()   { printf '%s[%s]%s %s\n' "$c_grn" "$SCRIPT_NAME" "$c_rst" "$*"; }
warn() { printf '%s[%s]%s %s\n' "$c_yel" "$SCRIPT_NAME" "$c_rst" "$*" >&2; }
die()  { printf '%s[%s]%s %s\n' "$c_red" "$SCRIPT_NAME" "$c_rst" "$*" >&2; exit 1; }

# --- arg parsing --------------------------------------------------------------
LAUNCH=1
for arg in "$@"; do
  case "$arg" in
    --no-launch) LAUNCH=0 ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown arg: $arg (try --help)" ;;
  esac
done

# --- 1. bun bootstrap ---------------------------------------------------------
ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    local current major
    current="$(bun --version 2>/dev/null || echo unknown)"
    # Compare major.minor only — patch drift is always fine.
    major="${current%%.*}"
    if [ "$current" = "$BUN_VERSION" ]; then
      ok "bun $current on PATH"
    elif [ -n "$major" ] && [ "$major" -ge "$(echo "$BUN_VERSION" | cut -d. -f1)" ]; then
      ok "bun $current on PATH (CI uses $BUN_VERSION; major >=, OK)"
    else
      warn "bun $current on PATH (CI uses $BUN_VERSION) — continuing; lockfile may need bump"
    fi
    return 0
  fi

  # No bun on PATH. Check for stale install at $BUN_INSTALL/bin/bun.
  local bun_bin="$BUN_INSTALL/bin/bun"
  if [ -x "$bun_bin" ]; then
    warn "bun not on PATH but found at $bun_bin — prepending to PATH for this session"
    export PATH="$BUN_INSTALL/bin:$PATH"
    ok "bun $("$bun_bin" --version) recovered"
    return 0
  fi

  # No bun anywhere. This is the most common fresh-clone case.
  log "bun not found — installing $BUN_VERSION to $BUN_INSTALL (no sudo)"
  if [ -e "$BUN_INSTALL" ] && [ ! -d "$BUN_INSTALL" ]; then
    # Stale symlink or file in the way (e.g. dangling symlink to a backup drive).
    warn "$BUN_INSTALL exists but is not a directory — removing"
    rm -f "$BUN_INSTALL"
  fi
  curl -fsSL https://bun.sh/install | bash >/dev/null
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    die "bun install succeeded but binary not on PATH (check $BUN_INSTALL/bin)"
  fi
  ok "bun $(bun --version) installed"
  warn "add to your shell rc:  export PATH=\"$BUN_INSTALL/bin:\$PATH\""
}

# --- 2. dependency freshness --------------------------------------------------
ensure_deps() {
  # Treat this repo as truly fresh only if BOTH node_modules is missing AND
  # no bun.lock is present (i.e. never been installed). Parens are required:
  # bash precedence is `&&` tighter than `||`, so `[ ! -d node_modules ] ||
  # [ ! -f ... ] && [ ! -f bun.lock ]` parses as `!A || (B && C)` which is
  # wrong. The intent is `(A || B) && C`.
  if { [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ]; } && [ ! -f bun.lock ]; then
    log "no node_modules and no bun.lock — running bun install"
    bun install
    ok "dependencies installed"
    return 0
  fi
  # If lockfile or package.json is newer than node_modules, refresh.
  if [ -f bun.lock ] && [ bun.lock -nt node_modules ]; then
    log "bun.lock newer than node_modules — running bun install"
    bun install
    ok "dependencies refreshed"
    return 0
  fi
  if [ package.json -nt node_modules ]; then
    log "package.json newer than node_modules — running bun install"
    bun install
    ok "dependencies refreshed"
    return 0
  fi
  ok "node_modules is fresh"
}

# --- 3. dev-server conflict cleanup ------------------------------------------
#
# We never blindly pkill — only target processes whose command line or port
# binding we can prove belongs to this project's previous dev runs.
free_dev_port() {
  local port="$1"
  local pids
  # ss -ltnp shows "(pid=N,fd=M)" in the users column. Parse with grep -o.
  pids="$(ss -ltnp "sport = :$port" 2>/dev/null \
          | grep -oE 'pid=[0-9]+' | sort -u | cut -d= -f2 || true)"
  if [ -z "$pids" ]; then
    ok "port $port is free"
    return 0
  fi
  warn "port $port in use by PID(s): $pids"
  local pid
  for pid in $pids; do
    local cmd
    cmd="$(ps -p "$pid" -o args= 2>/dev/null | head -c 200 || true)"
    if [ -z "$cmd" ]; then continue; fi
    # Only kill if the process is clearly this project's dev server.
    if echo "$cmd" | grep -qE 'mark-agent-linux.*(\.bin/(vite|tauri)|node_modules/@tauri-apps/cli)'; then
      log "  killing $pid — $cmd"
      kill "$pid" 2>/dev/null || true
    else
      die "port $port is held by an unrelated process (pid=$pid cmd='$cmd'); aborting to be safe"
    fi
  done
  # Reap, then SIGKILL stragglers in D state.
  sleep 1
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      log "  SIGKILL $pid (still alive)"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  if ss -ltn "sport = :$port" 2>/dev/null | grep -q ":$port"; then
    die "port $port is still bound after cleanup"
  fi
  ok "port $port freed"
}

free_cargo_lock() {
  # `cargo run` (and many `tauri dev` builds) acquire a filesystem lock under
  # src-tauri/target/. An interrupted previous run can leave a holder in 'D'
  # state. We only target holders whose working directory is this repo.
  local cargo_pids
  cargo_pids="$(pgrep -f 'cargo (run|build|check)' 2>/dev/null || true)"
  if [ -z "$cargo_pids" ]; then
    ok "no cargo build holders"
    return 0
  fi
  local pid
  for pid in $cargo_pids; do
    local cwd
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$PROJECT_ROOT/src-tauri" ] || [ "$cwd" = "$PROJECT_ROOT" ]; then
      local cmd
      cmd="$(ps -p "$pid" -o args= 2>/dev/null | head -c 160 || true)"
      log "  killing cargo holder $pid (cwd=$cwd) — $cmd"
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  for pid in $cargo_pids; do
    if kill -0 "$pid" 2>/dev/null; then
      local cwd
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
      if [ "$cwd" = "$PROJECT_ROOT/src-tauri" ] || [ "$cwd" = "$PROJECT_ROOT" ]; then
        log "  SIGKILL cargo holder $pid"
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  done
  ok "cargo holders cleared"
}

# --- main ---------------------------------------------------------------------
ensure_bun
ensure_deps
free_dev_port "$EXPECTED_PORT"
free_cargo_lock

if [ "$LAUNCH" -eq 0 ]; then
  ok "bootstrap complete (--no-launch). Run:  bun run app"
  exit 0
fi

log "launching: bun run app"
exec bun run app
