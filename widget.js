const feed = document.getElementById('feed');
let config,
  emotes = {},
  messages = [];
function image(url, alt) {
  const img = document.createElement('img');
  try {
    if (new URL(url).protocol !== 'https:') return document.createTextNode(alt);
  } catch {
    return document.createTextNode(alt);
  }
  img.src = url;
  img.alt = alt;
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => img.replaceWith(document.createTextNode(alt));
  return img;
}
function render(m) {
  const row = document.createElement('div');
  row.className = 'message';
  row.dataset.platform = m.platform;
  row.dataset.id = m.id || '';
  const badge = document.createElement('span');
  badge.className = 'platform';
  badge.textContent = m.platformName || m.platform;
  const user = document.createElement('span');
  user.className = 'user';
  user.textContent = m.user + ': ';
  if (
    /^#[a-f0-9]{6}$/i.test(m.color) &&
    config.appearance?.preserveNames !== false
  )
    user.style.color = m.color;
  const text = document.createElement('span');
  text.className = 'message-text';
  const chars = Array.from(m.text || '');
  const ranges = [];
  for (const group of (m.platform === 'twitch'
    ? String(m.emotes || '')
    : ''
  ).split('/')) {
    const [id, positions] = group.split(':');
    for (const position of (positions || '').split(',')) {
      const [start, end] = position.split('-').map(Number);
      if (
        Number.isInteger(start) &&
        start >= 0 &&
        end >= start &&
        end < chars.length
      )
        ranges.push({
          start,
          end,
          url: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`,
        });
    }
  }
  function words(value) {
    for (const part of value.split(
      /(\[emote:\d+:[^\]]+\]|:[a-zA-Z0-9_]{2,20}:|\s+)/,
    )) {
      const native = /^\[emote:(\d+):([^\]]+)\]$/.exec(part);
      const url = native
        ? `https://files.kick.com/emotes/${native[1]}/fullsize`
        : emotes[m.platform]?.[
            m.platform === 'starvios' ? part.toLowerCase() : part
          ];
      text.append(
        url ? image(url, native?.[2] || part) : document.createTextNode(part),
      );
    }
  }
  let offset = 0;
  for (const r of ranges.sort((a, b) => a.start - b.start)) {
    if (r.start < offset) continue;
    words(chars.slice(offset, r.start).join(''));
    text.append(image(r.url, chars.slice(r.start, r.end + 1).join('')));
    offset = r.end + 1;
  }
  words(chars.slice(offset).join(''));
  row.append(badge, user, text);
  feed.append(row);
  return row;
}
function refresh() {
  if (!config) return;
  const t = config.timing,
    now = Date.now();
  messages = messages.filter(
    (m) =>
      !t.enabled || now - m.widgetTime < (t.seconds + t.fadeSeconds) * 1000,
  );
  feed.replaceChildren();
  for (const m of messages) {
    const row = render(m),
      elapsed = (now - m.widgetTime) / 1000;
    if (t.enabled && elapsed >= t.seconds)
      row.style.opacity = String(
        Math.max(0, 1 - (elapsed - t.seconds) / (t.fadeSeconds || 0.001)),
      );
  }
}
function configure(value) {
  config = value;
  document.body.dataset.layout = config.widget.layout;
  document.body.style.fontSize = config.widget.fontSize + 'px';
  const a = config.appearance;
  if (a) {
    document.body.style.fontFamily = `${JSON.stringify(a.fontFamily)}, sans-serif`;
    document.body.style.fontWeight = a.fontWeight;
    document.body.style.color = a.textColor;
    document.body.style.textShadow = a.shadowEnabled
      ? `${a.shadowX}px ${a.shadowY}px ${a.shadowBlur}px ${a.shadowColor}${Math.round(
          a.shadowOpacity * 2.55,
        )
          .toString(16)
          .padStart(2, '0')}`
      : 'none';
  }
  document.getElementById('custom-css').textContent = config.widget.css;
  refresh();
}
const source = new EventSource('events');
source.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'snapshot') {
    emotes = data.emotes;
    messages = data.messages;
    configure(data.config);
  }
  if (type === 'config') configure(data);
  if (type === 'emotes') {
    emotes[data.platform] = data.items;
    refresh();
  }
  if (type === 'message') {
    messages.push(data);
    messages = messages.slice(-300);
    refresh();
  }
  if (type === 'reset') {
    messages = data;
    refresh();
  }
  if (type === 'remove') {
    messages = messages.filter(
      (m) => m.platform !== data.platform || m.id !== data.id,
    );
    refresh();
  }
};
setInterval(() => {
  if (!config) return;
  const t = config.timing,
    now = Date.now();
  for (let i = messages.length - 1; i >= 0; i--) {
    const elapsed = (now - messages[i].widgetTime) / 1000,
      row = feed.children[i];
    if (!row) continue;
    if (t.enabled && elapsed >= t.seconds + t.fadeSeconds) {
      row.remove();
      messages.splice(i, 1);
    } else
      row.style.opacity =
        t.enabled && elapsed >= t.seconds
          ? String(
              Math.max(0, 1 - (elapsed - t.seconds) / (t.fadeSeconds || 0.001)),
            )
          : '';
  }
}, 100);
