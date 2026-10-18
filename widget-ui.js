window.selectKaiaTab = (name) => {
  document.body.classList.toggle('widget-tab', name === 'widget');
  document.body.classList.toggle(
    'feature-tab',
    ['reader', 'sr'].includes(name),
  );
  for (const tab of ['chat', 'widget', 'reader', 'sr']) {
    document
      .getElementById('tab-' + tab)
      ?.setAttribute('aria-pressed', String(tab === name));
    if (tab !== 'chat') {
      const panel = document.getElementById(tab + '-panel');
      if (panel) panel.hidden = tab !== name;
    }
  }
};
(() => {
  const el = (id) => document.getElementById(id);
  function tab(widget) {
    window.selectKaiaTab(widget ? 'widget' : 'chat');
  }
  el('tab-chat').onclick = () => tab(false);
  el('tab-widget').onclick = () => tab(true);
  window.kaia.on('settings', (s) => {
    if (s.restore) tab(false);
  });
  window.kaia.load().then((s) => {
    el('widget-url').value = s.widgetUrl;
    el('widget-preview').src = s.widgetUrl;
    el('widget-layout').value = s.widget.layout;
    el('widget-font').value = s.widget.fontSize;
    el('widget-css').value = s.widget.css;
  });
  el('copy-widget').onclick = async () => {
    await window.kaia.copyWidget();
    el('widget-status').textContent =
      'URL copiada. No OBS, use Fonte de navegador e fundo transparente.';
  };
  el('popup-widget').onclick = () => window.kaia.popupWidget();
  el('save-widget').onclick = async () => {
    try {
      const s = await window.kaia.saveWidget({
        layout: el('widget-layout').value,
        fontSize: el('widget-font').value,
        css: el('widget-css').value,
      });
      el('widget-font').value = s.widget.fontSize;
      el('widget-status').textContent =
        'Widget salvo. Prévia e OBS atualizados.';
    } catch (error) {
      el('widget-status').textContent = error.message;
    }
  };
})();
