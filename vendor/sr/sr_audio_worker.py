"""Dedicated SR process: audio only, live gain and played-sample telemetry."""
import os,sys,time,threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import audio_out

def main():
    source,index,volume,seek,error_file=sys.argv[1:]
    player=audio_out._play_sd(source,None if index=='None' else int(index),int(volume),float(seek),Path(error_file),papel='sr')
    if player is None:
        print('ERROR',flush=True);return 1
    def commands():
        pending=b''
        while True:
            data=os.read(sys.stdin.fileno(),128)
            if not data:player.terminate();return
            pending+=data
            while b'\n' in pending:
                line,pending=pending.split(b'\n',1)
                if line.strip()==b'stop':player.terminate();return
                if line.startswith(b'volume '):
                    try:player.set_volume(float(line[7:]))
                    except ValueError:pass
    threading.Thread(target=commands,daemon=True).start()
    print('READY',flush=True)
    try:
        while player.poll() is None:
            print('PROGRESS '+str(player.played_seconds),flush=True)
            time.sleep(.2)
        print('PROGRESS '+str(player.played_seconds),flush=True)
        return player.poll() or 0
    finally:
        player.terminate()
        try:player.wait(timeout=2)
        except Exception:player.kill()

if __name__=='__main__':
    result=main();sys.stdout.flush();os._exit(result)
