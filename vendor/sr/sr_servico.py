"""Player sem janela, independente da Kaia; janela SR pode conectar como controle."""
import time,json,os
from sr_player import get_sr,desmarcar_vivo

if __name__=='__main__':
    sr=get_sr()
    if getattr(sr,'remoto',False):raise SystemExit(0)
    import yaml
    from pathlib import Path
    cfg=yaml.safe_load((Path(__file__).parent/'config.yaml').read_text(encoding='utf-8')) or {}
    audio=cfg.get('audio') or {}
    if audio.get('saida_sr'):sr.set_saida(audio['saida_sr'])
    try:
        from kick_chat import KickChat,resolve_chatroom_id,resolve_canal
        from sr_player import extrair_sr
        kick=cfg.get('kick') or {};kid=kick.get('chatroom_id') or resolve_chatroom_id(kick.get('channel') or 'hads1')
        def receive(user,text,meta=None):
            q=extrair_sr(text)
            if q is not None:sr.pedir(user,q)
        cid=kick.get('channel_id') or resolve_canal(kick.get('channel') or 'hads1').get('channel_id')
        chat=KickChat(int(kid),receive,channel_id=cid);chat.start()
    except Exception:sr.erro='SR ativo; chat Kick não conectado. Pedidos manuais continuam disponíveis.'
    try:
        while not sr._stop:time.sleep(.5)
    finally:sr.encerrar();desmarcar_vivo()
