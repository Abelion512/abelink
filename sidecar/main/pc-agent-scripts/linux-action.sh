#!/usr/bin/env bash
# linux-action.sh — Linux fallback single-shot executor (mirrors win-action.ps1)
# Receives args like: linux-action.sh click 100 200
# JS calls: runScriptFallback('win-action.ps1', ['-Action', 'click', '-X', x, '-Y', y])
# Pattern: $1=Action, then remaining args may contain -X/-Y/-Text/-Combo/-Target flags

set -euo pipefail

[ $# -ge 1 ] || { echo '{"status":"error","message":"No action given"}'; exit 1; }

ACTION="$1"; shift
err() { echo "{\"status\":\"error\",\"message\":\"$1\"}"; exit 1; }

command -v xdotool >/dev/null 2>&1 || err "xdotool not found; install xdotool"

parse_val() {
  # Read the next arg unless it starts with -, then read the one after
  local first="$1"; shift
  if [ -z "$first" ]; then echo ""; return; fi
  if [[ "$first" == -* ]]; then
    local second="$1"; shift
    echo "${second:-}"
  else
    echo "$first"
  fi
}

case "$ACTION" in
  click)
    X="$(parse_val "$1" "$1")"; shift 1 || true
    Y="$(parse_val "$1" "$1")"; shift 1 || true
    xdotool mousemove --sync "$X" "$Y" click 1
    echo '{"status":"success","action":"click","x":'"$X"',"y":'"$Y"'}'
    ;;

  doubleclick)
    X="$(parse_val "$1" "$1")"; shift 1 || true
    Y="$(parse_val "$1" "$1")"; shift 1 || true
    xdotool mousemove --sync "$X" "$Y"
    win="$(xdotool getactivewindow)"
    xdotool click --window "$win" 1; sleep 0.12
    xdotool click --window "$win" 1
    echo '{"status":"success","action":"doubleclick","x":'"$X"',"y":'"$Y"'}'
    ;;

  type)
    # JS passes: '-Action' 'type' '-Text' 'some text'
    # After shift: $1 = -Text, $2 = text
    TEXT="$(parse_val "$1" "$1")"; shift 1 || true
    [ -n "$TEXT" ] || err "Empty text"
    # Send each char; xdotool type doesn't handle \n
    i=0; while [ $i -lt ${#TEXT} ]; do
      c="${TEXT:$i:1}"
      case "$c" in
        $'\n') xdotool key Return; sleep 0.01 ;;
        $'\r') continue ;;
        *) xdotool type --clearmodifiers "$c"; sleep 0.005 ;;
      esac
      i=$((i+1))
    done
    echo '{"status":"success","action":"type"}'
    ;;

  key)
    # JS passes: '-Action' 'key' '-Combo' 'ctrl+c'
    # After shift: $1 = -Combo, $2 = combo
    COMBO="$(parse_val "$1" "$1")"; shift 1 || true
    [ -n "$COMBO" ] || err "Empty combo"
    case "$COMBO" in
      ctrl+c) xdotool key ctrl+c ;;
      ctrl+v) xdotool key ctrl+v ;;
      ctrl+x) xdotool key ctrl+x ;;
      ctrl+a) xdotool key ctrl+a ;;
      ctrl+z) xdotool key ctrl+z ;;
      ctrl+s) xdotool key ctrl+s ;;
      ctrl+p) xdotool key ctrl+p ;;
      ctrl+d) xdotool key ctrl+d ;;
      ctrl+f) xdotool key ctrl+f ;;
      ctrl+n) xdotool key ctrl+n ;;
      ctrl+t) xdotool key ctrl+t ;;
      ctrl+w) xdotool key ctrl+w ;;
      ctrl+e) xdotool key ctrl+e ;;
      ctrl+r) xdotool key ctrl+r ;;
      ctrl+left) xdotool key Ctrl+Left ;;
      ctrl+right) xdotool key Ctrl+Right ;;
      ctrl+up) xdotool key Ctrl+Up ;;
      ctrl+down) xdotool key Ctrl+Down ;;
      alt+tab) xdotool key alt+Tab ;;
      shift+tab) xdotool key Shift+Tab ;;
      shift+enter) xdotool key Shift+Return ;;
      alt+f4) xdotool key Alt+F4 ;;
      f1) xdotool key F1 ;;
      f2) xdotool key F2 ;;
      f3) xdotool key F3 ;;
      f4) xdotool key F4 ;;
      f5) xdotool key F5 ;;
      f6) xdotool key F6 ;;
      f7) xdotool key F7 ;;
      f8) xdotool key F8 ;;
      f9) xdotool key F9 ;;
      f10) xdotool key F10 ;;
      f11) xdotool key F11 ;;
      f12) xdotool key F12 ;;
      esc) xdotool key Escape ;;
      return) xdotool key Return ;;
      enter) xdotool key Return ;;
      tab) xdotool key Tab ;;
      up) xdotool key Up ;;
      down) xdotool key Down ;;
      left) xdotool key Left ;;
      right) xdotool key Right ;;
      home) xdotool key Home ;;
      end) xdotool key End ;;
      space) xdotool key Space ;;
      backspace) xdotool key BackSpace ;;
      delete) xdotool key Delete ;;
      *) xdotool key "$COMBO" ;;
    esac
    echo '{"status":"success","action":"key","combo":"'$COMBO'"}'
    ;;

  scroll)
    DIR="$(parse_val "$1" "$1")"; shift 1 || true
    AMOUNT="$(parse_val "$1" "$1")"; shift 1 || true
    [ "$DIR" = "up" ] && CLICK=4 || CLICK=5
    for ((i=0; i<AMOUNT; i++)); do xdotool click "$CLICK"; done
    echo '{"status":"success","action":"scroll","direction":"'$DIR'","amount":'$AMOUNT'}'
    ;;

  open)
    # JS passes: '-Action' 'open' '-Target' 'path'
    # After shift: $1 = -Target, $2 = target
    TARGET="$(parse_val "$1" "$1")"; shift 1 || true
    [ -n "$TARGET" ] || err "Empty target"
    xdg-open "$TARGET"
    echo '{"status":"success","action":"open"}'
    ;;

  list-windows)
    # JS does JSON.parse(result) and uses result as windows array
    # Must emit JSON array of {hwnd, title} objects
    command -v wmctrl >/dev/null 2>&1 || err "wmctrl not found; install wmctrl"
    echo '['
    first=1
    while read -r id desk host title; do
      # Filter out mark-agent internal windows
      case "$title" in
        mark\ agent*|mark\ pc\ automation*|mark_unblock|mark_pc_stop) continue ;;
      esac
      title="${title//\"/\\\"}"
      [ -z "$title" ] && continue
      [ $first -eq 0 ] && echo ','
      first=0
      printf '{"hwnd":"%s","title":"%s"}\n' "$id" "$title"
    done < <(wmctrl -l)
    echo ']'
    ;;

  focus-window)
    # JS passes: '-Action' 'focus-window' '-Target' 'title'
    # After shift: $1 = -Target, $2 = title
    TITLE="$(parse_val "$1" "$1")"; shift 1 || true
    [ -n "$TITLE" ] || err "Empty title"
    ID="$(xdotool search --name "$TITLE" 2>/dev/null | head -1)" || true
    if [ -n "$ID" ]; then
      xdotool windowactivate --sync "$ID"
      echo '{"status":"success","action":"focus-window"}'
    else
      # Fall back to wmctrl
      WMID="$(wmctrl -l | grep -i "$TITLE" | head -1 | awk '{print $1}')"
      if [ -n "$WMID" ]; then
        wmctrl -i -a "$WMID"
        echo '{"status":"success","action":"focus-window"}'
      else
        err "Window not found: $TITLE"
      fi
    fi
    ;;

  *)
    echo '{"status":"error","message":"Unknown action: '$ACTION'"}'; exit 1 ;;
esac