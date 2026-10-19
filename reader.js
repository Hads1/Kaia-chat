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
    interval: Number(value.interval) === 0 ? 0 : number('interval', 0, 0, 300),
    maxWait: number('maxWait', 15, 5, 120),
    maxQueue: number('maxQueue', 10, 1, 50),
    maxChars: number('maxChars', 300, 50, 1000),
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
    now = Date.now,
  }) {
    Object.assign(this, { speak, stop, status, blocked, now });
    this.config = normalizeReader();
    this.queue = [];
    this.count = 0;
    this.lowCount = 0;
    this.busy = false;
    this.last = 0;
    this.generation = 0;
    this.discarded = 0;
  }
  fresh() {
    const before = this.queue.length;
    this.queue = this.queue.filter(
      (m) => (m.announcement || !this.blocked(m)) && this.now() < m.expiresAt,
    );
    this.discarded += before - this.queue.length;
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
    this.fresh();
    if (!this.config.enabled) {
      this.queue = this.queue.filter((m) => m.announcement);
      if (this.busy && !this.current?.announcement) this.stop();
      if (!this.queue.length) clearTimeout(this.timer);
      this.pump();
    } else this.pump();
  }
  receive(message) {
    const c = this.config;
    if (
      (!c.enabled && !message.announcement) ||
      message.historical ||
      (!message.announcement && this.blocked(message)) ||
      !message.text?.trim() ||
      (!message.announcement &&
        c.ignoreCommands &&
        /^\s*[!！]/.test(message.text))
    )
      return;
    const user = nick(message.login || message.user),
      high = c.high.includes(user),
      low = !high && c.low.includes(user);
    if (!high && !message.announcement) {
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
    this.fresh();
    const item = {
      ...message,
      text: message.text.slice(0, message.announcement ? 1000 : c.maxChars),
      priority: message.announcement ? -1 : high ? 0 : low ? 2 : 1,
      queuedAt: this.now(),
      expiresAt: this.now() + (message.announcement ? 120 : c.maxWait) * 1000,
    };
    if (this.queue.length >= c.maxQueue) {
      const worst = this.queue.findLastIndex(
        (m) => m.priority >= item.priority,
      );
      if (worst < 0) {
        this.discarded++;
        return;
      }
      const priority = this.queue[worst].priority;
      const oldest = this.queue.findIndex((m) => m.priority === priority);
      this.queue.splice(oldest, 1);
      this.discarded++;
    }
    this.queue.push(item);
    this.queue.sort((a, b) => a.priority - b.priority);
    if (
      message.announcement &&
      this.busy &&
      this.current &&
      !this.current.announcement
    )
      this.stop();
    this.pump();
  }
  async pump() {
    if (
      this.busy ||
      (!this.config.enabled && !this.queue.some((m) => m.announcement))
    )
      return;
    this.fresh();
    if (!this.queue.length) return;
    const remaining = this.queue[0].announcement
      ? 0
      : this.config.interval * 1000 - (this.now() - this.last);
    if (remaining > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pump(), remaining);
      return;
    }
    const item = this.queue.shift(),
      generation = this.generation;
    this.busy = true;
    this.last = this.now();
    try {
      if (!this.config.output)
        throw Error('Escolha uma saída de áudio antes de iniciar a leitura.');
      this.current = item;
      this.status(
        `Preparando voz de ${item.user} · ${this.queue.length} na fila · ${this.discarded} descartadas pelo limite/filtro`,
      );
      await this.speak(item, this.config);
      if (
        generation === this.generation &&
        (this.config.enabled || item.announcement)
      )
        this.status(
          `Leitura concluída · ${item.user} · ${this.queue.length} na fila`,
        );
    } catch (error) {
      this.status(error.message);
      if (
        item.announcement &&
        generation === this.generation &&
        !item.retried &&
        this.now() < item.expiresAt
      ) {
        item.retried = true;
        this.queue.unshift(item);
        this.status('Aviso privado: uma nova tentativa de voz será feita.');
      }
    } finally {
      this.current = null;
      this.busy = false;
      this.pump();
    }
  }
  prune() {
    this.queue = this.queue.filter((m) => m.announcement || !this.blocked(m));
    if (
      this.current &&
      !this.current.announcement &&
      this.blocked(this.current)
    )
      this.stop();
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
    this.discarded = 0;
    this.last = 0;
    this.stop();
  }
}
module.exports = { normalizeReader, ReaderQueue };
