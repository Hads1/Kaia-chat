const fs = require('node:fs/promises');
const path = require('node:path');
class Transcript {
  constructor(onState = () => {}) {
    this.file = null;
    this.queue = Promise.resolve();
    this.failed = null;
    this.seen = new Set();
    this.onState = onState;
    this.count = 0;
  }
  async open(file) {
    if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.txt')
      throw Error('Escolha um caminho completo para um arquivo TXT.');
    await this.flush();
    await fs.appendFile(
      file,
      `\n=== Kaia Chat — sessão ${new Date().toISOString()} ===\n`,
      'utf8',
    );
    this.file = file;
    this.failed = null;
    this.seen.clear();
    this.count = 0;
    this.onState({
      state: 'ok',
      text: 'Backup TXT ativo. Todas as mensagens recebidas serão transcritas.',
    });
    return file;
  }
  append(message) {
    if (!this.file || this.failed) return;
    const key = message.id ? message.platform + ':' + message.id : null;
    if (key && this.seen.has(key)) return;
    if (key) {
      this.seen.add(key);
      if (this.seen.size > 10000)
        this.seen.delete(this.seen.values().next().value);
    }
    const clean = (v) =>
      String(v ?? '')
        .replace(/\r/g, '')
        .replace(/\n/g, '\\n');
    const platform =
      message.platformName ||
      {
        twitch: 'Twitch',
        kick: 'Kick',
        starvios: 'Starvios',
        custom: 'Personalizado',
      }[message.platform] ||
      message.platform;
    const line = `[${new Date().toISOString()}] [${clean(platform)}] ${clean(message.user)}${message.login && message.login !== message.user ? ' (@' + clean(message.login) + ')' : ''}${message.historical ? ' [histórico]' : ''}: ${clean(message.text)}\n`;
    const file = this.file;
    this.queue = this.queue
      .then(async () => {
        if (this.failed) return;
        await fs.appendFile(file, line, 'utf8');
        this.count++;
      })
      .catch((error) => {
        this.failed = error;
        this.onState({
          state: 'error',
          text: 'Não foi possível gravar o TXT. Escolha outro arquivo e reconecte os chats.',
        });
      });
  }
  async flush() {
    await this.queue;
  }
}
module.exports = { Transcript };
