(() => {
  const el = (id) => document.getElementById(id);
  let loaded,
    diagnosing = false;
  const readerKeys = [
    'enabled',
    'every',
    'lowEvery',
    'interval',
    'voice',
    'rate',
    'volume',
    'output',
    'sayName',
    'ignoreCommands',
    'high',
    'low',
  ];
  function readerValue() {
    return Object.fromEntries(
      readerKeys.map((key) => {
        const input = el('reader-' + key);
        return [key, input.type === 'checkbox' ? input.checked : input.value];
      }),
    );
  }
  function applyReader(value) {
    for (const key of readerKeys) {
      const input = el('reader-' + key);
      if (input.type === 'checkbox') input.checked = !!value[key];
      else if (Array.isArray(value[key])) input.value = value[key].join('\n');
      else {
        if (
          input.tagName === 'SELECT' &&
          value[key] &&
          ![...input.options].some((o) => o.value === String(value[key]))
        )
          input.add(new Option(value[key], value[key]));
        input.value = value[key];
      }
    }
  }
  function setOptions(id, values, empty) {
    const select = el(id),
      chosen = select.value;
    select.replaceChildren(new Option(empty, ''));
    for (const value of [...new Set(values)].filter(Boolean))
      select.add(new Option(value, value));
    if (chosen && !values.includes(chosen))
      select.add(new Option(chosen + ' · indisponível', chosen));
    select.value = chosen;
  }
  async function diagnose() {
    if (diagnosing) return;
    diagnosing = true;
    try {
      const info = await window.kaia.diagnoseMedia();
      const outputs = info.outputs.map((d) => d.nome).filter(Boolean);
      setOptions('reader-output', outputs, 'Escolha uma saída de áudio');
      setOptions('sr-output', outputs, 'Saída padrão do Windows');
      setOptions('sr-loopback-output', info.loopbacks, 'Saída padrão');
      el('media-device-status').textContent =
        'Saídas de áudio atualizadas. Selecione a saída da leitura.';
      if (!info.ffmpeg || !info.ffplay)
        el('sr-status').textContent =
          'FFmpeg incompleto; use a distribuição completa.';
    } catch (error) {
      el('reader-status').textContent = error.message;
      el('sr-status').textContent = error.message;
    } finally {
      diagnosing = false;
    }
  }
  async function task(kind, fn) {
    try {
      const result = await fn();
      el(kind + '-status').textContent =
        typeof result === 'string' ? result : 'Concluído.';
      return result;
    } catch (error) {
      el(kind + '-status').textContent = error.message;
    }
  }
  for (const tab of ['reader', 'sr'])
    el('tab-' + tab).onclick = () => {
      window.selectKaiaTab(tab);
      diagnose();
    };
  window.kaia.load().then((s) => {
    loaded = s;
    applyReader(s.reader);
    for (const key of ['enabled', 'volume', 'output', 'repeat', 'shuffle']) {
      const input = el('sr-' + key);
      if (input.type === 'checkbox') input.checked = !!s.sr[key];
      else {
        if (key === 'output' && s.sr.output)
          input.add(new Option(s.sr.output, s.sr.output));
        input.value = s.sr[key];
      }
    }
    el('spotify-client-id').value = s.spotify.clientId;
    el('spotify-client-secret').placeholder = s.spotify.hasSecret
      ? 'Segredo protegido já salvo; vazio mantém o atual'
      : 'Opcional: recomendado usar PKCE sem segredo';
    el('spotify-redirect').value = s.spotify.redirect;
    el('sr-url').value = s.srUrl;
    el('sr-custom-url').value = s.srCustomUrl;
    el('sr-preview').src = s.srCustomUrl;
    spotifyState(s.spotify);
    el('youtube-status').textContent = s.youtubeSession
      ? 'Sessão salva. Use Testar acesso para verificar a conexão atual.'
      : 'Nenhuma sessão do SR salva. Se o YouTube exigir login, clique Conectar YouTube e entre na janela dedicada.';
    if (s.srState) srState(s.srState);
  });
  el('refresh-devices').onclick = diagnose;
  el('save-reader').onclick = () =>
    task('reader', async () => {
      const value = readerValue();
      if (value.enabled && !value.output)
        throw Error('Escolha a saída antes de ativar a leitura.');
      applyReader(await window.kaia.saveReader(value));
      return 'Leitura salva. As próximas mensagens seguirão este fluxo.';
    });
  el('reader-enabled').onchange = async () => {
    if (el('reader-enabled').checked && !el('reader-output').value) {
      el('reader-enabled').checked = false;
      el('reader-status').textContent =
        'Leitor não ativado: escolha a Saída da leitura primeiro.';
      el('reader-output').focus();
      return;
    }
    await el('save-reader').onclick();
  };
  for (const key of readerKeys.filter((key) => key !== 'enabled'))
    el('reader-' + key).onchange = () => el('save-reader').onclick();
  for (const action of ['test', 'clear', 'stop'])
    el('reader-' + action).onclick = () =>
      task('reader', async () => {
        if (action === 'test') {
          if (!el('reader-output').value)
            throw Error('Escolha a Saída da leitura antes de testar a voz.');
          await window.kaia.saveReader(readerValue());
        }
        const result = await window.kaia.readerAction(action);
        if (action === 'stop') el('reader-enabled').checked = false;
        return result;
      });
  el('save-sr').onclick = () =>
    task('sr', async () => {
      await window.kaia.saveSR({
        enabled: el('sr-enabled').checked,
        volume: el('sr-volume').value,
        output: el('sr-output').value,
        repeat: el('sr-repeat').value,
        shuffle: el('sr-shuffle').checked,
      });
      return (
        'SR salvo. ' +
        (el('sr-enabled').checked
          ? 'Pedidos !sr ativos.'
          : 'Pedidos das lives desativados.')
      );
    });
  for (const button of document.querySelectorAll('[data-sr]'))
    button.onclick = () =>
      task('sr', () => window.kaia.srAction(button.dataset.sr, []));
  el('sr-test-audio').onclick = () =>
    task('sr-audio', async () => {
      await window.kaia.saveSR({
        enabled: el('sr-enabled').checked,
        volume: el('sr-volume').value,
        output: el('sr-output').value,
        repeat: el('sr-repeat').value,
        shuffle: el('sr-shuffle').checked,
      });
      return window.kaia.srAction('test-audio', []);
    });
  el('sr-request').onclick = () =>
    task('sr', () =>
      window.kaia.srAction('pedir', ['Operador', el('sr-query').value]),
    );
  el('sr-playlist-add').onclick = () =>
    task('sr', () =>
      window.kaia.srAction('adicionar_playlist', [
        el('sr-playlist').value,
        'Operador',
      ]),
    );
  el('sr-seek-go').onclick = () =>
    task('sr', () =>
      window.kaia.srAction('seek', [
        Math.max(0, Number(el('sr-seek').value) || 0),
      ]),
    );
  function srState(s) {
    window.KaiaMiniPlayer?.update(s);
    el('sr-now').textContent =
      s.titulo ||
      (s.fila?.[0]?.titulo
        ? 'Pedido: ' + s.fila[0].titulo
        : 'Nenhuma música em reprodução');
    el('sr-mute').textContent = s.mutado ? 'Ativar som do SR' : 'Silenciar SR';
    el('sr-mute').setAttribute('aria-pressed', String(!!s.mutado));
    el('sr-mute').title = s.mutado
      ? 'O SR está no mudo, independentemente do volume salvo.'
      : 'Silenciar apenas a música';
    el('sr-progress').textContent = s.tempo || '';
    if (s.erro) el('sr-status').textContent = s.erro;
    function rows(id, items, action) {
      const list = el(id);
      list.replaceChildren();
      (items || []).forEach((item, index) => {
        const row = document.createElement('li'),
          text = document.createElement('span'),
          remove = document.createElement('button');
        text.textContent = `${item.user || ''}: ${item.titulo || item.q || ''}${item.status ? ' · ' + item.status : ''}`;
        remove.textContent = 'Remover';
        remove.onclick = () =>
          task('sr', () => window.kaia.srAction(action, [index]));
        row.append(text, remove);
        list.append(row);
      });
    }
    rows('sr-queue', s.fila, 'remover_fila');
    rows('sr-history', s.historico, 'apagar_historico');
    el('sr-stats').textContent = s.stats ? JSON.stringify(s.stats) : '';
  }
  function spotifyState(s) {
    const current = s.current || {};
    el('spotify-now').textContent = current.titulo
      ? `${current.titulo} · ${current.artista || ''} · ${current.estado || ''}`
      : s.connected
        ? 'Spotify autorizado; aguardando música.'
        : 'Spotify ainda não autorizado.';
  }
  window.kaia.on('sr-state', srState);
  window.kaia.on('spotify-state', spotifyState);
  window.kaia.on('media-status', (s) => {
    const target = el(s.kind + '-status');
    if (target) target.textContent = s.text;
  });
  el('spotify-save').onclick = () =>
    task('spotify', async () => {
      const result = await window.kaia.spotifyAction('save', {
        clientId: el('spotify-client-id').value,
        clientSecret: el('spotify-client-secret').value,
        clearSecret: el('spotify-clear-secret').checked,
      });
      el('spotify-client-secret').value = '';
      el('spotify-clear-secret').checked = false;
      spotifyState(result);
      return 'Credenciais protegidas neste computador. Clique Conectar Spotify.';
    });
  for (const action of ['connect', 'disconnect'])
    el('spotify-' + action).onclick = () =>
      task('spotify', async () => {
        const result = await window.kaia.spotifyAction(action);
        spotifyState(result);
        return action === 'connect'
          ? 'Autorize no navegador e volte ao Kaia Chat.'
          : 'Spotify desconectado.';
      });
  for (const action of ['connect', 'test', 'disconnect'])
    el('youtube-' + action).onclick = () =>
      task('youtube', () => window.kaia.youtubeAction(action));
  for (const button of document.querySelectorAll('[data-media-link]'))
    button.onclick = () => window.kaia.mediaLink(button.dataset.mediaLink);
  for (const button of document.querySelectorAll('[data-sr-open]'))
    button.onclick = () => window.kaia.srOpen(button.dataset.srOpen);
  el('sr-loopback-save').onclick = () =>
    task('sr', () =>
      window.kaia.srLoopback({
        enabled: el('sr-loopback-enabled').checked,
        device: el('sr-loopback-output').value,
      }),
    );
})();
