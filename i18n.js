(function (root, factory) {
  const api = factory(
    typeof module === 'object' ? require('./i18n-data') : root.KaiaTranslations,
  );
  if (typeof module === 'object') module.exports = api;
  else root.KaiaI18n = api;
})(typeof window === 'object' ? window : globalThis, function (catalogs) {
  const languages = [
    ['pt-BR', 'Português', 'br', 'ltr'],
    ['en', 'English', 'gb', 'ltr'],
    ['es', 'Español', 'es', 'ltr'],
    ['fr', 'Français', 'fr', 'ltr'],
    ['de', 'Deutsch', 'de', 'ltr'],
    ['it', 'Italiano', 'it', 'ltr'],
    ['ru', 'Русский', 'ru', 'ltr'],
    ['ar', 'العربية', 'eg', 'rtl'],
    ['hi', 'हिन्दी', 'in', 'ltr'],
    ['bn', 'বাংলা', 'bd', 'ltr'],
    ['id', 'Bahasa Indonesia', 'id', 'ltr'],
    ['ja', '日本語', 'jp', 'ltr'],
    ['ko', '한국어', 'kr', 'ltr'],
    ['zh-CN', '简体中文', 'cn', 'ltr'],
  ].map(([code, name, flag, dir]) => ({ code, name, flag, dir }));
  const normalize = (code) =>
    languages.some((l) => l.code === code) ? code : 'pt-BR';
  const space = (s) => String(s).replace(/\s+/g, ' ').trim();
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = Object.keys(catalogs['pt-BR'] || {});
  const patterns = keys
    .filter((k) => /\{\d+\}/.test(k))
    .map((key) => {
      const parts = key.split(/(\{\d+\})/),
        params = parts.filter((p) => /^\{\d+\}$/.test(p));
      return {
        key,
        params,
        regex: new RegExp(
          '^' +
            parts
              .map((p) => (/^\{\d+\}$/.test(p) ? '([\\s\\S]*?)' : escape(p)))
              .join('') +
            '$',
        ),
      };
    })
    .sort((a, b) => b.key.length - a.key.length);
  function translate(text, language = 'pt-BR') {
    const lang = normalize(language),
      source = space(text),
      dict = catalogs[lang] || {};
    if (lang === 'pt-BR' || !source) return String(text);
    let result = Object.hasOwn(dict, source) ? dict[source] : undefined;
    if (!result)
      for (const p of patterns) {
        const match = source.match(p.regex);
        if (match) {
          result = dict[p.key];
          if (result)
            result = result.replace(
              /\{\d+\}/g,
              (token) => match[p.params.indexOf(token) + 1] || '',
            );
          break;
        }
      }
    if (!result) {
      for (const key of keys.filter((k) => /^[:;]/.test(k)))
        if (source.endsWith(key)) {
          result = source.slice(0, -key.length) + (dict[key] || key);
          break;
        }
    }
    if (!result) {
      for (const delimiter of [' · ', ': '])
        if (source.includes(delimiter)) {
          const parts = source.split(delimiter),
            converted = parts.map((p) => dict[p] || p);
          if (converted.some((p, i) => p !== parts[i])) {
            result = converted.join(delimiter);
            break;
          }
        }
    }
    if (!result) return String(text);
    const leading = String(text).match(/^\s*/)[0],
      trailing = String(text).match(/\s*$/)[0];
    return leading + result + trailing;
  }
  return { languages, normalize, translate, catalogs };
});
