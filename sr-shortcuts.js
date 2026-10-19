const ACTIONS = {
  play_pause: 'Alternar play/pausa',
  play: 'Play',
  pause: 'Pausar',
  skip: 'Próxima',
  prev: 'Anterior',
  stop: 'Parar',
};
class SRShortcuts {
  constructor(api, run) {
    this.api = api;
    this.run = run;
    this.active = [];
    this.values = {};
  }
  configure(values = {}) {
    const proposed = {};
    const seen = new Set();
    for (const action of Object.keys(ACTIONS)) {
      const key = String(values[action] || '').trim();
      if (!key) continue;
      if (
        key.length > 80 ||
        !/^(?:(?:CommandOrControl|Control|Ctrl|Alt|Shift|Super)\+)*(?:F(?:[1-9]|1[0-9]|2[0-4])|[A-Z0-9]|Space|Left|Right|Up|Down|Home|End|PageUp|PageDown|MediaPlayPause|MediaNextTrack|MediaPreviousTrack|MediaStop)$/i.test(
          key,
        )
      )
        throw Error('Atalho inválido para ' + ACTIONS[action]);
      if (
        /^(?:Ctrl|Control|CommandOrControl)\+Shift\+F(?:9|10)$/i.test(key) ||
        seen.has(key.toLowerCase())
      )
        throw Error('Atalho duplicado ou reservado para recuperar a janela.');
      seen.add(key.toLowerCase());
      proposed[action] = key;
    }
    const old = { ...this.values };
    this.clear();
    try {
      for (const [action, key] of Object.entries(proposed)) {
        if (
          !this.api.register(key, () =>
            Promise.resolve(this.run(action)).catch(() => {}),
          )
        )
          throw Error('Atalho em uso por outro programa: ' + key);
        this.active.push(key);
      }
      this.values = proposed;
      return proposed;
    } catch (error) {
      this.clear();
      for (const [action, key] of Object.entries(old))
        if (
          this.api.register(key, () =>
            Promise.resolve(this.run(action)).catch(() => {}),
          )
        )
          this.active.push(key);
      this.values = old;
      throw error;
    }
  }
  clear() {
    for (const key of this.active) this.api.unregister(key);
    this.active = [];
  }
}
module.exports = { SRShortcuts, ACTIONS };
