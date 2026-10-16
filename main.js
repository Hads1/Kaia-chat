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
const { normalizeBlockedUsers, isBlocked } = require('./blocking');
const { normalizeTiming } = require('./timing');
const { normalizeCustom } = require('./custom');
const { Transcript } = require('./transcript');
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
  custom: { ...normalizeCustom(), sound: 'Alert 3 (Low).wav', volume: 0.5 },
  transcriptPath: '',
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
settings.blockedUsers = normalizeBlockedUsers();
settings.timing = normalizeTiming();
const config = () => path.join(app.getPath('userData'), 'settings.json');
const assets = path.join(__dirname, 'assets');
const transcript = new Transcript((state) => {
  emit('transcript-status', state);
  if (state.state === 'error') {
    chats?.stop();
    for (const platform of ['twitch', 'kick', 'starvios', 'custom'])
      emit('status', {
        platform,
        state: 'error',
        text: 'Backup interrompido · escolha outro TXT e reconecte',
      });
  }
});
async function chooseTranscript() {
  const picked = await dialog.showSaveDialog(win, {
    title: 'Escolha onde salvar todo o chat em TXT',
    defaultPath:
      settings.transcriptPath ||
      path.join(
        app.getPath('documents'),
        'KaiaChat-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt',
      ),
    filters: [{ name: 'Transcrição do chat', extensions: ['txt'] }],
    buttonLabel: 'Usar este TXT',
  });
  if (picked.canceled || !picked.filePath) return null;
  const file =
    path.extname(picked.filePath).toLowerCase() === '.txt'
      ? picked.filePath
      : picked.filePath + '.txt';
  await transcript.open(file);
  settings.transcriptPath = file;
  return file;
}
function decorated() {
  return {
    ...settings,
    appearance: normalizeAppearance(settings.appearance),
    blockedUsers: normalizeBlockedUsers(settings.blockedUsers),
    timing: normalizeTiming(settings.timing),
    fonts: availableFonts,
    soundFiles: fs.readdirSync(assets).filter((n) => /\.wav$/i.test(n)),
    soundUrls: Object.fromEntries(
      ['twitch', 'kick', 'starvios', 'custom'].map((p) => [
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
  if (type === 'message') transcript.append(data);
  if (
    type === 'message' &&
    isBlocked(settings.blockedUsers, data.platform, data.login || data.user)
  )
    return;
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
        custom: { ...settings.custom, ...s.custom },
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
  ipcMain.handle('choose-transcript', async () => {
    const file = await chooseTranscript();
    if (!file) return null;
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save-timing', (_, value) => {
    settings.timing = normalizeTiming(value);
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save-blocked', (_, lists) => {
    settings.blockedUsers = normalizeBlockedUsers(lists);
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save-appearance', (_, s) => {
    settings.appearance = normalizeAppearance(s.appearance);
    settings.fontSize = Math.min(36, Math.max(12, Number(s.fontSize) || 18));
    settings.background = Math.min(1, Math.max(0, Number(s.background) || 0));
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save', async (_, s) => {
    const custom = normalizeCustom(s.custom ?? settings.custom);
    const blockedUsers = normalizeBlockedUsers(
      s.blockedUsers ?? settings.blockedUsers,
    );
    if (!transcript.file || transcript.failed) {
      if (!(await chooseTranscript()))
        throw Error(
          'Escolha um arquivo TXT antes de conectar para manter o backup do chat.',
        );
    }
    for (const p of ['twitch', 'kick', 'starvios', 'custom']) {
      const c = p === 'custom' ? custom.channel : channel(s[p]?.channel);
      const sound = String(s[p]?.sound || settings[p].sound);
      if (
        !path.isAbsolute(sound) &&
        !fs.existsSync(path.join(assets, path.basename(sound)))
      )
        throw Error('Som inválido');
      settings[p] = {
        ...settings[p],
        channel: c,
        enabled: !!s[p].enabled,
        sound: path.isAbsolute(sound) ? sound : path.basename(sound),
        volume: Math.min(1, Math.max(0, Number(s[p].volume) || 0)),
      };
    }
    settings.custom = { ...settings.custom, ...custom };
    settings.background = Math.min(1, Math.max(0, Number(s.background) || 0));
    settings.fontSize = Math.min(36, Math.max(12, Number(s.fontSize) || 18));
    settings.sounds = !!s.sounds;
    settings.appearance = normalizeAppearance(s.appearance);
    settings.blockedUsers = blockedUsers;
    settings.timing = normalizeTiming(s.timing ?? settings.timing);
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    chats.start(settings);
    return decorated();
  });
  ipcMain.handle('choose', async (_, p) => {
    if (!['kick', 'twitch', 'starvios', 'custom'].includes(p)) return;
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
    settings.transcriptPath = path.join(
      app.getPath('userData'),
      'chat-test.txt',
    );
    await transcript.open(settings.transcriptPath);
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
    setTimeout(
      () => require('./smoke')(win, app, emit, config, transcript),
      1800,
    );
  } else if (settings.transcriptPath) {
    try {
      await transcript.open(settings.transcriptPath);
      chats.start(settings);
    } catch {
      emit('transcript-status', {
        state: 'error',
        text: 'Escolha outro TXT antes de conectar. O arquivo anterior não pôde ser aberto.',
      });
    }
  } else
    for (const platform of ['twitch', 'kick', 'starvios', 'custom'])
      emit('status', {
        platform,
        text: 'Escolha o TXT e conecte',
        state: 'off',
      });
});
app.on('window-all-closed', () => app.quit());
let finishedQuit = false;
app.on('before-quit', (event) => {
  if (finishedQuit) return;
  event.preventDefault();
  chats?.stop();
  transcript.flush().finally(() => {
    finishedQuit = true;
    app.quit();
  });
});
app.on('will-quit', () => {
  chats?.stop();
  globalShortcut.unregisterAll();
});
