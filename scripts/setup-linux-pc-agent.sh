#!/bin/bash
# setup-linux-pc-agent.sh — Install Linux PC Agent dependencies for MARK
set -e

echo "[MARK] Installing Linux PC Agent dependencies..."

# System packages
if command -v apt &>/dev/null; then
    sudo apt install -y xdotool wmctrl xclip tesseract-ocr tesseract-ocr-ind 2>/dev/null || true
elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm xdotool wmctrl xclip tesseract tesseract-data-ind 2>/dev/null || true
fi

# Python packages
pip3 install --break-system-packages mss pytesseract Pillow 2>/dev/null || pip3 install --user mss pytesseract Pillow

echo "[MARK] Linux PC Agent dependencies installed successfully!"
echo "  - xdotool: $(which xdotool)"
echo "  - wmctrl: $(which wmctrl)"
echo "  - tesseract: $(tesseract --version 2>&1 | head -1)"
echo "  - Python mss: $(python3 -c 'import mss; print(mss.__version__)' 2>/dev/null || echo 'check')"
