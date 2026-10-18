"""Serve overlays da Kaia/Hades pro OBS. http://127.0.0.1:8765/"""

import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORTA = 8765
PASTA = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent))) / "avatar"


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path!='/api/sr-layout':self.send_error(404);return
        port=self.server.server_port
        if self.headers.get('Origin') not in (f'http://127.0.0.1:{port}',f'http://localhost:{port}') or self.headers.get('X-Kaia-Editor')!='1':
            self.send_error(403);return
        import json
        try:
            size=int(self.headers.get('Content-Length',0))
            if not 0<size<=100000:raise ValueError('Tamanho inválido.')
            from sr_overlay_layout import salvar
            data=salvar(json.loads(self.rfile.read(size)))
            payload=json.dumps(data,ensure_ascii=False).encode()
        except (ValueError,TypeError):self.send_error(400);return
        self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(PASTA), **k)

    def log_message(self, *_a):
        return

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def iniciar():
    from spotify_agora import iniciar_monitor
    iniciar_monitor()

    PASTA.mkdir(parents=True, exist_ok=True)
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORTA), Handler)
    except OSError:
        print("[obs] porta 8765 ocupada — overlay talvez já esteja no ar")
        return
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    from sr_loopback import iniciar as iniciar_medicao
    iniciar_medicao()
    print(f"[obs] Kaia  http://127.0.0.1:{PORTA}/overlay-kaia.html")
    print(f"[obs] Hades http://127.0.0.1:{PORTA}/overlay-hades.html")
