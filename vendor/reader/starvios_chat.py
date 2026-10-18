"""Chat público Starvios pelo mesmo serviço utilizado pela página do canal."""
import threading,time,re,os
from urllib.parse import urljoin
import requests

class StarviosChat:
    def __init__(self,channel,on_message,on_status=None,on_history=None):
        if not re.fullmatch(r'[a-zA-Z0-9_-]+',channel):raise ValueError('Canal inválido.')
        self.channel=channel.lower();self.on_message=on_message;self.on_status=on_status;self.on_history=on_history
        self.stop_event=threading.Event();self.session=requests.Session();self.session.trust_env=False
        self.base='';self.stream_id='';self.cursor='';self.seen=set();self.seeded=False
        self.cursor_id='';self.connected=False;self.last_error='';self.last_message_at=0
    def status(self,text):
        from chat_saude import registrar
        registrar('starvios','status',text,force=True)
        if self.on_status:self.on_status(text)
    def connect(self):
        r=self.session.get('https://starvios.com/'+self.channel,timeout=(4,12));r.raise_for_status()
        scripts=re.findall(r'<script[^>]+src=["\'](/assets/index-[^"\']+\.js)',r.text)
        if not scripts:raise ValueError('Cliente público Starvios mudou.')
        js=self.session.get(urljoin('https://starvios.com',scripts[0]),timeout=(4,12));js.raise_for_status()
        key=re.search(r'VITE_SUPABASE_PUBLISHABLE_KEY:`([^`]+)`',js.text)
        url=re.search(r'VITE_SUPABASE_URL:`(https://[a-z0-9]+\.supabase\.co)`',js.text)
        if not key or not url:raise ValueError('Serviço público não identificado.')
        self.base=url[1];self.session.headers.update({'apikey':key[1]})
        profile=self.get('profiles',select='id',username='eq.'+self.channel,limit='1')
        if not profile:raise ValueError('Canal não encontrado.')
        self.channel_id=profile[0]['id'];self.refresh_stream()
    def get(self,table,**params):
        r=self.session.get(self.base+'/rest/v1/'+table,params=params,timeout=(3,8));r.raise_for_status();return r.json()
    def refresh_stream(self):
        rows=self.get('live_streams',select='id,status',channel_id='eq.'+self.channel_id,limit='100')
        if not rows:self.connected=False;self.stream_id='';self.status('Canal ainda sem chat disponível.');return False
        active=[r for r in rows if str(r.get('status','')).lower() in ('live','active','streaming','online')]
        selected=active[0] if active else next((r for r in rows if r['id']==self.stream_id),rows[0])
        sid=selected['id']
        if sid!=self.stream_id:self.stream_id=sid;self.cursor='';self.cursor_id='';self.seen=set();self.seeded=False
        return True
    def poll(self):
        if not self.stream_id:return 0
        params={'select':'id,user_id,body,kind,badges,is_deleted,created_at,profiles:profiles!live_chat_messages_user_id_fkey(username,display_name)','stream_id':'eq.'+self.stream_id,'order':'created_at.desc' if not self.cursor else 'created_at.asc','limit':'200'}
        initial=not self.seeded
        if self.cursor:
            params['order']='created_at.asc,id.asc'
            if self.cursor_id:params['or']='(created_at.gt.'+self.cursor+',and(created_at.eq.'+self.cursor+',id.gt.'+self.cursor_id+'))'
            else:params['created_at']='gte.'+self.cursor
        rows=self.get('live_chat_messages',**params)
        self.seeded=True
        for row in sorted(rows,key=lambda r:(r.get('created_at',''),str(r.get('id','')))):
            id=row.get('id')
            position=(row.get('created_at',''),str(id or ''))
            if position>(self.cursor,self.cursor_id):self.cursor,self.cursor_id=position
            if id in self.seen:continue
            self.seen.add(id)
            if row.get('is_deleted') or row.get('kind','message')!='message' or not row.get('body'):continue
            profile=row.get('profiles') or {};user=profile.get('username') or profile.get('display_name') or 'visitante'
            if os.getenv('STARVIOS_BOT_NICK','').casefold()==user.casefold():continue
            badges=row.get('badges') or [];badges=set(badges) if isinstance(badges,list) else set(badges)
            meta=dict(plataforma='starvios',canal=self.channel,user_id=row.get('user_id') or user,stream_id=self.stream_id,message_id=id,vip='vip' in badges,sub='member' in badges,mod='moderator' in badges,broadcaster='owner' in badges)
            if initial:
                if self.on_history:self.on_history(user,row['body'],meta)
            else:
                self.last_message_at=time.time()
                self.on_message(user,row['body'],meta)
        if len(self.seen)>4000:self.seen={r.get('id') for r in rows}
        return len(rows)
    def start(self):threading.Thread(target=self.run,daemon=True).start()
    def stop(self):self.stop_event.set();self.connected=False
    def run(self):
        while not self.stop_event.is_set():
            try:
                self.connect()
                if not self.stream_id:self.stop_event.wait(10);continue
                self.poll();self.connected=True;self.last_error='';self.status('Conectado a '+self.channel+' · leitura pública ativa. Histórico anterior não é falado.')
                ticks=0
                while not self.stop_event.wait(2):
                    self.poll();ticks+=1
                    if ticks%30==0:self.refresh_stream()
            except Exception as e:
                self.connected=False;self.last_error=type(e).__name__
                self.status('Conexão indisponível: '+type(e).__name__+'. Tentando novamente.')
            self.stop_event.wait(10)
    def send_text(self,text):
        token=os.getenv('STARVIOS_ACCESS_TOKEN')
        if not token:return False
        r=self.session.post(self.base+'/rest/v1/rpc/send_live_message',headers={'Authorization':'Bearer '+token},json={'_stream_id':self.stream_id,'_body':text[:500],'_coins':0},timeout=(3,8))
        return r.status_code in (200,201) and bool(r.json())
