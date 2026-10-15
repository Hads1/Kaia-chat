const styleKeys = [
  'fontFamily',
  'fontWeight',
  'textColor',
  'preserveNames',
  'shadowEnabled',
  'shadowColor',
  'shadowOpacity',
  'shadowBlur',
  'shadowX',
  'shadowY',
];
const styleDefaults = {
  fontFamily: 'Segoe UI',
  fontWeight: 600,
  textColor: '#f0f1f7',
  preserveNames: true,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOpacity: 85,
  shadowBlur: 3,
  shadowX: 0,
  shadowY: 1,
};
function readStyle() {
  return Object.fromEntries(
    styleKeys.map((k) => {
      const e = document.getElementById(k);
      return [
        k,
        e.type === 'checkbox'
          ? e.checked
          : e.type === 'range' || k === 'fontWeight'
            ? Number(e.value)
            : e.value,
      ];
    }),
  );
}
function setStyle(style) {
  for (const [k, v] of Object.entries({ ...styleDefaults, ...style })) {
    const e = document.getElementById(k);
    if (!e) continue;
    if (k === 'fontFamily' && ![...e.options].some((o) => o.value === v))
      e.add(new Option(v + ' (se instalada)', v));
    if (e.type === 'checkbox') e.checked = v;
    else e.value = v;
  }
  renderStyle();
}
function renderStyle() {
  const s = readStyle(),
    root = document.documentElement;
  root.style.setProperty(
    '--chat-family',
    JSON.stringify(s.fontFamily) + ', "Segoe UI", sans-serif',
  );
  root.style.setProperty('--chat-color', s.textColor);
  root.style.setProperty('--chat-weight', s.fontWeight);
  const rgb = s.shadowColor.match(/\w\w/g).map((n) => parseInt(n, 16));
  root.style.setProperty(
    '--chat-shadow',
    s.shadowEnabled
      ? `${s.shadowX}px ${s.shadowY}px ${s.shadowBlur}px rgba(${rgb.join(',')},${s.shadowOpacity / 100})`
      : 'none',
  );
  document.body.classList.toggle('uniform-names', !s.preserveNames);
  for (const k of ['shadowOpacity', 'shadowBlur', 'shadowX', 'shadowY'])
    document.querySelector(`[data-value="${k}"]`).textContent =
      s[k] + (k === 'shadowOpacity' ? '%' : ' px');
  for (const el of document.querySelectorAll('.shadow-control input'))
    el.disabled = !s.shadowEnabled;
  const size = document.getElementById('fontSize');
  document.getElementById('size-value').textContent = size.value + ' px';
}
for (const key of styleKeys)
  document.getElementById(key).addEventListener('input', renderStyle);
document.getElementById('fontSize').addEventListener('input', renderStyle);
const presets = {
  classic: styleDefaults,
  contrast: {
    ...styleDefaults,
    fontWeight: 800,
    textColor: '#ffffff',
    shadowBlur: 2,
    shadowOpacity: 100,
    shadowY: 2,
  },
  neon: {
    ...styleDefaults,
    textColor: '#d6c4ff',
    shadowColor: '#8a46ff',
    shadowOpacity: 90,
    shadowBlur: 12,
    shadowY: 0,
  },
};
for (const button of document.querySelectorAll('[data-preset]'))
  button.onclick = () =>
    setStyle({
      ...readStyle(),
      ...presets[button.dataset.preset],
      fontFamily: readStyle().fontFamily,
    });
document.getElementById('save-style').onclick = async () => {
  const status = document.getElementById('style-status');
  try {
    const s = await window.kaia.saveAppearance({
      appearance: readStyle(),
      fontSize: Number(document.getElementById('fontSize').value),
      background: Number(document.getElementById('background').value),
    });
    settings.appearance = s.appearance;
    settings.fontSize = s.fontSize;
    settings.background = s.background;
    status.textContent = 'Aparência salva. Chats continuam conectados.';
  } catch (e) {
    status.textContent = 'Não foi possível salvar: ' + e.message;
  }
};
