"""Decode only the requested file to the explicitly selected output device."""
import os,sys,subprocess,threading
from pathlib import Path
import sounddevice as sd
file,index,volume,seek,error_file=sys.argv[1:]
stop=threading.Event();decoder=None
exit_code=0
def control():
    # A daemon blocked on buffered stdin can hold Python's stream lock during
    # interpreter shutdown, leaving a completed voice worker alive forever.
    pending=b''
    while True:
        chunk=os.read(sys.stdin.fileno(),64)
        if not chunk:return
        pending+=chunk
        if b'\n' in pending:
            lines=pending.split(b'\n');pending=lines.pop()
            if any(line.strip()==b'stop' for line in lines):stop.set();return
threading.Thread(target=control,daemon=True).start()
try:
    import shutil
    command=[shutil.which('ffmpeg'),'-nostdin','-v','error','-ss',seek,'-i',file,'-f','f32le','-ar','48000','-ac','2','-af',f'volume={int(volume)/100}','pipe:1']
    decoder=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    first=decoder.stdout.read(38400)
    if not first:raise RuntimeError('O decodificador não produziu áudio.')
    with sd.RawOutputStream(samplerate=48000,channels=2,dtype='float32',device=int(index)) as output:
        output.write(first)
        print('READY',flush=True)
        while not stop.is_set():
            block=decoder.stdout.read(38400)
            if not block:break
            output.write(block)
except Exception as error:
    Path(error_file).write_text(str(error),encoding='utf-8');print('ERROR',flush=True)
    exit_code=1
finally:
    if decoder:
        if decoder.poll() is None:decoder.terminate()
        try:decoder.wait(timeout=2)
        except subprocess.TimeoutExpired:decoder.kill();decoder.wait()
# All audio streams are closed above. The control daemon may still be blocked
# waiting for stdin; do not wait for that thread during interpreter finalization.
sys.stdout.flush()
os._exit(exit_code)
