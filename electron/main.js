// Secure, entirely local desktop origin for camera access and bundled WASM models.
const { app, BrowserWindow, protocol, net, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'app://camera';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function localURL(url) {
  try { const u = new URL(url); return u.protocol === 'app:' && u.hostname === 'camera'; }
  catch { return false; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1140, height: 930, minWidth: 390, minHeight: 600,
    title: 'Charmcaster Avatar', backgroundColor: '#100e19',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (!localURL(url)) event.preventDefault(); });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt))) {
      win.setFullScreen(!win.isFullScreen()); event.preventDefault();
    }
  });
  const test = process.argv.includes('--charmcaster-test') ? '?test' : '';
  win.loadURL(ORIGIN + '/index.html' + test);
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  // Only this local app can request camera/microphone; renderer asks after its UI action.
  ses.setPermissionCheckHandler((contents, permission, origin, details) =>
    permission === 'media' && !!contents && localURL(contents.getURL()) &&
    localURL(origin || details?.securityOrigin || contents.getURL()));
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const local = !!contents && localURL(contents.getURL()) && localURL(details.requestingUrl || contents.getURL());
    const media = !details.mediaTypes || details.mediaTypes.every(type => ['audio', 'video'].includes(type));
    callback(local && permission === 'media' && media);
  });
  // All app assets are local. Do not allow renderer traffic to external services.
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save your Charmcaster Avatar capture', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
  });
  protocol.handle('app', async request => {
    try {
      const url = new URL(request.url);
      if (!localURL(url.href)) return new Response('Forbidden', { status: 403 });
      const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      const relative = path.relative(ROOT, file);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
      return await net.fetch(pathToFileURL(file).href);
    } catch { return new Response('Not found', { status: 404 }); }
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
