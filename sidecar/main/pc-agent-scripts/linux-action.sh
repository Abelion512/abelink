#!/usr/bin/env bash
# linux-action.sh — Linux single-shot executor for MARK PC automation fallback.
# Pengganti langsung win-action.ps1 era Windows. Dipanggil dari
# sidecar/main/pc-agent.js (runScriptFallback) dengan gaya named-flag:
#   linux-action.sh --action click --x 100 --y 200
#   linux-action.sh --action type --text "halo dunia"
# Gaya posisi lama tetap didukung: linux-action.sh click 100 200
# Output: satu baris JSON di stdout.

set -euo pipefail

[ $# -ge 1 ] || { echo '{"status":"error","message":"No action given"}'; exit 1; }

err() { echo "{\"status\":\"error\",\"message\":\"$1\"}"; exit 1; }

command -v xdotool >/dev/null 2>&1 || err "xdotool not found; install xdotool"

# --- Argument parsing ------------------------------------------------------
# Semua argumen (setelah ACTION) disimpan di ARGS; get_flag mencari
# --name / -name lalu mengembalikan nilai berikutnya. Fallback posisional
# ditangani lewat pos() per-action.
ARGS=("$@")

get_flag() {
  local name="$1" i
  for ((i=0; i<${#ARGS[@]}-1; i++)); do
    if [[ "${ARGS[$i]}" == "--$name" || "${ARGS[$i]}" == "-$name" ]]; then
      printf '%s' "${ARGS[$((i+1))]}"
      return 0
    fi
  done
  return 1
}

# Nilai posisional ke-i, hanya bila tidak diawali '-' (bukan flag).
pos() {
  local i="$1"
  [[ $i -lt ${#ARGS[@]} ]] || return 1
  [[ "${ARGS[$i]}" == -* ]] && return 1
  printf '%s' "${ARGS[$i]}"
}

# Tentukan ACTION: dari --action atau token posisional pertama.
ACTION="$(get_flag action || true)"
if [ -z "$ACTION" ]; then
  ACTION="$(pos 0 || true)"
  ARGS=("${ARGS[@]:1}")
fi

[ -n "$ACTION" ] || { echo '{"status":"error","message":"No action given"}'; exit 1; }

case "$ACTION" in
  click)
    X="$(get_flag x || pos 0 || true)"
    Y="$(get_flag y || pos 1 || true)"
    [ -n "$X" ] && [ -n "$Y" ] || err "click needs --x and --y"
    xdotool mousemove --sync "$X" "$Y" click 1
    echo '{"status":"success","action":"click","x":"'"$X"'","y":"'"$Y"'"}'
    ;;

  doubleclick)
    X="$(get_flag x || pos 0 || true)"
    Y="$(get_flag y || pos 1 || true)"
    [ -n "$X" ] && [ -n "$Y" ] || err "doubleclick needs --x and --y"
    xdotool mousemove --sync "$X" "$Y"
    win="$(xdotool getactivewindow)"
    xdotool click --window "$win" 1; sleep 0.12
    xdotool click --window "$win" 1
    echo '{"status":"success","action":"doubleclick","x":"'"$X"'","y":"'"$Y"'"}'
    ;;

  type)
    TEXT="$(get_flag text || true)"
    if [ -z "$TEXT" ] && [ ${#ARGS[@]} -gt 0 ]; then
      # Gaya posisional: gabungkan sisa argumen sebagai teks (bisa ada spasi).
      TEXT="${ARGS[*]}"
    fi
    [ -n "$TEXT" ] || err "Empty text"
    # Kirim tiap karakter; xdotool type tidak menangani newline.
    i=0; while [ $i -lt ${#TEXT} ]; do
      c="${TEXT:$i:1}"
      case "$c" in
        $'\n') xdotool key Return; sleep 0.01 ;;
        $'\r') : ;;
        *) xdotool type --clearmodifiers "$c"; sleep 0.005 ;;
      esac
      i=$((i+1))
    done
    echo '{"status":"success","action":"type"}'
    ;;

  key)
    COMBO="$(get_flag combo || pos 0 || true)"
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
    echo '{"status":"success","action":"key","combo":"'"$COMBO"'"}'
    ;;

  scroll)
    DIR="$(get_flag direction || pos 0 || true)"
    AMOUNT="$(get_flag amount || pos 1 || true)"
    DIR="${DIR:-down}"; AMOUNT="${AMOUNT:-5}"
    [ "$DIR" = "up" ] && CLICK=4 || CLICK=5
    for ((i=0; i<AMOUNT; i++)); do xdotool click "$CLICK"; done
    echo '{"status":"success","action":"scroll","direction":"'"$DIR"'","amount":"'"$AMOUNT"'"}'
    ;;

  open)
    TARGET="$(get_flag target || pos 0 || true)"
    [ -n "$TARGET" ] || err "Empty target"
    xdg-open "$TARGET"
    echo '{"status":"success","action":"open"}'
    ;;

  list-windows)
    # Pemanggil JS melakukan JSON.parse(result) dan memakai array window.
    # Wajib: array JSON berisi {hwnd, title}.
    command -v wmctrl >/dev/null 2>&1 || err "wmctrl not found; install wmctrl"
    echo '['
    first=1
    while read -r id desk host title; do
      # Saring window internal mark-agent
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
    TITLE="$(get_flag target || pos 0 || true)"
    [ -n "$TITLE" ] || err "Empty title"
    ID="$(xdotool search --name "$TITLE" 2>/dev/null | head -1)" || true
    if [ -n "$ID" ]; then
      xdotool windowactivate --sync "$ID"
      echo '{"status":"success","action":"focus-window"}'
    else
      # Fallback wmctrl
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
    echo '{"status":"error","message":"Unknown action: '"$ACTION"'"}'; exit 1 ;;
esac
