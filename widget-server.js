const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizeWidget(value = {}) {
  return {
    layout: ['classic', 'cards', 'compact'].includes(value.layout)
      ? value.layout
      : 'classic',
    fontSize: Math.min(72, Math.max(12, Number(value.fontSize) || 24)),
    css: String(value.css || '').slice(0, 50000),
  };
}
class WidgetServer {
  constructor() {
    this.clients = new Set();
    this.messages = [];
    this.emotes = {};
    this.token = crypto.randomBytes(24).toString('hex');
    this.config = {
      widget: normalizeWidget(),
      timing: { enabled: true, seconds: 120, fadeSeconds: 2 },
    };
  }
  async start(port = 19347, token) {
    if (/^[a-f0-9]{48}$/.test(token || '')) this.token = token;
    this.server = http.createServer((req, res) => this.request(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', resolve);
    }).catch(async (error) => {
      if (error.code !== 'EADDRINUSE' || !port) throw error;
      await new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(0, '127.0.0.1', resolve);
      });
    });
    this.url = `http://127.0.0.1:${this.server.address().port}/${this.token}/widget.html`;
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) client.write(': keepalive\n\n');
    }, 20000);
    this.heartbeat.unref();
    return this.url;
  }
  request(req, res) {
    const route = req.url?.split('?')[0];
    const prefix = `/${this.token}/`;
    if (req.method !== 'GET' || !route?.startsWith(prefix)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const file = route.slice(prefix.length);
    if (file === 'events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      });
      this.clients.add(res);
      this.send(res, 'snapshot', {
        config: this.config,
        messages: this.snapshot(),
        emotes: this.emotes,
      });
      req.on('close', () => this.clients.delete(res));
      return;
    }
    const types = {
      'widget.html': 'text/html',
      'widget.css': 'text/css',
      'widget.js': 'text/javascript',
    };
    if (!types[file]) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'self' file:; object-src 'none'; base-uri 'none'",
    );
    res.setHeader('Content-Type', types[file] + '; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname, file)));
  }
  snapshot() {
    const t = this.config.timing;
    this.messages = this.messages.filter(
      (m) =>
        !t.enabled ||
        Date.now() - m.widgetTime < (t.seconds + t.fadeSeconds) * 1000,
    );
    return this.messages;
  }
  send(client, type, data) {
    client.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }
  broadcast(type, data) {
    for (const client of this.clients) {
      if (client.writableLength > 1048576) {
        client.destroy();
        this.clients.delete(client);
      } else this.send(client, type, data);
    }
  }
  update(settings) {
    this.snapshot();
    this.config = {
      widget: normalizeWidget(settings.widget),
      timing: settings.timing,
      appearance: settings.appearance,
    };
    this.broadcast('config', this.config);
  }
  prune(predicate) {
    this.messages = this.messages.filter(predicate);
    this.broadcast('reset', this.snapshot());
  }
  event(type, data) {
    if (type === 'message') {
      if (
        data.id &&
        this.messages.some(
          (m) => m.platform === data.platform && m.id === data.id,
        )
      )
        return;
      data = { ...data, widgetTime: Date.now() };
      this.messages.push(data);
      this.messages = this.messages.slice(-300);
    } else if (type === 'emotes') this.emotes[data.platform] = data.items;
    else if (type === 'remove')
      this.messages = this.messages.filter(
        (m) => m.platform !== data.platform || m.id !== data.id,
      );
    else if (type === 'settings' && data.clear) {
      this.messages = [];
      this.broadcast('reset', []);
      return;
    } else return;
    this.broadcast(type, data);
  }
  close() {
    clearInterval(this.heartbeat);
    for (const client of this.clients) client.end();
    this.server?.close();
  }
}
module.exports = { WidgetServer, normalizeWidget };
