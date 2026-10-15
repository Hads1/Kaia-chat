const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Tray,
  Menu,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Chats } = require('./services');
const { channel } = require('./protocol');
const { normalizeAppearance } = require('./appearance');
const { execFileSync } = require('child_process');
let availableFonts = [
  'Segoe UI',
  'Arial',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Consolas',
  'Trebuchet MS',
  'Times New Roman',
];
try {
  const found = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Drawing; @((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object Name | Sort-Object -Unique) | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 },
    ),
  );
  if (Array.isArray(found))
    availableFonts = [...new Set([...availableFonts, ...found])].sort();
} catch {}
app.setName('Kaia Chat');
const smoke = process.argv.includes('--smoke-test');
let win,
  chats,
  tray,
  locked = false,
  overlay = false;
let settings = {
  twitch: { channel: '', enabled: true, sound: 'Alert 1.wav', volume: 0.5 },
  kick: { channel: '', enabled: true, sound: 'Alert 2.wav', volume: 0.5 },
  starvios: { channel: '', enabled: false, sound: 'Alert 3.wav', volume: 0.5 },
  background: 0.8,
  fontSize: 18,
  sounds: true,
};
if (smoke) {
  const testPath = path.join(
    app.getPath('temp'),
    'kaia-chat-smoke-' + process.pid,
  );
  fs.mkdirSync(testPath, { recursive: true });
  app.setPath('userData', testPath);
}
settings.appearance = normalizeAppearance();
const config = () => path.join(app.getPath('userData'), 'settings.json');
const assets = path.join(__dirname, 'assets');
function decorated() {
  return {
    ...settings,
    appearance: normalizeAppearance(settings.appearance),
    fonts: availableFonts,
    soundFiles: fs.readdirSync(assets).filter((n) => /\.wav$/i.test(n)),
    soundUrls: Object.fromEntries(
      ['twitch', 'kick', 'starvios'].map((p) => [
        p,
        pathToFileURL(
          path.isAbsolute(settings[p].sound)
            ? settings[p].sound
            : path.join(assets, settings[p].sound),
        ).href,
      ]),
    ),
  };
}
function emit(type, data) {
  if (win && !win.isDestroyed()) win.webContents.send(type, data);
  if (type === 'status')
    fs.appendFile(
      path.join(app.getPath('userData'), 'connections.log'),
      `${new Date().toISOString()} ${data.platform}: ${data.text}\n`,
      () => {},
    );
}
app.whenReady().then(async () => {
  if (!smoke) {
    try {
      const s = JSON.parse(fs.readFileSync(config(), 'utf8'));
      settings = {
        ...settings,
        ...s,
        twitch: { ...settings.twitch, ...s.twitch },
        kick: { ...settings.kick, ...s.kick },
        starvios: { ...settings.starvios, ...s.starvios },
      };
    } catch {}
  }
  win = new BrowserWindow({
    width: 510,
    height: 860,
    minWidth: 340,
    minHeight: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  chats = new Chats(emit);
  ipcMain.handle('load', () => decorated());
  ipcMain.handle('save-appearance', (_, s) => {
    settings.appearance = normalizeAppearance(s.appearance);
    settings.fontSize = Math.min(36, Math.max(12, Number(s.fontSize) || 18));
    settings.background = Math.min(1, Math.max(0, Number(s.background) || 0));
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save', (_, s) => {
    for (const p of ['twitch', 'kick', 'starvios']) {
      const c = channel(s[p]?.channel);
      const sound = String(s[p]?.sound || settings[p].sound);
      if (
        !path.isAbsolute(sound) &&
        !fs.existsSync(path.join(assets, path.basename(sound)))
      )
        throw Error('Som inválido');
      settings[p] = {
        channel: c,
        enabled: !!s[p].enabled,
        sound: path.isAbsolute(sound) ? sound : path.basename(sound),
        volume: Math.min(1, Math.max(0, Number(s[p].volume) || 0)),
      };
    }
    settings.background = Math.min(1, Math.max(0, Number(s.background) || 0));
    settings.fontSize = Math.min(36, Math.max(12, Number(s.fontSize) || 18));
    settings.sounds = !!s.sounds;
    settings.appearance = normalizeAppearance(s.appearance);
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    chats.start(settings);
    return decorated();
  });
  ipcMain.handle('choose', async (_, p) => {
    if (!['kick', 'twitch', 'starvios'].includes(p)) return;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Áudio', extensions: ['wav', 'mp3', 'ogg', 'm4a'] }],
    });
    if (!r.canceled)
      return { path: r.filePaths[0], url: pathToFileURL(r.filePaths[0]).href };
  });
  const lock = () => {
    locked = !locked;
    win.setIgnoreMouseEvents(locked, { forward: true });
    if (locked) {
      overlay = true;
      emit('settings', { overlay: true });
    }
  };
  ipcMain.on('window', (_, a) => {
    if (a === 'close') win.close();
    if (a === 'minimize') win.minimize();
    if (a === 'lock') lock();
    if (a === 'overlay') {
      overlay = !overlay;
      locked = overlay;
      win.setIgnoreMouseEvents(locked, { forward: true });
      emit('settings', { overlay });
    }
    if (a === 'clear') emit('settings', { clear: true });
  });
  globalShortcut.register('CommandOrControl+Shift+F10', lock);
  globalShortcut.register('CommandOrControl+Shift+F9', () => {
    locked = false;
    win.setIgnoreMouseEvents(false);
    overlay = false;
    emit('settings', { overlay: false });
    win.show();
    win.focus();
  });
  tray = new Tray(path.join(assets, 'icon.png'));
  tray.setToolTip('Kaia Chat — Ctrl+Shift+F9 para configurar');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Abrir configurações / liberar cliques',
        click: () => {
          locked = false;
          win.setIgnoreMouseEvents(false);
          emit('settings', { overlay: false });
          win.show();
        },
      },
      { label: 'Sair', click: () => app.quit() },
    ]),
  );
  await win.loadFile('index.html');
  if (smoke) {
    emit('message', {
      platform: 'kick',
      id: 'test-k',
      user: 'Hads1',
      text: 'Kick conectada — teste de leitura 💚',
      color: '#53fc18',
    });
    emit('message', {
      platform: 'twitch',
      id: 'test-t',
      user: 'KaiaBot',
      text: 'Twitch e Kick no mesmo painel 💜',
      color: '#b59aff',
    });
    for (const p of ['kick', 'twitch', 'starvios'])
      emit('status', { platform: p, text: 'Teste visual', state: 'ok' });
    setTimeout(() => require('./smoke')(win, app, emit, config), 1800);
  } else chats.start(settings);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  chats?.stop();
  globalShortcut.unregisterAll();
});
