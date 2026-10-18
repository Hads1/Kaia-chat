"""Valida perguntas sobre a faixa atual usando os estados reais de SR/Spotify."""
from __future__ import annotations
import json,re,time,unicodedata,logging
from pathlib import Path
from typing import Optional
ESTADO=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))/'avatar'/'sr.json'
log=logging.getLogger('kaia.music')

def norm(text):
 return ''.join(c for c in unicodedata.normalize('NFD',str(text).lower()) if unicodedata.category(c)!='Mn')

def validar_pergunta(texto):
 n=norm(texto).strip(); no=dict(accepted=False,reason='OUTRO_ASSUNTO',attribute='titulo',source='')
 if not n or len(n)>4000 or n.startswith('!'):return no
 musical=bool(re.search(r'\b(musicas?|som|faixa|track|song|music|spotify|sr)\b',n))
 cantor=bool(re.search(r'\b(quem canta|qual (?:o )?(?:artista|cantor|cantora|banda)|de quem e)\b',n))
 referencia=bool(re.search(r'\b(essa|esse|esta|este|dessa|desse|desta|deste|agora|tocando|ouvindo|na live|nessa live|no sr|no spotify|atual)\b',n))
 pedido=bool('?' in n or re.search(r'\b(qual|que|quem|como|chama|nome|manda|passa|diz|fala|saber|identifica|what|who)\b',n))
 if not pedido or not (musical or (cantor and referencia) or n in ('quem canta?','quem canta')):return no
 # Letras, fatos musicais, recomendações e histórias pessoais não consultam a faixa da live.
 if re.search(r'\b(ontem|amanha|semana passada|minha playlist|meu spotify|meu celular|na minha|no meu|recomenda|recomendacao|sugere|sugestao|posso tocar|vou tocar|musica para|musica pra|musica do jogo|musica de abertura|letra|verso|compo[es]|significa|traduz|tradu[cz]|historia|origem)\b',n):return no
 if re.search(r'\b(anterior|passada|antes|ultima|proxima|seguinte|depois)\b',n):return dict(no,reason='OUTRO_MOMENTO')
 generica=bool(re.fullmatch(r'(?:kaia[, ]+)?(?:qual (?:e )?(?:o |a )?(?:nome (?:da |dessa )?)?(?:musica|som|faixa)|(?:nome (?:da |dessa )musica)|que musica(?: e essa)?)[?.! ]*',n))
 nome_pedido=bool(re.fullmatch(r'(?:kaia[, ]+)?(?:me )?(?:manda|passa|diz|fala)(?: pra mim| me)? (?:o )?nome (?:da |dessa )?(?:musica|faixa)(?: por favor)?[?.! ]*',n))
 if not referencia and not generica and not nome_pedido and n not in ('quem canta?','quem canta'):return no
 if re.search(r'\b(favorita|preferida|mais famosa|gosta|gostar|melhor musica|pior musica)\b',n):return no
 if not referencia and re.search(r'\b(?:musica|som|faixa)\s+(?:de|do|da)\s+\w+',n):return no
 atributo='artista' if cantor or re.search(r'\b(artista|cantor|cantora|banda)\b',n) else 'titulo'
 if re.search(r'\b(link|url)\b',n):atributo='link'
 if re.search(r'\b(quem pediu|pedido de|solicitou)\b',n):atributo='pedido'
 fonte='spotify' if re.search(r'\b(?:no |do |da |pelo )spotify\b',n) else 'sr' if re.search(r'\b(?:no |do |pelo )sr\b',n) else ''
 return dict(accepted=True,reason='FAIXA_ATUAL',attribute=atributo,source=fonte)

def _estado():
 try:
  d=json.loads(ESTADO.read_text(encoding='utf-8'));return d if isinstance(d,dict) else {}
 except (OSError,ValueError):return {}

def _ativo(d,agora,limite):
 try:stamp=float(d.get('quando') or d.get('updated_at') or 0)
 except (ValueError,TypeError):return False
 if not stamp or not -5<=agora-stamp<=limite:return False
 if d.get('fonte')=='janela' or d.get('cache_antigo') or d.get('paused') or d.get('estado') in ('PAUSED','NO_TRACK','UNAVAILABLE','ERROR','RECONNECTING'):return False
 if not d.get('tocando') or not str(d.get('titulo') or d.get('faixa') or '').strip():return False
 try:
  dur=float(d.get('dur') or 0);elapsed=float(d.get('elapsed') or 0)
  if dur>0 and elapsed>=dur:return False
 except (ValueError,TypeError):return False
 return True

def _limpo(value):
 return re.sub(r'\s+',' ',str(value or '')).strip()[:240]

def responder(texto: str) -> Optional[str]:
 decisao=validar_pergunta(texto)
 if decisao['reason']=='OUTRO_MOMENTO':
  # Preserva consultas legadas de fila/histórico sem apresentá-las como faixa atual.
  n=norm(texto);d=_estado()
  if re.search(r'\b(proxima|seguinte|depois)\b',n):
   fila=d.get('fila') or []
   item=next((x for x in fila if isinstance(x,dict) and x.get('titulo')),None)
   return 'A próxima da fila do SR é '+_limpo(item['titulo'])+'.' if item else 'Não há uma próxima música identificada na fila do SR.'
  try:
   from sr_player import ler_historico
   historico=ler_historico(80)
   item=next((x for x in historico if isinstance(x,dict) and x.get('titulo') and x.get('titulo')!=d.get('titulo')),None)
  except Exception:item=None
  return 'A última registrada no histórico do SR é '+_limpo(item['titulo'])+'.' if item else 'Não há uma música anterior identificada no histórico do SR.'
 if not decisao['accepted']:return None
 now=time.time();sr=_estado();sp={}
 # SR pode espelhar Spotify para a HUD; não é outra fonte independente.
 sr_ok=sr.get('fonte_atual')!='spotify' and _ativo(sr,now,15) and sr.get('volume',100)!=0
 if decisao['source']=='spotify' or (not sr_ok and decisao['source']!='sr'):
  try:
   from spotify_agora import agora
   sp=agora() or {}
  except Exception as exc:log.warning('[MUSIC] Spotify indisponível (%s)',type(exc).__name__)
 sp_ok=_ativo(sp,now,90)
 fonte=decisao['source']
 if fonte=='sr':d,fonte=(sr,'SR') if sr_ok else ({},'SR')
 elif fonte=='spotify':d,fonte=(sp,'Spotify') if sp_ok else ({},'Spotify')
 elif sr_ok:d,fonte=sr,'SR'
 elif sp_ok:d,fonte=sp,'Spotify'
 else:d,fonte={},''
 log.info('[MUSIC] intent=%s source=%s confirmed=%s',decisao['reason'],fonte,bool(d))
 if not d:return 'Não consigo confirmar uma música tocando'+(' no '+fonte if fonte else ' na live')+' agora.'
 titulo=_limpo(d.get('faixa') or d.get('titulo'));artista=_limpo(d.get('artista'));atributo=decisao['attribute']
 frase=f'Está tocando {titulo}'+(f', de {artista}' if artista else '')+f' no {fonte}.'
 if atributo=='artista' and not artista:frase+= ' A fonte não informou o artista separadamente.'
 if atributo=='pedido':frase+= (' Pedido de '+_limpo(d['user'])+'.') if fonte=='SR' and d.get('user') else ' Não há um pedido do chat identificado para essa faixa.'
 if atributo=='link':
  url=str(d.get('url') or d.get('url_reference') or '')
  from urllib.parse import urlsplit
  parsed=urlsplit(url)
  if parsed.scheme=='https' and parsed.hostname in ('www.youtube.com','youtube.com','youtu.be','open.spotify.com') and not parsed.username:frase+=' '+url[:500]
  else:frase+=' A fonte não informou um link confirmado.'
 return frase
