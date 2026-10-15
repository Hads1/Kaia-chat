(function (scope) {
  const platforms = ['all', 'twitch', 'kick', 'starvios'];
  function normalizeNick(value) {
    return String(value ?? '')
      .trim()
      .replace(/^@+/, '')
      .normalize('NFKC')
      .toLowerCase();
  }
  function normalizeBlockedUsers(input = {}) {
    const result = {};
    for (const platform of platforms) {
      const raw = Array.isArray(input?.[platform])
        ? input[platform].join('\n')
        : String(input?.[platform] ?? '');
      const names = [
        ...new Set(
          raw
            .split(/[\s,;]+/u)
            .map(normalizeNick)
            .filter(Boolean),
        ),
      ];
      if (names.length > 1000)
        throw Error('Use até 1.000 nicks por lista de bloqueio.');
      for (const name of names)
        if (!/^[\p{L}\p{N}_.-]{1,64}$/u.test(name))
          throw Error(`Nick inválido na lista de bloqueio: ${name}`);
      result[platform] = names;
    }
    return result;
  }
  function isBlocked(lists, platform, nick) {
    const name = normalizeNick(nick);
    return (
      !!name &&
      (lists?.all?.includes(name) ||
        (platforms.includes(platform) && lists?.[platform]?.includes(name))) ===
        true
    );
  }
  const api = { normalizeNick, normalizeBlockedUsers, isBlocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.KaiaBlocking = api;
})(globalThis);
