#!/usr/bin/env bash
# read-ui.sh — fallback pembacaan UI aktif (Linux-native)
# Output: teks sederhana window aktif + daftar window untuk parsing ID oleh pc-agent.js
ACTIVE=$(xdotool getactivewindow getwindowname 2>/dev/null || echo "(tidak ada window aktif)")
echo "=== ACTIVE WINDOW ==="
echo "$ACTIVE"
echo "=== WINDOW LIST ==="
wmctrl -l 2>/dev/null || xdotool search --onlyvisible --name "" getwindowname %@ 2>/dev/null
