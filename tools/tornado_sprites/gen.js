const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('E', e.message));
  await p.goto('http://localhost:8766/gen.html'); await p.waitForFunction(() => window.ready); await p.waitForTimeout(4000);
  const jobs = JSON.parse(fs.readFileSync('jobs.json'));
  fs.mkdirSync('/tmp/claude-0/gen', { recursive: true });
  for (const [name, a] of Object.entries(jobs)) { const d = await p.evaluate((a) => render(...a), a); fs.writeFileSync('/tmp/claude-0/gen/' + name + '.png', Buffer.from(d.split(',')[1], 'base64')); }
  await b.close();
})();
