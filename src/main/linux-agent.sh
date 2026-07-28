#!/bin/bash
# linux-agent.sh — Linux desktop automation primitives for MARK
# Usage: linux-agent.sh <command> [args...]
# Commands: click|mousemove|type|key|scroll|window-list|window-focus|active-window|screen-size|clipboard-get|clipboard-set|screenshot

set -euo pipefail

SESSION_TYPE="${XDG_SESSION_TYPE:-x11}"
TOOL=""
if [ "$SESSION_TYPE" = "wayland" ]; then
    TOOL="ydotool"
else
    TOOL="xdotool"
fi

case "${1:-help}" in
    click)
        X="${2:-0}"
        Y="${3:-0}"
        $TOOL mousemove "$X" "$Y"
        $TOOL click 1
        echo "clicked($X,$Y)"
        ;;
    mousemove)
        X="${2:-0}"
        Y="${3:-0}"
        $TOOL mousemove "$X" "$Y"
        echo "moved($X,$Y)"
        ;;
    type)
        shift
        TEXT="$*"
        if [ "$TOOL" = "ydotool" ]; then
            ydotool type "$TEXT"
        else
            xdotool type --delay 0 "$TEXT"
        fi
        echo "typed:${TEXT:0:50}"
        ;;
    key)
        COMBO="$2"
        if [ "$TOOL" = "ydotool" ]; then
            ydotool key "$COMBO"
        else
            xdotool key "$COMBO"
        fi
        echo "key:$COMBO"
        ;;
    scroll)
        DIR="${2:-down}"   # up/down
        COUNT="${3:-1}"
        BTN=5
        [ "$DIR" = "up" ] && BTN=4
        for ((i=0; i<COUNT; i++)); do $TOOL click "$BTN"; done
        echo "scroll:$DIR x$COUNT"
        ;;
    window-list)
        wmctrl -l | head -50
        ;;
    window-focus)
        TITLE="$2"
        wmctrl -F -a "$TITLE" 2>/dev/null || xdotool search --name "$TITLE" windowactivate 2>/dev/null
        echo "focused:$TITLE"
        ;;
    active-window)
        xdotool getactivewindow getwindowname 2>/dev/null || echo "unknown"
        ;;
    screen-size)
        xdpyinfo | awk '/dimensions:/{print $2}' 2>/dev/null || echo "1920x1080"
        ;;
    clipboard-get)
        xclip -o -selection clipboard 2>/dev/null || echo ""
        ;;
    clipboard-set)
        echo -n "$2" | xclip -selection clipboard
        echo "clipboard-set"
        ;;
    screenshot)
        OUT="${2:-/tmp/mark-screenshot.png}"
        python3 -c "
import mss, sys
from PIL import Image
with mss.mss() as sct:
    mon = sct.monitors[1]
    img = sct.grab(mon)
    Image.frombytes('RGB', img.size, img.rgb).save('$OUT')
    print(f'screenshot:$OUT')
" 2>/dev/null || echo "screenshot:FAILED"
        ;;
    help|*)
        echo "Commands: click X Y | mousemove X Y | type text | key combo | scroll up/down [n]"
        echo "         window-list | window-focus title | active-window | screen-size"
        echo "         clipboard-get | clipboard-set text | screenshot [path]"
        ;;
esac
