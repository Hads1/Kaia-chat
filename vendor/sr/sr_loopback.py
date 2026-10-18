"""Mede saída Windows para os HUDs; PCM só em memória, sem microfone."""
import json,threading,time
from pathlib import Path
BASE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
CONFIG=BASE/'sr_visual_config.json'
STOP=threading.Event();THREAD=None
_CFG=None;_STAMP=None
def config():
    global _CFG,_STAMP
    try:
        stamp=CONFIG.stat().st_mtime_ns
        if _CFG is None or stamp!=_STAMP:_CFG=json.loads(CONFIG.read_text(encoding='utf-8'));_STAMP=stamp
        return dict(_CFG)
    except (OSError,ValueError):return {'enabled':True,'device':'Alto-falantes (3- Logitech G533 Gaming Headset)'}
def salvar(**changes):
    d=config();d.update(changes);tmp=CONFIG.with_suffix('.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(CONFIG)
def saidas():
    import soundcard as sc
    return [s.name for s in sc.all_speakers()]
def status(state,**values):
    p=BASE/'avatar/sr_visual_status.json';tmp=p.with_suffix('.tmp')
    try:tmp.write_text(json.dumps(dict(estado=state,quando=time.time(),**values),ensure_ascii=False),encoding='utf-8');tmp.replace(p)
    except OSError:pass
def run():
    import soundcard as sc
    from sr_audio_visual import Meter
    while not STOP.is_set():
        cfg=config()
        if not cfg.get('enabled'):status('DESATIVADO');STOP.wait(1);continue
        try:
            speakers=sc.all_speakers();target=cfg.get('device','')
            speaker=next((s for s in speakers if s.name==target or s.id==target),None) if target else sc.default_speaker()
            if speaker is None:raise ValueError('Saída selecionada não encontrada.')
            loop=sc.get_microphone(id=speaker.id,include_loopback=True)
            if not loop.isloopback:raise ValueError('A entrada não é loopback de saída.')
            meter=Meter(source='system_loopback');status('MEDINDO',dispositivo=speaker.name)
            with loop.recorder(samplerate=48000,channels=[0,1],blocksize=4800) as recorder:
                while not STOP.is_set() and config()==cfg:meter.publish(recorder.record(numframes=4800))
        except Exception as e:status('ERRO',motivo=type(e).__name__);STOP.wait(3)
def iniciar():
    global THREAD
    if THREAD and THREAD.is_alive():return
    STOP.clear();THREAD=threading.Thread(target=run,daemon=True);THREAD.start()
def parar():STOP.set()
