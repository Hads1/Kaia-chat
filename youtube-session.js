const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const net = require('node:net');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function findBrowser() {
  const roots = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  for (const name of [
    'Google/Chrome/Application/chrome.exe',
    'Microsoft/Edge/Application/msedge.exe',
  ])
    for (const root of roots) {
      const file = path.join(root, name);
      if (fs.existsSync(file)) return file;
    }
  return null;
}
class YouTubeSession {
  constructor(directory) {
    this.profile = path.join(directory, 'youtube-browser');
    this.next = 0;
    this.pending = new Map();
  }
  async attach() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.attaching) return this.attaching;
    this.attaching = this.connectSocket();
    try {
      return await this.attaching;
    } finally {
      this.attaching = null;
    }
  }
  async connectSocket() {
    const text = fs
      .readFileSync(path.join(this.profile, 'DevToolsActivePort'), 'utf8')
      .trim()
      .split(/\r?\n/);
    if (
      !/^\d+$/.test(text[0]) ||
      !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(text[1])
    )
      throw Error('Sessão YouTube ainda não está pronta.');
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(`ws://127.0.0.1:${Number(text[0])}${text[1]}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.terminate();
        reject(Error('Não foi possível acessar a sessão dedicada do YouTube.'));
      }, 3000);
      socket.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.socket = socket;
    socket.on('message', (data) => {
      try {
        const reply = JSON.parse(data);
        const pending = this.pending.get(reply.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(reply.id);
        if (reply.error)
          pending.reject(
            Error('O navegador recusou a sincronização da sessão.'),
          );
        else pending.resolve(reply.result);
      } catch {}
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(Error('Navegador YouTube fechado.'));
      }
      this.pending.clear();
    });
  }
  async call(method, params = {}) {
    await this.attach();
    return new Promise((resolve, reject) => {
      const id = ++this.next,
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Error('A sessão YouTube demorou para responder.'));
        }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async open() {
    try {
      await this.call('Target.createTarget', {
        url: 'https://www.youtube.com/',
      });
      return;
    } catch {}
    const browser = findBrowser();
    if (!browser)
      throw Error(
        'Instale Chrome ou Microsoft Edge para conectar a sessão dedicada do YouTube.',
      );
    fs.mkdirSync(this.profile, { recursive: true });
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const selected = server.address().port;
        server.close(() => resolve(selected));
      });
    });
    const child = spawn(
      browser,
      [
        `--user-data-dir=${this.profile}`,
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        'https://www.youtube.com/',
      ],
      { stdio: 'ignore', detached: true },
    );
    child.on('error', () => {});
    child.unref();
    for (let i = 0; i < 60; i++) {
      await delay(250);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(1000),
        });
        const info = await response.json(),
          endpoint = new URL(info.webSocketDebuggerUrl);
        if (
          endpoint.hostname !== '127.0.0.1' ||
          Number(endpoint.port) !== port ||
          !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(endpoint.pathname)
        )
          throw Error('Endpoint inválido.');
        fs.writeFileSync(
          path.join(this.profile, 'DevToolsActivePort'),
          port + '\n' + endpoint.pathname + '\n',
        );
        await this.attach();
        return;
      } catch {}
    }
    throw Error(
      'O navegador não liberou a sessão dedicada. Feche essa janela do YouTube e tente Conectar novamente.',
    );
  }
  async cookies() {
    const result = await this.call('Storage.getCookies');
    return (result.cookies || [])
      .filter((c) =>
        /(^|\.)(youtube\.com|google\.com)$/.test(c.domain.replace(/^\./, '')),
      )
      .map((c) => ({ ...c, expirationDate: c.expires > 0 ? c.expires : 0 }));
  }
  async disconnect() {
    try {
      await this.call('Storage.clearCookies');
      await this.call('Browser.close');
    } catch {}
    this.close();
  }
  close() {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error('Sessão YouTube desconectada.'));
    }
    this.pending.clear();
    this.socket?.close();
    this.socket = null;
  }
}
module.exports = { YouTubeSession, findBrowser };
