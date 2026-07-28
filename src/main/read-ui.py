#!/usr/bin/env python3
"""read-ui.py — Linux AT-SPI accessibility tree reader for MARK.
Replaces Windows read-ui.ps1. Returns interactive elements as JSON.

Usage:
  read-ui.py                      # full tree of active app
  read-ui.py --active-only        # only interactive elements
  read-ui.py --focused            # focused element info
"""
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi
import json, sys

INTERACTIVE_ROLES = {
    'push button', 'toggle button', 'button', 'link',
    'combo box', 'text', 'password text', 'spin button',
    'slider', 'check box', 'radio button', 'menu item',
    'list item', 'table cell', 'tree item', 'tab',
}
MAX_ELEMENTS = 80
MAX_DEPTH = 50

def element_info(node):
    """Return dict with accessible info about this node"""
    name = node.get_name() or ''
    role = node.get_role_name()
    ss = node.get_state_set()
    states = []
    for s in ['FOCUSED', 'ENABLED', 'CHECKED', 'SELECTED', 'ACTIVE', 'VISIBLE', 'SHOWING']:
        try:
            enum_val = getattr(Atspi.StateType, s)
            if ss.contains(enum_val):
                states.append(s)
        except AttributeError:
            pass
    return {
        'role': role,
        'name': name,
        'states': states,
    }

def find_active_app():
    """Find the application that has the active/current window"""
    try:
        desktop = Atspi.get_desktop(0)
        for i in range(max(desktop.get_child_count(), 0)):
            try:
                app = desktop.get_child_at_index(i)
            except:
                continue
            if not app:
                continue
            for j in range(max(app.get_child_count(), 0)):
                try:
                    child = app.get_child_at_index(j)
                    if child and child.get_state_set().contains(Atspi.StateType.ACTIVE):
                        return app
                except:
                    pass
    except:
        pass
    return None

def collect_elements(app):
    """Collect interactive elements from active application"""
    results = []
    def walk(node, depth=0):
        if len(results) >= MAX_ELEMENTS or depth > MAX_DEPTH:
            return
        try:
            role = node.get_role_name()
            name = node.get_name() or ''
            if role in INTERACTIVE_ROLES and name.strip():
                results.append(element_info(node))
            for k in range(node.get_child_count()):
                try:
                    child = node.get_child_at_index(k)
                    if child:
                        walk(child, depth + 1)
                except:
                    pass
        except:
            pass
    walk(app)
    return results

def find_focused_node(node, depth=0):
    """Recursively search for the focused node within an app"""
    if depth > MAX_DEPTH:
        return None
    try:
        ss = node.get_state_set()
        if ss.contains(Atspi.StateType.FOCUSED):
            return node
    except:
        pass
    # Also check if any descendant is focused
    try:
        for k in range(node.get_child_count()):
            try:
                child = node.get_child_at_index(k)
                if child:
                    result = find_focused_node(child, depth + 1)
                    if result is not None:
                        return result
            except:
                pass
    except:
        pass
    return None

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'active'
    app = find_active_app()
    if not app:
        print(json.dumps({'error': 'No active application found'}))
        sys.exit(1)

    result = {'application': app.get_name() or 'unknown'}

    if mode == '--focused':
        focused = find_focused_node(app)
        if focused:
            result['focused'] = element_info(focused)
            result['ancestors'] = []
            p = focused.get_parent()
            while p and p.get_name():
                result['ancestors'].insert(0, p.get_name())
                p = p.get_parent()
    else:
        result['elements'] = collect_elements(app)

    print(json.dumps(result))

if __name__ == '__main__':
    main()