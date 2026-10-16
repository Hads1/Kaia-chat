(function (scope) {
  function normalizeTiming(value = {}) {
    const number = (key, fallback, min, max) =>
      Number.isFinite(Number(value?.[key]))
        ? Math.min(max, Math.max(min, Number(value[key])))
        : fallback;
    return {
      enabled: value?.enabled === undefined ? true : !!value.enabled,
      seconds: number('seconds', 120, 1, 86400),
      fadeSeconds: number('fadeSeconds', 2, 0, 10),
    };
  }
  class MessageExpiry {
    constructor({
      now = Date.now,
      schedule = (fn, delay) => setTimeout(fn, delay),
      cancel = (timer) => clearTimeout(timer),
      onFade = () => {},
      onShow = () => {},
      onRemove = () => {},
    } = {}) {
      this.now = now;
      this.schedule = schedule;
      this.cancel = cancel;
      this.onFade = onFade;
      this.onShow = onShow;
      this.onRemove = onRemove;
      this.entries = new Map();
      this.config = normalizeTiming();
    }
    configure(value) {
      this.config = normalizeTiming(value);
      for (const entry of [...this.entries.values()]) this.plan(entry);
    }
    add(key) {
      this.forget(key);
      const entry = { key, createdAt: this.now(), timers: [] };
      this.entries.set(key, entry);
      this.plan(entry);
      return () => this.forget(key);
    }
    forget(key) {
      const entry = this.entries.get(key);
      if (entry) {
        for (const timer of entry.timers) this.cancel(timer);
        this.entries.delete(key);
      }
    }
    clear() {
      for (const key of this.entries.keys()) this.forget(key);
    }
    plan(entry) {
      for (const timer of entry.timers) this.cancel(timer);
      entry.timers = [];
      this.onShow(entry.key);
      if (!this.config.enabled) return;
      const visible = this.config.seconds * 1000,
        fade = this.config.fadeSeconds * 1000,
        elapsed = Math.max(0, this.now() - entry.createdAt);
      const remove = () => {
        if (!this.entries.has(entry.key)) return;
        this.forget(entry.key);
        this.onRemove(entry.key);
      };
      if (elapsed >= visible + fade) {
        remove();
        return;
      }
      const fadeNow = () => {
        if (!this.entries.has(entry.key)) return;
        const remaining = Math.max(
          0,
          visible + fade - (this.now() - entry.createdAt),
        );
        if (remaining === 0) {
          remove();
          return;
        }
        this.onFade(entry.key, remaining / 1000);
      };
      if (elapsed >= visible) fadeNow();
      else entry.timers.push(this.schedule(fadeNow, visible - elapsed));
      entry.timers.push(this.schedule(remove, visible + fade - elapsed));
    }
  }
  const api = { normalizeTiming, MessageExpiry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.KaiaTiming = api;
})(globalThis);
