"""Leitor independente: apenas recebe, exibe e fala. Nenhuma interpretação por IA."""
import asyncio,html,json,queue,re,threading,time,uuid
from pathlib import Path
BASE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))

class Leitor:
    def __init__(self,cfg,on_message=lambda *a:None,on_status=lambda *a:None):
        self.cfg=cfg;self.on_message=on_message;self.on_status=on_status;self.clients=[]
        self.stop=threading.Event();self.queue=queue.Queue(maxsize=100);self.last=0
        self.thread=None
    def receber(self,user,text,meta=None):
        meta=meta or {};self.on_message(user,text,meta)
        if user.casefold() in {x.casefold() for x in self.cfg.get('ignorados',[])}:return
        if self.cfg.get('ignorar_comandos',True) and text.lstrip().startswith('!'):return
        text=html.unescape(re.sub(r'<[^>]+>','',text)).strip()
        if not text:return
        try:self.queue.put_nowait((user[:60],text[:1000]))
        except queue.Full:self.on_status('Fila cheia: mensagem exibida, mas não enfileirada para voz.')
    def iniciar(self):
        if self.thread and self.thread.is_alive():return
        self.stop.clear();self.thread=threading.Thread(target=self.worker,daemon=True);self.thread.start()
        for platform in ('kick','twitch','starvios'):
            c=self.cfg.get(platform,{})
            if not c.get('enabled') or not c.get('channel'):continue
            try:
                def receive(u,t,m=None,p=platform):self.receber(u,t,{**(m or {}),'plataforma':p})
                def status(s,p=platform):self.on_status(p+': '+s)
                if platform=='kick':
                    from kick_chat import KickChat,resolve_canal
                    info=resolve_canal(c['channel']);kid=info.get('chatroom_id') or c.get('chatroom_id')
                    if not kid:raise ValueError('Não foi possível localizar o chatroom Kick.')
                    client=KickChat(int(kid),receive,channel_id=info.get('channel_id'),on_status=status)
                elif platform=='twitch':
                    from twitch_chat import TwitchChat
                    client=TwitchChat(c['channel'],receive,on_status=status)
                else:
                    from starvios_chat import StarviosChat
                    client=StarviosChat(c['channel'],receive,on_status=status)

                if self.stop.is_set():break
                self.clients.append(client);client.start()
            except Exception as e:self.on_status(platform+': falha de inicialização '+type(e).__name__)
    def encerrar(self):
        self.stop.set()
        for c in self.clients:c.stop()
        self.clients=[]
    def sintetizar(self,text,path):
        import edge_tts
        async def run():
            await edge_tts.Communicate(text,self.cfg.get('voice','pt-BR-FranciscaNeural'),rate=self.cfg.get('rate','+0%'),volume=self.cfg.get('volume','+0%'),connect_timeout=8,receive_timeout=15).save(str(path))
        asyncio.run(run())
    def worker(self):
        from audio_out import tocar_bloqueado
        folder=BASE/'tmp_leitura';folder.mkdir(exist_ok=True)
        while not self.stop.is_set():
            try:user,text=self.queue.get(timeout=.3)
            except queue.Empty:continue
            delay=max(0,float(self.cfg.get('intervalo_segundos',5)))
            if self.stop.wait(max(0,delay-(time.monotonic()-self.last))):break
            if not self.cfg.get('saida'):
                self.on_status('Escolha um dispositivo de saída explícito antes de ler.');continue
            path=folder/(uuid.uuid4().hex+'.mp3')
            try:
                for attempt in range(2):
                    try:self.sintetizar(user+' diz: '+text,path);break
                    except Exception:
                        if attempt:raise
                        if self.stop.wait(1.5):return
                if self.stop.is_set():break
                result=tocar_bloqueado(str(path),saida=self.cfg['saida'],volume=80,parar=lambda:'parar' if self.stop.is_set() else '',papel='leitura')
                if result=='erro':raise RuntimeError('Dispositivo privado indisponível')
                self.last=time.monotonic();self.on_status('Leitura concluída: '+user)
            except Exception as e:self.on_status('Erro de voz/saída: '+type(e).__name__+'. Mensagens continuam aparecendo.')
            finally:path.unlink(missing_ok=True)

def main():
    import tkinter as tk
    from tkinter import ttk
    from audio_out import listar_saidas
    cfg=json.loads((BASE/'config_leitor.json').read_text(encoding='utf-8'))
    root=tk.Tk();root.title('Leitor de chat · sem interpretação');root.geometry('850x650')
    events=queue.Queue();reader=[None]
    tk.Label(root,text='Somente leitura de chat · Kick / Twitch / Starvios',font=('Segoe UI',15,'bold')).pack(pady=8)
    channels={};enabled={}
    for p in ('kick','twitch','starvios'):
        row=tk.Frame(root);row.pack(fill='x',padx=12)
        enabled[p]=tk.BooleanVar(value=cfg[p]['enabled']);channels[p]=tk.StringVar(value=cfg[p]['channel'])
        tk.Checkbutton(row,text=p,variable=enabled[p],width=10).pack(side='left');tk.Entry(row,textvariable=channels[p]).pack(side='left',fill='x',expand=True)
    tk.Label(root,text='Saída privada · escolha o headset que não será transmitido pelo OBS').pack()
    devices=[d['nome'] for d in listar_saidas() if d.get('nome')]
    output=tk.StringVar(value=cfg.get('saida',''));ttk.Combobox(root,textvariable=output,values=devices,state='readonly',width=75).pack(padx=12,pady=4)
    voice=tk.StringVar(value=cfg.get('voice','pt-BR-FranciscaNeural'))
    ttk.Combobox(root,textvariable=voice,values=['pt-BR-FranciscaNeural','pt-BR-ThalitaMultilingualNeural'],width=60).pack()
    delay=tk.StringVar(value=str(cfg.get('intervalo_segundos',5)))
    row=tk.Frame(root);row.pack();tk.Label(row,text='Intervalo entre leituras (s):').pack(side='left');tk.Entry(row,textvariable=delay,width=6).pack(side='left')
    log=tk.Text(root,wrap='word');log.pack(fill='both',expand=True,padx=12,pady=8)
    status=tk.StringVar(value='Escolha os canais e a saída. Não há interpretação nem publicação de mensagens.')
    tk.Label(root,textvariable=status,wraplength=800).pack()
    def stop():
        if reader[0]:reader[0].encerrar();reader[0]=None
        status.set('Parado')
    def start():
        if reader[0]:status.set('Pare antes de iniciar novamente.');return
        if not output.get():status.set('Selecione uma saída de áudio.');return
        try:interval=max(0,float(delay.get()))
        except ValueError:status.set('Intervalo inválido');return
        cfg.update(saida=output.get(),voice=voice.get(),intervalo_segundos=interval)
        for p in channels:cfg[p]={'enabled':enabled[p].get(),'channel':channels[p].get().strip()}
        (BASE/'config_leitor.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
        def msg(u,t,m):events.put(('message',f"[{m.get('plataforma','chat')}] {u}: {t}"))
        reader[0]=Leitor(cfg,msg,lambda s:events.put(('status',s)))
        threading.Thread(target=reader[0].iniciar,daemon=True).start();status.set('Conectando…')
    controls=tk.Frame(root);controls.pack(pady=8)
    tk.Button(controls,text='Iniciar leitura',command=start).pack(side='left',padx=6);tk.Button(controls,text='Parar',command=stop).pack(side='left',padx=6)
    def poll():
        try:
            while True:
                kind,text=events.get_nowait()
                if kind=='status':status.set(text)
                else:
                    log.insert('end',text+'\n');log.see('end')
                    if int(log.index('end-1c').split('.')[0])>1200:log.delete('1.0','200.0')
        except queue.Empty:pass
        root.after(100,poll)
    def close():stop();root.destroy()
    root.protocol('WM_DELETE_WINDOW',close);root.after(100,poll);root.mainloop()
if __name__=='__main__':main()
