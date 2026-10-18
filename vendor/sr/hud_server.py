from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

BASE = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
AVATAR = BASE / "avatar"

HOST = "127.0.0.1"
PORT = 8765


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(AVATAR), **kwargs)

    def end_headers(self):
        self.send_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0"
        )

        self.send_header(
            "Pragma",
            "no-cache"
        )

        self.send_header(
            "Expires",
            "0"
        )

        super().end_headers()

    def log_message(self, format, *args):
        pass


def main():
    from spotify_agora import iniciar_monitor
    iniciar_monitor()


    if not AVATAR.is_dir():
        print(
            "Pasta avatar não encontrada:"
        )
        print(
            AVATAR
        )
        input(
            "ENTER para fechar..."
        )
        return

    servidor = ThreadingHTTPServer(
        (
            HOST,
            PORT
        ),
        Handler
    )

    print(
        "=========================================="
    )
    print(
        "KAIA - HUD SERVER"
    )
    print(
        "=========================================="
    )
    print()
    print(
        f"Pasta: {AVATAR}"
    )
    print()
    print(
        "HUD:"
    )
    print(
        f"http://{HOST}:{PORT}/sr.html"
    )
    print()
    print(
        "SR JSON:"
    )
    print(
        f"http://{HOST}:{PORT}/sr.json"
    )
    print()
    print(
        "Spotify JSON:"
    )
    print(
        f"http://{HOST}:{PORT}/spotify.json"
    )
    print()
    print(
        "CTRL+C para encerrar."
    )
    print()

    try:

        servidor.serve_forever()

    except KeyboardInterrupt:

        print()
        print(
            "Servidor encerrado."
        )

    finally:

        servidor.server_close()


if __name__ == "__main__":
    main()
