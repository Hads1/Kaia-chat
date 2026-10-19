"""Bridge responsiveness with slow playlist import and a busy player lock."""
import io,os,sys,time,runpy,tempfile,threading,unittest,contextlib,types
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TEMP=tempfile.TemporaryDirectory(prefix='kaia-bridge-test-')
os.environ['KAIA_MEDIA_DATA']=TEMP.name
original_stdin=sys.stdin
try:
    sys.stdin=io.StringIO('')
    with contextlib.redirect_stdout(io.StringIO()):ns=runpy.run_path(str(ROOT/'backend/bridge.py'))
finally:sys.stdin=original_stdin
command=ns['command'];state=command.__globals__

class BridgeResponsiveness(unittest.TestCase):
    def test_slow_playlist_import_returns_immediately(self):
        gate=threading.Event()
        state['PLAYER']=types.SimpleNamespace(adicionar_playlist=lambda *args:gate.wait(2) or 'feito')
        start=time.monotonic()
        try:
            result=command('adicionar_playlist',['fixture','Operador'])
            self.assertLess(time.monotonic()-start,.5)
            self.assertIn('segundo plano',result);self.assertTrue(state['PLAYLIST_JOB']['busy'])
            with self.assertRaisesRegex(ValueError,'já está'):command('adicionar_playlist',['fixture','Operador'])
        finally:gate.set()

    def test_state_does_not_wait_for_busy_audio_player(self):
        lock=threading.Lock();lock.acquire()
        state['PLAYER']=types.SimpleNamespace(_lock=lock)
        state['LAST_STATE']={'titulo':'Música preservada','elapsed':17}
        start=time.monotonic()
        try:
            value=command('state',[])
            self.assertLess(time.monotonic()-start,.5);self.assertTrue(value['busy']);self.assertEqual(value['elapsed'],17)
        finally:lock.release()

if __name__=='__main__':unittest.main()

class VoiceWorkerLifecycle(unittest.TestCase):
    def test_finished_audio_exits_even_with_control_pipe_open(self):
        import subprocess,wave
        with tempfile.TemporaryDirectory(prefix='kaia-worker-test-') as folder:
            audio=Path(folder)/'test.wav'
            with wave.open(str(audio),'wb') as wav:
                wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(48000);wav.writeframes(b'\0'*19200)
            harness=Path(folder)/'harness.py'
            harness.write_text("import sys,types,runpy\nclass Output:\n def __init__(self,**kw):pass\n def __enter__(self):return self\n def __exit__(self,*args):pass\n def write(self,data):pass\nsys.modules['sounddevice']=types.SimpleNamespace(RawOutputStream=Output)\nrunpy.run_path("+repr(str(ROOT/'backend/audio_device_worker.py'))+",run_name='__main__')\n",encoding='utf-8')
            env={**os.environ,'PATH':str(ROOT/'.runtime/ffmpeg')+os.pathsep+os.environ['PATH']}
            proc=subprocess.Popen([sys.executable,str(harness),str(audio),'0','10','0',str(Path(folder)/'error.txt')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
            try:
                self.assertEqual(proc.wait(timeout=10),0)
                self.assertEqual(proc.stdout.read().strip(),b'READY')
            finally:
                if proc.poll() is None:proc.kill();proc.wait()
                proc.stdin.close();proc.stdout.close();proc.stderr.close()
