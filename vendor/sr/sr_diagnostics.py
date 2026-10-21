"""Small private diagnostic log. Never stores media URLs, cookies or audio."""
import json,re,threading,time
from collections import deque
from pathlib import Path


def safe_error(value):
    text=re.sub(r'\x1b\[[0-9;]*m','',str(value or 'Falha sem detalhe do serviço.'))
    text='\n'.join('Detalhe de endereço de mídia omitido.' if any(marker in line for marker in ('&itag=','&ip=','&id=','requiressl=','videoplayback?','googlevideo.com')) else line for line in text.splitlines())
    text=re.sub(r'https?://\S+','[URL omitido]',text)
    text=re.sub(r'(?i)(authorization|cookie|token|signature|secret|password)\s*[:=]\s*\S+',r'\1=[omitido]',text)
    return text[-700:]


def classify_error(value):
    text=safe_error(value);low=text.lower()
    cases=[
      ('rate_limit',('429','too many requests','limitou as requisi'),True,True),
      ('private',('private video','vídeo privado'),False,False),
      ('removed',('has been removed','video has been deleted','removed by the uploader'),False,False),
      ('region',('not available in your country','not available in your region'),False,False),
      ('login',('not a bot','confirm you','sign in','exige login','login required'),True,True),
      ('engine',('motor youtube ausente','yt-dlp ausente','runtime javascript','extrator do youtube precisa'),True,True),
      ('audio_output',('saída','saida','output device','portaudio','ffplay não abriu','ffmpeg ausente','dispositivo'),True,True),
      ('unavailable',('video unavailable','vídeo indisponível','video is unavailable','não está disponível'),False,False),
      ('timeout',('timed out','timeout','demorou demais'),True,False),
      ('network',('connection','http error 403','server returned 403','403 forbidden','http error 5','network','conexão','conexao','falha ao obter áudio'),True,False),
    ]
    for code,terms,retryable,pause in cases:
        if any(term in low for term in terms):return {'code':code,'reason':text,'retryable':retryable,'pause':pause}
    return {'code':'unknown','reason':text,'retryable':True,'pause':False}


class SRDiagnostics:
    def __init__(self,directory,max_bytes=2*1024*1024):
        self.path=Path(directory)/'sr-events.jsonl';self.max_bytes=max_bytes
        self.rows=deque(maxlen=50);self.lock=threading.RLock();self.sequence=0
        if self.path.exists():
            try:
                with self.path.open(encoding='utf-8') as source:
                    for line in deque(source,maxlen=50):self.rows.append(json.loads(line))
            except (OSError,ValueError):pass
    def record(self,event,item=None,reason='',code=''):
        item=item or {}
        with self.lock:
            self.sequence+=1
            row={'at':time.time(),'event':event,'id':str(item.get('id') or ''),'title':str(item.get('titulo') or '')[:300],'position':item.get('playlist_index'),'code':code,'reason':safe_error(reason) if reason else ''}
            self.rows.append(row)
            try:
                self.path.parent.mkdir(parents=True,exist_ok=True)
                if self.path.exists() and self.path.stat().st_size>=self.max_bytes:
                    previous=self.path.with_suffix('.previous.jsonl');self.path.replace(previous)
                with self.path.open('a',encoding='utf-8') as output:output.write(json.dumps(row,ensure_ascii=False)+'\n')
            except OSError:pass
            return row
    def snapshot(self):
        with self.lock:return {'sequence':self.sequence,'events':list(self.rows),'file':str(self.path)}
