(() => {
  const defaults = {
    theme: 'neon',
    width: 520,
    padding: 20,
    radius: 20,
    titleSize: 22,
    opacity: 85,
    accent: '#4ae8ff',
    background: '#101629',
    text: '#ffffff',
    font: 'Segoe UI',
    showWho: true,
    showTime: true,
    showBar: true,
    customCSS: '',
    rgbMode: 'off',
    rgbSpeed: 10,
    rgbStrength: 55,
    showSpectrum: false,
    spectrumHeight: 64,
    spectrumBars: 24,
    gainBass: 100,
    gainMid: 100,
    gainTreble: 100,
  };
  const presets = {
    neon: { accent: '#4ae8ff', background: '#101629', radius: 20 },
    minimal: {
      accent: '#ffffff',
      background: '#121212',
      radius: 4,
      opacity: 65,
    },
    glass: {
      accent: '#b7c9ff',
      background: '#192d4d',
      radius: 28,
      opacity: 55,
    },
    retro: {
      accent: '#7dff7d',
      background: '#101710',
      radius: 0,
      font: 'Consolas',
    },
    broadcast: { accent: '#ffb54a', background: '#152137', radius: 12 },
  };
  const numeric = {
    width: [200, 1600],
    padding: [0, 80],
    radius: [0, 80],
    titleSize: [12, 80],
    opacity: [0, 100],
    rgbSpeed: [2, 60],
    rgbStrength: [0, 100],
    spectrumHeight: [24, 200],
    spectrumBars: [8, 64],
    gainBass: [0, 200],
    gainMid: [0, 200],
    gainTreble: [0, 200],
  };
  for (const [key, label, type] of [
    ['width', 'Largura (px)', 'number'],
    ['padding', 'Espaçamento (px)', 'number'],
    ['radius', 'Cantos (px)', 'number'],
    ['titleSize', 'Título (px)', 'number'],
    ['opacity', 'Opacidade do fundo (%)', 'number'],
    ['accent', 'Cor de destaque', 'color'],
    ['background', 'Fundo', 'color'],
    ['text', 'Texto', 'color'],
    ['spectrumHeight', 'Altura da soundbar (px)', 'number'],
    ['spectrumBars', 'Quantidade de barras', 'number'],
    ['gainBass', 'Intensidade dos graves (%)', 'number'],
    ['gainMid', 'Intensidade dos médios (%)', 'number'],
    ['gainTreble', 'Intensidade dos agudos (%)', 'number'],
    ['font', 'Fonte', 'text'],
    ['rgbSpeed', 'Ciclo RGB (segundos)', 'number'],
    ['rgbStrength', 'Intensidade da iluminação (%)', 'number'],
  ]) {
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.id = key;
    i.type = type;
    if (numeric[key]) {
      i.min = numeric[key][0];
      i.max = numeric[key][1];
    }
    document.querySelector('#fields').append(l, i);
  }
  let current = { ...defaults };
  const status = (t) => (document.querySelector('#status').textContent = t);
  function paint() {
    for (const k of Object.keys(defaults)) {
      const e = document.getElementById(k);
      if (e.type === 'checkbox') e.checked = current[k];
      else e.value = current[k];
    }
    preview();
  }
  function read() {
    for (const k of Object.keys(defaults)) {
      const e = document.getElementById(k);
      current[k] =
        e.type === 'checkbox'
          ? e.checked
          : numeric[k]
            ? Math.max(
                numeric[k][0],
                Math.min(numeric[k][1], Number(e.value) || 0),
              )
            : e.value;
    }
  }
  function preview() {
    document
      .querySelector('#preview')
      .contentWindow.postMessage(
        { type: 'kaia-sr-preview', layout: current },
        location.origin,
      );
  }
  document.querySelector('#preview').addEventListener('load', preview);
  document.querySelector('.grid').addEventListener('input', () => {
    read();
    preview();
    status('Prévia alterada · salve para aplicar no OBS.');
  });
  document.querySelector('#theme').addEventListener('change', () => {
    current = { ...current, ...presets[current.theme] };
    paint();
  });
  document.querySelector('#save').onclick = async () => {
    read();
    try {
      const r = await fetch('api/sr-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Kaia-Editor': '1' },
        body: JSON.stringify(current),
      });
      if (!r.ok) throw Error();
      current = await r.json();
      paint();
      status('Salvo. O overlay do OBS atualiza em até dois segundos.');
    } catch {
      status(
        'Não foi possível salvar. Reabra a Kaia para carregar o servidor do editor.',
      );
    }
  };
  document.querySelector('#reset').onclick = () => {
    current = { ...defaults, theme: current.theme, ...presets[current.theme] };
    paint();
    status('Modelo restaurado na prévia. Clique Salvar para aplicar.');
  };
  const url = new URL('sr-custom.html', location.href).href;
  document.querySelector('#url').textContent = url;
  document.querySelector('#copy').onclick = () =>
    navigator.clipboard
      .writeText(url)
      .then(() => status('URL copiada.'))
      .catch(() => status('Selecione a URL acima para copiar.'));
  document.querySelector('#open').onclick = () =>
    window.open(url, '_blank', 'noopener');
  document.querySelector('#export').onclick = () => {
    read();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(current, null, 2)], {
        type: 'application/json',
      }),
    );
    a.download = 'kaia-sr-layout.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.querySelector('#import').onclick = () =>
    document.querySelector('#file').click();
  document.querySelector('#file').onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (f.size > 100000) throw Error();
      const d = JSON.parse(await f.text());
      current = {
        ...defaults,
        ...Object.fromEntries(
          Object.keys(defaults)
            .filter((k) => k in d)
            .map((k) => [k, d[k]]),
        ),
      };
      paint();
      status('Importado na prévia. Salve para aplicar.');
    } catch {
      status('Arquivo de layout inválido.');
    }
  };
  fetch('sr_layout.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : defaults))
    .then((d) => {
      current = { ...defaults, ...d };
      paint();
    })
    .catch(paint);
})();
