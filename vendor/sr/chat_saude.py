"""Diagnóstico pequeno e persistente; não armazena o conteúdo das conversas."""
import json,re,threading,time
from pathlib import Path
FILE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))/'logs/chat_saude.json'
LOCK=threading.RLock();STATE={};LAST_WRITE=0
try:
    PREVIOUS=json.loads(FILE.read_text(encoding='utf-8'))
    HISTORY=PREVIOUS.get('historico',[]) if isinstance(PREVIOUS,dict) else []
except (OSError,ValueError):HISTORY=[]

def registrar(platform,event,detail='',force=False):
    global LAST_WRITE
    try:
        with LOCK:
            row=STATE.setdefault(str(platform),{'contadores':{}})
            row['contadores'][event]=row['contadores'].get(event,0)+1
            row['ultimo_evento']=event;row['atualizado_em']=time.time()
            if detail:row['detalhe']=re.sub(r'(?:https?|wss?)://\S+','[endereço omitido]',str(detail))[:220]
            if force:
                HISTORY.append({'quando':time.time(),'plataforma':str(platform),'evento':event,'detalhe':row.get('detalhe','')})
                del HISTORY[:-40]
            if force or time.monotonic()-LAST_WRITE>=5:
                FILE.parent.mkdir(exist_ok=True)
                from progresso_voz import salvar
                salvar(FILE,{'sessao':STATE,'historico':HISTORY,'salvo_em':time.time()});LAST_WRITE=time.monotonic()
    except Exception:pass

def resumo():
    with LOCK:return json.loads(json.dumps(STATE))
