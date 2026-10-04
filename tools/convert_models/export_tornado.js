const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('E', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('C', m.text()); });
  await p.goto('http://localhost:8790/export_tornado.html'); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await p.evaluate(() => go()); const r = await p.evaluate(() => window.result);
  fs.writeFileSync('/tmp/conv/models_tornado.json', JSON.stringify(r));
  console.log('tails nodes', r.tails.nodes.length, r.tails.meshes.map(m => m.name + ' ' + m.verts.join('->') + ' ' + m.mats.map(x => x.map).join('|')), r.tails.textures);
  console.log('tornado', r.tornado.body.length, r.tornado.prop.length, r.tornado.textures.length);
  await b.close();
})();
