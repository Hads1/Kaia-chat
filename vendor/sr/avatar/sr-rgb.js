(() => {
  let cfg = { rgbMode: 'off', rgbSpeed: 10, rgbStrength: 55 },
    audio = null,
    level = 0,
    pulse = 0;
  const root = document.documentElement,
    box = document.querySelector('#box');
  document.addEventListener(
    'kaia-sr-layout',
    (e) => (cfg = { ...cfg, ...e.detail }),
  );
  const hash = (s) => {
    let n = 0;
    for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return n % 360;
  };
  async function poll() {
    try {
      const r = await fetch('sr_audio_visual.json?t=' + Date.now(), {
        cache: 'no-store',
      });
      if (r.ok) {
        audio = await r.json();
        if (audio.beat) pulse = 1;
      }
    } catch {}
    setTimeout(poll, 120);
  }
  poll();
  function frame(t) {
    const mode = cfg.rgbMode || 'off',
      strength = Math.max(0, Math.min(1, Number(cfg.rgbStrength) / 100 || 0));
    const srSelected =
      document.querySelector('#lab').textContent.startsWith('SONG REQUEST') &&
      !document.querySelector('#lab').textContent.includes('PAUSADO');
    const fresh =
      audio &&
      (audio.source === 'system_loopback' ||
        (srSelected && audio.source === 'sr_pcm')) &&
      Date.now() / 1000 - audio.quando < 0.7;
    let energy =
      mode === 'audio' && fresh ? Math.max(0, Math.min(1, audio.energy)) : 0;
    level += (energy - level) * 0.15;
    pulse *= 0.92;
    document.body.dataset.audioReactive = fresh ? 'available' : 'unavailable';
    if (mode === 'off') {
      root.style.setProperty('--accent', cfg.accent || '#4ae8ff');
      box.style.boxShadow = '';
      box.style.transform = '';
    } else {
      const speed = Math.max(2, Number(cfg.rgbSpeed) || 10),
        hue =
          mode === 'track'
            ? hash(document.querySelector('#tit').textContent)
            : ((t / 1000 / speed) * 360) % 360;
      root.style.setProperty('--accent', `hsl(${hue},90%,${60 + level * 12}%)`);
      const glow =
        (mode === 'audio' && fresh ? 6 + level * 40 + pulse * 12 : 18) *
        strength;
      box.style.boxShadow = `0 0 ${glow}px hsl(${hue} 95% 60% / ${0.2 + level * 0.45})`;
      box.style.transform =
        mode === 'audio' && fresh
          ? `scale(${1 + level * strength * 0.015})`
          : 'none';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
