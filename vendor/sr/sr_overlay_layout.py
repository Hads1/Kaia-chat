"""Layout do segundo HUD SR, independente do player e do HUD original."""
import json,threading
from pathlib import Path
FILE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))/'avatar/sr_layout.json'
LOCK=threading.Lock()
DEFAULT={'theme':'neon','width':520,'padding':20,'radius':20,'titleSize':22,'opacity':85,'accent':'#4ae8ff','background':'#101629','text':'#ffffff','font':'Segoe UI','showWho':True,'showTime':True,'showBar':True,'customCSS':''}
DEFAULT.update(rgbMode='off',rgbSpeed=10,rgbStrength=55)
DEFAULT.update(showSpectrum=False,spectrumHeight=64,spectrumBars=24,gainBass=100,gainMid=100,gainTreble=100)
def validar(data):
    cfg=DEFAULT.copy()
    if not isinstance(data,dict):raise ValueError('Layout inválido.')
    for k,low,high in [('width',200,1600),('padding',0,80),('radius',0,80),('titleSize',12,80),('opacity',0,100),('rgbSpeed',2,60),('rgbStrength',0,100)]:
        cfg[k]=max(low,min(high,int(data.get(k,cfg[k]))))
    import re
    for k in ('accent','background','text'):
        value=str(data.get(k,cfg[k]))
        if not re.fullmatch(r'#[0-9a-fA-F]{6}',value):raise ValueError('Cor inválida.')
        cfg[k]=value
    cfg['theme']=data.get('theme') if data.get('theme') in ('neon','minimal','glass','retro','broadcast') else 'neon'
    cfg['font']=str(data.get('font',cfg['font']))[:80]
    for k in ('showWho','showTime','showBar'):cfg[k]=bool(data.get(k,cfg[k]))
    cfg['customCSS']=str(data.get('customCSS',''))[:20000]
    cfg['rgbMode']=data.get('rgbMode','off') if data.get('rgbMode','off') in ('off','rainbow','track','audio') else 'off'
    cfg['showSpectrum']=bool(data.get('showSpectrum',False))
    for k,lo,hi in [('spectrumHeight',24,200),('spectrumBars',8,64),('gainBass',0,200),('gainMid',0,200),('gainTreble',0,200)]:cfg[k]=max(lo,min(hi,int(data.get(k,DEFAULT[k]))))
    return cfg
def salvar(data):
    cfg=validar(data)
    with LOCK:
        if FILE.exists():FILE.with_suffix('.backup.json').write_bytes(FILE.read_bytes())
        tmp=FILE.with_suffix('.tmp');tmp.write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(FILE)
    return cfg
