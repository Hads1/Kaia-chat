const WebSocket = require('ws');
async function discover() {
  const response = await fetch('https://starvios.com/', {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Starvios indisponível');
  const html = await response.text();
  const asset = html.match(/(?:href|src)="(\/assets\/client-[\w-]+\.js)"/)?.[1];
  if (!asset) throw Error('Starvios mudou a configuração pública');
  const js = await fetch('https://starvios.com' + asset, {
    signal: AbortSignal.timeout(15000),
  }).then((r) => {
    if (!r.ok) throw Error('Configuração Starvios indisponível');
    return r.text();
  });
  const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0],
    key = js.match(/sb_publishable_[\w-]+/)?.[0];
  if (!url || !key) throw Error('Starvios não informou acesso público');
  return { url, key };
}
function normalizeMessage(row) {
  if (!row?.id || row.is_deleted || typeof row.body !== 'string') return null;
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: String(row.id),
    user: profile?.display_name || profile?.username || 'Starvios',
    login: profile?.username || profile?.display_name || 'Starvios',
    text: row.body,
    color: /^#[a-f0-9]{6}$/i.test(profile?.chat_color)
      ? profile.chat_color
      : '#69d9ff',
    platform: 'starvios',
    createdAt: row.created_at,
  };
}
function connectStarvios(name, emit) {
  let stopped = false,
    timer,
    heartbeat,
    retry,
    socket,
    config,
    profile,
    stream,
    joined = false,
    cursor,
    checked = 0,
    backoff = 2000;
  const seen = new Set();
  const send = (type, data) => {
    if (!stopped) emit(type, data);
  };
  const status = (text, state = 'waiting') =>
    send('status', { platform: 'starvios', text, state });
  const rest = async (table, params) => {
    const u = new URL(config.url + '/rest/v1/' + table);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u, {
      headers: { apikey: config.key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error(`Starvios HTTP ${r.status}`);
    return r.json();
  };
  const deliver = (row, historical = false) => {
    const m = normalizeMessage(row);
    if (!m || seen.has(m.id)) return;
    seen.add(m.id);
    if (seen.size > 2000) seen.delete(seen.values().next().value);
    send('message', { ...m, historical });
  };
  const columns =
    'id,user_id,body,is_deleted,created_at,profiles:profiles!live_chat_messages_user_id_fkey(username,display_name,chat_color)';
  function subscribe() {
    if (stopped || !stream) return;
    clearInterval(heartbeat);
    socket?.close();
    joined = false;
    const current = stream.id;
    const ws = new WebSocket(
      config.url.replace('https:', 'wss:') +
        '/realtime/v1/websocket?apikey=' +
        encodeURIComponent(config.key) +
        '&vsn=1.0.0',
    );
    socket = ws;
    let ref = 1;
    const topic = 'realtime:stream:' + current;
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          topic,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: '' },
              postgres_changes: [],
              private: false,
            },
          },
          ref: String(ref++),
          join_ref: '1',
        }),
      );
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: String(ref++),
            }),
          );
      }, 25000);
    });
    ws.on('message', (raw) => {
      if (stopped || stream?.id !== current || socket !== ws) return;
      try {
        const m = JSON.parse(String(raw));
        if (m.event === 'phx_reply' && m.ref === '1') {
          joined = m.payload?.status === 'ok';
          if (joined)
            status(
              `Lendo ${name}${stream.status === 'live' ? '' : ' · canal offline'}`,
              'ok',
            );
        }
        if (m.event === 'broadcast' && m.payload?.event === 'msg') {
          const row = m.payload.payload?.msg;
          if (m.payload.payload?.op !== 'UPDATE') deliver(row);
          else if (row?.is_deleted)
            send('remove', { platform: 'starvios', id: row.id });
        }
        if (m.event === 'phx_error') ws.close();
      } catch {}
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (stopped || socket !== ws) return;
      joined = false;
      clearInterval(heartbeat);
      status(`Lendo ${name} · atualização periódica`, 'ok');
      clearTimeout(retry);
      retry = setTimeout(subscribe, 5000);
    });
  }
  const poll = async () => {
    if (stopped) return;
    try {
      if (!config) {
        status(`Localizando ${name}…`);
        config = await discover();
      }
      if (!profile) {
        const rows = await rest('profiles', {
          username: 'eq.' + name,
          select: 'id,username,display_name',
          limit: 1,
        });
        profile = rows[0];
        if (!profile) throw Error('Canal Starvios não encontrado');
        loadEmotes();
      }
      if (stopped) return;
      if (Date.now() - checked > 15000) {
        const rows = await rest('live_streams', {
          channel_id: 'eq.' + profile.id,
          select: 'id,status,started_at,chat_cleared_at',
          order: 'started_at.desc.nullslast',
          limit: 1,
        });
        checked = Date.now();
        const next = rows[0];
        if (next && next.id !== stream?.id) {
          stream = next;
          cursor = undefined;
          seen.clear();
          subscribe();
        } else if (next) stream = next;
      }
      if (stopped) return;
      if (!stream) {
        status(`Canal ${name} encontrado · aguardando primeira live`);
        timer = setTimeout(poll, 15000);
        return;
      }
      const initial = !cursor;
      const params = {
        stream_id: 'eq.' + stream.id,
        is_deleted: 'eq.false',
        select: columns,
        order: initial ? 'created_at.desc' : 'created_at.asc',
        limit: initial ? 30 : 200,
      };
      if (cursor) params.created_at = 'gte.' + cursor;
      else if (stream.chat_cleared_at)
        params.created_at = 'gte.' + stream.chat_cleared_at;
      const rows = await rest('live_chat_messages', params);
      if (stopped) return;
      const sorted = [...rows].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
      for (const row of sorted) deliver(row, initial);
      cursor = sorted.at(-1)?.created_at || cursor || new Date().toISOString();
      backoff = 2000;
      if (!joined)
        status(
          `Lendo ${name} · atualização periódica${stream.status === 'live' ? '' : ' · offline'}`,
          'ok',
        );
      timer = setTimeout(poll, joined ? 10000 : 2000);
    } catch (e) {
      if (stopped) return;
      status(e.message + '; tentando novamente…', 'error');
      timer = setTimeout(poll, backoff);
      backoff = Math.min(backoff * 2, 30000);
    }
  };
  async function loadEmotes() {
    try {
      const r = await fetch('https://starvios.com/api/public/emotes', {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return;
      const data = await r.json();
      const items = {};
      for (const e of data.rows || [])
        if (
          /^[a-z0-9_]{2,20}$/i.test(e.code) &&
          typeof e.storage_path === 'string'
        )
          items[':' + e.code.toLowerCase() + ':'] =
            'https://starvios.com/api/public/img?' +
            new URLSearchParams({ p: e.storage_path });
      send('emotes', {
        platform: 'starvios',
        items,
        count: Object.keys(items).length,
        failed: 0,
      });
    } catch {}
  }
  poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(retry);
    clearInterval(heartbeat);
    socket?.close();
  };
}
module.exports = { connectStarvios, normalizeMessage, discover };
