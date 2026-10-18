const assert = require('assert');
const { escolherEstado } = require('../avatar/sr.js');
const now = 1000;
const sr = {
  titulo: 'SR',
  fonte_atual: 'sr',
  quando: now,
  tocando: true,
  paused: false,
};
const sp = {
  titulo: 'SP',
  faixa: 'Spotify Song',
  artista: 'Artista',
  estado: 'PLAYING',
  tocando: true,
  quando: now,
};
assert.equal(escolherEstado(sr, sp, now).titulo, 'SR');
assert.equal(
  escolherEstado({ ...sr, tocando: false, paused: true }, sp, now).titulo,
  'SP',
);
assert.equal(
  escolherEstado({ ...sr, erro: 'falha' }, sp, now).fonte_atual,
  'spotify',
);
assert.equal(escolherEstado(null, sp, now).faixa, 'Spotify Song');
assert.equal(
  escolherEstado(null, { ...sp, estado: 'PAUSED', tocando: false }, now).estado,
  'PAUSED',
);
assert.equal(
  escolherEstado(null, { ...sp, quando: 1 }, now).estado,
  'UNAVAILABLE',
);
console.log('6 verificações de prioridade SR/Spotify passaram.');
