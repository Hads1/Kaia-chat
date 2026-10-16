const $ = (s) => document.querySelector(s);
let settings;
const messageExpiry = new KaiaTiming.MessageExpiry({
  onFade: (row, seconds) => {
    row.style.transition = `opacity ${seconds}s linear`;
    row.classList.add('message-fading');
  },
  onShow: (row) => {
    row.style.transition = 'none';
    row.classList.remove('message-fading');
  },
  onRemove: (row) => row.remove(),
});
const maps = { twitch: {}, kick: {}, starvios: {}, custom: {} },
  seen = new Set(),
  audio = {
    twitch: new Audio(),
    kick: new Audio(),
    starvios: new Audio(),
    custom: new Audio(),
  },
  lastSound = { twitch: 0, kick: 0, starvios: 0, custom: 0 };
for (const p of ['twitch', 'kick', 'starvios', 'custom']) {
  const card = document.createElement('div');
  card.className = `card ${p}`;
  card.innerHTML = `<div class="card-top"><span class="name">${{ kick: 'KICK', twitch: 'TWITCH', starvios: 'STARVIOS', custom: 'PERSONALIZADO' }[p]}</span><label><input id="${p}-enabled" type="checkbox" aria-label="Ativar ${p}"> Ativar</label></div><input class="channel" id="${p}-channel" type="text" placeholder="Nome do canal ou link" aria-label="Canal ${p}"><div class="audio"><select id="${p}-sound" aria-label="Som ${p}"></select><button id="${p}-choose">Arquivo…</button><button id="${p}-test">▶ Testar</button></div><label class="volume">Volume <input id="${p}-volume" type="range" min="0" max="1" step="0.05"></label><small id="${p}-emotes" class="help">${p === 'custom' ? 'Mensagens em texto pela API JSON' : 'Emotes aguardando conexão'}</small>`;
  $('#platforms').append(card);
  if (p === 'custom') installCustomControls(card);
  $(`#${p}-choose`).onclick = async () => {
    const f = await window.kaia.choose(p);
    if (f) {
      const o = new Option(f.path.split(/[\\/]/).pop(), f.path);
      $(`#${p}-sound`).add(o);
      o.dataset.url = f.url;
      o.selected = true;
      audio[p].src = f.url;
    }
  };
  $(`#${p}-test`).onclick = () => play(p, true);
  $(`#${p}-sound`).onchange = () => {
    const value = $(`#${p}-sound`).value;
    audio[p].src =
      $(`#${p}-sound`).selectedOptions[0]?.dataset.url || settings.soundUrls[p];
    if (settings.soundFiles.includes(value))
      audio[p].src = new URL(
        `assets/${encodeURIComponent(value)}`,
        location.href,
      ).href;
  };
}
function apply(s) {
  settings = s;
  setBlockedUsers(s.blockedUsers);
  setTiming(s.timing);
  messageExpiry.configure(s.timing);
  setCustomFields(s.custom);
  $('#transcript-path').value = s.transcriptPath || '';
  for (const p of ['kick', 'twitch', 'starvios', 'custom']) {
    $(`#${p}-enabled`).checked = s[p].enabled;
    $(`#${p}-channel`).value = s[p].channel;
    $(`#${p}-volume`).value = s[p].volume;
    const select = $(`#${p}-sound`);
    select.replaceChildren();
    for (const file of s.soundFiles) select.add(new Option(file, file));
    if (!s.soundFiles.includes(s[p].sound))
      select.add(new Option(s[p].sound.split(/[\\/]/).pop(), s[p].sound));
    select.value = s[p].sound;
    audio[p].src = s.soundUrls[p];
  }
  $('#background').value = s.background;
  $('#fontSize').value = s.fontSize;
  $('#sounds').checked = s.sounds;
  const fonts = $('#fontFamily');
  fonts.replaceChildren();
  for (const name of s.fonts || ['Segoe UI']) fonts.add(new Option(name, name));
  setStyle(s.appearance);
  appearance();
}
function appearance() {
  document.documentElement.style.setProperty(
    '--background',
    $('#background').value,
  );
  document.documentElement.style.setProperty(
    '--font',
    $('#fontSize').value + 'px',
  );
}
$('#background').oninput = appearance;
$('#fontSize').oninput = appearance;
async function play(p, force = false) {
  if (!force && !$('#sounds').checked) return;
  const now = Date.now();
  if (!force && now - lastSound[p] < 500) return;
  lastSound[p] = now;
  audio[p].volume = Number($(`#${p}-volume`).value);
  audio[p].currentTime = 0;
  try {
    await audio[p].play();
  } catch {
    if (force)
      $('#error').textContent =
        'Não foi possível reproduzir este arquivo de áudio.';
  }
}
$('#connect').onclick = async () => {
  try {
    const s = {
      background: +$('#background').value,
      fontSize: +$('#fontSize').value,
      sounds: $('#sounds').checked,
      appearance: readStyle(),
      blockedUsers: readBlockedUsers(),
      timing: readTiming(),
    };
    for (const p of ['kick', 'twitch', 'starvios', 'custom'])
      s[p] = {
        enabled: $(`#${p}-enabled`).checked,
        channel: $(`#${p}-channel`).value,
        sound: $(`#${p}-sound`).value,
        volume: +$(`#${p}-volume`).value,
      };
    Object.assign(s.custom, readCustomFields());
    const saved = await window.kaia.save(s);
    maps.twitch = {};
    maps.kick = {};
    maps.starvios = {};
    maps.custom = {};
    seen.clear();
    apply(saved);
    $('#error').textContent = '';
  } catch (e) {
    $('#error').textContent = e.message;
  }
};
function image(url, alt) {
  const img = document.createElement('img');
  img.className = 'emote';
  img.alt = alt;
  img.title = alt;
  img.src = url;
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => img.replaceWith(document.createTextNode(alt));
  return img;
}
function renderText(m, node) {
  const text = String(m.text || '');
  const chars = Array.from(text),
    ranges = [];
  if (m.platform === 'twitch' && m.emotes)
    for (const group of m.emotes.split('/')) {
      const [id, positions] = group.split(':');
      if (!/^[a-zA-Z0-9_\-]+$/.test(id)) continue;
      for (const pos of (positions || '').split(',')) {
        const [start, end] = pos.split('-').map(Number);
        if (
          Number.isInteger(start) &&
          Number.isInteger(end) &&
          start >= 0 &&
          end >= start &&
          end < chars.length
        )
          ranges.push({
            start,
            end,
            url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`,
            alt: chars.slice(start, end + 1).join(''),
          });
      }
    }
  function words(t) {
    if (m.platform === 'kick') {
      let last = 0;
      const re = /\[emote:(\d+):([^\]]+)\]/g;
      for (const match of t.matchAll(re)) {
        external(t.slice(last, match.index));
        node.append(
          image(`https://files.kick.com/emotes/${match[1]}/fullsize`, match[2]),
        );
        last = match.index + match[0].length;
      }
      external(t.slice(last));
    } else external(t);
  }
  function external(t) {
    for (const word of t.split(
      m.platform === 'starvios' ? /(:[a-zA-Z0-9_]{2,20}:|\s+)/ : /(\s+)/,
    )) {
      const url =
        maps[m.platform][m.platform === 'starvios' ? word.toLowerCase() : word];
      node.append(url ? image(url, word) : document.createTextNode(word));
    }
  }
  let offset = 0;
  for (const r of ranges.sort((a, b) => a.start - b.start)) {
    if (r.start < offset) continue;
    words(chars.slice(offset, r.start).join(''));
    node.append(image(r.url, r.alt));
    offset = r.end + 1;
  }
  words(chars.slice(offset).join(''));
}
window.kaia.on('message', (m) => {
  if (KaiaBlocking.isBlocked(activeBlockedUsers, m.platform, m.login || m.user))
    return;
  const key = m.platform + ':' + m.id;
  if (m.id && seen.has(key)) return;
  if (m.id) {
    seen.add(key);
    if (seen.size > 2000) seen.delete(seen.values().next().value);
  }
  $('#empty')?.remove();
  const feed = $('#feed'),
    nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 70;
  const row = document.createElement('div');
  row.className = 'message';
  row.dataset.platform = m.platform;
  row.dataset.messageId = m.id || '';
  row.dataset.login = m.login || m.user;
  const badge = document.createElement('span');
  badge.className = 'platform ' + m.platform;
  badge.textContent = { kick: 'K', twitch: 'T', starvios: 'S', custom: 'C' }[
    m.platform
  ];
  badge.title = m.platformName || m.platform;
  const user = document.createElement('span');
  user.className = 'user';
  user.textContent = m.user + ': ';
  if (/^#[a-f0-9]{6}$/i.test(m.color)) user.style.color = m.color;
  row.append(badge, user);
  renderText(m, row);
  feed.append(row);
  row.cancelExpiry = messageExpiry.add(row);
  while (feed.children.length > 300) {
    feed.firstElementChild.cancelExpiry?.();
    feed.firstElementChild.remove();
  }
  if (nearBottom) feed.scrollTop = feed.scrollHeight;
  if (!m.historical) play(m.platform);
});
window.kaia.on('status', (s) => {
  const el = $(`#${s.platform}-status`);
  el.textContent =
    {
      kick: 'Kick',
      twitch: 'Twitch',
      starvios: 'Starvios',
      custom: settings?.custom?.name || 'Personalizado',
    }[s.platform] +
    ' · ' +
    s.text;
  el.className = s.state;
});
window.kaia.on('emotes', (s) => {
  maps[s.platform] = s.items;
  $(`#${s.platform}-emotes`).textContent =
    `${s.count} emotes externos${s.failed ? ' · alguns serviços indisponíveis' : ''}`;
});
window.kaia.on('settings', (s) => {
  if ('collapsed' in s)
    document.body.classList.toggle('settings-collapsed', s.collapsed);
  if ('overlay' in s) {
    document.body.classList.toggle('overlay', s.overlay);
    if (s.overlay) {
      const feed = document.getElementById('feed');
      feed.scrollTop = feed.scrollHeight;
    }
  }
  if (s.clear) {
    messageExpiry.clear();
    $('#feed').replaceChildren();
    seen.clear();
  }
});
for (const a of ['close', 'minimize', 'clear', 'hide'])
  $('#' + a).onclick = () => window.kaia.window(a);
$('#settings-toggle').onclick = () => window.kaia.window('settings');
window.kaia.load().then(apply);

window.kaia.on('remove', (s) => {
  for (const row of document.querySelectorAll('.message'))
    if (row.dataset.platform === s.platform && row.dataset.messageId === s.id) {
      row.cancelExpiry?.();
      row.remove();
    }
});
