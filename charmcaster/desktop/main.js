// Charmcaster Lens for Windows: the web lens in its own window, fully offline.
// Files are served from an app:// origin so ES modules, fetch() and the camera
// work exactly like on https.
//
// Graphics drivers are the usual way an Electron window ends up black, so this
// also logs what happens (CharmcasterLens-log.txt in the app's data folder),
// shows startup progress in the native title bar, and offers a software
// "safe graphics" mode when nothing has been drawn after 20 seconds (or on F9).
const { app, BrowserWindow, protocol, session, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'lens') : path.join(__dirname, '..');
const DATA = app.getPath('userData');
const LOG = path.join(DATA, 'CharmcasterLens-log.txt');
const SETTINGS = path.join(DATA, 'settings.json');

function log(...parts) {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${parts.join(' ')}\n`);
  } catch (_) { /* logging must never break the app */ }
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (_) { return {}; }
}
function writeSettings(patch) {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(SETTINGS, JSON.stringify({ ...readSettings(), ...patch }));
  } catch (e) { log('settings write failed', e.message); }
}

const SAFE = readSettings().safeGraphics === true || process.argv.includes('--safe-graphics');
try { fs.writeFileSync(LOG, ''); } catch (_) { /* first run: folder may not exist yet */ }
log(`start v${app.getVersion()} electron ${process.versions.electron} chrome ${process.versions.chrome} ${process.platform} ${process.arch}`, SAFE ? 'SAFE GRAPHICS' : 'gpu');

if (SAFE) app.disableHardwareAcceleration();
// WebGL may fall back to SwiftShader (software) on GPUs Chromium won't use; only our own files load here
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream',
  };

  let win = null;
  let painted = false;
  let asked = false;

  function relaunch(safe) {
    writeSettings({ safeGraphics: safe });
    log('relaunch', safe ? 'in safe graphics mode' : 'with gpu');
    app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--safe-graphics') });
    app.exit(0);
  }

  async function offerSafeMode(reason) {
    if (asked || !win) return;
    asked = true;
    log('offer safe mode:', reason);
    const buttons = SAFE ? ['Try the GPU again', 'Keep waiting', 'Open log'] : ['Restart in safe graphics mode', 'Keep waiting', 'Open log'];
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning', title: 'Charmcaster Lens', buttons, defaultId: 0, cancelId: 1,
      message: SAFE ? 'Safe graphics mode is on.' : 'The lens window isn\'t drawing.',
      detail: SAFE
        ? 'The app is drawing in software, which is slower. You can switch back to the graphics card.'
        : `${reason}\n\nThis is almost always a graphics driver problem. Safe graphics mode draws in software: slower, but it works on any PC.`,
    });
    asked = false;
    if (response === 0) relaunch(!SAFE);
    else if (response === 2) shell.openPath(LOG);
  }

  // Drawn but blank? Look at what the window actually shows (the loading screen and HUD are never one flat colour).
  async function checkDrawing(when) {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const img = await Promise.race([win.webContents.capturePage(), new Promise((r) => setTimeout(() => r(null), 5000))]);
    if (!img) { offerSafeMode('The window stopped drawing.'); return; }
    const { width, height } = img.getSize();
    if (!width || !height) return;
    const px = img.toBitmap();
    const lo = [255, 255, 255], hi = [0, 0, 0];
    const step = Math.max(1, Math.floor(px.length / 4 / 4000)) * 4;
    for (let i = 0; i + 2 < px.length; i += step) {
      for (let k = 0; k < 3; k++) {
        if (px[i + k] < lo[k]) lo[k] = px[i + k];
        if (px[i + k] > hi[k]) hi[k] = px[i + k];
      }
    }
    const spread = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    log('drawing check', when, `${width}x${height}`, 'colour spread', spread);
    if (spread < 6) offerSafeMode('The window is showing a blank screen.');
  }

  function showError(title, detail) {
    const html = `<!doctype html><meta charset="utf-8"><title>Charmcaster Lens</title>
      <body style="margin:0;height:100vh;display:grid;place-items:center;background:#14061a;color:#f3e6fb;font:16px system-ui">
      <div style="max-width:560px;padding:24px"><h2>${title}</h2><p style="white-space:pre-wrap">${detail}</p>
      <p>Press <b>F9</b> to switch graphics mode. Log file:<br><code>${LOG.replace(/</g, '&lt;')}</code></p></div>`;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1280, height: 800, minWidth: 640, minHeight: 400,
      backgroundColor: '#14061a', title: 'Charmcaster Lens — starting…', autoHideMenuBar: true,
      icon: path.join(ROOT, 'icons', 'icon-512.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    win.removeMenu();
    const wc = win.webContents;
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
        win.setFullScreen(!win.isFullScreen());
        e.preventDefault();
      } else if (input.key === 'Escape' && win.isFullScreen()) {
        win.setFullScreen(false);
      } else if (input.key === 'F9') {
        offerSafeMode('You pressed F9.');
        e.preventDefault();
      } else if (input.key === 'F12' || (input.key.toLowerCase() === 'i' && input.control && input.shift)) {
        wc.toggleDevTools();
        e.preventDefault();
      }
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('console-message', (e, level, message) => {
      const msg = typeof message === 'string' ? message : e.message;
      const lvl = typeof level === 'number' ? ['debug', 'info', 'warning', 'error'][level] : e.level;
      if (!msg) return;
      if (msg.includes('[charmcaster] painted') && !painted) {
        painted = true;
        setTimeout(() => checkDrawing('after paint'), 3000);
      }
      if (msg.includes('[charmcaster] ready')) setTimeout(() => checkDrawing('after camera start'), 4000);
      if (lvl !== 'debug') log(`page ${lvl}:`, msg.slice(0, 500));
    });
    wc.on('did-finish-load', () => log('page loaded', wc.getURL().slice(0, 80)));
    wc.on('did-fail-load', (e, code, desc, url, isMain) => {
      log('load failed', code, desc, url);
      if (isMain && code !== -3) showError('The lens could not load.', `${desc} (${code})\n${url}`);
    });
    wc.on('render-process-gone', (e, d) => {
      log('renderer gone', d.reason, d.exitCode);
      showError('The lens stopped unexpectedly.', `Reason: ${d.reason} (exit code ${d.exitCode}). If this keeps happening, press F9 for safe graphics mode.`);
    });
    win.loadURL(`app://lens/index.html?desktop${SAFE ? '&safe' : ''}`);
    // nothing drawn after 20 s: almost certainly the graphics driver
    setTimeout(() => { if (!painted) offerSafeMode('Nothing has been drawn for 20 seconds.'); }, 20000);
  }

  app.on('child-process-gone', (e, d) => log('child process gone', d.type, d.reason, d.exitCode));

  app.whenReady().then(async () => {
    protocol.handle('app', async (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname);
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        return new Response(data, {
          headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' },
        });
      } catch (err) {
        log('missing file', rel, err.code);
        return new Response('Not found', { status: 404 });
      }
    });
    const ses = session.defaultSession;
    // camera + mic for the lens, nothing else
    ses.setPermissionRequestHandler((wc, permission, done) => done(permission === 'media' || permission === 'fullscreen'));
    ses.setPermissionCheckHandler((wc, permission) => permission === 'media' || permission === 'fullscreen');
    // "Save" in the preview asks where to put the file, starting in Pictures / Videos
    ses.on('will-download', (e, item) => {
      const folder = item.getMimeType().startsWith('video/') ? 'videos' : 'pictures';
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath(folder), item.getFilename()) });
    });
    createWindow();
    try {
      log('gpu features', JSON.stringify(app.getGPUFeatureStatus()));
      const info = await app.getGPUInfo('basic');
      log('gpu devices', JSON.stringify((info.gpuDevice || []).map((d) => ({ vendor: d.vendorId, device: d.deviceId, active: d.active, driver: d.driverVersion }))));
    } catch (e) {
      log('gpu info failed', e.message);
    }
  });

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
}
