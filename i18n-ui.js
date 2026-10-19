(() => {
  const api = window.KaiaI18n;
  let language = 'pt-BR',
    observer,
    scheduled = false;
  const textState = new WeakMap(),
    attributeState = new WeakMap();
  const excluded =
    'script,style,textarea,code,pre,[data-i18n-ignore],#feed .message,#language-picker,#fontFamily option,select[id$="-sound"] option,select[id$="-output"] option:not([value=""])';
  function ignore(node) {
    return node.parentElement?.closest(excluded);
  }
  function text(node) {
    if (ignore(node)) return;
    const old = textState.get(node);
    const source = old && node.data === old.last ? old.source : node.data;
    const last = api.translate(source, language);
    textState.set(node, { source, last });
    if (node.data !== last) node.data = last;
  }
  function apply(root = document.body) {
    observer?.disconnect();
    if (root.nodeType === 3) text(root);
    else {
      for (const option of root.querySelectorAll('option'))
        if (!option.hasAttribute('value'))
          option.setAttribute('value', option.value);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) text(node);
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (el.closest?.(excluded) && el.tagName !== 'TEXTAREA') continue;
        const state = attributeState.get(el) || {};
        for (const name of ['placeholder', 'title', 'aria-label'])
          if (el.hasAttribute(name)) {
            const current = el.getAttribute(name),
              old = state[name],
              source = old && old.last === current ? old.source : current,
              last = api.translate(source, language);
            state[name] = { source, last };
            if (last !== current) el.setAttribute(name, last);
          }
        attributeState.set(el, state);
      }
    }
    observer?.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });
  }
  function setLanguage(value) {
    language = api.normalize(value);
    const meta = api.languages.find((l) => l.code === language);
    document.documentElement.lang = language;
    document.documentElement.dir = meta.dir;
    for (const option of document.querySelectorAll(
      'option[data-i18n-unavailable]',
    ))
      option.textContent =
        option.dataset.i18nUnavailable +
        api.translate(' · indisponível', language);
    for (const option of document.querySelectorAll('#language-picker button'))
      option.setAttribute('aria-pressed', String(option.lang === language));
    document
      .getElementById('language-picker')
      ?.setAttribute('aria-label', api.translate('Idioma', language));
    const button = document.getElementById('language-toggle');
    if (button) {
      button.replaceChildren();
      const flag = document.createElement('img');
      flag.src = 'assets/flags/' + meta.flag + '.svg';
      flag.alt = '';
      const label = document.createElement('span');
      label.textContent = meta.name;
      button.append(flag, label);
      button.setAttribute(
        'aria-label',
        api.translate('Idioma', language) + ': ' + meta.name,
      );
      button.dataset.i18nIgnore = '';
    }
    apply();
    window.dispatchEvent(
      new CustomEvent('kaia-language', { detail: language }),
    );
  }
  function init() {
    observer = new MutationObserver((records) => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        apply();
      });
    });
    const button = document.getElementById('language-toggle'),
      picker = document.getElementById('language-picker');
    if (button && picker) {
      for (const meta of api.languages) {
        const option = document.createElement('button');
        option.type = 'button';
        option.lang = meta.code;
        option.dir = meta.dir;
        option.innerHTML =
          '<img alt="" src="assets/flags/' + meta.flag + '.svg">';
        option.append(document.createTextNode(meta.name));
        option.setAttribute('aria-label', meta.name);
        option.onclick = async () => {
          try {
            await window.kaia.saveLanguage(meta.code);
            picker.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            setLanguage(meta.code);
          } catch (e) {
            document.getElementById('language-status').textContent = e.message;
          }
        };
        picker.append(option);
      }
      button.onclick = () => {
        picker.hidden = !picker.hidden;
        button.setAttribute('aria-expanded', String(!picker.hidden));
      };
      document.addEventListener('click', (e) => {
        if (!picker.contains(e.target) && !button.contains(e.target)) {
          picker.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          picker.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
      });
    }
    setLanguage('pt-BR');
    if (window.kaia) {
      window.kaia.load().then((s) => setLanguage(s.language));
      window.kaia.on('language', setLanguage);
    } else if (location.protocol === 'http:')
      fetch('api/ui-language')
        .then((r) => r.json())
        .then((s) => setLanguage(s.language))
        .catch(() => {});
  }
  window.KaiaLocale = {
    setLanguage,
    translate: (text) => api.translate(text, language),
    get language() {
      return language;
    },
    apply,
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
