// Automated play-test: drives the real game with keyboard/mouse in headless
// Chromium and saves screenshots of each move to build/play/.
// node tools/play_test.mjs [quality]
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
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${server.address().port}/index.html?autostart&drag&q=${process.argv[2] || 'low'}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const wait = (ms) => page.evaluate((s) => window.__step(s), ms / 1000);
const shot = async (name) => { await page.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name, await page.evaluate(() => { const p = __game.player; return `${p.state}/${p.baseName}/${p.act?.name || ''} pos=${p.pos.x.toFixed(2)},${p.pos.y.toFixed(2)},${p.pos.z.toFixed(2)} yaw=${p.yaw.toFixed(2)}`; })); };
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
await page.keyboard.press('KeyH');
await wait(1000);
await shot('01_idle');
await hold('KeyW', 1500); await shot('02_after_jog');
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await wait(700); await shot('03_sprint');
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await wait(800);
await page.keyboard.press('KeyC'); await wait(900); await shot('04_crouch');
await page.keyboard.down('KeyD'); await wait(800); await shot('05_crouch_walk'); await page.keyboard.up('KeyD');
await page.keyboard.press('KeyC'); await wait(600);
// walk up to a dummy and use the knife
await page.evaluate(() => { const g = __game; const d = g.dummies.list[0]; g.player.pos.set(d.root.position.x, 0, d.root.position.z + 1.3); g.player.yaw = Math.PI; g.cam.yaw = Math.PI; });
await wait(600);
await page.mouse.move(640, 360);
await page.mouse.down(); await page.mouse.up(); await wait(250); await shot('06_knife_A');
await page.mouse.down(); await page.mouse.up(); await wait(350); await shot('07_knife_B');
await page.mouse.down(); await page.mouse.up(); await wait(600); await shot('08_knife_C');
await wait(1200);
await page.keyboard.press('KeyF'); await wait(650); await shot('09_kick');
await wait(1500);
await page.keyboard.press('KeyE'); await wait(400); await shot('10_dodge_back');
await wait(1000);
await page.keyboard.down('KeyW'); await page.keyboard.press('KeyE'); await wait(450); await shot('11_roll'); await page.keyboard.up('KeyW');
await wait(1400);
await page.keyboard.press('Space'); await wait(330); await shot('12_jump');
await wait(1200);
await page.keyboard.press('KeyQ'); await wait(500); await shot('13_turn180');
await wait(1500);
// aim and shoot at a dummy
await page.evaluate(() => { const g = __game; const d = g.dummies.list[2]; g.player.pos.set(d.root.position.x, 0, d.root.position.z + 5); g.player.yaw = Math.PI; g.cam.yaw = Math.PI; g.cam.pitch = 0.08; });
await wait(400);
await page.keyboard.press('KeyG'); await wait(900); await shot('14_aim');
await page.mouse.down(); await page.mouse.up(); await wait(40); await shot('15_fire');
await wait(500);
await page.keyboard.press('KeyR'); await wait(800); await shot('16_reload');
await wait(1500);
await page.keyboard.press('KeyG'); await wait(800); await shot('17_holstered');
console.log('errors:', errors.slice(0, 10));
await browser.close(); server.close();
