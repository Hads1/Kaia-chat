const {
  ipcMain,
  dialog,
  BrowserWindow,
  shell,
  safeStorage,
  globalShortcut,
} = require('electron');
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
const { SRShortcuts } = require('./sr-shortcuts');
const { AlertSources } = require('./alerts');
const locale = require('./i18n');
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
  const t = (text) => locale.translate(text, getSettings().language);
  settings.reader = normalizeReader(settings.reader);
  settings.sr = {
    enabled: false,
    volume: 80,
    output: '',
    repeat: 'off',
    shuffle: false,
    requestLimit: 80,
    playlistLimit: 0,
    announceRequests: true,
    ...settings.sr,
  };
  if (!settings.sr.playlistSizingV2 && settings.sr.playlistLimit === 60)
    settings.sr.playlistLimit = 0;
  settings.sr.playlistSizingV2 = true;
  const backend = new MediaBackend(directory, (kind, text) =>
    notify(kind, text),
  );
  const notify = (kind, text) => emit('media-status', { kind, text });
  let announcementState = null,
    lastRequest = null;
  let volumeSaveTimer;
  function voiceState(phase, text, error = '') {
    announcementState = { phase, text, error, at: Date.now() };
    emit('announcement-state', announcementState);
  }
  const reader = new ReaderQueue({
    speak: async (message, config) => {
      if (message.announcement) voiceState('preparing', message.text);
      try {
        const result = await backend.call(
          'speak',
          {
            message,
            config: {
              ...config,
              sayName: message.announcement ? false : config.sayName,
              sayTemplate: t('{0} diz: '),
            },
          },
          180000,
        );
        if (message.announcement) voiceState('done', message.text);
        return result;
      } catch (error) {
        if (message.announcement)
          voiceState('error', message.text, error.message);
        throw error;
      }
    },
    stop: () => {
      if (backend.process) backend.call('stop-voice', [], 5000).catch(() => {});
    },
    status: (text) => {
      notify('reader', text);
      if (reader.current?.announcement) notify('announcements', text);
    },
    blocked: (m) =>
      isBlocked(getSettings().blockedUsers, m.platform, m.login || m.user),
  });
  reader.configure(settings.reader);
  let lastAlert = null;
  function announce(text, user = 'Kaia') {
    text = t(text);
    if (smoke) return;
    if (!settings.reader.output) {
      notify('reader', 'Escolha a saída do leitor para ouvir avisos privados.');
      voiceState('error', text, 'Selecione e salve a saída do Leitor.');
      return false;
    }
    voiceState('queued', text);
    reader.receive({
      user,
      text,
      announcement: true,
      platform: 'system',
      id: crypto.randomUUID(),
    });
    return true;
  }
  ipcMain.handle('test-announcement', (_, kind) => {
    const text =
      kind === 'sr'
        ? 'Pessoa de teste pediu Música de teste.'
        : 'Pessoa de teste seguiu o canal. Esta é a mensagem de teste do alerta.';
    if (!announce(text))
      throw Error('Selecione e salve a saída de áudio do Leitor primeiro.');
    return 'Aviso de teste enviado para a fila privada de voz.';
  });
  ipcMain.handle('repeat-request', () => {
    if (!lastRequest) return 'Nenhum pedido novo recebido nesta sessão.';
    announce(
      `${lastRequest.user} pediu ${lastRequest.titulo}.`,
      lastRequest.user,
    );
    return true;
  });
  const alertSources = new AlertSources({
    smoke,
    event: (value) => {
      lastAlert = value;
      emit('alert-state', value);
      announce(value.source + ': ' + value.text);
    },
    status: (text) => notify('alerts', text),
  });
  try {
    alertSources.configure(settings.alertSources || []);
  } catch {
    notify('alerts', 'Revise os URLs e seletores das fontes de alertas.');
  }
  ipcMain.handle('save-alerts', (_, rows) => {
    const value = alertSources.configure(rows);
    settings.alertSources = value;
    saveSettings();
    return value;
  });
  ipcMain.handle('repeat-alert', () => {
    if (!lastAlert)
      return 'Nenhum alerta recebido ainda. Salve a fonte e dispare um alerta de teste no serviço.';
    announce(lastAlert.source + ': ' + lastAlert.text);
    return true;
  });
  ipcMain.handle('preview-alert', (_, id) => alertSources.preview(id));
  const shortcuts = new SRShortcuts(globalShortcut, (action) =>
    runSR(action).catch((error) => notify('sr', error.message)),
  );
  try {
    if (!smoke) shortcuts.configure(settings.srShortcuts || {});
  } catch (error) {
    notify('sr', error.message);
  }
  ipcMain.handle('save-sr-shortcuts', (_, value) => {
    const saved = shortcuts.configure(value);
    settings.srShortcuts = saved;
    saveSettings();
    return saved;
  });
  ipcMain.handle('chat-sound', async (_, value) => {
    if (smoke) return true;
    if (!settings.reader.output)
      throw Error(
        'Selecione a saída do leitor: os sons do chat usam essa saída privada.',
      );
    const sound = String(value?.sound || '');
    const file = path.isAbsolute(sound)
      ? sound
      : path.join(__dirname, 'assets', sound);
    if (!/\.(wav|mp3|ogg|m4a)$/i.test(file) || !fs.existsSync(file))
      throw Error('Arquivo de som inválido.');
    if (smoke) return true;
    return backend.call(
      'chat-sound',
      {
        file,
        output: settings.reader.output,
        volume: Math.min(100, Math.max(0, Number(value.volume) * 100 || 0)),
      },
      30000,
    );
  });
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
  widgetServer.srRoute = createSRRoutes({
    directory,
    backend,
    getLanguage: () => getSettings().language,
  });
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
  let configuring;
  async function configureSR() {
    if (configuring) return configuring;
    configuring = (async () => {
      await backend.call('set_volume', [settings.sr.volume]);
      await backend.call('set_saida', [settings.sr.output]);
      await backend.call('set_repeat', [settings.sr.repeat]);
      await backend.call('set_shuffle', [settings.sr.shuffle]);
      await backend.call('set_limits', [
        settings.sr.requestLimit,
        settings.sr.playlistLimit,
      ]);
      configuredProcess = backend.process;
    })();
    try {
      await configuring;
    } finally {
      configuring = null;
    }
  }
  let configuredProcess,
    srState,
    pollProcess,
    queueRevision = -1;
  const announced = new Set();
  const startedAt = Date.now() / 1000;
  const poll = setInterval(async () => {
    if (smoke || closing || pollBusy || !backend.process) return;
    pollBusy = true;
    try {
      if (pollProcess !== backend.process) {
        pollProcess = backend.process;
        queueRevision = -1;
      }
      const update = await backend.call('state', [queueRevision], 5000);
      queueRevision = update.queue_revision ?? -1;
      srState = { ...srState, ...update };
      for (const item of srState.notifications || [])
        if (!announced.has(item.key)) {
          announced.add(item.key);
          if (item.at >= startedAt) lastRequest = item;
          if (settings.sr.announceRequests && item.at >= startedAt)
            announce(`${item.user} pediu ${item.titulo}.`, item.user);
        }
      if (announced.size > 2000)
        announced.delete(announced.values().next().value);
      emit('sr-state', update);
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
      ...settings.sr,
      enabled: !!value.enabled,
      volume: Math.max(0, Math.min(100, Number(value.volume) || 0)),
      output: String(value.output || '').slice(0, 300),
      repeat: ['off', 'one', 'playlist'].includes(value.repeat)
        ? value.repeat
        : 'off',
      shuffle: !!value.shuffle,
      requestLimit: Math.min(
        500,
        Math.max(
          1,
          Number(value.requestLimit ?? settings.sr.requestLimit) || 80,
        ),
      ),
      playlistLimit: Math.max(
        0,
        Math.floor(
          Number(value.playlistLimit ?? settings.sr.playlistLimit) || 0,
        ),
      ),
      announceRequests: value.announceRequests ?? settings.sr.announceRequests,
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
    'save_playlist',
    'restore_playlist',
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
    'export-log',
    'play',
    'pause',
    'edit_queue',
  ]);
  async function runSR(action, args = []) {
    if (!actions.has(action) || !Array.isArray(args) || args.length > 4)
      throw Error('Comando SR inválido.');
    if (
      action === 'pedir' &&
      (!String(args[1] || '').trim() || String(args[1]).length > 500)
    )
      throw Error('Informe uma música ou link válido.');
    if (action === 'export-log') {
      const source = path.join(directory, 'aprendizado', 'sr-events.jsonl');
      if (!fs.existsSync(source))
        throw Error('Nenhum evento do SR registrado ainda.');
      const result = await dialog.showSaveDialog(win, {
        defaultPath: 'KaiaChat-SR-log.jsonl',
        filters: [{ name: 'Log JSON Lines', extensions: ['jsonl'] }],
      });
      if (result.canceled) return 'Exportação cancelada.';
      const text = fs.readFileSync(source, 'utf8');
      fs.writeFileSync(
        result.filePath,
        text.slice(0, text.lastIndexOf('\n') + 1),
      );
      return 'Log do SR exportado.';
    }
    await backend.start();
    if (configuredProcess !== backend.process) await configureSR();
    if (action === 'adicionar_playlist' && args.length >= 3) {
      settings.sr.playlistLimit = Math.max(0, Math.floor(Number(args[2]) || 0));
      saveSettings();
      await backend.call('set_limits', [
        settings.sr.requestLimit,
        settings.sr.playlistLimit,
      ]);
      args = args.slice(0, 2);
    }
    if (action === 'test-audio')
      return backend.call('test-sr-audio', {
        output: settings.sr.output,
        volume: settings.sr.volume,
      });
    if (action === 'retry') await syncCookies();
    const result = await backend.call(action, args);
    if (
      action === 'restore_playlist' ||
      (action === 'edit_queue' && args[1] === 'move')
    ) {
      settings.sr.shuffle = false;
      saveSettings();
      emit('sr-order-manual', true);
    }
    if (action === 'set_repeat') {
      settings.sr.repeat = args[0];
      saveSettings();
    }
    if (action === 'set_volume') {
      settings.sr.volume = Math.min(100, Math.max(0, Number(args[0]) || 0));
      clearTimeout(volumeSaveTimer);
      volumeSaveTimer = setTimeout(() => { volumeSaveTimer = null; saveSettings(); }, 500);
      return result;
    }
    notify('sr', typeof result === 'string' ? result : 'Comando executado.');
    return result;
  }
  ipcMain.handle('sr-action', (_, action, args) => runSR(action, args));
  ipcMain.handle('spotify-action', async (_, action, value) => {
    if (action === 'enabled') return spotify.setEnabled(value);
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
      announcementState,
      lastRequest,
      srShortcuts: settings.srShortcuts || {},
      alertSources: settings.alertSources || [],
      lastAlert,
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
    languageChanged: () => reader.configure(settings.reader),
    async close() {
      closing = true;
      if (volumeSaveTimer) { clearTimeout(volumeSaveTimer); saveSettings(); }
      clearInterval(poll);
      clearInterval(cookieTimer);
      spotify.close();
      shortcuts.clear();
      alertSources.close();
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
