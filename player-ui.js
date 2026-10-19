(() => {
  const el = (id) => document.getElementById(id);
  let state = { repeat: 'off' },
    received = 0,
    seeking = false;
  const paths = {
    play: 'M8 5v14l11-7z',
    pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    prev: 'M5 5h2v14H5zM19 5v14L8 12z',
    next: 'M17 5h2v14h-2zM5 5v14l11-7z',
    repeat:
      'M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3v2H2v-2a5 5 0 0 1 5-5h10zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3v-2h2v2a5 5 0 0 1-5 5H7z',
  };
  function icon(button, name) {
    button.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(svg.namespaceURI, 'path');
    p.setAttribute('d', paths[name]);
    svg.append(p);
    button.append(svg);
  }
  function time(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return (
      Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
    );
  }
  async function action(name, args = []) {
    try {
      await window.kaia.srAction(name, args);
    } catch (error) {
      state.erro = error.message;
      el('chat-sr-status').textContent = error.message;
      el('sr-status').textContent = error.message;
    }
  }
  function timeline(prefix, value, duration, enabled) {
    const slider = el(prefix + '-timeline');
    if (!slider) return;
    slider.max = String(Math.max(1, duration));
    if (!seeking) slider.value = String(Math.min(value, duration || 0));
    slider.disabled = !enabled;
    el(prefix + '-time').textContent =
      time(value) + ' / ' + (duration ? time(duration) : '--:--');
  }
  function paint() {
    const fallback = state.fila?.[0],
      playing = !!state.tocando && !state.paused;
    let position = Number(state.elapsed) || 0;
    if (playing)
      position += Math.min(3, Math.max(0, (Date.now() - received) / 1000));
    const duration = Number(state.dur || fallback?.dur) || 0;
    position = duration ? Math.min(position, duration) : position;
    const title = state.titulo || fallback?.titulo || 'SR · nenhuma música';
    el('chat-sr-title').textContent = title;
    el('chat-sr-title').toggleAttribute(
      'data-i18n-ignore',
      !!(state.titulo || fallback?.titulo),
    );
    el('chat-sr-requester').textContent =
      state.titulo && state.user ? 'Solicitado por ' + state.user : '';
    el('chat-sr-status').textContent =
      (state.mutado ? 'SR no mudo · ative o som na aba SR. ' : '') +
      (state.erro ||
        (playing
          ? 'Reproduzindo'
          : state.paused && state.titulo
            ? 'Pausado'
            : state.estado === 'loading'
              ? 'Buscando áudio…'
              : 'Aguardando pedido !sr'));
    icon(el('chat-sr-play'), playing ? 'pause' : 'play');
    el('chat-sr-play').setAttribute(
      'aria-label',
      playing ? 'Pausar música' : 'Reproduzir música',
    );
    el('chat-sr-play').title = playing
      ? 'Pausar música'
      : 'Reproduzir / tentar novamente';
    el('chat-sr-repeat').setAttribute(
      'aria-pressed',
      String(state.repeat && state.repeat !== 'off'),
    );
    el('chat-sr-repeat').title =
      'Repetir: ' +
      ({ off: 'desligado', one: 'faixa atual', playlist: 'playlist' }[
        state.repeat
      ] || 'desligado');
    if (el('sr-repeat')) el('sr-repeat').value = state.repeat || 'off';
    timeline(
      'chat-sr',
      position,
      duration,
      !!state.titulo && duration > 0 && state.estado !== 'error',
    );
    timeline(
      'sr',
      position,
      duration,
      !!state.titulo && duration > 0 && state.estado !== 'error',
    );
  }
  for (const [id, name] of [
    ['prev', 'prev'],
    ['play', 'play'],
    ['next', 'next'],
    ['repeat', 'repeat'],
  ])
    icon(el('chat-sr-' + id), name);
  el('chat-sr-prev').onclick = () => action('prev');
  el('chat-sr-next').onclick = () => action('skip');
  el('chat-sr-play').onclick = () => action('play_pause');
  el('chat-sr-repeat').onclick = () =>
    action('set_repeat', [
      state.repeat === 'off'
        ? 'one'
        : state.repeat === 'one'
          ? 'playlist'
          : 'off',
    ]);
  for (const prefix of ['chat-sr', 'sr']) {
    const slider = el(prefix + '-timeline');
    slider.oninput = () => {
      seeking = true;
      el(prefix + '-time').textContent =
        time(slider.value) + ' / ' + time(slider.max);
    };
    slider.onchange = async () => {
      const position = Number(slider.value) || 0;
      await action('seek', [position]);
      state.elapsed = position;
      received = Date.now();
      seeking = false;
      paint();
    };
  }
  window.KaiaMiniPlayer = {
    update(value) {
      state = value || {};
      received = Date.now();
      paint();
    },
  };
  window.kaia.on('sr-state', window.KaiaMiniPlayer.update);
  window.kaia.on('media-status', (event) => {
    if (event.kind === 'reader')
      el('chat-reader-status').textContent = event.text;
    if (event.kind === 'sr' && event.text)
      el('chat-sr-status').textContent = event.text;
  });
  window.kaia.load().then((s) => {
    if (s.srState) window.KaiaMiniPlayer.update(s.srState);
    el('chat-reader-status').textContent = s.reader.enabled
      ? 'Leitor ativo · ' + s.reader.output
      : 'Leitor desativado';
  });
  setInterval(paint, 250);
  paint();
})();
