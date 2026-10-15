const { test } = require('node:test');
const assert = require('node:assert/strict');
const { channel, irc, publications } = require('./protocol');
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
