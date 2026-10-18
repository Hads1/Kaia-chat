"""Controles locais para o processo SR; a Kaia não cria outro player."""
import json,time,uuid,subprocess,threading,os
from pathlib import Path
BASE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
DIR=BASE/'tmp_sr'/'comandos'
STATE=BASE/'tmp_sr'/'controle_estado.json'
START_LOCK=threading.Lock()
ACTIONS={'play_pause','stop','skip','prev','seek','set_volume','mute_toggle','set_repeat','set_shuffle','limpar','remover_fila','limpar_historico','apagar_historico','adicionar_playlist','set_saida','autenticar','encerrar'}

def dono_local():
    from sr_player import LOCK
    try:return LOCK.read_text(encoding='utf-8').strip()==str(os.getpid())
    except OSError:return False

def estado():
    try:data=json.loads(STATE.read_text(encoding='utf-8'))
    except (OSError,ValueError):data={}
    from sr_player import sr_vivo
    data['servico_ativo']=sr_vivo()
    if not data['servico_ativo']:data.update(tocando=False,erro='Serviço SR desligado. Clique em Iniciar SR independente.')
    return data

def publicar(data):
    STATE.parent.mkdir(exist_ok=True)
    temp=STATE.with_suffix(f'.{os.getpid()}.{uuid.uuid4().hex}.tmp')
    try:
        temp.write_text(json.dumps(dict(data,atualizado=time.time()),ensure_ascii=False),encoding='utf-8')
        for attempt in range(10):
            try:temp.replace(STATE);return True
            except PermissionError:
                # Leitores no Windows podem manter a versão anterior aberta por instantes.
                time.sleep(.01)
        return False  # Preserva o último estado; não interrompe reprodução.
    finally:temp.unlink(missing_ok=True)

def comando(action,*args):
    from sr_player import sr_vivo
    if action not in ACTIONS:raise ValueError('Controle SR desconhecido.')
    if not sr_vivo():raise ValueError('Inicie o serviço SR primeiro.')
    DIR.mkdir(parents=True,exist_ok=True)
    p=DIR/(uuid.uuid4().hex+'.json');tmp=p.with_suffix('.tmp')
    tmp.write_text(json.dumps(dict(acao=action,args=list(args),quando=time.time()),ensure_ascii=False),encoding='utf-8');tmp.replace(p)
    return 'Controle enviado ao SR.'

def consumir(sr):
    if not DIR.exists():return
    for p in sorted(DIR.glob('*.json'),key=lambda x:x.stat().st_mtime)[:20]:
        try:
            if p.stat().st_size>12000:continue
            data=json.loads(p.read_text(encoding='utf-8'))
            if time.time()-data.get('quando',0)>30:continue
            action=data.get('acao');args=data.get('args',[])
            if action not in ACTIONS or not isinstance(args,list) or len(args)>2:continue
            if action=='autenticar':
                from sr_player import _STREAM_STATUS,_YTD_CACHE
                _STREAM_STATUS.update(erro='',pausa_ate=0);_YTD_CACHE['cmd']=None;sr.erro='Sessão atualizada. Escolha uma faixa para testar.'
            elif action=='adicionar_playlist':threading.Thread(target=lambda args=args:sr.adicionar_playlist(*args),daemon=True).start()
            else:getattr(sr,action)(*args)
        except Exception:sr.erro='Não foi possível executar o controle solicitado.'
        finally:p.unlink(missing_ok=True)

def iniciar():
    from sr_player import sr_vivo,_cf,_py
    with START_LOCK:
        if sr_vivo():return 'SR já está ativo.'
        subprocess.Popen([_py(),str(BASE/'sr_servico.py')],cwd=str(BASE),creationflags=_cf(),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    return 'Iniciando SR em processo separado…'

class ProxySR:
    remoto=True
    def estado(self):return estado()
    def encerrar(self):pass # fechar a janela não encerra o serviço de outra janela
    def pedir(self,user,q,fonte='sr'):
        from sr_player import enfileirar
        return enfileirar(user,q,fonte)
    def __getattr__(self,name):
        if name in ACTIONS:return lambda *args:comando(name,*args)
        return estado().get(name)
    def __setattr__(self,name,value):
        if name=='saida':comando('set_saida',value)
        elif name not in ('erro',):object.__setattr__(self,name,value)
