(() => {
  const root = document.documentElement;
  function apply(c) {
    document.dispatchEvent(new CustomEvent('kaia-sr-layout', { detail: c }));
    document.body.dataset.theme = c.theme;
    root.style.setProperty('--width', c.width + 'px');
    root.style.setProperty('--padding', c.padding + 'px');
    root.style.setProperty('--radius', c.radius + 'px');
    root.style.setProperty('--title-size', c.titleSize + 'px');
    root.style.setProperty('--accent', c.accent);
    root.style.setProperty('--text', c.text);
    root.style.setProperty('--font', c.font);
    const hex = c.background || '#101629';
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    root.style.setProperty('--bg', `rgba(${rgb.join(',')},${c.opacity / 100})`);
    for (const [key, cls] of [
      ['showWho', 'hide-who'],
      ['showTime', 'hide-time'],
      ['showBar', 'hide-bar'],
    ])
      document.body.classList.toggle(cls, !c[key]);
    document.querySelector('#custom-css').textContent = c.customCSS || '';
  }
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data?.type === 'kaia-sr-preview')
      apply(e.data.layout);
  });
  async function tick() {
    try {
      const r = await fetch('sr_layout.json?t=' + Date.now(), {
        cache: 'no-store',
      });
      if (r.ok) apply(await r.json());
    } catch {}
    setTimeout(tick, 2000);
  }
  if (!new URLSearchParams(location.search).has('preview')) tick();
})();
