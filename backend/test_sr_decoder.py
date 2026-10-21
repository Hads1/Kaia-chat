"""Actual bundled FFmpeg decoding; silent sink, temporary generated PCM only."""
import sys,tempfile,unittest,wave,threading
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'vendor/sr'))
import audio_out

class DecoderTests(unittest.TestCase):
    def test_live_gain_changes_real_pcm_without_reopening_decoder(self):
        ff=Path(__file__).resolve().parent.parent/'.runtime/ffmpeg/ffmpeg.exe'
        if not ff.exists():ff=next(ff.parent.rglob('ffmpeg.exe'))
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);track=root/'level.wav'
            with wave.open(str(track),'wb') as output:
                output.setnchannels(2);output.setsampwidth(2);output.setframerate(48000)
                output.writeframes(b'\x00\x20'*(48000*2*3))
            first=threading.Event();resume=threading.Event();levels=[]
            class Sink:
                def __init__(self,**kwargs):pass
                def start(self):pass
                def write(self,data):
                    levels.append(float(abs(data).max()))
                    if len(levels)==1:first.set();resume.wait(5)
                def stop(self):pass
                def close(self):pass
            with patch.object(audio_out,'ffmpeg_bin',return_value=str(ff)),patch.dict(sys.modules,{'sounddevice':SimpleNamespace(OutputStream=Sink)}):
                proc=audio_out._play_sd(str(track),None,80,0,root/'decoder.err',papel='leitura')
                try:
                    self.assertTrue(first.wait(5));decoder=proc._sub
                    self.assertTrue(proc.set_volume(0))
                finally:resume.set()
                proc.wait(timeout=10)
                self.assertIs(proc._sub,decoder);self.assertEqual(proc.poll(),0)
                self.assertGreater(levels[0],.1);self.assertTrue(all(v==0 for v in levels[1:]))
                self.assertAlmostEqual(proc.played_seconds,3,delta=.05)

    def test_full_track_seek_and_decoder_failure(self):
        ff=Path(__file__).resolve().parent.parent/'.runtime/ffmpeg/ffmpeg.exe'
        if not ff.exists():
            matches=list((ff.parent).rglob('ffmpeg.exe'))
            self.assertTrue(matches,'Bundled decoder is required');ff=matches[0]
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);track=root/'generated.wav'
            with wave.open(str(track),'wb') as output:
                output.setnchannels(2);output.setsampwidth(2);output.setframerate(48000)
                for _ in range(120):output.writeframes(b'\0'*(48000*4))
            class Sink:
                def __init__(self,**kwargs):pass
                def start(self):pass
                def write(self,data):pass
                def stop(self):pass
                def close(self):pass
            with patch.object(audio_out,'ffmpeg_bin',return_value=str(ff)),patch.dict(sys.modules,{'sounddevice':SimpleNamespace(OutputStream=Sink)}):
                for position,expected in [(0,120),(117,3)]:
                    proc=audio_out._play_sd(str(track),0,50,position,root/'decoder.err',papel='leitura')
                    self.assertIsNotNone(proc);proc.wait(timeout=20)
                    self.assertEqual(proc.poll(),0)
                    self.assertAlmostEqual(proc.played_seconds,expected,delta=.05)
                broken=root/'broken.wav';broken.write_bytes(b'invalid audio')
                proc=audio_out._play_sd(str(broken),0,50,0,root/'decoder.err',papel='leitura')
                self.assertIsNotNone(proc);proc.wait(timeout=10)
                self.assertNotEqual(proc.poll(),0)
                self.assertEqual(proc.played_seconds,0)

if __name__=='__main__':unittest.main()
