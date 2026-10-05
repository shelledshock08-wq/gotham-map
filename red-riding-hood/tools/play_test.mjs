// Automated combat play-test: drives the real game with keyboard/mouse in
// headless Chromium, stepping the simulation deterministically, and saves
// screenshots to build/play/.  node tools/play_test.mjs [quality]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const out = path.join(root, 'build/play');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.goto(`http://localhost:${server.address().port}/index.html?autostart&drag&q=${process.argv[2] || 'low'}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const step = (s) => page.evaluate((x) => window.__step(x), s);
const ev = (fn, arg) => page.evaluate(fn, arg);
let n = 0;
const shot = async (name) => {
  const st = await ev(() => { const p = __game.player; const E = __game.enemies; return `${p.state}/${p.move?.id || p.baseName || ''} hp=${p.hp|0} focus=${p.focus|0} combo=${p.combo} bp=${p.bp} pos=${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} | wave ${E.wave}: ${E.list.map((e) => `${e.kind}:${e.state}:${e.hp|0}`).join(' ')} | pieces ${__game.pieces.list.length}`; });
  await page.screenshot({ path: path.join(out, `${String(++n).padStart(2, '0')}_${name}.png`) });
  console.log(name.padEnd(16), st);
};
const click = async (button = 'left') => { await page.mouse.down({ button }); await page.mouse.up({ button }); };
// put Jason in front of an enemy, facing it, camera behind
const faceEnemy = (i = 0, d = 1.8) => ev(([i, d]) => {
  const g = __game; const e = g.enemies.alive[i] || g.enemies.alive[0];
  if (!e) return;
  const p = g.player;
  p.pos.set(e.pos.x, e.pos.y, e.pos.z + d); p.yaw = Math.PI; g.cam.yaw = Math.PI; g.cam.pitch = 0.15;
  e.root.rotation.y = 0; e.state = 'idle'; e.cool = 2; e.hp = e.maxHp; e.stunUsed = true; e.clearCore(); e.T.block = e.T.dodge = 0;
  // keep the others out of it so each move is shown cleanly
  for (const o of g.enemies.alive) if (o !== e) { o.cool = 6; o.endAttack(); if (o.state === 'attack') o.state = 'idle'; o.pos.set(o.pos.x + (o.pos.x > e.pos.x ? 5 : -5), o.pos.y, o.pos.z - 4); }
}, [i, d]);

await page.keyboard.press('KeyH');
await page.mouse.move(640, 360);
// deterministic: no random blocks/dodges during the scripted moves
await ev(() => { for (const e of __game.enemies.list) e.T.block = e.T.dodge = 0; });
await step(0.5);
await shot('start');
await step(2.5);
await shot('wave1_incoming');
// speed: run and ninja run
await page.keyboard.down('KeyW'); await step(0.8); await shot('run');
await page.keyboard.down('ShiftLeft'); await step(0.6); await shot('ninja_run');
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await step(0.3);
// light string
await faceEnemy(0, 1.9);
for (const k of [1, 2, 3, 4]) { await click('left'); await step(k === 3 ? 0.5 : 0.3); await shot(`light_${k}`); }
await step(0.5);
// heavy string
await faceEnemy(1, 1.9);
for (const k of [1, 2, 3]) { await click('right'); await step(0.3); await shot(`heavy_${k}`); }
await step(0.6);
// launcher (back + heavy, holding heavy to follow) then air combo and plunge
await ev(() => { for (const e of __game.enemies.list) e.T.block = e.T.dodge = 0; });
await faceEnemy(0, 1.7);
await page.keyboard.down('KeyS'); await page.mouse.down({ button: 'right' }); await step(0.05); await page.keyboard.up('KeyS');
await step(0.45); await shot('launcher');
await step(0.3); await page.mouse.up({ button: 'right' }); await shot('follow_up');
for (const k of [1, 2, 3]) { await click('left'); await step(0.2); }
await shot('air_combo');
await click('right'); await step(0.3); await shot('plunge');
await step(0.5);
// crouch attacks
await faceEnemy(1, 1.7);
await page.keyboard.press('KeyC'); await step(0.2);
await click('left'); await step(0.2); await click('left'); await step(0.18); await shot('crouch_slash');
await click('right'); await step(0.35); await shot('slide_tackle');
await step(0.5); await page.keyboard.press('KeyC'); await step(0.2);
// ninja dash stab
await faceEnemy(0, 7);
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await step(0.45);
await click('left'); await step(0.25); await shot('dash_stab');
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await step(0.6);
// parry: wait for an enemy to swing, then light attack toward it
await faceEnemy(0, 1.6);
await ev(() => { const g = __game; const e = g.enemies.alive[0]; e.cool = 0; e.T.attacks = ['cross']; });
let parried = false;
for (let i = 0; i < 120 && !parried; i++) {
  const t = await ev(() => { const e = __game.enemies.alive[0]; return e && e.nextImpact(); });
  if (t !== null && t !== undefined && t < 0.1 && t > 0) {
    await page.keyboard.down('KeyW'); await click('left'); await step(0.02); await page.keyboard.up('KeyW');
    parried = true;
  } else await step(1 / 60);
}
await step(0.1); await shot('parry');
await step(0.6); await shot('after_parry');
// Blade Mode: hold F, swipe, cut
await step(0.8);
await faceEnemy(0, 1.6);
await page.keyboard.down('KeyF'); await step(0.2);
await page.mouse.move(700, 330); await page.mouse.move(760, 300); await step(0.05);
await shot('blade_mode');
await click('left'); await step(0.1); await shot('blade_cut');
await click('right'); await step(0.1);
await page.keyboard.up('KeyF'); await step(0.6); await shot('pieces');
// Zandatsu on a stunned enemy
await faceEnemy(0, 1.5);
await ev(() => { const e = __game.enemies.alive[0]; if (e) e.stun(); __game.player.cutAngle = 0; });
await page.keyboard.down('KeyF'); await step(0.15);
await click('right'); await step(0.1); await page.keyboard.up('KeyF');
await step(0.15); await shot('zandatsu');
await step(1.2); await shot('after_zandatsu');
// pistol
await page.keyboard.down('KeyQ'); await step(0.4); await click('left'); await step(0.03); await shot('pistol');
await page.keyboard.up('KeyQ'); await step(1.5);
// let the waves play out a bit with Jason idle (enemies attack him)
await step(3); await shot('enemies_attack');
console.log('errors:', errors.slice(0, 12));
await browser.close(); server.close();
