#!/usr/bin/env python3
"""
linux-daemon.py - Linux-native MARK PC Automation daemon
Mirrors pc-daemon.ps1: JSON-over-stdio protocol with ---MARK_DONE--- delimiter.
Uses xdotool/wmctrl for desktop automation, mss+pytesseract for OCR fallback.
"""
import sys
import os
import json
import subprocess
import time

# Ensure stdout/stderr use UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# ─── Dependencies ────────────────────────────────────────────────────
try:
    from mss import mss
    from PIL import Image
except ImportError:
    mss = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

# ─── State ───────────────────────────────────────────────────────────
element_cache = {}   # id -> {rect: [x,y,w,h], bbox}
screenshots_cache = {}
MARK_WINDOW_KEYWORDS = [
    'mark agent', 'mark pc automation', 'mark_unblock', 'mark_pc_stop',
]

# ─── Helpers ─────────────────────────────────────────────────────────

def is_mark_window(title: str) -> bool:
    t = (title or '').strip().lower()
    if not t:
        return True
    if t.startswith('mark -') or t.startswith('mark_pc_') or t.startswith('mark_'):
        return True
    return any(k in t for k in MARK_WINDOW_KEYWORDS)

def flush():
    sys.stdout.flush()

def emit(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':'), ensure_ascii=False))
    sys.stdout.write('\n')
    sys.stdout.write('---MARK_DONE---\n')
    flush()

def xdotool(*args) -> str:
    """Run xdotool, return stdout stripped."""
    try:
        result = subprocess.run(
            ['xdotool'] + list(args),
            capture_output=True, text=True, timeout=10
        )
        return (result.stdout or '').strip()
    except FileNotFoundError:
        return ''
    except Exception:
        return ''

def wmctrl_list() -> str:
    try:
        result = subprocess.run(
            ['wmctrl', '-l'],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout or ''
    except FileNotFoundError:
        return ''
    except Exception:
        return ''

def get_target_window_title() -> str:
    """Equivalent to MarkWin32::GetTargetWindow() + GetWindowText."""
    # Get the currently focused window title
    title = xdotool('getwindowfocus', 'getwindowname')
    if not title:
        return ''
    if not is_mark_window(title):
        return title

    # Focused window is Mark — find another visible, non-Mark window
    lines = wmctrl_list().splitlines()
    for line in lines:
        parts = line.split(None, 2)
        if len(parts) >= 3:
            win_title = parts[2]
            if not is_mark_window(win_title):
                win_id = parts[0]
                xdotool('windowactivate', '--sync', win_id)
                xdotool('windowfocus', '--sync', win_id)
                return win_title
    return title

def ensure_target_window_focused():
    """Equivalent to MarkWin32::EnsureTargetWindowFocused() - activates target window."""
    get_target_window_title()  # This already handles the logic

def get_window_rect(title: str) -> dict:
    """Get the bounding rectangle of the focused/named window."""
    win_id = xdotool('getactivewindow')
    if not win_id:
        for line in wmctrl_list().splitlines():
            if title and title.lower() in line.lower():
                parts = line.split(None, 1)
                if parts:
                    win_id = parts[0]
                    break
    if not win_id:
        return None

    geom = xdotool('getwindowgeometry', '--shell', win_id)
    rect = {}
    for line in geom.splitlines():
        if line.startswith('X='):
            rect['x'] = int(line.split('=')[1])
        elif line.startswith('Y='):
            rect['y'] = int(line.split('=')[1])
        elif line.startswith('WIDTH='):
            rect['w'] = int(line.split('=')[1])
        elif line.startswith('HEIGHT='):
            rect['h'] = int(line.split('=')[1])
    if rect.get('w', 0) <= 0 or rect.get('h', 0) <= 0:
        return None
    return rect

def capture_screen(rect: dict = None) -> str:
    """Capture screen or region, return temp PNG path."""
    if mss is None:
        return None
    with mss() as sct:
        if rect:
            monitor = {
                'left': rect['x'],
                'top': rect['y'],
                'width': rect['w'],
                'height': rect['h']
            }
        else:
            monitor = sct.monitors[1]

        sct_img = sct.grab(monitor)
        img = Image.frombytes('RGB', sct_img.size, sct_img.rgb)

        import tempfile
        fd, tmp = tempfile.mkstemp(suffix='.png')
        os.close(fd)
        img.save(tmp, 'PNG')
        return tmp

def run_ocr(png_path: str) -> list:
    """Run tesseract OCR on image, return list of {text, rect}."""
    if pytesseract is None:
        return []
    try:
        data = pytesseract.image_to_data(png_path, output_type=pytesseract.Output.DICT)
        results = []
        for i, text in enumerate(data.get('text', [])):
            if not text or text.strip() == '':
                continue
            x = data['left'][i]
            y = data['top'][i]
            w = data['width'][i]
            h = data['height'][i]
            results.append({
                'id': len(results) + 1,
                'text': text,
                'rect': [x, y, w, h]
            })
        return results
    except Exception:
        return []

def parse_key_combo(combo: str) -> str:
    """Map user-friendly key combos to xdotool key names."""
    combo = combo.lower().strip().replace(' ', '')
    parts = combo.split('+')
    mapped = []
    for p in parts:
        if p == 'ctrl':
            mapped.append('ctrl')
        elif p == 'alt':
            mapped.append('alt')
        elif p == 'shift':
            mapped.append('shift')
        elif p == 'win' or p == 'super':
            mapped.append('super')
        elif p == 'enter' or p == 'return':
            mapped.append('Return')
        elif p == 'tab':
            mapped.append('Tab')
        elif p == 'esc' or p == 'escape':
            mapped.append('Escape')
        elif p == 'backspace':
            mapped.append('BackSpace')
        elif p == 'delete' or p == 'del':
            mapped.append('Delete')
        elif p == 'up':
            mapped.append('Up')
        elif p == 'down':
            mapped.append('Down')
        elif p == 'left':
            mapped.append('Left')
        elif p == 'right':
            mapped.append('Right')
        elif p == 'home':
            mapped.append('Home')
        elif p == 'end':
            mapped.append('End')
        elif p == 'space':
            mapped.append('space')
        elif p == 'f1':
            mapped.append('F1')
        elif len(p) == 1:
            mapped.append(p)
        else:
            mapped.append(p)
    return '+'.join(mapped)

# ─── Command Handlers ────────────────────────────────────────────────

def handle_read_focus(cmd_obj):
    title = get_target_window_title()
    return {
        'window': title,
        'process': 'focused',
        'elements': [],
        'element_count': 0,
        'method': 'x11-focus'
    }

def handle_read_ui(cmd_obj):
    element_cache.clear()
    title = get_target_window_title()
    rect = get_window_rect(title)

    max_elements = cmd_obj.get('maxElements', 300)
    filter_roles = cmd_obj.get('roles', None)  # Not used on Linux (no UIA roles)

    elements = []
    method = 'ocr'

    if rect and mss is not None:
        png_path = capture_screen(rect)
        if png_path:
            ocr_results = run_ocr(png_path)
            for el in ocr_results:
                if len(elements) >= max_elements:
                    break
                if el['text'].strip():
                    elements.append(el)
                    element_cache[el['id']] = el
            try:
                os.unlink(png_path)
            except Exception:
                pass

    return {
        'window': title,
        'process': 'unknown',
        'elements': elements,
        'element_count': len(elements),
        'method': method
    }

def handle_ocr(cmd_obj):
    element_cache.clear()
    title = get_target_window_title()
    rect = get_window_rect(title)

    elements = []
    if rect and mss is not None:
        png_path = capture_screen(rect)
        if png_path:
            elements = run_ocr(png_path)
            for el in elements:
                element_cache[el['id']] = el
            try:
                os.unlink(png_path)
            except Exception:
                pass

    return {
        'window': title,
        'method': 'ocr',
        'elements': elements,
        'element_count': len(elements)
    }

def handle_click(cmd_obj):
    ensure_target_window_focused()
    x = int(cmd_obj.get('x', 0))
    y = int(cmd_obj.get('y', 0))
    xdotool('mousemove', '--sync', str(x), str(y))
    time.sleep(0.05)
    win = xdotool('getactivewindow')
    xdotool('click', '--window', win, '1')
    return {'status': 'success', 'action': 'click', 'x': x, 'y': y}

def handle_double_click(cmd_obj):
    ensure_target_window_focused()
    x = int(cmd_obj.get('x', 0))
    y = int(cmd_obj.get('y', 0))
    xdotool('mousemove', '--sync', str(x), str(y))
    time.sleep(0.05)
    win = xdotool('getactivewindow')
    xdotool('click', '--window', win, '1')
    time.sleep(0.05)
    xdotool('click', '--window', win, '1')
    return {'status': 'success', 'action': 'double-click', 'x': x, 'y': y}

def handle_type(cmd_obj):
    text = cmd_obj.get('text', '')
    if not text:
        return {'status': 'error', 'message': 'Empty text'}
    # Use xdotool type for the full string (handles unicode); split newlines
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if line:
            xdotool('type', '--clearmodifiers', line)
        if i < len(lines) - 1:
            xdotool('key', 'Return')
            time.sleep(0.02)
    return {'status': 'success', 'action': 'type', 'text': text}

def handle_key(cmd_obj):
    combo = cmd_obj.get('combo', '')
    if not combo:
        return {'status': 'error', 'message': 'Empty combo'}
    try:
        key_str = parse_key_combo(combo)
        xdotool('key', '--clearmodifiers', key_str)
        return {'status': 'success', 'action': 'key', 'combo': combo}
    except Exception as e:
        return {'status': 'error', 'message': f'Invalid key combo: {combo}'}

def handle_scroll(cmd_obj):
    ensure_target_window_focused()
    direction = cmd_obj.get('direction', 'down')
    amount = int(cmd_obj.get('amount', 3))
    click_count = 4 if direction == 'up' else 5
    for _ in range(amount):
        xdotool('click', str(click_count))
    return {'status': 'success', 'action': 'scroll', 'direction': direction, 'amount': amount}

def handle_open(cmd_obj):
    target = cmd_obj.get('target', '')
    if not target:
        return {'status': 'error', 'message': 'Empty target'}
    try:
        subprocess.Popen(['xdg-open', target], start_new_session=True)
        return {'status': 'success', 'action': 'open', 'target': target}
    except Exception as e:
        return {'status': 'error', 'message': f'Failed to open: {target}'}

def handle_native_invoke(cmd_obj):
    elem_id = int(cmd_obj.get('id', 0))
    el = element_cache.get(elem_id)
    if not el:
        return {'status': 'error', 'message': 'ID Elemen tidak ditemukan di cache (Mungkin kadaluarsa, lakukan os-read ulang)'}
    rect = el.get('rect') or el.get('bbox')
    if rect and len(rect) >= 4:
        cx = rect[0] + rect[2] // 2
        cy = rect[1] + rect[3] // 2
        ensure_target_window_focused()
        xdotool('mousemove', '--sync', str(cx), str(cy))
        time.sleep(0.05)
        win = xdotool('getactivewindow')
        xdotool('click', '--window', win, '1')
        return {'status': 'success', 'action': 'native-invoke-fallback-click', 'id': elem_id, 'x': cx, 'y': cy}
    return {'status': 'error', 'message': 'Elemen tidak memiliki koordinat valid'}

def handle_list_windows(cmd_obj):
    lines = wmctrl_list().splitlines()
    windows = []
    for line in lines:
        parts = line.split(None, 2)
        if len(parts) >= 3:
            win_id = parts[0]
            title = parts[2]
            if not is_mark_window(title):
                windows.append({'hwnd': win_id, 'title': title})
    return windows

def handle_focus_window(cmd_obj):
    title_query = cmd_obj.get('title', '').lower()
    if not title_query:
        return {'status': 'error', 'message': 'Empty title'}

    lines = wmctrl_list().splitlines()
    for line in lines:
        parts = line.split(None, 2)
        if len(parts) >= 3:
            win_title = parts[2]
            if title_query in win_title.lower() and not is_mark_window(win_title):
                win_id = parts[0]
                xdotool('windowactivate', '--sync', win_id)
                xdotool('windowfocus', '--sync', win_id)
                return {'status': 'success', 'action': 'focus-window', 'title': win_title}

    return {'status': 'error', 'message': f'Window not found: {title_query}'}

def handle_ping(cmd_obj):
    return {'status': 'alive'}

# ─── Main Loop ───────────────────────────────────────────────────────

COMMANDS = {
    'read-focus': handle_read_focus,
    'read-ui': handle_read_ui,
    'ocr': handle_ocr,
    'click': handle_click,
    'double-click': handle_double_click,
    'type': handle_type,
    'key': handle_key,
    'scroll': handle_scroll,
    'open': handle_open,
    'native-invoke': handle_native_invoke,
    'list-windows': handle_list_windows,
    'focus-window': handle_focus_window,
    'ping': handle_ping,
}

def process_command(line):
    line = line.strip()
    if not line:
        return
    try:
        cmd_obj = json.loads(line)
    except json.JSONDecodeError:
        emit({'status': 'error', 'message': 'Invalid JSON'})
        return

    cmd = cmd_obj.get('cmd', '')
    if cmd == 'exit':
        emit({'status': 'success', 'message': 'Shutting down'})
        sys.exit(0)

    handler = COMMANDS.get(cmd)
    if handler:
        try:
            result = handler(cmd_obj)
            if result is not None:
                emit(result)
            else:
                emit({'status': 'error', 'message': f'Handler for {cmd} returned None'})
        except Exception as e:
            emit({'status': 'error', 'message': str(e)})
    else:
        emit({'status': 'error', 'message': f'Unknown command: {cmd}'})

def main():
    emit({'status': 'ready'})

    for line in sys.stdin:
        process_command(line)

if __name__ == '__main__':
    main()
