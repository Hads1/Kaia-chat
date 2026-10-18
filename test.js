const { test } = require('node:test');
const assert = require('node:assert/strict');
const { channel, irc, publications } = require('./protocol');
const { ReaderQueue, normalizeReader } = require('./reader');
const { Spotify, REDIRECT } = require('./spotify');
const { YouTubeSession } = require('./youtube-session');
test('despachante encaminha !sr das quatro plataformas, sem históricos, bloqueados ou duplicatas', async () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
  const calls = [];
  class Backend {
    async start() {
      this.process = {};
    }
    async call(action, args) {
      calls.push({ action, args });
      return true;
    }
    async close() {}
  }
  class SpotifyFake {
    start() {}
    info() {
      return {};
    }
    close() {}
  }
  class SessionFake {
    async cookies() {
      return [];
    }
    close() {}
  }
  const fakeElectron = {
    ipcMain: { handle() {} },
    BrowserWindow: class {},
    shell: {},
    safeStorage: {},
  };
  const module = { exports: {} };
  const dependencies = {
    electron: fakeElectron,
    './media-backend': { MediaBackend: Backend },
    './spotify': { Spotify: SpotifyFake },
    './youtube-session': { YouTubeSession: SessionFake },
    './sr-assets': { createSRRoutes: () => () => {} },
  };
  new Function(
    'require',
    'module',
    'exports',
    fs.readFileSync(path.join(__dirname, 'media.js'), 'utf8'),
  )((name) => dependencies[name] || require(name), module, module.exports);
  const settings = {
    reader: { enabled: false },
    sr: { enabled: true },
    blockedUsers: { all: ['bloqueado'] },
  };
  const manager = module.exports.installMedia({
    win: {},
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'kaia-router-')),
    getSettings: () => settings,
    saveSettings() {},
    emit() {},
    widgetServer: { url: 'http://127.0.0.1:1/token/widget.html' },
    smoke: false,
  });
  try {
    for (const platform of ['twitch', 'kick', 'starvios', 'custom'])
      manager.receive('message', {
        platform,
        id: platform,
        user: 'Pessoa' + platform,
        text: '!sr Minha música',
      });
    manager.receive('message', {
      platform: 'twitch',
      id: 'twitch',
      user: 'Pessoa',
      text: '!sr Duplicada',
    });
    manager.receive('message', {
      platform: 'kick',
      id: 'old',
      user: 'Antigo',
      text: '!sr Histórico',
      historical: true,
    });
    manager.receive('message', {
      platform: 'kick',
      id: 'blocked',
      user: 'BLOQUEADO',
      text: '!sr Bloqueada',
    });
    manager.receive('message', {
      platform: 'twitch',
      id: 'normal',
      user: 'Pessoa',
      text: 'boa live',
    });
    await new Promise((resolve) => setImmediate(resolve));
    const requests = calls.filter((c) => c.action === 'pedir');
    assert.equal(requests.length, 4);
    assert.ok(requests.every((c) => c.args[1] === 'Minha música'));
  } finally {
    await manager.close();
  }
});
test('sessão dedicada sincroniza apenas cookies YouTube/Google e não lança navegador durante o teste', async () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const { WebSocketServer } = require('ws');
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => server.once('listening', resolve));
  server.on('connection', (socket) =>
    socket.on('message', (data) => {
      const packet = JSON.parse(data);
      socket.send(
        JSON.stringify({
          id: packet.id,
          result:
            packet.method === 'Storage.getCookies'
              ? {
                  cookies: [
                    {
                      domain: '.youtube.com',
                      name: 'fixture',
                      value: 'teste',
                      expires: 1234,
                    },
                    {
                      domain: '.google.com',
                      name: 'fixture2',
                      value: 'teste',
                      expires: 5678,
                    },
                    {
                      domain: '.example.com',
                      name: 'fora',
                      value: 'nao-importar',
                    },
                  ],
                }
              : {},
        }),
      );
    }),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaia-youtube-test-'));
  const session = new YouTubeSession(root);
  fs.mkdirSync(session.profile);
  fs.writeFileSync(
    path.join(session.profile, 'DevToolsActivePort'),
    server.address().port + '\n/devtools/browser/fixture\n',
  );
  try {
    const [a, b] = await Promise.all([session.cookies(), session.cookies()]);
    assert.equal(a.length, 2);
    assert.equal(b.length, 2);
    assert.equal(a[0].expirationDate, 1234);
    assert.ok(a.every((c) => c.domain !== '.example.com'));
  } finally {
    session.close();
    for (const client of server.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('leitor respeita amostragem, prioridade, bloqueio e histórico sem sobrepor falas', async () => {
  const spoken = [],
    waiters = [];
  let blocked = new Set();
  const reader = new ReaderQueue({
    speak: (m) => {
      spoken.push(m.user);
      return new Promise((resolve) => waiters.push(resolve));
    },
    blocked: (m) => blocked.has(m.user),
  });
  reader.configure({
    enabled: true,
    output: 'Headset',
    interval: 0,
    every: 2,
    lowEvery: 3,
    high: ['vip'],
    low: ['baixo'],
  });
  const send = (user, text = 'mensagem', historical = false) =>
    reader.receive({ user, text, historical });
  send('normal');
  assert.equal(spoken.length, 0);
  send('normal');
  assert.deepEqual(spoken, ['normal']);
  send('baixo');
  send('baixo');
  send('baixo');
  send('vip');
  send('ignorado', '!sr música');
  send('antigo', 'histórico', true);
  blocked.add('bloqueado');
  send('bloqueado');
  waiters.shift()();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(spoken, ['normal', 'vip']);
  blocked.add('baixo');
  reader.prune();
  waiters.shift()();
  await new Promise((r) => setImmediate(r));
  assert.equal(spoken.length, 2);
  assert.equal(reader.queue.length, 0);
  reader.clear();
  assert.equal(normalizeReader({ high: '@Vip, vip\nOutro' }).high.length, 2);
});
test('Spotify protege tokens, renova automaticamente e usa PKCE com state validado', async () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kaia-spotify-test-'));
  const requests = [];
  let opened;
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s).map((x) => x ^ 93),
    decryptString: (b) =>
      Buffer.from(b)
        .map((x) => x ^ 93)
        .toString(),
  };
  const spotify = new Spotify({
    directory: folder,
    storage,
    open: async (url) => {
      opened = url;
    },
    fetcher: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/api/token'))
        return {
          ok: true,
          json: async () => ({
            access_token: 'fixture-token',
            refresh_token: 'fixture-refresh',
            expires_in: 3600,
          }),
        };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          is_playing: true,
          item: {
            name: 'Faixa de teste',
            artists: [{ name: 'Artista' }],
            duration_ms: 120000,
          },
          progress_ms: 1000,
        }),
      };
    },
  });
  try {
    spotify.configure({ clientId: 'a'.repeat(32) });
    await spotify.connect();
    const url = new URL(opened);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
    assert.equal(
      (await fetch(REDIRECT + '?state=errado&code=teste')).status,
      400,
    );
    const callback = new URL(REDIRECT);
    callback.search = new URLSearchParams({
      state: url.searchParams.get('state'),
      code: 'fixture-code',
    });
    assert.equal((await fetch(callback)).status, 200);
    await new Promise((r) => setImmediate(r));
    spotify.auth.expires = 0;
    await spotify.poll();
    assert.equal(spotify.current.titulo, 'Faixa de teste');
    assert.ok(
      requests.some(
        (r) => r.options.body?.get('grant_type') === 'refresh_token',
      ),
    );
    assert.equal(
      JSON.stringify(spotify.info()).includes('fixture-token'),
      false,
    );
    assert.equal(
      fs
        .readFileSync(path.join(folder, 'spotify.enc'), 'utf8')
        .includes('fixture-refresh'),
      false,
    );
    const publicState = JSON.parse(
      fs.readFileSync(path.join(folder, 'avatar/spotify.json')),
    );
    assert.equal(publicState.access_token, undefined);
  } finally {
    spotify.close();
  }
});
const { WidgetServer, normalizeWidget } = require('./widget-server');
test('widget local protege rotas, omite configurações privadas e sincroniza histórico', async () => {
  const server = new WidgetServer();
  try {
    const url = await server.start(0);
    server.update({
      widget: { layout: 'cards', css: '.user { color: pink; }' },
      timing: { enabled: true, seconds: 1, fadeSeconds: 0 },
      transcriptPath: 'SEGREDO',
      blockedUsers: { all: ['segredo'] },
    });
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(new URL('/widget.html', url))).status, 404);
    assert.equal(
      (await fetch(url.replace('widget.html', 'main.js'))).status,
      404,
    );
    assert.equal(JSON.stringify(server.config).includes('SEGREDO'), false);
    server.event('message', {
      platform: 'kick',
      id: '1',
      user: 'a',
      text: 'oi',
    });
    server.event('message', {
      platform: 'kick',
      id: '1',
      user: 'a',
      text: 'duplicada',
    });
    assert.equal(server.snapshot().length, 1);
    const response = await fetch(url.replace('widget.html', 'events'));
    const reader = response.body.getReader();
    const packet = new TextDecoder().decode((await reader.read()).value);
    assert.match(packet, /snapshot/);
    assert.match(packet, /oi/);
    assert.doesNotMatch(packet, /SEGREDO/);
    await reader.cancel();
    server.messages[0].widgetTime -= 2000;
    assert.equal(server.snapshot().length, 0);
    server.event('message', {
      platform: 'twitch',
      id: '2',
      user: 'b',
      text: 'teste',
    });
    server.prune((m) => m.user !== 'b');
    assert.equal(
      server.messages.some((m) => m.user === 'b'),
      false,
    );
    server.event('settings', { clear: true });
    assert.equal(server.messages.length, 0);
    assert.deepEqual(normalizeWidget({ layout: 'invalido', fontSize: 900 }), {
      layout: 'classic',
      fontSize: 72,
      css: '',
    });
  } finally {
    server.close();
  }
});
test('normaliza canais e rejeita entradas impróprias', () => {
  assert.equal(channel('https://kick.com/Hads1?x=2'), 'hads1');
  assert.equal(channel('@Example_2'), 'example_2');
  assert.throws(() => channel('<script>'));
});
test('IRC preserva mensagens, tags e posições de emotes', () => {
  const m = irc(
    '@id=abc;room-id=12;display-name=Hads1;color=#ffffff;emotes=25:0-4 :hads1!x@y PRIVMSG #hads1 :Kappa oi',
  );
  assert.equal(m.user, 'Hads1');
  assert.equal(m.text, 'Kappa oi');
  assert.equal(m.emotes, '25:0-4');
  assert.equal(m.room, '12');
  assert.equal(irc('PING :server'), null);
});
test('Centrifugo reconhece confirmação, publicação e ping', () => {
  const frames = publications(
    '{"id":2,"subscribe":{}}\n{}\n{"push":{"pub":{"data":{"event":"App\\\\Events\\\\ChatMessageEvent","data":{"content":"oi"}}}}}',
  );
  assert.equal(frames.length, 3);
  assert.deepEqual(frames[1], {});
  assert.equal(frames[2].push.pub.data.data.content, 'oi');
});
const { normalizeAppearance } = require('./appearance');
const { normalizeMessage } = require('./starvios');
const { normalizeBlockedUsers, isBlocked } = require('./blocking');
const { normalizeTiming, MessageExpiry } = require('./timing');
const { normalizeCustom, decodeMessages, connectCustom } = require('./custom');
const { Transcript } = require('./transcript');
test('plataforma personalizada mapeia JSON sem executar código e exige IDs', () => {
  const config = normalizeCustom({
    enabled: true,
    url: 'https://example.com/{channel}',
    channel: 'canal',
    itemsPath: 'data.messages',
    userPath: 'sender.nick',
    textPath: 'body',
  });
  const rows = decodeMessages(
    {
      data: {
        messages: [{ id: 1, sender: { nick: 'Pessoa' }, body: 'Olá <texto>' }],
      },
    },
    config,
  );
  assert.equal(rows[0].platform, 'custom');
  assert.equal(rows[0].text, 'Olá <texto>');
  assert.equal(rows[0].user, 'Pessoa');
  assert.throws(() =>
    normalizeCustom({ enabled: true, url: 'file:///C:/secret' }),
  );
  assert.throws(() =>
    normalizeCustom({ enabled: true, url: 'https://user:pass@example.com' }),
  );
  assert.throws(() =>
    decodeMessages(
      { data: { messages: [{ sender: { nick: 'a' }, body: 'oi' }] } },
      config,
    ),
  );
});
test('adapter personalizado recebe mensagens de uma API local sem duplicar o histórico', async (t) => {
  const http = require('node:http');
  let rows = [{ id: '1', username: 'A', text: 'Primeira' }];
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ messages: rows }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let stop;
  t.after(() => {
    stop?.();
    server.closeAllConnections();
    server.close();
  });
  const messages = [];
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('A segunda mensagem não chegou')),
      7000,
    );
    t.after(() => clearTimeout(timeout));
    stop = connectCustom(
      {
        enabled: true,
        url: `http://127.0.0.1:${server.address().port}/chat`,
        pollSeconds: 2,
      },
      (type, m) => {
        if (type === 'message') {
          messages.push(m);
          if (messages.length === 1)
            rows.push({ id: '2', username: 'B', text: 'Segunda' });
          if (messages.length === 2) {
            clearTimeout(timeout);
            resolve();
          }
        }
      },
    );
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].historical, true);
  assert.equal(messages[1].historical, false);
  assert.equal(messages[1].text, 'Segunda');
});
test('backup TXT acrescenta o histórico, mantém Unicode e deduplica mensagens recebidas', async (t) => {
  const fs = require('node:fs/promises'),
    os = require('node:os'),
    path = require('node:path');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kaia-tests-'));
  t.after(async () => {
    if (path.dirname(temp) !== path.resolve(os.tmpdir()))
      throw Error('Diretório temporário inesperado');
    await fs.rm(temp, { recursive: true });
  });
  const file = path.join(temp, 'chat.txt');
  await fs.writeFile(file, 'Conteúdo anterior\n', 'utf8');
  const log = new Transcript();
  await log.open(file);
  const message = {
    platform: 'twitch',
    id: 'a',
    user: 'Pessoa',
    text: 'Olá 💜\nNova linha',
  };
  log.append(message);
  log.append(message);
  log.append({
    platform: 'custom',
    platformName: 'Meu serviço',
    id: 'b',
    user: 'Outro',
    text: 'Mensagem completa',
  });
  await log.flush();
  const text = await fs.readFile(file, 'utf8');
  assert.ok(text.startsWith('Conteúdo anterior\n'));
  assert.ok(text.includes('Olá 💜\\nNova linha'));
  assert.ok(text.includes('[Meu serviço]'));
  assert.equal(log.count, 2);
  await assert.rejects(() => log.open(path.join(temp, 'not-json.json')));
});
function fakeExpiry() {
  let now = 0,
    next = 0;
  const queue = new Map(),
    events = [];
  const timer = new MessageExpiry({
    now: () => now,
    schedule: (fn, delay) => {
      const id = ++next;
      queue.set(id, { at: now + delay, fn });
      return id;
    },
    cancel: (id) => queue.delete(id),
    onFade: (key, seconds) => events.push(['fade', key, seconds]),
    onRemove: (key) => events.push(['remove', key]),
  });
  return {
    timer,
    events,
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        const task = [...queue].sort((a, b) => a[1].at - b[1].at)[0];
        if (!task || task[1].at > target) break;
        now = task[1].at;
        queue.delete(task[0]);
        task[1].fn();
      }
      now = target;
    },
  };
}
test('cada mensagem tem seu próprio tempo antes do fade e da remoção', () => {
  const f = fakeExpiry();
  f.timer.configure({ seconds: 120, fadeSeconds: 2 });
  f.timer.add('a');
  f.advance(1000);
  f.timer.add('b');
  f.advance(119000);
  assert.deepEqual(f.events, [['fade', 'a', 2]]);
  f.advance(1000);
  assert.deepEqual(f.events.at(-1), ['fade', 'b', 2]);
  f.advance(1000);
  assert.deepEqual(f.events.at(-1), ['remove', 'a']);
  assert.equal(f.timer.entries.has('b'), true);
  f.advance(1000);
  assert.deepEqual(f.events.at(-1), ['remove', 'b']);
  assert.equal(f.timer.entries.size, 0);
});
test('desativar, reconfigurar e limpar cancela temporizadores sem deixar mensagens órfãs', () => {
  const f = fakeExpiry();
  f.timer.configure({ seconds: 5, fadeSeconds: 1 });
  f.timer.add('a');
  f.advance(1000);
  f.timer.configure({ enabled: false });
  f.advance(100000);
  assert.deepEqual(f.events, []);
  f.timer.configure({ seconds: 5, fadeSeconds: 1 });
  assert.deepEqual(f.events, [['remove', 'a']]);
  f.timer.add('b');
  f.timer.clear();
  f.advance(100000);
  assert.equal(f.events.length, 1);
  assert.equal(f.timer.entries.size, 0);
  assert.equal(normalizeTiming().seconds, 120);
  assert.equal(normalizeTiming({ seconds: -4, fadeSeconds: 200 }).seconds, 1);
  assert.equal(
    normalizeTiming({ seconds: 5, fadeSeconds: 200 }).fadeSeconds,
    10,
  );
});
test('bloqueios normalizam nicks e mantêm correspondência exata e escopo por plataforma', () => {
  const lists = normalizeBlockedUsers({
    all: ' @GlobalBot,GLOBALBOT ; OutroBot',
    twitch: ['@SpamMeR', 'spammer'],
    starvios: 'Pessoa_SV',
  });
  assert.deepEqual(lists.all, ['globalbot', 'outrobot']);
  assert.deepEqual(lists.twitch, ['spammer']);
  assert.equal(isBlocked(lists, 'kick', 'GLOBALBOT'), true);
  assert.equal(isBlocked(lists, 'starvios', '@GlobalBot'), true);
  assert.equal(isBlocked(lists, 'twitch', 'SPAMMER'), true);
  assert.equal(isBlocked(lists, 'kick', 'spammer'), false);
  assert.equal(isBlocked(lists, 'twitch', 'spammer_extra'), false);
  assert.equal(isBlocked(lists, 'starvios', 'pessoa_sv'), true);
  assert.equal(isBlocked(normalizeBlockedUsers(), 'twitch', 'spammer'), false);
  assert.throws(() => normalizeBlockedUsers({ all: 'nome!invalido' }));
});
test('Starvios resolve links e mensagens públicas sem depender de outras plataformas', () => {
  assert.equal(channel('https://starvios.com/hads'), 'hads');
  assert.equal(
    normalizeMessage({ id: '1', body: 'oi', is_deleted: true }),
    null,
  );
  const message = normalizeMessage({
    id: 's1',
    body: 'Olá :Teste:',
    profiles: { display_name: 'Pessoa', chat_color: '#123abc' },
    created_at: '2026-10-15T12:00:00Z',
  });
  assert.equal(message.platform, 'starvios');
  assert.equal(message.user, 'Pessoa');
  assert.equal(message.color, '#123abc');
  assert.equal(message.text, 'Olá :Teste:');
  assert.equal(
    normalizeMessage({
      id: '2',
      body: 'oi',
      profiles: { chat_color: 'url(bad)' },
    }).color,
    '#69d9ff',
  );
});
test('aparência antiga recebe padrões e valores fora dos limites são normalizados', () => {
  assert.equal(normalizeAppearance().fontFamily, 'Segoe UI');
  const s = normalizeAppearance({
    fontFamily: 'Arial',
    textColor: 'invalid',
    fontWeight: 999,
    shadowOpacity: 300,
    shadowBlur: -2,
    shadowX: -90,
  });
  assert.equal(s.fontFamily, 'Arial');
  assert.equal(s.textColor, '#f0f1f7');
  assert.equal(s.fontWeight, 600);
  assert.equal(s.shadowOpacity, 100);
  assert.equal(s.shadowBlur, 0);
  assert.equal(s.shadowX, -12);
});

test('limpeza remove somente áudio temporário privado e preserva histórico e arquivos externos', async () => {
  const fs = require('node:fs/promises'),
    path = require('node:path'),
    os = require('node:os');
  const { cleanupMedia } = require('./media-cleanup');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'kaia-cleanup-'));
  await fs.mkdir(path.join(folder, 'tmp_sr'));
  await fs.mkdir(path.join(folder, 'tmp_leitura'));
  await fs.writeFile(path.join(folder, 'tmp_sr', 'reader-test.mp3'), 'audio');
  await fs.writeFile(path.join(folder, 'tmp_leitura', 'test.wav'), 'audio');
  await fs.writeFile(path.join(folder, 'tmp_sr', 'controle_estado.json'), '{}');
  await fs.writeFile(path.join(folder, 'meu-alerta.mp3'), 'preservar');
  assert.deepEqual(await cleanupMedia(folder), []);
  await assert.rejects(
    fs.access(path.join(folder, 'tmp_sr', 'reader-test.mp3')),
  );
  await assert.rejects(fs.access(path.join(folder, 'tmp_leitura', 'test.wav')));
  await fs.access(path.join(folder, 'tmp_sr', 'controle_estado.json'));
  await fs.access(path.join(folder, 'meu-alerta.mp3'));
  assert.deepEqual(await cleanupMedia(folder), []);
});
