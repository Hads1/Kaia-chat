function channel(value) {
  const s = String(value || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?(twitch\.tv|kick\.com|starvios\.com)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  if (s && !/^[a-z0-9_\-]{1,40}$/.test(s))
    throw Error('Nome de canal inválido');
  return s;
}
function irc(line) {
  const tags = {};
  if (line.startsWith('@')) {
    const end = line.indexOf(' ');
    for (const part of line.slice(1, end).split(';')) {
      const i = part.indexOf('=');
      tags[part.slice(0, i)] = part
        .slice(i + 1)
        .replace(/\\s/g, ' ')
        .replace(/\\:/g, ';');
    }
    line = line.slice(end + 1);
  }
  const m = line.match(/^:([^! ]+)[^ ]* PRIVMSG #[^ ]+ :([\s\S]*)$/);
  return m
    ? {
        id: tags.id,
        user: tags['display-name'] || m[1],
        login: m[1],
        text: m[2],
        color: tags.color || '#c4b5fd',
        emotes: tags.emotes || '',
        room: tags['room-id'],
      }
    : null;
}
function publications(raw) {
  return String(raw)
    .split('\n')
    .filter(Boolean)
    .map((s) => JSON.parse(s));
}
module.exports = { channel, irc, publications };
