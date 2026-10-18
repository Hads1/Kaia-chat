"""Decode only the requested file to the explicitly selected output device."""
import os,sys,subprocess,threading
from pathlib import Path
import sounddevice as sd
file,index,volume,seek,error_file=sys.argv[1:]
stop=threading.Event();decoder=None
def control():
    for line in sys.stdin:
        if line.strip()=='stop':stop.set();break
threading.Thread(target=control,daemon=True).start()
try:
    import shutil
    command=[shutil.which('ffmpeg'),'-v','error','-ss',seek,'-i',file,'-f','f32le','-ar','48000','-ac','2','-af',f'volume={int(volume)/100}','pipe:1']
    decoder=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
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
    sys.exit(1)
finally:
    if decoder and decoder.poll() is None:decoder.terminate()
