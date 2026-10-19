"""JSON-lines bridge. Chat connections remain exclusively in Electron."""
import sys,os,json,threading,time,asyncio,uuid,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
DATA=Path(os.environ['KAIA_MEDIA_DATA']);DATA.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(ROOT/'vendor/sr'),str(ROOT/'vendor/reader')]
OUT=sys.stdout
sys.stdout=sys.stderr
LOCK=threading.Lock();PLAYER=None;VOICE_STOP=threading.Event();LAST_STATE={};PLAYLIST_JOB={'busy':False,'message':''};CHAT_STOP=threading.Event();CHAT_LOCK=threading.Lock()
def reply(value):
    with LOCK:OUT.write(json.dumps(value,ensure_ascii=False)+'\n');OUT.flush()
def initialize():
    # Load native extensions before the main thread blocks reading stdin.
    # First importing NumPy in a request thread can deadlock on Windows.
    import numpy,sounddevice
    for folder in ('avatar','tmp_sr','aprendizado','bin','sr_auth'): (DATA/folder).mkdir(exist_ok=True)
    for source in (ROOT/'vendor/sr/avatar').glob('*.json'):
        dest=DATA/'avatar'/source.name
        if not dest.exists():shutil.copy2(source,dest)
    for name in ('config.yaml','sr_visual_config.json','sr_youtube_config.json'):
        dest=DATA/name
        if not dest.exists():shutil.copy2(ROOT/'vendor/sr'/name,dest)
    shutil.copy2(ROOT/'backend/audio_device_worker.py',DATA/'audio_device_worker.py')
    # The original Spotify monitor is replaced by Electron's PKCE and automatic refresh.
    import spotify_agora
    spotify_agora.iniciar_monitor=lambda *args,**kwargs:None
def player():
    global PLAYER
    if PLAYER is None:
        import sr_player
        sr_player._bin_original=sr_player._bin
        sr_player.get_sr # keep the original public entry point available
        PLAYER=sr_player.get_sr()
    return PLAYER
def command(action,args):
    global LAST_STATE,CHAT_STOP
    if action=='diagnose':
        import audio_out
        outputs=audio_out.listar_saidas()
        return {'outputs':outputs,'loopbacks':[d['nome'] for d in outputs if d['nome']],'ffmpeg':bool(audio_out.ffmpeg_bin()),'ffplay':bool(audio_out.ffplay_bin()),'python':sys.version.split()[0]}
    if action=='state':
        if not PLAYER:return {'titulo':'','fila':[],'historico':[],'paused':True,'volume':80,'playlist_job':dict(PLAYLIST_JOB)}
        lock=getattr(PLAYER,'_lock',None)
        if lock and not lock.acquire(timeout=.05):return {**LAST_STATE,'busy':True,'playlist_job':dict(PLAYLIST_JOB)}
        try:LAST_STATE=PLAYER.estado();return {**LAST_STATE,'playlist_job':dict(PLAYLIST_JOB)}
        finally:
            if lock:lock.release()
    if action=='adicionar_playlist':
        if PLAYLIST_JOB['busy']:raise ValueError('Uma playlist já está sendo importada. Aguarde o resultado na tela.')
        PLAYLIST_JOB.update(busy=True,message='Importando playlist…')
        def import_playlist():
            try:PLAYLIST_JOB['message']=player().adicionar_playlist(*args)
            except Exception:PLAYLIST_JOB['message']='Não foi possível importar a playlist. Verifique o link e a sessão YouTube.'
            finally:PLAYLIST_JOB['busy']=False
        threading.Thread(target=import_playlist,daemon=True).start()
        return 'Importação iniciada em segundo plano. Os controles continuam disponíveis.'
    if action=='speak':
        import edge_tts,audio_out
        VOICE_STOP.clear();c=args['config'];m=args['message']
        text=(m['user']+' diz: ' if c['sayName'] else '')+m['text'][:(1000 if m.get('announcement') else int(c.get('maxChars',300)))]
        file=DATA/'tmp_sr'/('reader-'+uuid.uuid4().hex+'.mp3')
        budget=15 if m.get('announcement') else 8
        deadline=min(time.time()+budget,float(m.get('expiresAt') or (time.time()+8000)*1000)/1000)
        async def synthesize():
            with file.open('wb') as output:
                async for chunk in edge_tts.Communicate(text,c['voice'],rate=f"{int(c['rate']):+d}%",connect_timeout=5,receive_timeout=8).stream():
                    if VOICE_STOP.is_set():return
                    if chunk['type']=='audio':output.write(chunk['data'])
        try:
            remaining=deadline-time.time()
            if remaining<=0:raise RuntimeError('Mensagem antiga descartada da leitura para acompanhar a live.')
            async def bounded():await asyncio.wait_for(synthesize(),timeout=remaining)
            try:asyncio.run(bounded())
            except (TimeoutError,asyncio.TimeoutError):raise RuntimeError(f'Geração da voz excedeu {budget} segundos. Verifique a conexão do serviço de voz.')
            if m.get('expiresAt') and time.time()*1000>=m['expiresAt']:
                raise RuntimeError('Mensagem antiga descartada da leitura para acompanhar a live.')
            if not VOICE_STOP.is_set():
                result=audio_out.tocar_bloqueado(str(file),saida=c['output'],volume=c['volume'],parar=lambda:'parar' if VOICE_STOP.is_set() else '',papel='leitura')
                if result=='erro':raise RuntimeError('Saída de leitura indisponível; selecione novamente o dispositivo.')
            return 'Leitura concluída'
        finally:file.unlink(missing_ok=True)
    if action=='stop-voice':VOICE_STOP.set();return True
    if action=='chat-sound':
        import audio_out
        CHAT_STOP.set();event=threading.Event();CHAT_STOP=event
        def play_alert():
            with CHAT_LOCK:
                if event.is_set():return
                try:
                    result=audio_out.tocar_bloqueado(args['file'],saida=args['output'],volume=args['volume'],papel='chat',parar=lambda:'parar' if event.is_set() else '')
                    if result=='erro':reply({'event':'audio-error','text':'Som do chat indisponível. Revise a saída configurada no Leitor.'})
                except Exception:reply({'event':'audio-error','text':'Falha ao tocar o som privado do chat. Revise o arquivo e a saída do Leitor.'})
        threading.Thread(target=play_alert,daemon=True).start()
        return True
    if action=='test-sr-audio':
        import audio_out,wave,math,struct
        if PLAYER and PLAYER.proc is not None and PLAYER.proc.poll() is None:
            raise RuntimeError('Pare a música antes de testar a saída do SR.')
        volume=max(0,min(100,int(args['volume'])))
        if not volume:raise RuntimeError('Aumente o volume do SR antes de testar.')
        file=DATA/'tmp_sr'/('sr-test-'+uuid.uuid4().hex+'.wav')
        try:
            with wave.open(str(file),'wb') as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(44100)
                wav.writeframes(b''.join(struct.pack('<h',int(6000*math.sin(2*math.pi*440*i/44100)*min(1,i/2205,(44100-i)/2205))) for i in range(44100)))
            result=audio_out.tocar_bloqueado(str(file),saida=args['output'],volume=volume,papel='sr')
            if result=='erro':raise RuntimeError('Falha na saída exclusiva do SR. Selecione novamente o dispositivo de áudio.')
            return 'Tom de teste enviado à saída do SR. Confirme se você ouviu; este teste não usa YouTube nem os alertas.'
        finally:file.unlink(missing_ok=True)
    if action=='layout':
        from sr_overlay_layout import salvar
        return salvar(args)
    if action=='loopback':
        import sr_loopback
        sr_loopback.salvar(enabled=bool(args.get('enabled')),device=str(args.get('device','')))
        sr_loopback.iniciar();return True
    if action=='cookies':
        from sr_player import configurar_cookies
        configurar_cookies(args['path']);return True
    if action=='test-youtube':
        from sr_player import _url_stream,_stream_erro
        if not _url_stream('jNQXAC9IVRw'):raise RuntimeError(_stream_erro())
        return 'YouTube acessível; áudio resolvido sem reproduzir.'
    if action=='shutdown':
        VOICE_STOP.set();CHAT_STOP.set()
        if PLAYER:PLAYER.encerrar()
        import sr_loopback
        sr_loopback.parar();return True
    allowed={'pedir','play_pause','retry','stop','skip','prev','seek','set_volume','set_saida','mute_toggle','set_repeat','set_shuffle','limpar','remover_fila','limpar_historico','apagar_historico','set_limits','edit_queue','play','pause'}
    if action in ('play','pause'):
        p=player()
        if (action=='play' and p.paused) or (action=='pause' and not p.paused and p.atual):return p.play_pause()
        if action=='play' and not p.atual:return p.retry()
        return True
    if action not in allowed:raise ValueError('Comando desconhecido.')
    return getattr(player(),action)(*args)
def handle(request):
    try:reply({'id':request['id'],'result':command(request['action'],request.get('args',[]))})
    except Exception as error:reply({'id':request.get('id'),'error':str(error)[:400]})
initialize()
reply({'event':'ready'})
for line in sys.stdin:
    try:
        request=json.loads(line)
        if request['action']=='shutdown':handle(request);break
        if request['action']=='stop-voice':handle(request);continue
        threading.Thread(target=handle,args=(request,),daemon=True).start()
    except Exception:pass
VOICE_STOP.set()
CHAT_STOP.set()
if PLAYER:PLAYER.encerrar()
