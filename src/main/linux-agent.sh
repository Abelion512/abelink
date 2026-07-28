#!/bin/bash
# linux-agent.sh — Linux desktop automation primitives for MARK
# Usage: linux-agent.sh <command> [args...]
# Commands: click|mousemove|type|key|scroll|window-list|window-focus|
#           active-window|screen-size|clipboard-get|clipboard-set|screenshot|preflight

set -euo pipefail

SESSION_TYPE="${XDG_SESSION_TYPE:-x11}"
TOOL=""
[ "$SESSION_TYPE" = "wayland" ] && TOOL="ydotool" || TOOL="xdotool"

# ── helpers ────────────────────────────────────────────
die() { echo "ERROR:$*" >&2; exit 1; }

_require() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "$cmd not found"
  done
}

# ── dispatch ───────────────────────────────────────────
case "${1:-help}" in
    preflight)
        _require "$TOOL"
        echo "preflight:ok ($SESSION_TYPE → $TOOL)"
        ;;

    click)
        X="${2:-0}"
        Y="${3:-0}"
        _require "$TOOL"
        $TOOL mousemove "$X" "$Y"
        $TOOL click 1
        echo "clicked($X,$Y)"
        ;;

    mousemove)
        X="${2:-0}"
        Y="${3:-0}"
        _require "$TOOL"
        $TOOL mousemove "$X" "$Y"
        echo "moved($X,$Y)"
        ;;

    type)
        _require "$TOOL"
        shift
        [ $# -eq 0 ] && { echo "type:empty"; exit 0; }
        TEXT="$*"
        if [ "$TOOL" = "ydotool" ]; then
            "$TOOL" type "$TEXT"
        else
            "$TOOL" type --delay 0 "$TEXT"
        fi
        echo "typed:${TEXT:0:50}"
        ;;

    key)
        COMBO="${2:-}"
        [ -z "$COMBO" ] && { echo "key:missing-combo"; exit 0; }
        _require "$TOOL"
        if [ "$TOOL" = "ydotool" ]; then
            "$TOOL" key "$COMBO"
        else
            "$TOOL" key "$COMBO"
        fi
        echo "key:$COMBO"
        ;;

    scroll)
        DIR="${2:-down}"
        COUNT="${3:-1}"
        BTN=5
        [ "$DIR" = "up" ] && BTN=4
        _require "$TOOL"
        if [ "$TOOL" = "xdotool" ]; then
            "$TOOL" click --repeat "$COUNT" "$BTN"
        else
            for ((i=0; i<COUNT; i++)); do "$TOOL" click "$BTN"; done
        fi
        echo "scroll:$DIR x$COUNT"
        ;;

    window-list)
        _require wmctrl
        wmctrl -l | head -50
        ;;

    window-focus)
        TITLE="${2:-}"
        [ -z "$TITLE" ] && { echo "focus:missing-title"; exit 0; }
        if [ "$SESSION_TYPE" = "wayland" ]; then
            # ydotool has no native window focus; try kdotool
            command -v kdotool >/dev/null 2>&1 && {
                kdotool search --name "$TITLE" | head -1 | xargs -r kdotool windowactivate 2>/dev/null
            } || echo "focus:no-wayland-tool"
        else
            wmctrl -F -a "$TITLE" 2>/dev/null || \
            xdotool search --name "$TITLE" windowactivate 2>/dev/null || \
            echo "focus:not-found"
        fi
        echo "focused:$TITLE"
        ;;

    active-window)
        if [ "$SESSION_TYPE" = "wayland" ]; then
            command -v kdotool >/dev/null 2>&1 && {
                aid=$(kdotool getactivewindow 2>/dev/null) && \
                kdotool getwindowname "$aid" 2>/dev/null || echo "unknown"
            } || echo "unknown"
        else
            xdotool getactivewindow getwindowname 2>/dev/null || echo "unknown"
        fi
        ;;

    screen-size)
        if [ "$SESSION_TYPE" = "wayland" ]; then
            command -v wlr-randr >/dev/null 2>&1 && \
                wlr-randr | awk '/current mode/{print $1}' | head -1 || \
                echo "1920x1080"
        else
            xdpyinfo | awk '/dimensions:/{print $2}' 2>/dev/null || echo "1920x1080"
        fi
        ;;

    clipboard-get)
        if [ "$SESSION_TYPE" = "wayland" ]; then
            command -v wl-paste >/dev/null 2>&1 && wl-paste 2>/dev/null || echo ""
        else
            xclip -o -selection clipboard 2>/dev/null || echo ""
        fi
        ;;

    clipboard-set)
        [ $# -lt 2 ] && { echo "clipboard-set:missing-text"; exit 0; }
        if [ "$SESSION_TYPE" = "wayland" ]; then
            command -v wl-copy >/dev/null 2>&1 && {
                shift; printf '%s' "$*" | wl-copy
            } || echo "clipboard-set:no-tool"
        else
            shift; printf '%s' "$*" | xclip -selection clipboard
        fi
        echo "clipboard-set"
        ;;

    screenshot)
        OUT="${2:-/tmp/mark-screenshot.png}"
        python3 -c "
import mss, sys, os
from PIL import Image
out = sys.argv[1]
with mss.mss() as sct:
    mon = sct.monitors[1]
    img = sct.grab(mon)
    Image.frombytes('RGB', img.size, img.rgb).save(out)
    print(f'screenshot:{out}')
" "$OUT" 2>/dev/null || echo "screenshot:FAILED"
        ;;

    help|*)
        echo "Commands: click X Y | mousemove X Y | type text | key combo | scroll up/down [n]"
        echo "         window-list | window-focus title | active-window | screen-size"
        echo "         clipboard-get | clipboard-set text | screenshot [path]"
        echo "         preflight"
        ;;
esac
