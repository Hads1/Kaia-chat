"""Real FFmpeg/PCM pipeline, local HTTP failure, no external service or speakers."""
import io,os,sys,time,wave,tempfile,threading,socket,unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

ROOT=Path(__file__).resolve().parent.parent
TEMP=tempfile.TemporaryDirectory(prefix='kaia-stream-integration-')
os.environ['KAIA_MEDIA_DATA']=TEMP.name
os.environ['PATH']=str(ROOT/'.runtime/ffmpeg')+os.pathsep+os.environ['PATH']
sys.path.insert(0,str(ROOT/'vendor/sr'))
import numpy,sounddevice,audio_out
from unittest.mock import patch

class StreamIntegration(unittest.TestCase):
    def test_complete_track_after_http_connection_drops(self):
        buf=io.BytesIO()
        with wave.open(buf,'wb') as output:
            output.setnchannels(2);output.setsampwidth(2);output.setframerate(48000)
            output.writeframes(b'\0\0\0\0'*(48000*12))
        payload=buf.getvalue();requests=[];dropped=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):
                header=self.headers.get('Range','bytes=0-')
                start=int(header.split('=')[1].split('-')[0]);requests.append(start)
                self.send_response(206 if 'Range' in self.headers else 200)
                self.send_header('Content-Type','audio/wav');self.send_header('Accept-Ranges','bytes')
                self.send_header('Content-Length',str(len(payload)-start))
                if 'Range' in self.headers:self.send_header('Content-Range',f'bytes {start}-{len(payload)-1}/{len(payload)}')
                self.end_headers()
                if not dropped:
                    dropped.append(True);self.wfile.write(payload[start:len(payload)//2]);self.wfile.flush()
                    self.close_connection=True
                    try:self.connection.shutdown(socket.SHUT_RDWR)
                    except OSError:pass
                else:self.wfile.write(payload[start:])
        class Sink:
            frames=0
            def __init__(self,**kw):pass
            def start(self):pass
            def write(self,pcm):Sink.frames+=len(pcm)
            def stop(self):pass
            def close(self):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        proc=None
        try:
            with patch.object(sounddevice,'OutputStream',Sink):
                proc=audio_out._play_sd(f'http://127.0.0.1:{server.server_port}/track.wav',0,30,0,Path(TEMP.name)/'decoder.err',papel='sr')
                self.assertIsNotNone(proc)
                until=time.monotonic()+25
                while proc.poll() is None and time.monotonic()<until:time.sleep(.05)
                self.assertEqual(proc.poll(),0)
                self.assertGreaterEqual(len(requests),2)
                self.assertAlmostEqual(Sink.frames/48000,12,delta=.1)
                self.assertAlmostEqual(proc.played_seconds,12,delta=.1)
        finally:
            if proc:proc.kill();proc.wait(timeout=3)
            server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
