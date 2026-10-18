const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const REDIRECT = 'http://127.0.0.1:19348/spotify/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state';
class Spotify {
  constructor({
    directory,
    storage,
    open,
    status = () => {},
    fetcher = fetch,
  }) {
    Object.assign(this, { directory, storage, open, status, fetcher });
    this.auth = {};
    this.current = {};
    this.closed = false;
    try {
      this.auth = JSON.parse(
        storage.decryptString(
          fs.readFileSync(path.join(directory, 'spotify.enc')),
        ),
      );
    } catch {}
  }
  save() {
    if (!this.storage.isEncryptionAvailable())
      throw Error('Proteção de credenciais indisponível neste Windows.');
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(
      path.join(this.directory, 'spotify.enc'),
      this.storage.encryptString(JSON.stringify(this.auth)),
    );
  }
  info() {
    return {
      clientId: this.auth.clientId || '',
      hasSecret: !!this.auth.clientSecret,
      connected: !!this.auth.refresh_token,
      redirect: REDIRECT,
      current: this.current,
    };
  }
  configure(value) {
    const id = String(value.clientId || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(id))
      throw Error('Informe um Client ID válido do painel Spotify.');
    if (id !== this.auth.clientId) this.auth = { clientId: id };
    if (value.clientSecret)
      this.auth.clientSecret = String(value.clientSecret).trim();
    if (value.clearSecret) delete this.auth.clientSecret;
    this.save();
    return this.info();
  }
  async token(parameters) {
    const body = new URLSearchParams({
      ...parameters,
      client_id: this.auth.clientId,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.auth.clientSecret)
      headers.Authorization =
        'Basic ' +
        Buffer.from(this.auth.clientId + ':' + this.auth.clientSecret).toString(
          'base64',
        );
    const response = await this.fetcher(
      'https://accounts.spotify.com/api/token',
      { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw Error(
        `Spotify recusou a autorização (HTTP ${response.status}). Confira Client ID, acesso do usuário e Redirect URI.`,
      );
    const data = await response.json();
    if (!data.access_token)
      throw Error('Spotify não retornou um token válido.');
    this.auth = {
      ...this.auth,
      ...data,
      expires: Date.now() + Number(data.expires_in || 3600) * 1000 - 60000,
    };
    this.save();
  }
  async connect() {
    if (!this.auth.clientId) throw Error('Salve seu Client ID primeiro.');
    this.cancelAuth();
    const state = crypto.randomBytes(32).toString('base64url'),
      verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1:19348');
      if (
        url.pathname !== '/spotify/callback' ||
        url.searchParams.get('state') !== state
      ) {
        res.writeHead(400);
        res.end('Callback invalido.');
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        res.end('Autorizacao cancelada. Volte ao Kaia Chat.');
        this.status('Autorização Spotify cancelada.');
        this.cancelAuth();
        return;
      }
      try {
        await this.token({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT,
          code_verifier: verifier,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h1>Spotify conectado.</h1><p>Pode voltar ao Kaia Chat.</p>');
        this.status('Spotify conectado; atualização automática ativa.');
        this.start();
      } catch (error) {
        res.writeHead(400);
        res.end('Falha na autorizacao. Veja o Kaia Chat.');
        this.status(error.message);
      } finally {
        this.cancelAuth();
      }
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', () =>
        reject(
          Error(
            'A porta 19348 está ocupada. Feche outra autorização Spotify e tente novamente.',
          ),
        ),
      );
      this.server.listen(19348, '127.0.0.1', resolve);
    });
    this.authTimer = setTimeout(() => {
      this.cancelAuth();
      this.status('Autorização expirou. Clique Conectar novamente.');
    }, 180000);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({
      client_id: this.auth.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT,
      scope: SCOPES,
      state,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    await this.open(url.href);
    return this.info();
  }
  cancelAuth() {
    clearTimeout(this.authTimer);
    this.server?.close();
    this.server = null;
  }
  async poll() {
    if (
      this.polling ||
      !this.auth.refresh_token ||
      Date.now() < (this.backoff || 0)
    )
      return;
    this.polling = true;
    try {
      if (!this.auth.access_token || Date.now() >= this.auth.expires)
        await this.token({
          grant_type: 'refresh_token',
          refresh_token: this.auth.refresh_token,
        });
      let response = await this.fetcher(
        'https://api.spotify.com/v1/me/player/currently-playing',
        {
          headers: { Authorization: 'Bearer ' + this.auth.access_token },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.status === 401) {
        await this.token({
          grant_type: 'refresh_token',
          refresh_token: this.auth.refresh_token,
        });
        response = await this.fetcher(
          'https://api.spotify.com/v1/me/player/currently-playing',
          {
            headers: { Authorization: 'Bearer ' + this.auth.access_token },
            signal: AbortSignal.timeout(10000),
          },
        );
      }
      if (response.status === 429) {
        this.backoff =
          Date.now() +
          Math.max(10, Number(response.headers.get('retry-after')) || 30) *
            1000;
        throw Error(
          'Limite do Spotify atingido; nova tentativa automática após a espera.',
        );
      }
      if (response.status === 204) {
        this.current = {
          estado: 'IDLE',
          tocando: false,
          quando: Date.now() / 1000,
        };
      } else {
        if (!response.ok)
          throw Error(
            `Spotify HTTP ${response.status}. Confira Premium e os usuários autorizados no painel.`,
          );
        const data = await response.json();
        this.current = {
          estado: data.is_playing ? 'PLAYING' : 'PAUSED',
          tocando: !!data.is_playing,
          paused: !data.is_playing,
          titulo: data.item?.name || '',
          artista: (data.item?.artists || []).map((a) => a.name).join(', '),
          album: data.item?.album?.name || '',
          capa: data.item?.album?.images?.[0]?.url || '',
          elapsed: (data.progress_ms || 0) / 1000,
          dur: (data.item?.duration_ms || 0) / 1000,
          quando: Date.now() / 1000,
          fonte_atual: 'spotify',
        };
      }
      this.writeCurrent();
      this.status('Spotify atualizado automaticamente.');
    } catch (error) {
      this.backoff = Math.max(this.backoff || 0, Date.now() + 15000);
      this.current = {
        ...this.current,
        estado: 'UNAVAILABLE',
        tocando: false,
        quando: Date.now() / 1000,
      };
      this.writeCurrent();
      this.status(error.message);
    } finally {
      this.polling = false;
    }
  }
  writeCurrent() {
    fs.mkdirSync(path.join(this.directory, 'avatar'), { recursive: true });
    const file = path.join(this.directory, 'avatar', 'spotify.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(this.current));
    fs.renameSync(file + '.tmp', file);
  }
  start() {
    clearInterval(this.timer);
    this.closed = false;
    if (this.auth.refresh_token) {
      this.poll();
      this.timer = setInterval(() => this.poll(), 5000);
      this.timer.unref();
    }
  }
  disconnect() {
    this.close();
    this.auth = { clientId: this.auth.clientId };
    this.current = { estado: 'UNAVAILABLE', tocando: false };
    this.save();
    this.writeCurrent();
    return this.info();
  }
  close() {
    clearInterval(this.timer);
    this.cancelAuth();
    this.closed = true;
  }
}
module.exports = { Spotify, REDIRECT };
