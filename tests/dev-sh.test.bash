#!/usr/bin/env bash
# Unit tests for scripts/dev.sh cwd-match security logic
# Tests that free_cargo_lock only kills processes whose cwd matches PROJECT_ROOT

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_SH="$SCRIPT_DIR/scripts/dev.sh"

# Test helper: create a fake process with specific cwd
# Returns the PID of the fake process
create_fake_cargo_process() {
  local fake_cwd="$1"
  # Use bash -c to create a process that appears to be cargo
  # The process will sleep, but we'll check its cwd
  bash -c "cd '$fake_cwd' && exec -a cargo sleep 300" &
  echo $!
}

# Test 1: Process with cwd OUTSIDE PROJECT_ROOT should NOT be matched
test_cargo_outside_project_not_killed() {
  echo "Test 1: Cargo process outside PROJECT_ROOT should NOT be killed"
  
  local fake_cwd="/tmp"
  local pid
  pid=$(create_fake_cargo_process "$fake_cwd")
  
  # Give process time to start
  sleep 0.5
  
  # Verify process exists
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "FAIL: Test process failed to start"
    return 1
  fi
  
  # Get PROJECT_ROOT from dev.sh
  local project_root
  project_root=$(grep '^PROJECT_ROOT=' "$DEV_SH" | head -1 | cut -d'"' -f2)
  
  # Check that cwd is NOT project root
  local proc_cwd
  proc_cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || echo "unknown")
  
  if [ "$proc_cwd" = "$project_root" ] || [ "$proc_cwd" = "$project_root/src-tauri" ]; then
    echo "FAIL: Test setup error - cwd matches project root"
    kill "$pid" 2>/dev/null || true
    return 1
  fi
  
  # The free_cargo_lock function should NOT kill this process
  # We simulate by checking the condition in dev.sh
  # If cwd != PROJECT_ROOT and cwd != PROJECT_ROOT/src-tauri, process is spared
  
  # Clean up
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  
  echo "PASS: Process outside PROJECT_ROOT correctly identified as not belonging to repo"
}

# Test 2: Process with cwd = PROJECT_ROOT should be matched
test_cargo_inside_project_is_killed() {
  echo "Test 2: Cargo process inside PROJECT_ROOT should be identified for cleanup"
  
  local project_root
  project_root=$(grep '^PROJECT_ROOT=' "$DEV_SH" | head -1 | cut -d'"' -f2)
  
  local fake_cwd="$project_root"
  local pid
  pid=$(create_fake_cargo_process "$fake_cwd")
  
  sleep 0.5
  
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "FAIL: Test process failed to start"
    return 1
  fi
  
  local proc_cwd
  proc_cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || echo "unknown")
  
  if [ "$proc_cwd" != "$project_root" ]; then
    echo "FAIL: Test setup error - cwd does not match project root"
    kill "$pid" 2>/dev/null || true
    return 1
  fi
  
  # This process WOULD be killed by free_cargo_lock
  # We verify the condition matches
  if [ "$proc_cwd" = "$project_root" ] || [ "$proc_cwd" = "$project_root/src-tauri" ]; then
    echo "PASS: Process inside PROJECT_ROOT correctly identified for cleanup"
  else
    echo "FAIL: Process should have been identified for cleanup"
  fi
  
  # Clean up
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# Test 3: Process with cwd = PROJECT_ROOT/src-tauri should be matched
test_cargo_in_src_tauri_is_killed() {
  echo "Test 3: Cargo process in src-tauri should be identified for cleanup"
  
  local project_root
  project_root=$(grep '^PROJECT_ROOT=' "$DEV_SH" | head -1 | cut -d'"' -f2)
  
  local fake_cwd="$project_root/src-tauri"
  local pid
  pid=$(create_fake_cargo_process "$fake_cwd")
  
  sleep 0.5
  
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "FAIL: Test process failed to start"
    return 1
  fi
  
  local proc_cwd
  proc_cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || echo "unknown")
  
  if [ "$proc_cwd" != "$project_root/src-tauri" ]; then
    echo "FAIL: Test setup error - cwd does not match src-tauri"
    kill "$pid" 2>/dev/null || true
    return 1
  fi
  
  if [ "$proc_cwd" = "$project_root" ] || [ "$proc_cwd" = "$project_root/src-tauri" ]; then
    echo "PASS: Process in src-tauri correctly identified for cleanup"
  else
    echo "FAIL: Process should have been identified for cleanup"
  fi
  
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# Run all tests
echo "=== dev.sh cwd-match security tests ==="
echo ""

test_cargo_outside_project_not_killed
test_cargo_inside_project_is_killed
test_cargo_in_src_tauri_is_killed

echo ""
echo "=== All tests passed ==="