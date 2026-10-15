const WebSocket = require('ws');
const { channel, irc, publications } = require('./protocol');
async function json(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', ...options.headers },
  });
  if (!r.ok)
    throw Object.assign(Error(`HTTP ${r.status} em ${new URL(url).hostname}`), {
      status: r.status,
    });
  return r.json();
}
class Chats {
  constructor(emit) {
    this.emit = emit;
    this.sessions = [];
    this.generation = 0;
  }
  stop() {
    this.generation++;
    for (const s of this.sessions) s();
    this.sessions = [];
  }
  start(settings) {
    this.stop();
    for (const p of ['twitch', 'kick', 'starvios']) {
      const options = settings[p] || {};
      const name = channel(options.channel);
      if (options.enabled && name) {
        if (p === 'starvios') {
          const generation = this.generation;
          this.sessions.push(
            require('./starvios').connectStarvios(name, (type, data) => {
              if (generation === this.generation) this.emit(type, data);
            }),
          );
        } else this.connect(p, name, this.generation);
      } else
        this.emit('status', { platform: p, text: 'Desativado', state: 'off' });
    }
  }
  async connect(platform, name, generation) {
    let socket,
      timer,
      closed = false,
      backoff = 1500,
      refresh;
    const status = (text, state = 'waiting') => {
      if (!closed && generation === this.generation)
        this.emit('status', { platform, text, state });
    };
    const message = (data) => {
      if (!closed && generation === this.generation)
        this.emit('message', { ...data, platform });
    };
    const stop = () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(refresh);
      socket?.close();
    };
    this.sessions.push(stop);
    let emotesFor = '';
    const loadEmotes = (id, userId = id) => {
      if (emotesFor === String(id)) return;
      emotesFor = String(id);
      this.emotes(platform, id, userId, generation).catch(() => {});
    };
    const run = async () => {
      if (closed || generation !== this.generation) return;
      status(`Conectando a ${name}…`);
      try {
        if (platform === 'twitch') {
          socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
          socket.on('open', () => {
            socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
            socket.send('PASS SCHMOOPIIE\r\n');
            socket.send(
              `NICK justinfan${Math.floor(Math.random() * 900000 + 100000)}\r\n`,
            );
            socket.send(`JOIN #${name}\r\n`);
          });
          socket.on('message', (raw) => {
            for (const line of String(raw).split('\r\n')) {
              if (line.startsWith('PING '))
                socket.send(line.replace(/^PING/, 'PONG') + '\r\n');
              if (line.includes(' 366 ') || line.includes(' ROOMSTATE ')) {
                status(`Lendo ${name}`, 'ok');
                backoff = 1500;
                const room = line.match(/room-id=(\d+)/)?.[1];
                if (room) loadEmotes(room);
              }
              if (
                /NOTICE.*(Login authentication failed|Improperly formatted auth)/i.test(
                  line,
                )
              )
                status('Twitch recusou leitura sem login', 'error');
              const m = irc(line);
              if (m) {
                if (m.room) loadEmotes(m.room);
                message(m);
              }
              if (line.includes(' RECONNECT')) socket.close();
            }
          });
        } else {
          const data = await json(`https://kick.com/api/v2/channels/${name}`);
          if (!data.chatroom?.id) throw Error('Canal Kick sem sala de chat');
          loadEmotes(data.id, data.user_id);
          const clientId = crypto.randomUUID();
          const post = (body) => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const discovered = await json(
            `https://web.kick.com/api/v1/realtime/channels/${data.id}/chat/connection`,
            post({
              client: { id: clientId, type: 'web' },
              capabilities: {
                accepted_providers: [
                  { provider: 'centrifugo' },
                  { provider: 'pusher' },
                ],
              },
            }),
          );
          if (closed || generation !== this.generation) return;
          const connection = discovered.data?.connections?.[0];
          if (!connection) throw Error('Kick não informou serviço de conexão');
          const deliver = (env) => {
            if (!env) return;
            let d = env.data;
            if (typeof d === 'string') {
              try {
                d = JSON.parse(d);
              } catch {
                return;
              }
            }
            if (env.event === 'App\\Events\\ChatMessageEvent' && d?.sender)
              message({
                id: d.id,
                user: d.sender.username,
                color: d.sender.identity?.color || '#53fc18',
                text: d.content || '',
                emotes: '',
              });
          };
          if (connection.provider === 'centrifugo') {
            const auth = await json(
              'https://web.kick.com/api/v1/realtime/auth/connection',
              post({ client_id: clientId }),
            );
            if (!auth.data?.token)
              throw Error('Kick não forneceu token temporário');
            if (closed || generation !== this.generation) return;
            const url = new URL(connection.credentials.url);
            if (url.protocol !== 'wss:' || !url.hostname.endsWith('.kick.com'))
              throw Error('Endereço Kick inesperado');
            socket = new WebSocket(url);
            socket.on('open', () =>
              socket.send(
                JSON.stringify({
                  id: 1,
                  connect: {
                    token: auth.data.token,
                    name: 'kaia-chat',
                    version: '0.1.0',
                  },
                }),
              ),
            );
            socket.on('message', (raw) => {
              try {
                for (const reply of publications(raw)) {
                  if (Object.keys(reply).length === 0) {
                    socket.send('{}');
                    continue;
                  }
                  if (reply.error) throw Error(`Kick: ${reply.error.message}`);
                  if (reply.id === 1 && reply.connect) {
                    socket.send(
                      JSON.stringify({
                        id: 2,
                        subscribe: {
                          channel: `chatrooms.${data.chatroom.id}.v2`,
                        },
                      }),
                    );
                    if (reply.connect.ttl)
                      refresh = setTimeout(
                        () => socket.close(),
                        Math.max(30000, (reply.connect.ttl - 60) * 1000),
                      );
                  }
                  if (reply.id === 2 && reply.subscribe) {
                    status(`Lendo ${name}`, 'ok');
                    backoff = 1500;
                  }
                  if (reply.push?.pub) deliver(reply.push.pub.data);
                  if (reply.push?.disconnect) socket.close();
                }
              } catch (e) {
                status(e.message, 'error');
                socket.close();
              }
            });
          } else if (connection.provider === 'pusher') {
            const c = connection.credentials;
            if (
              !/^[a-z0-9]+$/i.test(c.app_key) ||
              !/^[a-z0-9-]+$/i.test(c.cluster)
            )
              throw Error('Credenciais públicas Kick inválidas');
            socket = new WebSocket(
              `wss://ws-${c.cluster}.pusher.com/app/${c.app_key}?protocol=7&client=js&version=8.4.0&flash=false`,
            );
            socket.on('message', (raw) => {
              try {
                const e = JSON.parse(raw);
                if (e.event === 'pusher:connection_established')
                  socket.send(
                    JSON.stringify({
                      event: 'pusher:subscribe',
                      data: { channel: `chatrooms.${data.chatroom.id}.v2` },
                    }),
                  );
                else if (e.event === 'pusher_internal:subscription_succeeded') {
                  status(`Lendo ${name}`, 'ok');
                  backoff = 1500;
                } else if (e.event === 'pusher:ping')
                  socket.send(
                    JSON.stringify({ event: 'pusher:pong', data: {} }),
                  );
                else if (e.event === 'pusher:error') {
                  status('Kick rejeitou conexão', 'error');
                  socket.close();
                } else deliver(e);
              } catch {}
            });
          } else throw Error('Novo provedor Kick ainda não suportado');
        }
        if (closed || generation !== this.generation) {
          socket?.close();
          return;
        }
        socket.on('error', (e) =>
          status(`Falha de rede: ${e.message}`, 'error'),
        );
        socket.on('close', () => {
          clearTimeout(refresh);
          if (!closed && generation === this.generation) {
            status('Desconectado; tentando novamente…', 'error');
            timer = setTimeout(run, backoff);
            backoff = Math.min(backoff * 2, 30000);
          }
        });
      } catch (e) {
        if (closed || generation !== this.generation) return;
        status(e.message + '; tentando novamente…', 'error');
        timer = setTimeout(run, backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    };
    run();
  }
  async emotes(platform, id, userId, generation = this.generation) {
    const result = {};
    const add = (name, url) => {
      if (name && /^https:\/\//.test(url)) result[name] = url;
    };
    const seven = (data) => {
      for (const e of data?.emotes || data?.emote_set?.emotes || []) {
        const host = e.data?.host;
        if (host) {
          const f =
            host.files?.find((f) => f.name === '2x.webp') ||
            host.files?.find((f) => /webp$/.test(f.name));
          if (f) add(e.name, `https:${host.url}/${f.name}`);
        }
      }
    };
    const tasks = [
      async () => seven(await json('https://7tv.io/v3/emote-sets/global')),
      async () =>
        seven(
          await json(
            `https://7tv.io/v3/users/${platform}/${platform === 'kick' ? userId : id}`,
          ),
        ),
      async () => {
        for (const e of await json(
          'https://api.betterttv.net/3/cached/emotes/global',
        ))
          add(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
      },
      async () => {
        const d = await json(
          `https://api.betterttv.net/3/cached/users/${platform}/${id}`,
        );
        for (const e of [...(d.channelEmotes || []), ...(d.sharedEmotes || [])])
          add(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
      },
    ];
    const ffz = (d) => {
      for (const set of Object.values(d.sets || {}))
        for (const e of set.emoticons || []) {
          const u = e.animated?.['2'] || e.urls?.['2'] || e.urls?.['1'];
          if (u) add(e.name, u.startsWith('//') ? 'https:' + u : u);
        }
    };
    tasks.push(async () =>
      ffz(await json('https://api.frankerfacez.com/v1/set/global')),
    );
    if (platform === 'twitch')
      tasks.push(async () =>
        ffz(await json(`https://api.frankerfacez.com/v1/room/id/${id}`)),
      );
    const outcomes = await Promise.allSettled(tasks.map((f) => f()));
    if (generation === this.generation)
      this.emit('emotes', {
        platform,
        items: result,
        count: Object.keys(result).length,
        failed: outcomes.filter(
          (o) => o.status === 'rejected' && o.reason?.status !== 404,
        ).length,
      });
  }
}
module.exports = { Chats, json };
