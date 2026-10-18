const { ipcMain, BrowserWindow, shell, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MediaBackend } = require('./media-backend');
const { ReaderQueue, normalizeReader } = require('./reader');
const { Spotify } = require('./spotify');
const { YouTubeSession } = require('./youtube-session');
const { isBlocked } = require('./blocking');
const { createSRRoutes } = require('./sr-assets');
const { cleanupMedia } = require('./media-cleanup');
function installMedia({
  win,
  directory,
  getSettings,
  saveSettings,
  emit,
  widgetServer,
  smoke,
}) {
  const settings = getSettings();
  settings.reader = normalizeReader(settings.reader);
  settings.sr = {
    enabled: false,
    volume: 80,
    output: '',
    repeat: 'off',
    shuffle: false,
    ...settings.sr,
  };
  const backend = new MediaBackend(directory);
  const notify = (kind, text) => emit('media-status', { kind, text });
  const reader = new ReaderQueue({
    speak: (message, config) =>
      backend.call('speak', { message, config }, 180000),
    stop: () => {
      if (backend.process) backend.call('stop-voice', [], 5000).catch(() => {});
    },
    status: (text) => notify('reader', text),
    blocked: (m) =>
      isBlocked(getSettings().blockedUsers, m.platform, m.login || m.user),
  });
  reader.configure(settings.reader);
  const spotify = new Spotify({
    directory,
    storage: safeStorage,
    open: (url) => shell.openExternal(url),
    status: (text) => {
      notify('spotify', text);
      emit('spotify-state', spotify.info());
    },
  });
  if (!smoke) spotify.start();
  widgetServer.srRoute = createSRRoutes({ directory, backend });
  const youtube = new YouTubeSession(directory);
  let cookieHash = '',
    pollBusy = false,
    closing = false;
  let disconnectingYouTube = false;
  async function syncCookies() {
    if (closing || disconnectingYouTube) return false;
    let cookies;
    try {
      cookies = await youtube.cookies();
    } catch {
      return false;
    }
    if (closing || disconnectingYouTube) return false;
    if (!cookies.length) return false;
    const text =
      '# Netscape HTTP Cookie File\n' +
      cookies
        .map((c) =>
          [
            c.httpOnly ? '#HttpOnly_' + c.domain : c.domain,
            c.domain.startsWith('.') ? 'TRUE' : 'FALSE',
            c.path || '/',
            c.secure ? 'TRUE' : 'FALSE',
            Math.floor(c.expirationDate || 0),
            c.name,
            c.value,
          ].join('\t'),
        )
        .join('\n') +
      '\n';
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    if (hash === cookieHash) return true;
    fs.mkdirSync(path.join(directory, 'sr_auth'), { recursive: true });
    const file = path.join(directory, 'sr_auth', 'youtube_cookies.txt');
    fs.writeFileSync(file + '.tmp', text);
    fs.renameSync(file + '.tmp', file);
    await backend.call('cookies', { path: file });
    cookieHash = hash;
    notify(
      'youtube',
      'Sessão do navegador do SR sincronizada automaticamente.',
    );
    return true;
  }
  async function configureSR() {
    await backend.call('set_volume', [settings.sr.volume]);
    await backend.call('set_saida', [settings.sr.output]);
    await backend.call('set_repeat', [settings.sr.repeat]);
    await backend.call('set_shuffle', [settings.sr.shuffle]);
    configuredProcess = backend.process;
  }
  let configuredProcess, srState;
  const poll = setInterval(async () => {
    if (closing || pollBusy || !backend.process) return;
    pollBusy = true;
    try {
      srState = await backend.call('state', [], 5000);
      emit('sr-state', srState);
    } catch (error) {
      notify('sr', error.message);
    } finally {
      pollBusy = false;
    }
  }, 1000);
  poll.unref();
  const cookieTimer = setInterval(() => {
    if (!smoke && (settings.sr.enabled || youtube.socket))
      syncCookies().catch((error) => notify('youtube', error.message));
  }, 5000);
  cookieTimer.unref();
  ipcMain.handle('media-diagnose', async () => {
    const result = await backend.call('diagnose');
    return { ...result, spotify: spotify.info() };
  });
  ipcMain.handle('save-reader', (_, value) => {
    settings.reader = normalizeReader(value);
    if (settings.reader.enabled && !settings.reader.output) {
      settings.reader.enabled = false;
      throw Error('Escolha uma saída de áudio para ativar o leitor.');
    }
    saveSettings();
    reader.configure(settings.reader);
    return settings.reader;
  });
  ipcMain.handle('reader-action', (_, action) => {
    if (action === 'clear') {
      reader.clear();
      notify('reader', 'Fila de leitura limpa.');
    }
    if (action === 'stop') {
      settings.reader.enabled = false;
      reader.configure(settings.reader);
      saveSettings();
      notify('reader', 'Leitura parada.');
    }
    if (action === 'test') {
      if (reader.busy)
        throw Error('Pare a leitura atual antes de testar a voz.');
      if (!settings.reader.output)
        throw Error('Selecione e salve a saída de áudio primeiro.');
      return backend.call('speak', {
        message: { user: 'Kaia', text: 'Teste da saída de leitura do chat.' },
        config: settings.reader,
      });
    }
    return true;
  });
  ipcMain.handle('save-sr', async (_, value) => {
    const wasEnabled = settings.sr.enabled;
    settings.sr = {
      enabled: !!value.enabled,
      volume: Math.max(0, Math.min(100, Number(value.volume) || 0)),
      output: String(value.output || '').slice(0, 300),
      repeat: ['off', 'one', 'playlist'].includes(value.repeat)
        ? value.repeat
        : 'off',
      shuffle: !!value.shuffle,
    };
    saveSettings();
    if (!smoke) {
      if (settings.sr.enabled || backend.process) {
        await configureSR();
        syncCookies().catch(() => {});
      }
      if (wasEnabled && !settings.sr.enabled && backend.process)
        await backend.call('stop');
    }
    return settings.sr;
  });
  const actions = new Set([
    'pedir',
    'adicionar_playlist',
    'play_pause',
    'retry',
    'stop',
    'skip',
    'prev',
    'seek',
    'set_volume',
    'set_saida',
    'mute_toggle',
    'set_repeat',
    'set_shuffle',
    'limpar',
    'remover_fila',
    'limpar_historico',
    'apagar_historico',
    'test-audio',
  ]);
  ipcMain.handle('sr-action', async (_, action, args = []) => {
    if (!actions.has(action) || !Array.isArray(args) || args.length > 3)
      throw Error('Comando SR inválido.');
    if (
      action === 'pedir' &&
      (!String(args[1] || '').trim() || String(args[1]).length > 500)
    )
      throw Error('Informe uma música ou link válido.');
    await backend.start();
    if (configuredProcess !== backend.process) await configureSR();
    if (action === 'test-audio')
      return backend.call('test-sr-audio', {
        output: settings.sr.output,
        volume: settings.sr.volume,
      });
    if (action === 'retry') await syncCookies();
    const result = await backend.call(action, args);
    if (action === 'set_repeat') {
      settings.sr.repeat = args[0];
      saveSettings();
    }
    if (action === 'set_volume') {
      settings.sr.volume = Math.min(100, Math.max(0, Number(args[0]) || 0));
      saveSettings();
    }
    notify('sr', typeof result === 'string' ? result : 'Comando executado.');
    return result;
  });
  ipcMain.handle('spotify-action', async (_, action, value) => {
    if (action === 'save') return spotify.configure(value);
    if (action === 'connect') return spotify.connect();
    if (action === 'disconnect') return spotify.disconnect();
    if (action === 'info') return spotify.info();
    throw Error('Ação Spotify inválida.');
  });
  ipcMain.handle('youtube-action', async (_, action) => {
    if (action === 'connect') {
      await youtube.open();
      notify(
        'youtube',
        'Faça login na janela dedicada do Chrome/Edge. A sessão é sincronizada automaticamente; depois clique Testar acesso.',
      );
      await syncCookies();
      return 'Navegador dedicado aberto. Faça login no YouTube e depois teste o acesso.';
    }
    if (action === 'test') {
      if (!(await syncCookies())) {
        await youtube.open();
        await syncCookies();
      }
      const result = await backend.call('test-youtube', [], 120000);
      const state = await backend.call('state');
      if (!state.titulo && state.fila?.some((item) => item.status === 'erro')) {
        await backend.call('retry');
        return result + ' Pedido pendente colocado novamente na fila.';
      }
      return result;
    }
    if (action === 'disconnect') {
      disconnectingYouTube = true;
      await youtube.disconnect();
      cookieHash = '';
      const file = path.join(directory, 'sr_auth', 'youtube_cookies.txt');
      if (fs.existsSync(file)) fs.unlinkSync(file);
      await backend.call('cookies', { path: '' });
      notify('youtube', 'Sessão YouTube desconectada.');
      disconnectingYouTube = false;
      return true;
    }
    throw Error('Ação YouTube inválida.');
  });
  ipcMain.handle('sr-loopback', (_, value) =>
    backend.call('loopback', {
      enabled: !!value.enabled,
      device: String(value.device || ''),
    }),
  );
  const links = {
    dashboard: 'https://developer.spotify.com/dashboard',
    spotifyDocs:
      'https://developer.spotify.com/documentation/web-api/concepts/apps',
    spotifyVideo: 'https://www.youtube.com/watch?v=or6GSvjmyyE',
    redirectVideo: 'https://www.youtube.com/watch?v=B_NYjslAGfw',
  };
  ipcMain.handle('media-link', (_, name) => {
    if (links[name]) return shell.openExternal(links[name]);
  });
  ipcMain.handle('sr-open', (_, kind) => {
    const name = {
      standard: 'sr.html',
      custom: 'sr-custom.html',
      editor: 'sr-editor.html',
    }[kind];
    if (!name) return;
    const popup = new BrowserWindow({
      width: 900,
      height: 760,
      title: 'Kaia SR — ' + kind,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.loadURL(widgetServer.url.replace('widget.html', 'sr/' + name));
  });
  const recent = new Map();
  if (!smoke && settings.sr.enabled)
    configureSR()
      .then(() => syncCookies())
      .catch((error) => notify('sr', error.message));
  return {
    info: () => ({
      reader: settings.reader,
      sr: settings.sr,
      srState,
      youtubeSession: fs.existsSync(
        path.join(directory, 'sr_auth', 'youtube_cookies.txt'),
      ),
      spotify: spotify.info(),
      srUrl: widgetServer.url?.replace('widget.html', 'sr/sr.html'),
      srCustomUrl: widgetServer.url?.replace(
        'widget.html',
        'sr/sr-custom.html',
      ),
      srEditorUrl: widgetServer.url?.replace(
        'widget.html',
        'sr/sr-editor.html',
      ),
    }),
    receive(type, data) {
      if (type === 'message') {
        if (
          isBlocked(
            getSettings().blockedUsers,
            data.platform,
            data.login || data.user,
          )
        )
          return;
        const key = data.platform + ':' + data.id;
        if (data.id && recent.has(key)) return;
        if (data.id) {
          recent.set(key, Date.now());
          if (recent.size > 2000) recent.delete(recent.keys().next().value);
        }
        reader.receive(data);
        const match = /^\s*[!！](?:sr|songrequest)\b[:\s]*(.+)/i.exec(
          data.text || '',
        );
        if (settings.sr.enabled && !data.historical && match && !smoke) {
          const userKey =
              data.platform + ':' + (data.login || data.user).toLowerCase(),
            last = recent.get('sr:' + userKey) || 0;
          if (Date.now() - last < 5000) return;
          recent.set('sr:' + userKey, Date.now());
          (async () => {
            await backend.start();
            if (configuredProcess !== backend.process) await configureSR();
            return backend.call('pedir', [data.user, match[1].slice(0, 500)]);
          })()
            .then((result) => notify('sr', result))
            .catch((error) => notify('sr', error.message));
        }
      }
      if (type === 'remove') reader.remove(data.platform, data.id);
      if (type === 'settings' && data.clear) reader.clear();
    },
    prune: () => reader.prune(),
    async close() {
      closing = true;
      clearInterval(poll);
      clearInterval(cookieTimer);
      spotify.close();
      reader.clear();
      youtube.close();
      await backend.close();
      const failed = await cleanupMedia(directory);
      if (failed.length)
        notify(
          'sr',
          'Alguns áudios temporários estão em uso. A limpeza será repetida na próxima abertura.',
        );
    },
  };
}
module.exports = { installMedia };
