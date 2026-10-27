// Charmcaster Lens for Windows: the web lens in its own window, fully offline.
// Files are served from an app:// origin so ES modules, fetch() and the camera
// work exactly like on https.
const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'lens') : path.join(__dirname, '..');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);
// older laptop GPUs are often blocklisted for WebGL2; the lens is unusable in software rendering
app.commandLine.appendSwitch('ignore-gpu-blocklist');

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400,
    backgroundColor: '#14061a', title: 'Charmcaster Lens', autoHideMenuBar: true,
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.removeMenu();
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL('app://lens/index.html?desktop');
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
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
  const win = createWindow();
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});
app.on('window-all-closed', () => app.quit());
