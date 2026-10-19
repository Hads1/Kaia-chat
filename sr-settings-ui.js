(() => {
  const el = (id) => document.getElementById(id);
  const actions = {
    play_pause: 'Alternar play/pausa',
    play: 'Play',
    pause: 'Pausar',
    skip: 'Próxima',
    prev: 'Anterior',
    stop: 'Parar',
  };
  const inputs = {};
  for (const [action, title] of Object.entries(actions)) {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.placeholder = 'Ctrl+Alt+F6';
    input.type = 'text';
    inputs[action] = input;
    input.onkeydown = (e) => {
      e.preventDefault();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        input.value = '';
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      const key = e.code.startsWith('Key')
        ? e.code.slice(3)
        : e.code.startsWith('Digit')
          ? e.code.slice(5)
          : e.key === ' '
            ? 'Space'
            : e.key.replace(/^Arrow/, '');
      input.value = [
        e.ctrlKey ? 'Ctrl' : '',
        e.altKey ? 'Alt' : '',
        e.shiftKey ? 'Shift' : '',
        e.metaKey ? 'Super' : '',
        key,
      ]
        .filter(Boolean)
        .join('+');
    };
    label.append(input);
    el('sr-shortcuts').append(label);
  }
  el('save-sr-shortcuts').onclick = async () => {
    try {
      await window.kaia.saveSRShortcuts(
        Object.fromEntries(
          Object.entries(inputs).map(([k, v]) => [k, v.value]),
        ),
      );
      el('sr-shortcuts-status').textContent = 'Atalhos globais salvos.';
    } catch (e) {
      el('sr-shortcuts-status').textContent = e.message;
    }
  };
  window.kaia.load().then((s) => {
    for (const [action, input] of Object.entries(inputs))
      input.value = s.srShortcuts?.[action] || '';
  });
  const task = async (action, args) => {
    try {
      const result = await window.kaia.srAction(action, args);
      el('sr-status').textContent = String(result || 'Concluído.');
    } catch (e) {
      el('sr-status').textContent = e.message;
    }
  };
  el('sr-clear-requests').onclick = () => task('edit_queue', ['sr', 'clear']);
  el('sr-clear-playlist').onclick = () =>
    task('edit_queue', ['playlist', 'clear']);
  el('sr-add-background').onclick = () =>
    task('pedir', ['Operador', el('sr-query').value, 'playlist']);
})();
