import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session, shell, type MenuItemConstructorOptions } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Backend, BackendOptions } from './backend/contract';
import { isElevated, relaunchElevated } from './shell/elevation';

const SCHEME = 'app';
const HOST = 'ipshift';
const ORIGIN = `${SCHEME}://${HOST}`;
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; media-src 'self' blob:";
const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', hdr: 'application/octet-stream', bin: 'application/octet-stream',
  ktx2: 'application/octet-stream', exr: 'application/octet-stream', wasm: 'application/wasm', woff2: 'font/woff2', woff: 'font/woff',
  ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', txt: 'text/plain; charset=utf-8',
};

app.setName('IP SHIFT');
app.setPath('userData', path.join(app.getPath('appData'), 'IP SHIFT'));
if (process.platform === 'win32') app.setAppUserModelId('com.ipshift.app');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

let win: BrowserWindow | null = null;
let backend: Backend;

function webRoot(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', '..', 'web', 'dist');
}

function resolveFile(urlPath: string, root: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const comps = decoded.split('/').filter(Boolean);
  if (comps.some((c) => c === '..' || c === '.' || c.includes(':'))) return null;
  const rel = comps.length ? comps.join(path.sep) : 'index.html';
  let realRoot: string;
  try { realRoot = fs.realpathSync(root); } catch { return null; }
  let candidate = path.join(realRoot, rel);
  try {
    candidate = fs.realpathSync(candidate);
    if (fs.statSync(candidate).isDirectory()) candidate = fs.realpathSync(path.join(candidate, 'index.html'));
  } catch { return null; }
  if (candidate !== realRoot && !candidate.startsWith(realRoot + path.sep)) return null;
  return candidate;
}

function respond(status: number, body: Uint8Array | string, mime: string): Response {
  return new Response(body as any, {
    status,
    headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP },
  });
}

/* --------------------------------------------------------------- backend */

class ShellOnlyError extends Error { code = 'internal' as const; }

function loadBackend(opts: BackendOptions): Backend {
  try {
    // Guarded: the backend is built in parallel; missing module => honest failure, never fake data.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./backend/index');
    return mod.createWindowsBackend(opts) as Backend;
  } catch (e) {
    console.error('[ipshift] backend unavailable:', e);
    const msg = 'The Windows networking backend is not available in this build.';
    return {
      call: async () => { throw new ShellOnlyError(msg); },
      onEvent: () => () => {},
      setWindowVisible: () => {},
      prepareForQuit: async () => {},
      historySnapshot: () => [],
    } as Backend;
  }
}

/* ----------------------------------------------------------- validation */

const SHELL_CMDS = new Set(['history.export', 'system.openSettings', 'clipboard.write', 'permissions.requestLocation']);
const COMMAND_KEYS: Record<string, string[]> = {
  'app.info': [], 'network.snapshot': [], 'network.refresh': ['includePublicIP'], 'switch.start': ['mode'], 'switch.cancel': [],
  'switch.state': [], 'history.list': [], 'history.clear': [], 'history.export': [], 'settings.get': [],
  'settings.update': ['mode', 'confirmBeforeSwitch', 'publicIPLookup', 'publicIPProvider', 'quality', 'graphics', 'reducedMotion', 'theme', 'sound'],
  'diagnostics.run': [], 'permissions.requestLocation': [], 'system.openSettings': ['pane'], 'clipboard.write': ['text'],
};
const ERROR_CODES = new Set(['busy', 'noWifiInterface', 'wifiOff', 'notAssociated', 'authorizationDenied', 'authorizationFailed',
  'refreshFailed', 'powerToggleFailed', 'timeout', 'cancelled', 'invalidArgument', 'unknownCommand', 'internal']);
const SETTINGS_URLS: Record<string, string> = {
  location: 'ms-settings:privacy-location', network: 'ms-settings:network-status', wifi: 'ms-settings:network-wifi',
};

class Invalid extends Error { constructor(public code: string, m: string) { super(m); } }

function validate(cmd: string, raw: unknown): Record<string, unknown> {
  const allowed = COMMAND_KEYS[cmd];
  if (!allowed) throw new Invalid('unknownCommand', `Unknown command '${cmd}'.`);
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Invalid('invalidArgument', 'args must be an object.');
  const args = raw as Record<string, unknown>;
  const bad = Object.keys(args).find((k) => !allowed.includes(k));
  if (bad) throw new Invalid('invalidArgument', `Unexpected argument '${bad}'.`);
  const bool = (k: string) => { if (k in args && typeof args[k] !== 'boolean') throw new Invalid('invalidArgument', `${k} must be a boolean.`); };
  const oneOf = (k: string, vals: string[], req = false) => {
    if ((req || k in args) && !vals.includes(args[k] as string)) throw new Invalid('invalidArgument', `${k} must be one of ${vals.join(', ')}.`);
  };
  switch (cmd) {
    case 'network.refresh': bool('includePublicIP'); break;
    case 'switch.start': oneOf('mode', ['renew', 'reconnect'], true); break;
    case 'system.openSettings': oneOf('pane', ['location', 'network', 'wifi'], true); break;
    case 'clipboard.write':
      if (typeof args.text !== 'string' || args.text.length > 100_000) throw new Invalid('invalidArgument', 'text must be a string.');
      break;
    case 'settings.update':
      oneOf('mode', ['renew', 'reconnect']); bool('confirmBeforeSwitch'); bool('publicIPLookup'); bool('sound');
      oneOf('publicIPProvider', ['cloudflare', 'ipify']); oneOf('quality', ['auto', 'low', 'balanced', 'high', 'ultra', 'custom']);
      oneOf('reducedMotion', ['system', 'on', 'off']); oneOf('theme', ['midnight', 'graphite', 'aurora']);
      if ('graphics' in args && (typeof args.graphics !== 'object' || args.graphics === null || Array.isArray(args.graphics)))
        throw new Invalid('invalidArgument', 'graphics must be an object.');
      break;
  }
  return args;
}

function senderAllowed(e: Electron.IpcMainInvokeEvent): boolean {
  if (!win || e.sender !== win.webContents) return false;
  const frame = e.senderFrame;
  if (!frame || frame !== win.webContents.mainFrame) return false;
  try { return new URL(frame.url).origin === ORIGIN; } catch { return false; }
}

async function handleShell(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case 'history.export': {
      const opts = { defaultPath: 'IP SHIFT History.json', filters: [{ name: 'JSON', extensions: ['json'] }] };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return { path: null };
      await fs.promises.writeFile(r.filePath, JSON.stringify(backend.historySnapshot(), null, 2), 'utf8');
      return { path: r.filePath };
    }
    case 'system.openSettings': {
      const url = SETTINGS_URLS[args.pane as string];
      if (!url || process.platform !== 'win32') return { opened: false };
      try { await shell.openExternal(url); return { opened: true }; } catch { return { opened: false }; }
    }
    case 'clipboard.write':
      clipboard.writeText(args.text as string);
      return { written: true };
    case 'permissions.requestLocation': {
      if (process.platform === 'win32') { try { await shell.openExternal(SETTINGS_URLS.location); } catch { /* ignore */ } }
      try {
        const snap = await backend.call('network.snapshot', undefined as void);
        return { status: snap.locationAuthorization ?? 'notDetermined' };
      } catch { return { status: 'notDetermined' }; }
    }
  }
  throw new Invalid('unknownCommand', `Unknown command '${cmd}'.`);
}

function toError(e: unknown) {
  const err = e as { code?: unknown; message?: unknown; stage?: unknown };
  const code = typeof err?.code === 'string' && ERROR_CODES.has(err.code) ? err.code : 'internal';
  const out: { code: string; message: string; stage?: string } = { code, message: typeof err?.message === 'string' ? err.message : String(e) };
  if (typeof err?.stage === 'string') out.stage = err.stage;
  return out;
}

/* ----------------------------------------------------------- elevation */

let relaunching = false;
let quitReady = false;

async function requestElevation(): Promise<'relaunching' | 'declined'> {
  if (process.platform !== 'win32') return 'declined';
  const opts = {
    type: 'warning' as const, buttons: ['Restart', 'Cancel'], defaultId: 0, cancelId: 1, title: 'IP SHIFT',
    message: 'Windows needs administrator permission to renew the DHCP lease. Restart IP SHIFT as administrator?',
  };
  const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  if (r.response !== 0) return 'declined';
  await Promise.race([backend.prepareForQuit().catch(() => {}), new Promise((res) => setTimeout(res, 5000))]);
  app.releaseSingleInstanceLock();
  const args = app.isPackaged ? process.argv.slice(1) : process.argv.slice(1);
  let ok = false;
  try { ok = relaunchElevated(process.execPath, args); } catch (e) { console.error('[ipshift] runas failed', e); }
  if (!ok) { app.requestSingleInstanceLock(); return 'declined'; }
  relaunching = true;
  quitReady = true;
  setImmediate(() => app.quit());
  return 'relaunching';
}

/* ---------------------------------------------------------------- menu */

function sendEvent(ev: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send('ipshift:event', ev);
}
function menuEvent(action: string, target?: string) {
  sendEvent({ type: 'menu', payload: target ? { action, target } : { action } });
}

function buildMenu() {
  const views = ['Dashboard', 'Network', 'History', 'Diagnostics', 'Settings'];
  const template: MenuItemConstructorOptions[] = [
    { label: '&File', submenu: [
      { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => menuEvent('navigate', 'settings') },
      { type: 'separator' },
      { label: 'E&xit', role: 'quit' },
    ] },
    { label: '&Network', submenu: [
      { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => {
        menuEvent('refresh');
        backend.call('network.refresh', { includePublicIP: true }).catch(() => {});
      } },
      { label: 'Switch IP', accelerator: 'CmdOrCtrl+Enter', click: () => menuEvent('switch') },
      { label: 'Run Diagnostics', click: () => menuEvent('diagnostics') },
    ] },
    { label: '&View', submenu: [
      ...views.map((v, i): MenuItemConstructorOptions => ({ label: v, accelerator: `CmdOrCtrl+${i + 1}`, click: () => menuEvent('navigate', v.toLowerCase()) })),
      { type: 'separator' },
      { label: 'Toggle Full Screen', accelerator: 'F11', click: () => win?.setFullScreen(!win.isFullScreen()) },
      ...(!app.isPackaged ? [{ label: 'Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => win?.webContents.toggleDevTools() } as MenuItemConstructorOptions] : []),
    ] },
    { label: '&Help', submenu: [
      { label: 'About IP SHIFT', click: () => {
        const o = { type: 'info' as const, title: 'About IP SHIFT', message: 'IP SHIFT', detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron}\n${os.type()} ${os.release()} (${process.arch})` };
        if (win) dialog.showMessageBox(win, o); else dialog.showMessageBox(o);
      } },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------------------------------------------------------- start */

function start() {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (ev, url) => { if (!url.startsWith(ORIGIN + '/')) ev.preventDefault(); });
    contents.on('will-redirect', (ev, url) => { if (!url.startsWith(ORIGIN + '/')) ev.preventDefault(); });
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  app.on('before-quit', (ev) => {
    if (quitReady) return;
    ev.preventDefault();
    if (relaunching) return;
    relaunching = true; // reuse as "quit in progress" guard
    Promise.race([backend.prepareForQuit().catch(() => {}), new Promise((res) => setTimeout(res, 5000))]).finally(() => {
      quitReady = true;
      app.quit();
    });
  });
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    const root = webRoot();
    protocol.handle(SCHEME, async (req) => {
      let url: URL;
      try { url = new URL(req.url); } catch { return respond(400, 'Bad request', 'text/plain; charset=utf-8'); }
      if (url.host !== HOST) return respond(404, 'Not found', 'text/plain; charset=utf-8');
      const file = resolveFile(url.pathname, root);
      if (!file) return respond(404, 'Not found', 'text/plain; charset=utf-8');
      try {
        const data = await fs.promises.readFile(file);
        const ext = path.extname(file).slice(1).toLowerCase();
        return respond(200, new Uint8Array(data), MIME[ext] ?? 'application/octet-stream');
      } catch { return respond(404, 'Not found', 'text/plain; charset=utf-8'); }
    });

    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);

    backend = loadBackend({ dataDir: app.getPath('userData'), appVersion: app.getVersion(), isElevated: isElevated(), requestElevation });
    backend.onEvent((ev) => sendEvent(ev));

    ipcMain.handle('ipshift:invoke', async (e, payload: unknown) => {
      if (!senderAllowed(e)) return { ok: false, error: { code: 'invalidArgument', message: 'Message origin not allowed.' } };
      try {
        const p = payload as { cmd?: unknown; args?: unknown } | null;
        if (!p || typeof p !== 'object' || typeof p.cmd !== 'string') throw new Invalid('invalidArgument', 'Expected { cmd, args }.');
        const args = validate(p.cmd, p.args);
        const data = SHELL_CMDS.has(p.cmd)
          ? await handleShell(p.cmd, args)
          : await backend.call(p.cmd as any, (Object.keys(args).length || p.cmd === 'settings.update' || p.cmd === 'network.refresh' ? args : undefined) as any);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: toError(err) };
      }
    });

    buildMenu();
    createWindow();
  });
}

function createWindow() {
  const isWin11 = process.platform === 'win32' && Number(os.release().split('.')[2] ?? 0) >= 22000;
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700, show: false, backgroundColor: '#03050A', title: 'IP SHIFT',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#A6B1C8', height: 40 },
    autoHideMenuBar: true,
    ...(isWin11 ? { backgroundMaterial: 'mica' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      webviewTag: false, spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());

  let lastVisible: boolean | null = null;
  const vis = () => {
    if (!win || win.isDestroyed()) return;
    const v = win.isVisible() && !win.isMinimized();
    if (v === lastVisible) return;
    lastVisible = v;
    backend.setWindowVisible(v);
    sendEvent({ type: 'window', payload: { visible: v } });
  };
  for (const ev of ['show', 'hide', 'minimize', 'restore', 'focus', 'blur'] as const) win.on(ev as any, vis);
  win.on('closed', () => { win = null; });

  const page = process.env.IPSHIFT_BENCH === '1' ? 'index.html?bench=1' : 'index.html';
  win.loadURL(`${ORIGIN}/${page}`);
}
