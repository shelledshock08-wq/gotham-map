const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { _electron: electron } = require('playwright-core');

(async () => {
  assert.ok(process.env.CAMERA_FIXTURE, 'Set CAMERA_FIXTURE to the prepared camera.y4m');
  const root = path.resolve(__dirname, '../..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'charmcaster-desktop-'));
  const args = [
    '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    '--user-data-dir=' + profile, '--use-fake-device-for-media-stream',
    '--use-file-for-fake-video-capture=' + process.env.CAMERA_FIXTURE,
  ];
  // CI only. The distributed app retains Chromium's sandbox.
  if (process.env.ELECTRON_HEADLESS === '1') args.push('--no-sandbox', '--ozone-platform=headless');
  let app;
  try {
    app = await electron.launch({ executablePath: require(path.join(root, 'node_modules/electron')), args: [...args, root, '--charmcaster-test'], timeout: 30000 });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => window.CharmTest);
    assert.equal(new URL(page.url()).host, 'camera');
    assert.equal(await page.evaluate(() => CharmTest.state.stream), null);
    await page.click('#start');
    await page.waitForFunction(() => CharmTest.state.phase === 'live' && CharmTest.state.tracker.latest && CharmTest.state.tracker.hasMask, null, { timeout: 120000 });
    console.log('PASS: Electron local origin, camera permission, real face tracking and segmentation');
    await page.evaluate(() => CharmTest.photo());
    assert.ok(await page.evaluate(() => CharmTest.state.capture.blob.size > 1000));
    await page.evaluate(() => CharmTest.closeCapture());
    const networkBlocked = await page.evaluate(async () => { try { await fetch('https://example.com'); return false; } catch { return true; } });
    assert.ok(networkBlocked);
    await page.evaluate(async () => {
      const tracks = CharmTest.state.stream.getTracks();
      await CharmTest.stop();
      if (tracks.some(t => t.readyState !== 'ended')) throw new Error('Camera not released');
    });
    assert.deepEqual(errors, []);
    console.log('PASS: desktop photo capture, external network blocked, camera released, no page errors');
  } finally {
    if (app) await app.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
