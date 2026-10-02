#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file (sonic-standalone.html).

Inlines every script, image, sound and the font as data URIs so the file
works when opened on its own (double-click, phone, chat previews)."""
import base64, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIME = {'.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'}

def data_uri(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return f'data:{MIME[os.path.splitext(rel)[1]]};base64,' + base64.b64encode(f.read()).decode()

html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

embedded = {}
for sub in ('assets/tiles', 'assets/enemies', 'assets/bg', 'assets/sfx'):
    for name in sorted(os.listdir(os.path.join(ROOT, sub))):
        if os.path.splitext(name)[1] in MIME:
            embedded[f'{sub}/{name}'] = data_uri(f'{sub}/{name}')

html = html.replace('url("assets/fonts/PressStart2P.woff2")', f'url("{data_uri("assets/fonts/PressStart2P.woff2")}")')

def inline(m):
    code = open(os.path.join(ROOT, m.group(1)), encoding='utf-8').read()
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'

first = True
def repl(m):
    global first
    out = ''
    if first:
        out = '<script>window.EMBEDDED_ASSETS = ' + json.dumps(embedded) + ';</script>\n'
        first = False
    return out + inline(m)

html = re.sub(r'<script src="([^"]+)"></script>', repl, html)
out = os.path.join(ROOT, 'sonic-standalone.html')
open(out, 'w', encoding='utf-8').write(html)
print(f'wrote {out} ({os.path.getsize(out) / 1024 / 1024:.2f} MB, {len(embedded)} assets)')
