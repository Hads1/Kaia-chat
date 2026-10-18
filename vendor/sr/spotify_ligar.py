"""Abre o login do Spotify e grava o refresh_token no config.yaml.

No dashboard: https://developer.spotify.com/dashboard
Cria um app, Redirect URI = http://127.0.0.1:8888/callback
Copia Client ID e Client Secret pro config.yaml (spotify).
Roda:  python spotify_ligar.py
"""

from __future__ import annotations

import time
import secrets
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BASE = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
REDIRECT = "http://127.0.0.1:8888/callback"
SCOPES = "user-read-currently-playing user-read-playback-state"


def _cfg():
    import yaml

    return yaml.safe_load((BASE / "config.yaml").read_text(encoding="utf-8")) or {}


def main():
    import requests
    import yaml

    raw = _cfg()
    sp = raw.setdefault("spotify", {})
    cid = (sp.get("client_id") or "").strip()
    secret = (sp.get("client_secret") or "").strip()
    if not cid or not secret:
        print("Coloca spotify.client_id e spotify.client_secret no config.yaml")
        print("Dashboard: https://developer.spotify.com/dashboard")
        print("Redirect URI: http://127.0.0.1:8888/callback")
        return
    state = secrets.token_urlsafe(32)
    q = urllib.parse.urlencode(
        {
            "client_id": cid,
            "response_type": "code",
            "redirect_uri": REDIRECT,
            "scope": SCOPES,
            "state": state,
        }
    )
    url = "https://accounts.spotify.com/authorize?" + q
    code = {"v": ""}

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(u.query)
            if u.path != "/callback" or (qs.get("state") or [""])[0] != state:
                self.send_error(400, "Callback invalido")
                return
            code["v"] = (qs.get("code") or [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h1>Codigo recebido.</h1><p>Pode fechar.</p>")

        def log_message(self, *a):
            return

    print("Abrindo o login do Spotify...")
    httpd = HTTPServer(("127.0.0.1", 8888), H)
    httpd.timeout = 1
    webbrowser.open(url)
    prazo = time.monotonic() + 120
    while not code["v"] and time.monotonic() < prazo:
        httpd.handle_request()
    httpd.server_close()
    if not code["v"]:
        print("Nao veio o codigo.")
        return
    r = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": code["v"],
            "redirect_uri": REDIRECT,
        },
        auth=(cid, secret),
        timeout=15,
    )
    print("[spotify] OAuth HTTP", r.status_code)
    if r.status_code >= 400:
        print("Autorização recusada. Verifique a configuração do aplicativo.")
        return
    j = r.json()
    if not j.get("refresh_token") and not j.get("access_token"):
        print("Falhou. Confere o Redirect URI no dashboard.")
        return
    sp["access_token"] = j.get("access_token") or ""
    if j.get("refresh_token"):
        sp["refresh_token"] = j["refresh_token"]
    sp["expira"] = time.time() + int(j.get("expires_in") or 3600) - 30
    from spotify_agora import _alterar_config_spotify
    if not _alterar_config_spotify(sp):
        print("Não foi possível salvar a configuração do Spotify.")
        return
    print("Salvo no config.yaml. Pergunta no chat: qual a musica?")


if __name__ == "__main__":
    main()
