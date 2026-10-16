const crypto = require('node:crypto');
function field(object, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce(
      (value, key) =>
        value &&
        Object.hasOwn(value, key) &&
        !['__proto__', 'prototype', 'constructor'].includes(key)
          ? value[key]
          : undefined,
      object,
    );
}
function normalizeCustom(input = {}) {
  const value = {
    enabled: !!input.enabled,
    name: String(input.name || 'Personalizado')
      .replace(/[\r\n]/g, ' ')
      .trim()
      .slice(0, 40),
    channel: String(input.channel || '')
      .trim()
      .slice(0, 100),
    url: String(input.url || '').trim(),
    pollSeconds: Math.min(60, Math.max(2, Number(input.pollSeconds) || 3)),
  };
  for (const [key, fallback] of Object.entries({
    itemsPath: 'messages',
    userPath: 'username',
    textPath: 'text',
    idPath: 'id',
  })) {
    value[key] = String(input[key] ?? fallback).trim();
    if (value[key] && !/^[a-zA-Z0-9_.]+$/.test(value[key]))
      throw Error('Use campos JSON separados por ponto, sem código.');
  }
  if (value.url) {
    const url = new URL(
      value.url.replaceAll('{channel}', encodeURIComponent(value.channel)),
    );
    if (
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw Error('Use uma API HTTPS pública ou HTTP local, sem senha na URL.');
  } else if (value.enabled)
    throw Error('Informe o endereço da API JSON da plataforma personalizada.');
  return value;
}
function decodeMessages(data, config) {
  const rows = field(data, config.itemsPath);
  if (!Array.isArray(rows))
    throw Error('O campo da lista de mensagens não contém um array JSON.');
  return rows
    .slice(-500)
    .map((row) => {
      const id = field(row, config.idPath),
        user = field(row, config.userPath),
        text = field(row, config.textPath);
      if ((typeof id !== 'string' && typeof id !== 'number') || id === '')
        throw Error('A API precisa fornecer um ID único para cada mensagem.');
      if (typeof text !== 'string' || typeof user !== 'string') return null;
      return {
        platform: 'custom',
        platformName: config.name,
        id: crypto
          .createHash('sha256')
          .update(config.url + '|' + config.channel + '|' + id)
          .digest('hex'),
        login: user,
        user,
        text,
        color: '#ffb38a',
      };
    })
    .filter(Boolean);
}
function connectCustom(options, emit) {
  const config = normalizeCustom(options);
  let stopped = false,
    timer,
    first = true,
    delay = config.pollSeconds * 1000;
  const controller = new AbortController(),
    seen = new Set();
  const poll = async () => {
    if (stopped) return;
    try {
      const response = await fetch(
        config.url.replaceAll('{channel}', encodeURIComponent(config.channel)),
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!response.ok)
        throw Error(`API personalizada HTTP ${response.status}`);
      const raw = await response.text();
      if (raw.length > 2_000_000)
        throw Error('A API retornou uma resposta muito grande.');
      const messages = decodeMessages(JSON.parse(raw), config);
      if (stopped) return;
      for (const m of messages)
        if (!seen.has(m.id)) {
          seen.add(m.id);
          if (seen.size > 3000) seen.delete(seen.values().next().value);
          emit('message', { ...m, historical: first });
        }
      first = false;
      delay = config.pollSeconds * 1000;
      emit('status', {
        platform: 'custom',
        text: 'Lendo ' + config.name,
        state: 'ok',
      });
    } catch (e) {
      if (stopped) return;
      emit('status', {
        platform: 'custom',
        text: e.message + '; tentando novamente…',
        state: 'error',
      });
      delay = Math.min(Math.max(3000, delay * 2), 60000);
    }
    if (!stopped) timer = setTimeout(poll, delay);
  };
  poll();
  return () => {
    stopped = true;
    controller.abort();
    clearTimeout(timer);
  };
}
module.exports = { normalizeCustom, decodeMessages, connectCustom };
