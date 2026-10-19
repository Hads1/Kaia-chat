/* Apenas dados públicos locais; nenhuma chamada à API Spotify no navegador. */
(function () {
  'use strict';
  const api = {
    escolherEstado(sr, spotify, agora = Date.now() / 1000) {
      const idade = (d) =>
        d && d.quando ? Math.max(0, agora - Number(d.quando)) : Infinity;
      const srValido =
        sr &&
        sr.titulo &&
        ['sr', 'voz', 'playlist'].includes(sr.fonte_atual) &&
        idade(sr) < 4;
      if (srValido) {
        return sr;
      }
      if (
        spotify &&
        idade(spotify) <= 90 &&
        spotify.tocando &&
        spotify.estado === 'PLAYING'
      )
        return { ...spotify, fonte_atual: 'spotify' };
      if (srValido && sr.paused) return sr;
      if (spotify && idade(spotify) <= 90) {
        return { ...spotify, fonte_atual: 'spotify' };
      }
      return { estado: 'UNAVAILABLE', fonte_atual: 'spotify', tocando: false };
    },
    fmt(seg) {
      seg = Math.max(0, Math.floor(Number(seg) || 0));
      return Math.floor(seg / 60) + ':' + String(seg % 60).padStart(2, '0');
    },
  };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;
  const lab = document.getElementById('lab');
  const tit = document.getElementById('tit');
  const who = document.getElementById('who');
  const tempo = document.getElementById('tempo');
  const fill = document.getElementById('fill');

  async function ler(nome) {
    const controller = new AbortController();
    const prazo = setTimeout(() => controller.abort(), 2000);
    try {
      const r = await fetch(nome + '?t=' + Date.now(), {
        cache: 'no-store',
        signal: controller.signal,
      });
      return r.ok ? await r.json() : null;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(prazo);
    }
  }

  function pintar(d) {
    const spotify = d.fonte_atual === 'spotify';
    const indisponivel = ['ERROR', 'UNAVAILABLE', 'RECONNECTING'].includes(
      d.estado,
    );
    lab.textContent = spotify
      ? 'SPOTIFY' + (d.tocando ? '' : d.estado === 'PAUSED' ? ' · PAUSADO' : '')
      : 'SONG REQUEST' + (d.paused ? ' · PAUSADO' : '');
    if (indisponivel) {
      tit.textContent =
        d.estado === 'RECONNECTING'
          ? 'reconectando Spotify'
          : 'Spotify indisponível';
      who.textContent = 'aguardando atualização';
      tempo.textContent = '--:--';
      fill.style.width = '0%';
      return;
    }
    if (!d.titulo) {
      tit.textContent = spotify ? 'sem música no Spotify' : 'fila vazia';
      who.textContent = '';
      tempo.textContent = '--:--';
      fill.style.width = '0%';
      return;
    }
    tit.textContent = spotify ? d.faixa || d.titulo : d.titulo;
    who.textContent = spotify ? d.artista || 'Spotify' : '';
    let elapsed = Number(d.elapsed) || 0;
    const dur = Number(d.dur) || 0;
    if (d.tocando && d.quando)
      elapsed += Math.max(0, Date.now() / 1000 - Number(d.quando));
    if (dur > 0) elapsed = Math.min(dur, elapsed);
    tempo.textContent =
      api.fmt(elapsed) + ' / ' + (dur > 0 ? api.fmt(dur) : '--:--');
    fill.style.width =
      (dur > 0 ? Math.min(100, (elapsed / dur) * 100) : 0) + '%';
  }

  async function tick() {
    try {
      const [sr, spotify] = await Promise.all([
        ler('sr.json'),
        ler('spotify.json'),
      ]);
      pintar(api.escolherEstado(sr, spotify));
    } finally {
      // Sem sobreposição de fetches; API real continua limitada no backend.
      setTimeout(tick, 1000);
    }
  }
  tick();
})();
