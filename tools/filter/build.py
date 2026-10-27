#!/usr/bin/env python3
"""Build a standalone HTML camera app and a static-host ZIP, with all models local."""
from pathlib import Path
import base64, hashlib, json, mimetypes, re, zipfile
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'dist';out.mkdir(exist_ok=True)
html=(ROOT/'index.html').read_text()
html,styles=re.subn(r'<link\s+rel="stylesheet"\s+href="filter/style.css"\s*/?>',lambda m:'<style>'+ (ROOT/'filter/style.css').read_text()+'</style>',html)
assert styles==1, 'Expected exactly one embedded stylesheet'
packed={}
for folder in ['face_mesh','selfie_segmentation','pose']:
 for file in (ROOT/'filter/vendor'/folder).iterdir():
  if file.suffix not in ['.js','.wasm','.data','.binarypb','.tflite'] or file.name in ['face_mesh.js','selfie_segmentation.js']:continue
  typ='application/wasm' if file.suffix=='.wasm' else 'text/javascript' if file.suffix=='.js' else 'application/octet-stream'
  packed[folder+'/'+file.name]={'type':typ,'data':base64.b64encode(file.read_bytes()).decode()}
asset_script='<script>window.CHARM_PACKED_ASSETS='+json.dumps(packed,separators=(',',':'))+';</script>'
html=html.replace('<script src="filter/vendor/face_mesh/face_mesh.js">',asset_script+'<script src="filter/vendor/face_mesh/face_mesh.js">')
def inline(m):return '<script>\n'+(ROOT/m[1]).read_text().replace('</script','<\\/script')+'\n</script>'
html,count=re.subn(r'<script src="([^"]+)"></script>',inline,html)
assert count==9 and not re.search(r'<script[^>]+src=',html)
html=html.replace('</body>','<!-- MediaPipe: Apache-2.0. '+(ROOT/'filter/vendor/LICENSE-APACHE-2.0.txt').read_text().replace('--','—')+' -->\n</body>')
file=out/'Charmcaster-Avatar-v2.html';file.write_text(html)
manifest={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'filter/vendor').rglob('*')) if p.is_file() and p.name!='SHA256SUMS.json'}
(ROOT/'filter/vendor/SHA256SUMS.json').write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(out/'Charmcaster-Avatar-v2-Web.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 z.writestr('index.html', html)
 z.writestr('START-HERE.txt', 'Extract this ZIP first, then open index.html in Chrome or Edge.\nThe page embeds all tracking models; keep it open while using the camera.\nBrowser camera support for local files varies; HTTPS hosting is also supported.\n')
 for p in [ROOT/'README.md',*sorted((ROOT/'filter').rglob('*'))]:
  if p.is_file():z.write(p,p.relative_to(ROOT))
print(f'Standalone: {file.stat().st_size/1024/1024:.1f} MiB; static-host ZIP: {(out/"Charmcaster-Avatar-v2-Web.zip").stat().st_size/1024/1024:.1f} MiB')
