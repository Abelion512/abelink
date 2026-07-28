#!/usr/bin/env python3
"""screenshot-ocr.py — Linux screenshot + OCR for MARK.
Replaces Windows ocr-region.ps1.

Usage:
  screenshot-ocr.py                          # full screen OCR
  screenshot-ocr.py --region X Y W H         # region OCR
  screenshot-ocr.py --file /path/to.png      # OCR existing image
"""
import json, sys, os
from PIL import Image

try:
    import mss
    import pytesseract
except ImportError:
    print(json.dumps({'error': 'Missing deps. Install: pip install mss pytesseract Pillow'}))
    sys.exit(1)

def ocr_image(img, lang='eng+ind'):
    """Run Tesseract OCR on PIL Image"""
    try:
        text = pytesseract.image_to_string(img, lang=lang)
        data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
        words = []
        for i in range(len(data['text'])):
            if data['text'][i].strip():
                words.append({
                    'text': data['text'][i].strip(),
                    'x': data['left'][i],
                    'y': data['top'][i],
                    'w': data['width'][i],
                    'h': data['height'][i],
                    'conf': int(data['conf'][i]) if data['conf'][i] != '-1' else 0,
                })
        return {
            'text': text,
            'words': words,
            'chars': len(text),
        }
    except Exception as e:
        return {'error': str(e)}

def main():
    if '--file' in sys.argv:
        idx = sys.argv.index('--file') + 1
        if idx < len(sys.argv):
            path = sys.argv[idx]
            if not os.path.exists(path):
                print(json.dumps({'error': f'File not found: {path}'}))
                sys.exit(1)
            img = Image.open(path)
            result = ocr_image(img)
            result['source'] = path
            print(json.dumps(result))
            return

    lang = 'eng+ind'
    if '--lang' in sys.argv:
        idx = sys.argv.index('--lang') + 1
        if idx < len(sys.argv):
            lang = sys.argv[idx]

    with mss.MSS() as sct:
        if '--region' in sys.argv:
            idx = sys.argv.index('--region') + 1
            x, y, w, h = map(int, sys.argv[idx:idx+4])
            monitor = {'left': x, 'top': y, 'width': w, 'height': h}
        else:
            monitor = sct.monitors[1]

        sct_img = sct.grab(monitor)
        img = Image.frombytes('RGB', sct_img.size, sct_img.rgb)
        result = ocr_image(img)

        if '--save' in sys.argv:
            idx = sys.argv.index('--save') + 1
            path = sys.argv[idx] if idx < len(sys.argv) else '/tmp/mark-ocr-screenshot.png'
            img.save(path)
            result['screenshot'] = path

        print(json.dumps(result))

if __name__ == '__main__':
    main()