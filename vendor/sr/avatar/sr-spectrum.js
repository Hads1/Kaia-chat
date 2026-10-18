(() => {
  let cfg = {
      showSpectrum: false,
      spectrumHeight: 64,
      spectrumBars: 24,
      gainBass: 100,
      gainMid: 100,
      gainTreble: 100,
    },
    data = null,
    levels = [];
  const container = document.createElement('div');
  container.id = 'soundbar';
  const bars = document.createElement('div');
  bars.style.cssText = 'display:flex;align-items:end;gap:3px;height:64px';
  const note = document.createElement('div');
  note.style.cssText = 'font:10px Segoe UI;opacity:.65;margin-top:4px';
  container.append(bars, note);
  document.querySelector('#box').append(container);
  function build() {
    bars.replaceChildren();
    levels = [];
    for (let i = 0; i < cfg.spectrumBars; i++) {
      const b = document.createElement('div');
      b.style.cssText =
        'flex:1;background:var(--accent);border-radius:3px 3px 0 0;min-width:1px;min-height:2px;height:2px';
      bars.append(b);
      levels.push(0);
    }
    bars.style.height = cfg.spectrumHeight + 'px';
    container.style.display = cfg.showSpectrum ? 'block' : 'none';
  }
  document.addEventListener('kaia-sr-layout', (e) => {
    const old = cfg;
    cfg = { ...cfg, ...e.detail };
    if (
      old.spectrumBars !== cfg.spectrumBars ||
      old.spectrumHeight !== cfg.spectrumHeight ||
      old.showSpectrum !== cfg.showSpectrum
    )
      build();
  });
  build();
  async function poll() {
    try {
      const r = await fetch('sr_audio_visual.json?t=' + Date.now(), {
        cache: 'no-store',
      });
      if (r.ok) data = await r.json();
    } catch {}
    setTimeout(poll, 120);
  }
  poll();
  function frame() {
    if (cfg.showSpectrum) {
      const label = document.querySelector('#lab').textContent;
      const fresh =
        data &&
        Date.now() / 1000 - data.quando < 0.7 &&
        (data.source === 'system_loopback' ||
          (label.startsWith('SONG REQUEST') && !label.includes('PAUSADO'))) &&
        data.bands?.length;
      note.textContent = fresh
        ? 'Graves · médios · agudos'
        : 'Sem sinal de áudio medido';
      for (let i = 0; i < levels.length; i++) {
        const index = Math.min(15, Math.floor((i / levels.length) * 16));
        const hz = data?.frequency_edges?.[index] || 100;
        const gain =
          hz < 250 ? cfg.gainBass : hz < 2000 ? cfg.gainMid : cfg.gainTreble;
        const target = fresh
          ? Math.min(1, (data.bands[index] * gain) / 100)
          : 0;
        levels[i] += (target - levels[i]) * 0.18;
        bars.children[i].style.height =
          Math.max(2, levels[i] * cfg.spectrumHeight) + 'px';
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
