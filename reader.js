const nick = (value) =>
  String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
const list = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/))
        .map(nick)
        .filter(Boolean),
    ),
  ].slice(0, 1000);
function normalizeReader(value = {}) {
  const number = (key, fallback, low, high) =>
    Math.min(high, Math.max(low, Number(value[key]) || fallback));
  return {
    enabled: !!value.enabled,
    every: number('every', 1, 1, 100),
    lowEvery: number('lowEvery', 5, 1, 100),
    interval: Number(value.interval) === 0 ? 0 : number('interval', 5, 0, 300),
    voice: String(value.voice || 'pt-BR-FranciscaNeural').slice(0, 100),
    rate: Math.min(100, Math.max(-50, Number(value.rate) || 0)),
    volume: number('volume', 80, 1, 100),
    output: String(value.output || '').slice(0, 300),
    sayName: value.sayName !== false,
    ignoreCommands: value.ignoreCommands !== false,
    high: list(value.high),
    low: list(value.low),
  };
}
class ReaderQueue {
  constructor({
    speak,
    stop = () => {},
    status = () => {},
    blocked = () => false,
  }) {
    Object.assign(this, { speak, stop, status, blocked });
    this.config = normalizeReader();
    this.queue = [];
    this.count = 0;
    this.lowCount = 0;
    this.busy = false;
    this.last = 0;
    this.generation = 0;
  }
  configure(value) {
    const wasEnabled = this.config.enabled;
    this.config = normalizeReader(value);
    if (!this.config.enabled)
      this.status(
        'Leitor desativado. Escolha a saída e ative para ler novas mensagens.',
      );
    else
      this.status(
        `Leitor ativo · ${this.config.output} · uma a cada ${this.config.every} mensagens`,
      );
    this.queue = this.queue.filter((m) => !this.blocked(m));
    if (!this.config.enabled) {
      if (wasEnabled || this.busy || this.queue.length) this.clear();
    } else this.pump();
  }
  receive(message) {
    const c = this.config;
    if (
      !c.enabled ||
      message.historical ||
      this.blocked(message) ||
      !message.text?.trim() ||
      (c.ignoreCommands && /^\s*[!！]/.test(message.text))
    )
      return;
    const user = nick(message.login || message.user),
      high = c.high.includes(user),
      low = !high && c.low.includes(user);
    if (!high) {
      if (low) {
        if (++this.lowCount % c.lowEvery) {
          if (!this.busy)
            this.status(
              `Baixa prioridade: aguardando ${this.lowCount % c.lowEvery}/${c.lowEvery} mensagens.`,
            );
          return;
        }
      } else if (++this.count % c.every) {
        if (!this.busy)
          this.status(
            `Amostragem: aguardando ${this.count % c.every}/${c.every} mensagens.`,
          );
        return;
      }
    }
    const item = { ...message, priority: high ? 0 : low ? 2 : 1 };
    if (this.queue.length >= 100) {
      const worst = this.queue.findLastIndex(
        (m) => m.priority >= item.priority,
      );
      if (worst < 0) return;
      this.queue.splice(worst, 1);
    }
    this.queue.push(item);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.pump();
  }
  async pump() {
    if (this.busy || !this.config.enabled) return;
    this.queue = this.queue.filter((m) => !this.blocked(m));
    if (!this.queue.length) return;
    const remaining = this.config.interval * 1000 - (Date.now() - this.last);
    if (remaining > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pump(), remaining);
      return;
    }
    const item = this.queue.shift(),
      generation = this.generation;
    this.busy = true;
    try {
      if (!this.config.output)
        throw Error('Escolha uma saída de áudio antes de iniciar a leitura.');
      this.current = item;
      this.status(`Lendo ${item.user} · ${this.queue.length} na fila`);
      await this.speak(item, this.config);
      if (generation === this.generation && this.config.enabled)
        this.status(
          `Leitura concluída · ${item.user} · ${this.queue.length} na fila`,
        );
    } catch (error) {
      this.status(error.message);
    } finally {
      this.current = null;
      this.busy = false;
      if (generation === this.generation) this.last = Date.now();
      this.pump();
    }
  }
  prune() {
    this.queue = this.queue.filter((m) => !this.blocked(m));
    if (this.current && this.blocked(this.current)) this.stop();
  }
  remove(platform, id) {
    this.queue = this.queue.filter(
      (m) => m.platform !== platform || m.id !== id,
    );
    if (this.current?.platform === platform && this.current.id === id)
      this.stop();
  }
  clear() {
    this.generation++;
    clearTimeout(this.timer);
    this.queue = [];
    this.count = 0;
    this.lowCount = 0;
    this.last = 0;
    this.stop();
  }
}
module.exports = { normalizeReader, ReaderQueue };
