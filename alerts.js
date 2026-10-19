const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const observerSource = fs
  .readFileSync(path.join(__dirname, 'alerts-preload.js'), 'utf8')
  .replace("const { ipcRenderer } = require('electron');", '');
const selectors = {
  streamlabs:
    '#alert-text, #alert-message, #alert-user-message, .alert-message',
  streamelements: '.alert-text, .alert-message, #alert-message',
  custom: '',
};
function normalizeAlerts(rows = []) {
  if (!Array.isArray(rows) || rows.length > 20)
    throw Error('Use até 20 fontes de alertas.');
  return rows.map((row, i) => {
    const url = new URL(String(row.url || ''));
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error('Use URL HTTP/HTTPS do widget, sem senha no endereço.');
    const provider = Object.hasOwn(selectors, row.provider)
      ? row.provider
      : 'custom';
    const oldDefault =
      String(row.selector || '').replace(/\s/g, '') ===
      '#alert-message,#alert-user-message';
    const selector = String(
      provider === 'streamlabs' && oldDefault
        ? selectors.streamlabs
        : row.selector || selectors[provider],
    ).trim();
    if (!selector || selector.length > 500)
      throw Error('Informe o seletor CSS do texto do alerta.');
    return {
      id: String(row.id || crypto.randomUUID()).slice(0, 80),
      name: String(row.name || 'Fonte ' + (i + 1)).slice(0, 80),
      provider,
      url: url.href,
      selector,
      enabled: row.enabled !== false,
      durationSeconds: Math.max(
        0,
        Math.min(300, Number(row.durationSeconds) || 0),
      ),
    };
  });
}
class AlertSources {
  constructor({ event, status, smoke = false }) {
    this.event = event;
    this.status = status;
    this.smoke = smoke;
    this.windows = new Map();
    this.last = new Map();
    this.rows = [];
    this.listener = (e, data) => {
      const row = this.windows.get(e.sender.id)?.row;
      if (!row || typeof data?.text !== 'string') return;
      const text = data.text.replace(/\s+/g, ' ').trim().slice(0, 600);
      if (!text) return;
      const key = row.id + ':' + text;
      if (Date.now() - (this.last.get(key) || 0) < 15000) return;
      this.last.set(key, Date.now());
      if (this.last.size > 500) this.last.delete(this.last.keys().next().value);
      this.event({ source: row.name, text, at: Date.now() });
    };
    ipcMain.on('alerts-text', this.listener);
    this.progressListener = (e) => {
      const row = this.windows.get(e.sender.id)?.row;
      if (row)
        this.status(
          row.name + ': alerta identificado; aguardando o fim para falar.',
        );
    };
    ipcMain.on('alerts-progress', this.progressListener);
    this.errorListener = (e) => {
      const row = this.windows.get(e.sender.id)?.row;
      if (row)
        this.status(
          row.name +
            ': seletor CSS inválido. Corrija o campo do texto do alerta.',
        );
    };
    ipcMain.on('alerts-error', this.errorListener);
    this.healthListener = (e, data) => {
      const item = this.windows.get(e.sender.id);
      if (!item) return;
      const count = Math.max(0, Math.min(10000, Number(data?.matches) || 0));
      const blocked = Math.max(
        0,
        Math.min(10000, Number(data?.framesBlocked) || 0),
      );
      this.status(
        item.row.name +
          ': ' +
          (count
            ? count +
              ' elemento(s) de texto encontrado(s). Aguardando novo alerta.'
            : 'Nenhum elemento corresponde ao seletor. Se o alerta aparecer na prévia, ajuste o seletor CSS.') +
          (blocked
            ? ' Há iframe(s) de outro domínio sem acesso ao texto.'
            : ''),
      );
    };
    ipcMain.on('alerts-health', this.healthListener);
  }
  configure(rows) {
    const normalized = normalizeAlerts(rows);
    this.closeWindows();
    this.rows = normalized;
    if (this.smoke) return normalized;
    for (const row of normalized.filter((x) => x.enabled)) {
      const w = new BrowserWindow({
        show: false,
        width: 1280,
        height: 720,
        webPreferences: {
          preload: path.join(__dirname, 'alerts-preload.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          partition: 'kaia-alerts-' + row.id,
        },
      });
      this.windows.set(w.webContents.id, { window: w, row });
      const item = this.windows.get(w.webContents.id);
      const frameKey = '__kaiaAlert_' + crypto.randomBytes(12).toString('hex');
      const frameConfig = JSON.stringify({
        selector: row.selector,
        durationSeconds: row.durationSeconds,
      });
      const frameCode = `(() => {const key=${JSON.stringify(frameKey)};
        if(!globalThis[key]){const queue=[];const ipcRenderer={
          on:(_,callback)=>callback(null,${frameConfig}),
          send:(channel,data)=>{if(queue.length<100)queue.push({channel,data});}
        };${observerSource}\n globalThis[key]=queue;}
        return globalThis[key].splice(0,100);})()`;
      let readingFrames = false;
      item.framePoll = setInterval(async () => {
        if (readingFrames || w.isDestroyed()) return;
        readingFrames = true;
        try {
          const main = w.webContents.mainFrame;
          const frames = main.framesInSubtree
            .filter(
              (frame) =>
                frame !== main && frame.origin !== frame.parent?.origin,
            )
            .slice(0, 20);
          await Promise.allSettled(
            frames.map(async (frame) => {
              const messages = await frame.executeJavaScript(frameCode);
              if (
                !this.windows.has(w.webContents.id) ||
                !Array.isArray(messages)
              )
                return;
              for (const message of messages) {
                const event = { sender: w.webContents };
                if (message.channel === 'alerts-text')
                  this.listener(event, message.data);
                if (message.channel === 'alerts-progress')
                  this.progressListener(event);
                if (
                  message.channel === 'alerts-health' &&
                  message.data?.matches > 0
                )
                  this.status(
                    row.name +
                      ': texto do widget incorporado encontrado; aguardando alerta e término da mídia.',
                  );
              }
            }),
          );
        } catch {
          // A widget frame may navigate or disappear between samples.
        } finally {
          readingFrames = false;
        }
      }, 200);
      w.on('close', (e) => {
        e.preventDefault();
        w.hide();
      });
      w.webContents.setAudioMuted(true);
      w.webContents.session.setPermissionRequestHandler((_, __, cb) =>
        cb(false),
      );
      w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      w.webContents.on('will-navigate', (e, destination) => {
        if (new URL(destination).origin !== new URL(row.url).origin)
          e.preventDefault();
      });
      w.webContents.on('did-finish-load', () => {
        w.webContents.send('alerts-config', {
          selector: row.selector,
          durationSeconds: row.durationSeconds,
        });
        this.status(
          row.name +
            ': monitorando texto HTML; dispare um alerta de teste no serviço.',
        );
      });
      w.webContents.on('did-fail-load', (_, code, description, url, main) => {
        if (main && code !== -3)
          this.status(
            row.name + ': falha ao carregar. Verifique o URL do widget.',
          );
      });
      w.loadURL(row.url).catch(() =>
        this.status(row.name + ': não foi possível abrir a fonte.'),
      );
    }
    return normalized;
  }
  closeWindows() {
    for (const { window: w, framePoll } of this.windows.values()) {
      clearInterval(framePoll);
      if (!w.isDestroyed()) w.destroy();
    }
    this.windows.clear();
    this.last.clear();
  }
  preview(id) {
    const item = Array.from(this.windows.values()).find((x) => x.row.id === id);
    if (!item) throw Error('Salve e ative a fonte antes de abrir a prévia.');
    item.window.setTitle('Kaia Chat — prévia: ' + item.row.name);
    item.window.show();
    item.window.focus();
    return true;
  }
  close() {
    this.closeWindows();
    ipcMain.removeListener('alerts-text', this.listener);
    ipcMain.removeListener('alerts-progress', this.progressListener);
    ipcMain.removeListener('alerts-error', this.errorListener);
    ipcMain.removeListener('alerts-health', this.healthListener);
  }
}
module.exports = { AlertSources, normalizeAlerts, selectors };
