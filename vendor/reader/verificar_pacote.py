import importlib.util,shutil,json
from pathlib import Path
mods=['yaml','requests','websocket','curl_cffi','yt_dlp','numpy','sounddevice','soundcard'] if Path('executar_sr.py').exists() else ['requests','websocket','curl_cffi','edge_tts','numpy','sounddevice']
result={m:bool(importlib.util.find_spec(m)) for m in mods}
result.update(ffmpeg=bool(shutil.which('ffmpeg')),ffplay=bool(shutil.which('ffplay')))
print(json.dumps(result,indent=2));raise SystemExit(0 if all(result.values()) else 1)
