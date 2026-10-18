"""FFT do PCM do SR ou da saída Windows; sem capturar microfone."""
import json,time,math,threading
from pathlib import Path
FILE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))/'avatar/sr_audio_visual.json'
class Meter:
    def __init__(self,source='sr_pcm'):self.last=0;self.average=.01;self.beat_at=0;self.source=source;self.peak=.01
    def sample(self,pcm,now=None):
        import numpy as np
        now=time.monotonic() if now is None else now
        if now-self.last<.1:return None
        self.last=now
        a=np.asarray(pcm,dtype=np.float32)
        rms=float(np.sqrt(np.mean(a*a))) if a.size else 0
        if not math.isfinite(rms):rms=0
        mono=a.mean(axis=1) if a.ndim==2 else a
        bands=[]
        if mono.size>=64:
            spectrum=np.abs(np.fft.rfft(mono*np.hanning(mono.size)))/max(1,mono.size/2)
            frequencies=np.fft.rfftfreq(mono.size,1/48000)
            edges=np.geomspace(25,16000,17)
            for lo,hi in zip(edges[:-1],edges[1:]):
                bins=spectrum[(frequencies>=lo)&(frequencies<hi)]
                value=float(np.max(bins))*5 if bins.size else 0
                bands.append(min(1,value) if math.isfinite(value) else 0)
        if self.source=='system_loopback' and bands:
            self.peak=max(.01,self.peak*.96,max(bands))
            bands=[min(1,v/self.peak) if rms>.0001 else 0 for v in bands]
        beat=rms>max(.001,self.average*1.4) and now-self.beat_at>.18
        self.average=.85*self.average+.15*rms
        if beat:self.beat_at=now
        return {'quando':time.time(),'energy':min(1,rms*5),'beat':bool(beat),'source':self.source,'bands':bands,'frequency_edges':[float(x) for x in np.geomspace(25,16000,17)]}
    def publish(self,pcm):
        if self.source=='sr_pcm':
            from sr_loopback import config
            if config().get('enabled'):return
        data=self.sample(pcm)
        if data is None:return
        try:
            tmp=FILE.with_suffix('.tmp');tmp.write_text(json.dumps(data),encoding='utf-8');tmp.replace(FILE)
        except OSError:pass # O visual nunca interrompe reprodução.
