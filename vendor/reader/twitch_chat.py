"""Leitura anônima do chat da Twitch (IRC websocket). Sem token lê; com token escreve depois."""

import threading
import time
from typing import Callable, Optional

import websocket
import re


def _irc_url():
    return "wss://irc-ws.chat.twitch.tv:443"


class TwitchChat:
    def __init__(self, channel: str, on_message: Callable[..., None], token: str = "", nick: str = "",on_status=None):
        self.channel = (channel or "").lstrip("#").lower()
        self.on_message = on_message
        self.token = (token or "").strip()
        self.nick = (nick or "justinfan48291").lower()
        self._ws = None
        self._stop = False
        self.connected=threading.Event();self.on_status=on_status
        self._sent_lock=threading.Lock();self._last_sent=0
        self._seen={}
        self.last_message_at=0;self.last_error=''

    def status(self,message):
        from chat_saude import registrar
        registrar('twitch','status',message,force=True)
        if self.on_status:self.on_status(message)

    def send_text(self,text):
        if not self.token or not self.nick or self.nick.startswith('justinfan') or not self.connected.is_set():return False
        text=str(text).replace('\r',' ').replace('\n',' ').strip()
        if not text:return False
        def work():
            with self._sent_lock:
                rest=text
                while rest and not self._stop:
                    part=rest[:400]
                    while len(part.encode('utf-8'))>400:part=part[:-1]
                    time.sleep(max(0,1.6-(time.monotonic()-self._last_sent)))
                    try:self._ws.send(f'PRIVMSG #{self.channel} :{part}')
                    except Exception:self.status('Não foi possível enviar a resposta.');return
                    self._last_sent=time.monotonic();rest=rest[len(part):].lstrip()
        threading.Thread(target=work,daemon=True).start()
        return True

    def start(self):
        t = threading.Thread(target=self._run, daemon=True)
        t.start()
        return t

    def stop(self):
        self._stop = True
        self.connected.clear()
        try:
            if self._ws:
                self._ws.close()
        except Exception:
            pass

    def _run(self):
        while not self._stop:
            try:
                self._ws = websocket.WebSocketApp(
                    _irc_url(),
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                )
                self._ws.run_forever(ping_interval=40, ping_timeout=10)
            except Exception as exc:
                print("[twitch]", exc)
            if not self._stop:
                time.sleep(3)

    def _on_open(self, ws):
        print(f"[twitch] conectando #{self.channel}")
        if self.token:
            tok = self.token[6:] if self.token.lower().startswith("oauth:") else self.token
            ws.send(f"PASS oauth:{tok}")
            ws.send(f"NICK {self.nick}")
        else:
            ws.send("PASS SCHMOOPIIE")
            ws.send("NICK justinfan48291")
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands")
        ws.send(f"JOIN #{self.channel}")

    def _on_message(self, _ws, raw: str):
        for line in (raw or "").split("\r\n"):
            if not line:
                continue
            if line.startswith("PING"):
                try:
                    self._ws.send("PONG :tmi.twitch.tv")
                except Exception:
                    pass
                continue
            if line=='RECONNECT' or ' RECONNECT' in line:
                self.connected.clear();self.status('Servidor solicitou reconexão; reconectando.')
                if self._ws:self._ws.close()
                continue
            if 'Login authentication failed' in line or 'Improperly formatted auth' in line:
                self.connected.clear();self.status('Autorização recusada; revise a sessão do bot.');continue
            if not self.connected.is_set() and (f'ROOMSTATE #{self.channel}' in line or f' 366 {self.nick} #{self.channel}' in line or (' JOIN #'+self.channel in line)):
                self.connected.set();self.status('Conectado a #'+self.channel+(' com conta autorizada.' if self.token else ' para leitura e respostas por voz.'))
            if "PRIVMSG #" not in line:
                continue
            user = "alguem"
            texto = ""
            tags = ''
            try:
                if line.startswith("@"):
                    tags, rest = line[1:].split(" ", 1)
                else:
                    rest = line
                prefix, _, payload = rest.partition(" PRIVMSG ")
                user = prefix.split("!")[0].lstrip(":")
                if payload.split(' ',1)[0].lower()!='#'+self.channel:continue
                texto = payload.split(" :", 1)[-1]
            except Exception:
                continue
            meta = {"vip": False, "sub": False, "mod": False, "broadcaster": False, "plataforma": "twitch"}
            tagmap=dict(t.split('=',1) for t in tags.split(';') if '=' in t)
            message_id=tagmap.get('id')
            if message_id:
                now=time.monotonic();self._seen={k:v for k,v in self._seen.items() if now-v<120}
                if message_id in self._seen:continue
                self._seen[message_id]=now
            badges={b.partition('/')[0] for b in tagmap.get('badges','').split(',')}
            meta.update(user_id=tagmap.get('user-id') or user,canal=self.channel,message_id=message_id or '',
                        vip='vip' in badges,sub=tagmap.get('subscriber')=='1' or 'subscriber' in badges,
                        mod=tagmap.get('mod')=='1' or 'moderator' in badges,broadcaster='broadcaster' in badges)
            try:
                self.on_message(user, texto, meta)
            except TypeError:
                self.on_message(user, texto)
            self.last_message_at=time.time()

    def _on_error(self, _ws, err):
        self.connected.clear();self.last_error=str(err);self.status('Erro na conexão: '+self.last_error[:150])
        print("[twitch] erro:", err)

    def _on_close(self, *_a):
        self.connected.clear()
        if not self._stop:self.status('Desconectado; tentando reconectar.')
        print("[twitch] fechou")
