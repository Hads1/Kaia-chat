import json
import time
import threading
from typing import Callable, Optional

import websocket

PUSHER_URL = (
    "wss://ws-us2.pusher.com/app/34bf7a0ff419a2a775b9"
    "?protocol=7&client=js&version=8.4.0&flash=false"
)
_REALTIME={}
_REALTIME_LOCK=threading.Lock()

def realtime_url(channel_id,force=False):
    """Descoberta pública usada pelo próprio site da Kick, sem sessão do usuário."""
    if not channel_id:return PUSHER_URL
    with _REALTIME_LOCK:
        previous=_REALTIME.get(channel_id)
        if previous and not force and time.monotonic()-previous[0]<300:return previous[1]
    try:
        import uuid,re
        from curl_cffi import requests as http
        r=http.post(f'https://web.kick.com/api/v1/realtime/channels/{int(channel_id)}/chat/connection',
            json={'client':{'id':str(uuid.uuid4()),'type':'web'},'capabilities':{'accepted_providers':[{'provider':'pusher'}]}},
            headers={'Origin':'https://kick.com','Referer':'https://kick.com/','x-app-platform':'web','Accept':'application/json'},impersonate='chrome124',timeout=10)
        r.raise_for_status()
        for connection in r.json().get('data',{}).get('connections',[]):
            c=connection.get('credentials',{});key=c.get('app_key','');cluster=c.get('cluster','')
            if connection.get('provider')=='pusher' and re.fullmatch(r'[a-zA-Z0-9]+',key) and re.fullmatch(r'[a-z0-9-]+',cluster):
                url=f'wss://ws-{cluster}.pusher.com/app/{key}?protocol=7&client=js&version=8.4.0&flash=false'
                with _REALTIME_LOCK:_REALTIME[channel_id]=(time.monotonic(),url)
                return url
    except Exception as exc:print('[kick] descoberta realtime indisponível:',type(exc).__name__)
    return previous[1] if previous else PUSHER_URL


def _kick_headers():
    return {
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    }


def resolve_canal(slug: str) -> dict:
    """chatroom_id + channel_id pra assinar alerta de sub/follow."""
    url = f"https://kick.com/api/v2/channels/{slug}"
    data = {}
    try:
        from curl_cffi import requests as cfreq

        r = cfreq.get(url, headers=_kick_headers(), impersonate="chrome124", timeout=20)
        if r.status_code == 200:
            data = r.json() or {}
    except Exception as exc:
        print(f"[kick] curl_cffi falhou: {exc}")
    if not data:
        try:
            import requests

            r = requests.get(url, headers=_kick_headers(), timeout=20)
            if r.status_code == 200:
                data = r.json() or {}
        except Exception as exc:
            print(f"[kick] requests falhou: {exc}")
    chat = (data.get("chatroom") or {}).get("id")
    cid = data.get("id") or (data.get("user") or {}).get("id")
    return {"chatroom_id": chat, "channel_id": cid, "slug": slug,
            "livestream": data.get('livestream'), 'consulta_ok': bool(data)}


def resolve_chatroom_id(slug: str) -> Optional[int]:
    return resolve_canal(slug).get("chatroom_id")


def _parse(payload):
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return {}
    return payload if isinstance(payload, dict) else {}


class KickChat:
    def __init__(self, chatroom_id: int, on_message: Callable[..., None], on_alerta=None, channel_id=None,on_status=None):
        self.chatroom_id = chatroom_id
        self.channel_id = channel_id
        self.on_message = on_message
        self.on_alerta = on_alerta
        self._ws = None
        self._stop = False
        self.connected = False
        self.on_status=on_status;self.last_error='';self.last_message_at=0;self._refresh=False;self._seen={}

    def status(self,message):
        from chat_saude import registrar
        registrar('kick','status',message,force=True)
        if self.on_status:self.on_status(message)

    def start(self):
        t = threading.Thread(target=self._run, daemon=True)
        t.start()
        return t

    def stop(self):
        self._stop = True
        self.connected=False
        try:
            if self._ws:
                self._ws.close()
        except Exception:
            pass

    def _run(self):
        while not self._stop:
            try:
                self._ws = websocket.WebSocketApp(
                    realtime_url(self.channel_id,force=self._refresh),
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                )
                self._ws.run_forever(ping_interval=30, ping_timeout=10)
            except Exception as exc:
                print(f"[kick] socket caiu: {exc}")
            if not self._stop:
                print("[kick] reconectando em 3s...")
                time.sleep(3)

    def _on_open(self, ws):
        self._refresh=False;self.connected = False
        self.status('Socket aberto; aguardando confirmação do chat.')
        canais = [
            f"chatrooms.{self.chatroom_id}.v2",
            f"chatroom_{self.chatroom_id}",
        ]
        if self.channel_id:
            canais += [
                f"channel.{self.channel_id}",
                f"channel_{self.channel_id}",
                f"channel_{self.channel_id}.v2",
            ]
        for ch in canais:
            ws.send(json.dumps({"event": "pusher:subscribe", "data": {"auth": "", "channel": ch}}))

    def _alerta(self, tipo: str, user: str, meses: int = 1, qtd: int = 1):
        if not self.on_alerta or not tipo:
            return
        user = (user or "").strip()
        if not user or user.lower() in ("guerreiro", "guerreira", "alguem", "kickbot", "kaiabot", "kaia"):
            return
        try:
            self.on_alerta(tipo, user, meses or 1, qtd or 1)
        except Exception as exc:
            print("[kick] alerta:", exc)

    def _on_message(self, _ws, raw: str):
        try:
            frame = json.loads(raw)
        except json.JSONDecodeError:
            return
        event = frame.get("event") or ""
        if event=='pusher_internal:subscription_succeeded' and frame.get('channel') in (f'chatrooms.{self.chatroom_id}.v2',f'chatroom_{self.chatroom_id}'):
            self.connected=True;self.last_error='';self.status('Conectada ao chatroom '+str(self.chatroom_id));return
        if event == "pusher:ping":
            try:
                self._ws.send(json.dumps({"event": "pusher:pong", "data": {}}))
            except Exception:
                pass
            return
        payload = _parse(frame.get("data"))
        ev = event.lower()

        if "ChatMessageEvent" in event:
            message_id=str(payload.get('id') or '')
            if message_id:
                now=time.monotonic();self._seen={k:v for k,v in self._seen.items() if now-v<120}
                if message_id in self._seen:return
                self._seen[message_id]=now
            self.last_message_at=time.time()
            tipo_msg = str(payload.get("type") or payload.get("message_type") or "message").lower()
            sender = payload.get("sender") or {}
            user = sender.get("username") or sender.get("slug") or "alguem"
            text = payload.get("content") or ""
            if tipo_msg and tipo_msg not in ("message", "reply", ""):
                if user.lower() in ("kickbot", "kaiabot", "kaia", "hads1"):
                    pass
                elif "gift" in tipo_msg:
                    self._alerta("gift", user, 1, 1)
                elif "resub" in tipo_msg:
                    self._alerta("resub", user, 1, 1)
                elif tipo_msg in ("subscription", "subscriber", "new_subscriber"):
                    self._alerta("sub", user, 1, 1)
                elif "follow" in tipo_msg:
                    self._alerta("follow", user, 1, 1)
                elif "raid" in tipo_msg:
                    self._alerta("raid", user, 1, 1)
                elif "host" in tipo_msg:
                    self._alerta("host", user, 1, 1)
                elif tipo_msg in ("reward", "kick", "kicks"):
                    self._alerta("kick", user, 1, 1)
            identity = sender.get("identity") or {}
            badges = identity.get("badges") or payload.get("badges") or []
            tipos = []
            for b in badges:
                if isinstance(b, dict):
                    tipos.append(str(b.get("type") or b.get("text") or "").lower())
                else:
                    tipos.append(str(b).lower())
            blob = " ".join(tipos)
            meta = {
                "user_id": str(sender.get('id') or ''),
                "vip": "vip" in blob,
                "sub": any(x in blob for x in ("subscriber", "subgifts", "founder", "og")),
                "mod": "moderator" in blob or blob.strip() == "mod",
                "broadcaster": "broadcaster" in blob,
                "badges": tipos,
            }
            if text:
                try:
                    self.on_message(user, text, meta)
                except TypeError:
                    self.on_message(user, text)
            return

        user = (
            payload.get("username")
            or payload.get("user")
            or (payload.get("sender") or {}).get("username")
            or payload.get("gifter_username")
            or payload.get("host_username")
            or ""
        )
        if isinstance(user, dict):
            user = user.get("username") or user.get("slug") or ""
        meses = int(payload.get("months") or payload.get("duration") or 1)
        gifted = payload.get("gifted_usernames") or payload.get("gifted") or []
        qtd = int(payload.get("quantity") or payload.get("count") or payload.get("number_of_gifts") or (len(gifted) if gifted else 1))

        if "giftedsubscription" in ev or "gifted_subscription" in ev:
            self._alerta("gift", str(user), 1, qtd)
        elif "resub" in ev:
            self._alerta("resub", str(user), meses, 1)
        elif "subscription" in ev:
            self._alerta("sub", str(user), meses, 1)
        elif "follow" in ev:
            self._alerta("follow", str(user), 1, 1)
        elif "raid" in ev:
            self._alerta("raid", str(user), 1, qtd)
        elif "host" in ev:
            self._alerta("host", str(user), 1, qtd)
        elif "reward" in ev or "kick" in ev and "chat" not in ev:
            self._alerta("kick", str(user), 1, qtd)

    def _on_error(self, _ws, err):
        self.connected = False
        self.last_error=str(err);self.status('Erro de conexão: '+self.last_error[:150])
        print(f"[kick] erro: {err}")

    def _on_close(self, _ws, status, msg):
        self.connected = False
        if status==4001:self._refresh=True
        if not self._stop:self.status('Conexão encerrada; reconectando. '+str(msg or '')[:100])
        print(f"[kick] fechou ({status}) {msg or ''}")
