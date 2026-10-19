const { ipcRenderer } = require('electron');
let poll, observer, timer;
ipcRenderer.on('alerts-config', (_, config) => {
  try {
    document.querySelector(config.selector);
  } catch {
    ipcRenderer.send('alerts-error');
    return;
  }
  clearInterval(poll);
  clearTimeout(timer);
  observer?.disconnect();
  let roots = [],
    previous = '',
    active = null,
    hiddenAt = 0,
    lastHealth = '',
    pending = [];
  const duration =
    Math.max(0, Math.min(300, Number(config.durationSeconds) || 0)) * 1000;
  function visible(e) {
    if (!e.getClientRects().length) return false;
    for (
      let node = e;
      node;
      node = node.parentElement || node.getRootNode()?.host
    ) {
      const css = node.ownerDocument.defaultView.getComputedStyle(node);
      if (
        css.display === 'none' ||
        css.visibility === 'hidden' ||
        Number(css.opacity) === 0
      )
        return false;
    }
    const frame = e.ownerDocument.defaultView.frameElement;
    return !frame || visible(frame);
  }
  function sample(initial = false) {
    roots = [];
    let framesBlocked = 0,
      matches = 0;
    function visit(root) {
      if (roots.length >= 32 || roots.includes(root)) return;
      roots.push(root);
      for (const frame of root.querySelectorAll('iframe')) {
        try {
          if (frame.contentDocument) visit(frame.contentDocument);
          else framesBlocked++;
        } catch {
          framesBlocked++;
        }
      }
      for (const e of root.querySelectorAll('*'))
        if (e.shadowRoot) visit(e.shadowRoot);
    }
    visit(document);
    const parts = [];
    let playing = false;
    for (const root of roots) {
      const nodes = Array.from(root.querySelectorAll(config.selector));
      matches += nodes.length;
      for (const e of nodes.filter(
        (e) => !nodes.some((other) => other !== e && other.contains(e)),
      )) {
        if (!visible(e)) continue;
        const text = (e.innerText || e.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (text && !parts.includes(text)) parts.push(text);
      }
      // Muting the monitoring window does not stop the media clock.
      for (const media of root.querySelectorAll('audio,video'))
        if (!media.paused && !media.ended && media.readyState >= 2)
          playing = true;
    }
    const text = parts.join(' ').slice(0, 600),
      now = Date.now();
    if (initial) {
      previous = text;
      return;
    }
    if (text && text !== previous) {
      if (active && now - active.started > 700) {
        pending.push(active);
        active = null;
      }
      if (!active) active = { text, started: now };
      else active.text = text;
      hiddenAt = 0;
      ipcRenderer.send('alerts-progress', { text, phase: 'waiting' });
    }
    previous = text;
    if (!playing && pending.length) {
      for (const item of pending.filter(
        (item) => now - item.started >= duration,
      ))
        ipcRenderer.send('alerts-text', {
          text: item.text,
          phase: 'finished',
          startedAt: item.started,
          finishedAt: now,
        });
      pending = pending.filter((item) => now - item.started < duration);
    }
    if (active) {
      if (!text && !playing) {
        if (!hiddenAt) hiddenAt = now;
      } else hiddenAt = 0;
      const minimumDone = now - active.started >= duration;
      const disappeared = hiddenAt && now - hiddenAt >= 350;
      // A duration supplied by the user also handles widgets that retain text.
      if (minimumDone && !playing && (disappeared || duration > 0)) {
        ipcRenderer.send('alerts-text', {
          text: active.text,
          phase: 'finished',
          startedAt: active.started,
          finishedAt: now,
        });
        active = null;
        hiddenAt = 0;
      }
    }
    const health = JSON.stringify({ matches, framesBlocked });
    if (health !== lastHealth) {
      lastHealth = health;
      ipcRenderer.send('alerts-health', { matches, framesBlocked });
    }
  }
  sample(true);
  sample();
  observer = new MutationObserver(() => {
    if (!timer)
      timer = setTimeout(() => {
        timer = null;
        sample();
      }, 100);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  });
  poll = setInterval(sample, 100);
});
