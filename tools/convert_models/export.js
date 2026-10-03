const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('E', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('C', m.text()); });
  await p.goto('http://localhost:8790/export.html');
  await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await p.evaluate(() => go());
  const r = await p.evaluate(() => window.result);
  fs.writeFileSync('/tmp/conv/models.json', JSON.stringify(r));
  for (const k of ['sonic', 'pawn']) console.log(k, 'nodes', r[k].nodes.length, 'meshes', r[k].meshes.map(m => m.name + ' ' + m.verts.join('->') + ' groups ' + m.groups.length + ' mats ' + m.mats.map(x => x.map).join('|')), 'tex', r[k].textures);
  await b.close();
})();
