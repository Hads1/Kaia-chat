(() => {
  const init = async () => {
    const byId = (id) => document.getElementById(id),
      languages = byId('reader-voice-language'),
      gender = byId('reader-voice-gender'),
      select = byId('reader-voice');
    if (!select) return;
    const [voices, settings] = await Promise.all([
      window.kaia.voices(),
      window.kaia.load(),
    ]);
    const group = (voice) =>
      voice.locale.startsWith('zh-')
        ? 'zh-CN'
        : voice.locale.startsWith('pt-')
          ? 'pt-BR'
          : voice.locale.split('-')[0];
    let selected = settings.reader.voice;
    function fillLanguages() {
      const chosen = languages.value || group({ locale: selected });
      languages.replaceChildren();
      languages.add(
        new Option(window.KaiaLocale.translate('Todos os idiomas'), '*'),
      );
      for (const meta of window.KaiaI18n.languages)
        languages.add(new Option(meta.name, meta.code));
      languages.value = chosen || 'pt-BR';
      if (!languages.value) languages.value = '*';
    }
    function fill() {
      const previous = select.value || selected;
      const matches = voices.filter(
        (v) =>
          (languages.value === '*' || group(v) === languages.value) &&
          (gender.value === 'all' || gender.value === v.gender),
      );
      select.replaceChildren();
      const names = new Intl.DisplayNames([window.KaiaLocale.language], {
        type: 'language',
      });
      for (const v of matches) {
        let name = v.locale;
        try {
          name = names.of(v.locale);
        } catch {}
        const title =
          v.id.replace(v.locale + '-', '').replace(/Neural$/, '') +
          ' · ' +
          window.KaiaLocale.translate(
            v.gender === 'Female' ? 'Feminina' : 'Masculina',
          ) +
          ' · ' +
          name;
        select.add(new Option(title, v.id));
      }
      if (matches.some((v) => v.id === previous)) select.value = previous;
      else if (matches.length) select.value = matches[0].id;
      if (!matches.length) {
        const option = new Option(
          window.KaiaLocale.translate('Nenhuma voz disponível neste filtro'),
          '',
        );
        option.disabled = true;
        select.add(option);
      }
    }
    fillLanguages();
    select.value = selected;
    fill();
    languages.onchange = fill;
    gender.onchange = fill;
    select.addEventListener('change', () => {
      selected = select.value;
    });
    window.addEventListener('kaia-language', async () => {
      const current = await window.kaia.load();
      selected = current.reader.voice;
      languages.value = window.KaiaLocale.language;
      const voice = voices.find((v) => v.id === selected);
      gender.value = voice?.gender || 'all';
      select.value = selected;
      fill();
    });
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () =>
      init().catch(console.error),
    );
  else init().catch(console.error);
})();
