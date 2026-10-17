(() => {
  const button = document.getElementById('fullscreen');
  function state(value) {
    if (!value) return;
    button.title = value.active
      ? 'Restaurar janela (F11 ou Esc)'
      : 'Maximizar janela (F11)';
    button.setAttribute(
      'aria-label',
      value.active ? 'Restaurar janela' : 'Maximizar janela',
    );
    button.setAttribute('aria-pressed', String(value.active));
    document.body.classList.toggle('fullscreen', value.active);
    document.body.classList.toggle('snapped', !!value.snapped);
  }
  window.kaia.on('display-state', state);
  window.kaia.load().then((s) => state(s.displayState));
  button.onclick = () => window.kaia.display('toggle');
})();
