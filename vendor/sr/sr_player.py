"""Song request: pause real, volume, saídas separadas, histórico apagável."""

import json
import os
import re
import shutil
import subprocess
import threading
import time
import atexit
import uuid
import unicodedata
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs
from sr_diagnostics import SRDiagnostics,classify_error,safe_error

PASTA = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
TMP = PASTA / "tmp_sr"
ESTADO = PASTA / "avatar" / "sr.json"
HIST = PASTA / "aprendizado" / "sr_historico.jsonl"
YT = re.compile(
    r"(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([\w-]{11})",
    re.I,
)
MAX_FILA = 80
MAX_PLAYLIST = 60
MAX_SEG = 15 * 60

PLAYLIST_RE = re.compile(
    r"(?:youtube\.com/playlist\?list=|music\.youtube\.com/playlist\?list=|[?&]list=)([\w-]+)",
    re.I,
)


def _cf():
    if os.name == "nt":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def _si():
    if os.name != "nt":
        return None
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0
    return si


_ACTIVE_RUNS=set()
_ACTIVE_RUNS_LOCK=threading.Lock()

def _run(cmd, timeout=60):
    p=None
    try:
        p = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            creationflags=_cf(),
            startupinfo=_si(),
        )
        with _ACTIVE_RUNS_LOCK:_ACTIVE_RUNS.add(p)
        try:
            out, err = p.communicate(timeout=timeout)
            return SimpleNamespace(returncode=p.returncode, stdout=out, stderr=err)
        except subprocess.TimeoutExpired:
            try:
                p.kill()
            except Exception:
                pass
            try:
                matar_pid(p.pid)
            except Exception:
                pass
            try:
                out, err = p.communicate(timeout=4)
            except Exception:
                out, err = b"", b"timeout"
            return SimpleNamespace(returncode=124, stdout=out or b"", stderr=err or b"timeout")
    except Exception as exc:
        return SimpleNamespace(returncode=1, stdout=b"", stderr=str(exc).encode("utf-8", "replace"))
    finally:
        if p is not None:
            with _ACTIVE_RUNS_LOCK:_ACTIVE_RUNS.discard(p)


def _dec(b) -> str:
    if not b:
        return ""
    if isinstance(b, str):
        return b
    return b.decode("utf-8", errors="replace")


def _bin(*nomes):
    for n in nomes:
        p = shutil.which(n)
        if p:
            return p
    extra = [
        PASTA / ".venv" / "Scripts",
        PASTA / "ffmpeg" / "bin",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links",
        Path(r"C:\ffmpeg\bin"),
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "ffmpeg" / "bin",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "ffmpeg" / "bin",
    ]
    for pasta in extra:
        if not pasta:
            continue
        for n in nomes:
            p = pasta / n
            if p.is_file():
                return str(p)
            p2 = pasta / f"{n}.exe"
            if p2.is_file():
                return str(p2)
    return ""


def _py():
    import sys

    exe = Path(sys.executable)
    if exe.name.lower() == "pythonw.exe":
        alt = exe.with_name("python.exe")
        if alt.is_file():
            return str(alt)
    return str(exe) if exe else "python"


_YTD_CACHE = {"cmd": None, "t": 0.0, "ok": False}
_INSTALANDO = False
_STREAM_STATUS={'erro':'','pausa_ate':0}

def _stream_erro():
    return _STREAM_STATUS['erro'] or 'Não foi possível obter o áudio deste vídeo.'

def configurar_cookies(path=''):
    """Somente arquivo explicitamente escolhido pelo operador; não lê navegadores."""
    if path and not Path(path).is_file():raise ValueError('Arquivo de cookies não encontrado.')
    (PASTA/'sr_youtube_config.json').write_text(json.dumps({'cookies_file':path},ensure_ascii=False),encoding='utf-8')
    _YTD_CACHE['cmd']=None;_STREAM_STATUS.update(erro='',pausa_ate=0)

def _yt_opcoes():
    opts=['--retries','1','--extractor-retries','1']
    node=shutil.which('node')
    if node:opts+=['--js-runtimes','node:'+node]
    try:
        path=json.loads((PASTA/'sr_youtube_config.json').read_text(encoding='utf-8')).get('cookies_file','')
        if path and Path(path).is_file():opts+=['--cookies',path]
    except (OSError,ValueError):pass
    return opts


def _yt_cmd():
    agora = time.time()
    if _YTD_CACHE["cmd"] and agora - _YTD_CACHE["t"] < 3600:
        return list(_YTD_CACHE["cmd"])+_yt_opcoes()
    exe = ""  # Use the bundled Python module instead of a machine-wide executable.
    cmd = [exe] if exe else []
    if not cmd:
        py = _py()
        try:
            r = _run([py, "-m", "yt_dlp", "--version"], 25)
            if r.returncode == 0:
                cmd = [py, "-m", "yt_dlp"]
        except Exception:
            cmd = []
    _YTD_CACHE["cmd"] = list(cmd)
    _YTD_CACHE["t"] = agora
    _YTD_CACHE["ok"] = bool(cmd)
    return list(cmd)+_yt_opcoes() if cmd else []


def _player():
    try:
        from audio_out import player_exe

        p = player_exe("sr")
        if p:
            return p
    except Exception:
        pass
    return _bin("ffplay", "ffplay.exe") or _bin("mpv", "mpv.exe")


def _ffmpeg():
    return _bin("ffmpeg", "ffmpeg.exe")


def instalar() -> str:
    global _INSTALANDO
    _INSTALANDO = True
    py = _py()
    try:
        r = _run([py, "-m", "pip", "install", "-U", "yt-dlp[default]"], 240)
        _YTD_CACHE["cmd"] = None
        _YTD_CACHE["t"] = 0
        ok_pip = r.returncode == 0
        tem = bool(_yt_cmd())
        if ok_pip and tem:
            return "yt-dlp instalado. Pode pedir música."
        if ok_pip:
            return "pip rodou, mas o yt-dlp ainda não aparece. Reabre a Kaia."
        err = (_dec(r.stderr) or _dec(r.stdout)).strip()[-220:]
        return "pip falhou: " + (err or f"código {r.returncode}. Roda INSTALAR-SR.bat")
    except Exception as exc:
        return f"não instalou: {exc}"
    finally:
        _INSTALANDO = False


def fmt(seg: float) -> str:
    s = max(0, int(seg))
    return f"{s // 60}:{s % 60:02d}"


GEN_MAP = (
    ("funk", "funk"),
    ("sertanejo", "sertanejo"),
    ("pagode", "pagode"),
    ("forró", "forro"),
    ("forro", "forro"),
    ("samba", "samba"),
    ("mpb", "mpb"),
    ("rock", "rock"),
    ("metal", "metal"),
    ("pop", "pop"),
    ("rap", "rap"),
    ("trap", "trap"),
    ("hip hop", "hiphop"),
    ("hiphop", "hiphop"),
    ("eletr", "eletronica"),
    ("edm", "eletronica"),
    ("house", "eletronica"),
    ("phonk", "phonk"),
    ("lofi", "lofi"),
    ("lo-fi", "lofi"),
    ("anime", "anime"),
    ("ost", "game"),
    ("soundtrack", "game"),
    ("game", "game"),
    ("k-pop", "kpop"),
    ("kpop", "kpop"),
    ("gospel", "gospel"),
)


def classificar_genero(titulo: str, extra: str = "") -> str:
    blob = f"{titulo} {extra}".lower()
    for chave, gen in GEN_MAP:
        if chave in blob:
            return gen
    return "outros"


def _append_hist(rec: dict):
    try:
        HIST.parent.mkdir(parents=True, exist_ok=True)
        with HIST.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass


def ler_historico(limite: int = 80) -> list:
    if not HIST.is_file():
        return []
    try:
        linhas = HIST.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []
    out = []
    for ln in linhas[-limite:]:
        try:
            out.append(json.loads(ln))
        except Exception:
            pass
    return list(reversed(out))


def salvar_historico(itens: list):
    try:
        HIST.parent.mkdir(parents=True, exist_ok=True)
        linhas = []
        for it in reversed(list(itens or [])):
            linhas.append(json.dumps(it, ensure_ascii=False))
        HIST.write_text("\n".join(linhas) + ("\n" if linhas else ""), encoding="utf-8")
    except Exception:
        pass


def stats_sr(itens=None) -> dict:
    itens = itens if itens is not None else ler_historico(400)
    ped, gen = {}, {}
    for it in itens:
        u = (it.get("user") or "?").lower()
        g = it.get("genero") or "outros"
        ped[u] = ped.get(u, 0) + 1
        gen[g] = gen.get(g, 0) + 1
    top_user = sorted(ped.items(), key=lambda x: -x[1])[:8]
    top_gen = sorted(gen.items(), key=lambda x: -x[1])[:8]
    return {
        "total": len(itens),
        "pediram": top_user,
        "generos": top_gen,
        "mais_sr": top_user[0] if top_user else ("—", 0),
        "mais_genero": top_gen[0] if top_gen else ("—", 0),
    }


def _para_mp3(src: Path) -> Path:
    if src.suffix.lower() == ".mp3":
        return src
    ff = _ffmpeg()
    if not ff:
        return src
    dest = src.with_suffix(".mp3")
    try:
        r = _run(
            [ff, "-y", "-i", str(src), "-vn", "-acodec", "libmp3lame", "-q:a", "5", str(dest)],
            90,
        )
        if r.returncode == 0 and dest.is_file() and dest.stat().st_size > 1000:
            return dest
    except Exception:
        pass
    return src


PEDIDOS = TMP / "pedidos.jsonl"
LOCK = TMP / "sr.lock"


def sr_vivo() -> bool:
    if not LOCK.is_file():
        return False
    try:
        pid = int((LOCK.read_text(encoding="utf-8") or "0").strip() or 0)
    except Exception:
        return False
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            import ctypes

            SYNCHRONIZE = 0x00100000
            h = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE|0x1000, False, pid)
            if h:
                code=ctypes.c_ulong()
                active=bool(ctypes.windll.kernel32.GetExitCodeProcess(h,ctypes.byref(code)) and code.value==259)
                ctypes.windll.kernel32.CloseHandle(h)
                return active
        except Exception:
            return False
        return False
    try:
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def marcar_vivo():
    try:
        TMP.mkdir(parents=True, exist_ok=True)
        LOCK.write_text(str(os.getpid()), encoding="utf-8")
    except Exception:
        pass

def adquirir_vivo():
    TMP.mkdir(parents=True,exist_ok=True)
    for _ in range(2):
        try:
            with LOCK.open('x',encoding='utf-8') as f:f.write(str(os.getpid()))
            return True
        except FileExistsError:
            if sr_vivo():return False
            LOCK.unlink(missing_ok=True)
    return False


def desmarcar_vivo():
    try:
        if LOCK.is_file():
            if LOCK.read_text(encoding='utf-8').strip()==str(os.getpid()):LOCK.unlink()
    except Exception:
        pass


def enfileirar(user: str, query: str, fonte: str = "sr") -> str:
    """Kaia só enfileira. O app_sr.py (processo separado) toca."""
    q = (query or "").strip()
    q = re.sub(r"^!(sr|songrequest)\s*", "", q, flags=re.I).strip()
    if not q:
        return "Manda !sr + nome da música ou o link do YouTube."
    fonte = (fonte or "sr").lower()
    if fonte not in ("sr", "voz", "playlist"):
        fonte = "sr"
    try:
        TMP.mkdir(parents=True, exist_ok=True)
        rec = {"t": time.time(), "user": user or "chat", "q": q, "fonte": fonte}
        with PEDIDOS.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        tag = {"voz": "VOZ", "playlist": "PLAYLIST"}.get(fonte, "SR")
        vivo = " (SR pegou)" if sr_vivo() else " (abre o SR pra tocar)"
        return f"{tag}: {user} pediu {q[:80]}{vivo}"
    except Exception as exc:
        return f"SR fila falhou: {exc}"


def enfileirar_voz(user: str, query: str) -> str:
    return enfileirar(user, query, fonte="voz")


def extrair_pedido_voz(texto: str):
    t = re.sub(r"\s+", " ", (texto or "").strip())
    t = re.sub(r"^(kaia|caia|caio|kaiá|caiá)[,:\s]+", "", t, flags=re.I)
    if not t:
        return None
    m = re.search(r"\b(?:coloca|p[oõ]e|bota)\s+(.+?)\s+(?:pra|para)\s+tocar\b", t, re.I)
    q = m.group(1) if m else ""
    if not q:
        m = re.search(
            r"\b(?:toca|toque|tocar|play|reproduz(?:e|ir)?)\b"
            r"(?:\s+(?:pra|para)\s+mim)?"
            r"(?:\s+(?:a|o|uma|um))?"
            r"(?:\s+(?:m[uú]sica|musica|som|faixa|track|song))?"
            r"(?:\s+(?:do|da|de|o|a))?"
            r"\s*(.+)$",
            t,
            re.I,
        )
        if m:
            q = m.group(1)
    q = re.sub(r"^(a|o|uma|um|m[uú]sica|musica|som)\s+", "", (q or "").strip(), flags=re.I)
    q = re.sub(r"\s+(pra|para)\s+(mim|tocar).*$", "", q, flags=re.I)
    q = re.sub(r"[\.!?]+$", "", q).strip(" ,.-")
    if not q or len(q) < 2:
        return None
    if re.sub(r"\s+", " ", q.lower()) in {"isso", "aquilo", "ela", "ele", "agora", "aqui", "a live", "live"}:
        return None
    return q[:180]


def puxar_pedidos() -> list:
    if not PEDIDOS.is_file():
        return []
    try:
        linhas = PEDIDOS.read_text(encoding="utf-8", errors="ignore").splitlines()
        PEDIDOS.write_text("", encoding="utf-8")
    except Exception:
        return []
    out = []
    for ln in linhas:
        try:
            out.append(json.loads(ln))
        except Exception:
            pass
    return out


SR_CMD_RE = re.compile(
    r"^[!！](?:sr|songrequest)\b[:\s]*",
    re.I,
)


def extrair_sr(texto: str):
    """Só pega se a mensagem COMEÇA com !sr. O resto do chat ignora."""
    t = re.sub(r"[\u200b\ufeff]", "", str(texto or "")).strip()
    if not t:
        return None
    m = re.match(r"^[!！](?:sr|songrequest)\b[:\s]*(.*)$", t, re.I)
    if not m:
        return None
    q = (m.group(1) or "").strip()
    return q or None


def eh_playlist(url: str, so_pura: bool = True) -> bool:
    u = (url or "").strip()
    if not u or not PLAYLIST_RE.search(u):
        return False
    if not so_pura:
        return True
    low = u.lower()
    if "playlist?list=" in low:
        return True
    if "list=" in low and "watch?" not in low and "youtu.be/" not in low:
        return True
    return False


def _sem_acento(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _norm_busca(s: str) -> str:
    s = _sem_acento((s or "").lower())
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _score_yt(query: str, titulo: str, dur: int) -> float:
    qn = _norm_busca(query)
    tn = _norm_busca(titulo)
    if not tn:
        return -99
    sc = 0.0
    if qn == tn:
        sc += 60
    elif qn and qn in tn:
        sc += 24
    qt = [w for w in qn.split() if len(w) > 1]
    tt = set(tn.split())
    if qt:
        sc += 10.0 * sum(1 for w in qt if w in tt) / len(qt)
    for w in ("official", "audio", "lyric", "letra", "topic", "video"):
        if w in tn:
            sc += 2
    for w in ("live", "cover", "hora", "hour", "mix", "playlist", "8d", "slowed", "nightcore", "remix"):
        if w in tn:
            sc -= 10
    if 80 <= int(dur or 0) <= 360:
        sc += 6
    elif int(dur or 0) > MAX_SEG:
        sc -= 40
    return sc


def _id_do_link(q: str) -> str:
    m = YT.search(q or "")
    return m.group(4) if m else ""


def _parece_link(s: str) -> bool:
    t = (s or "").strip().lower()
    return t.startswith("http") or "youtube.com/" in t or "youtu.be/" in t


def _titulo_do_id(vid: str) -> str:
    ytd = _yt_cmd()
    vid = re.sub(r"[^\w-]", "", vid or "")[:20]
    if not ytd or not vid:
        return ""
    try:
        r = _run(
            ytd
            + [
                "--no-playlist",
                "--skip-download",
                "--no-warnings",
                "--print",
                "%(title)s",
                f"https://www.youtube.com/watch?v={vid}",
            ],
            45,
        )
        linhas = [ln.strip() for ln in _dec(r.stdout).splitlines() if ln.strip()]
        nome = linhas[0] if linhas else ""
        if nome and not _parece_link(nome):
            return nome
    except Exception:
        pass
    return ""


def _titulo_bonito(item: dict) -> str:
    t = (item.get("titulo") or "").strip()
    if t and not _parece_link(t) and t.lower() not in {"na", "nan", "none"}:
        return t
    vid = item.get("id") or _id_do_link(item.get("q") or "")
    if vid and not item.get("_tit_busy"):
        item["_tit_busy"] = True

        def _go():
            nome = _titulo_do_id(vid)
            if nome:
                item["titulo"] = nome
            item["_tit_busy"] = False

        threading.Thread(target=_go, daemon=True).start()
    return t if t and not _parece_link(t) else (item.get("id") or "faixa")


def _url_stream(vid: str) -> str:
    """Pega URL de áudio pra tocar. Não baixa arquivo."""
    ytd = _yt_cmd()
    if time.time()<_STREAM_STATUS['pausa_ate']:return ''
    if not ytd or not vid:
        return ""
    url = f"https://www.youtube.com/watch?v={vid}"
    r = _run(
        ytd
        + [
            "-g",
            "-f",
            "bestaudio[ext=m4a]/bestaudio/worstaudio/best",
            "--no-playlist",
            "--no-warnings",
            url,
        ],
        45,
    )
    linhas = [ln.strip() for ln in _dec(r.stdout).splitlines() if ln.strip().startswith("http")]
    if r.returncode==0 and linhas:
        _STREAM_STATUS.update(erro='',pausa_ate=0)
        return linhas[-1]
    raw_error=safe_error(_dec(r.stderr))
    error=raw_error.lower()
    if '429' in error or 'too many requests' in error:
        _STREAM_STATUS.update(erro='YouTube limitou as requisições (HTTP 429). SR aguardando 10 minutos antes de tentar novamente.',pausa_ate=time.time()+600)
    elif 'private video' in error or 'video unavailable' in error or 'removed' in error:
        _STREAM_STATUS['erro']=raw_error
    elif 'not a bot' in error or 'confirm you' in error or 'sign in' in error:
        _STREAM_STATUS.update(erro='YouTube exige login para este acesso. Na aba SR, clique Conectar YouTube, faça login na sessão dedicada e depois Testar acesso.',pausa_ate=time.time()+600)
    elif 'javascript' in error or 'js runtime' in error:
        _STREAM_STATUS['erro']='Extrator do YouTube precisa de runtime JavaScript compatível. Atualize o SR e verifique Node.js 22 ou superior.'
    elif 'private video' in error or 'video unavailable' in error or 'removed' in error:
        _STREAM_STATUS['erro']=raw_error
    else:_STREAM_STATUS['erro']=raw_error or 'Falha ao obter áudio do YouTube sem detalhe do serviço.'
    return ''


def _duracao_id(vid: str) -> int:
    ytd = _yt_cmd()
    if not ytd or not vid:
        return 0
    r = _run(
        ytd + ["--no-playlist", "--no-warnings", "--print", "%(duration)s", f"https://www.youtube.com/watch?v={vid}"],
        25,
    )
    raw = _dec(r.stdout).strip().splitlines()
    for ln in raw:
        ln = ln.strip()
        if ln.isdigit():
            return int(ln)
        try:
            return int(float(ln))
        except Exception:
            continue
    return 0


_YT_PIDS = []


def _abrir_youtube(vid: str):
    """Não abre mais janela. Embed em branco travava na tela."""
    return


def _fechar_youtube():
    global _YT_PIDS
    for pid in list(_YT_PIDS):
        try:
            matar_pid(pid)
        except Exception:
            pass
    _YT_PIDS = []


def _buscar_youtube(query: str):
    """Acha o vídeo mais próximo do nome. Link = usa o id. Nome = busca ytsearch."""
    ytd = _yt_cmd()
    if not ytd:
        return None
    vid = _id_do_link(query)
    if vid:
        nome = _titulo_do_id(vid) or vid
        return {"id": vid, "titulo": nome, "dur": 0, "url": f"https://www.youtube.com/watch?v={vid}"}
    q = re.sub(r"\s+", " ", (query or "").strip())
    if not q:
        return None
    q2 = _sem_acento(q)
    termos = [q]
    if q2.lower() != q.lower():
        termos.append(q2)
    termos.append(f"{q} official audio")
    termos.append(f"{q} lyrics")
    melhores = []
    vistos = set()
    for termo in termos:
        r = _run(
            ytd
            + [
                "--flat-playlist",
                "--no-warnings",
                "--skip-download",
                "--print",
                "%(id)s\t%(title)s\t%(duration)s",
                f"ytsearch8:{termo}",
            ],
            70,
        )
        for ln in _dec(r.stdout).splitlines():
            partes = (ln.split("\t") + ["", "", "0"])[:3]
            vid, titulo, dur = [p.strip() for p in partes]
            vid = re.sub(r"[^\w-]", "", vid)[:20]
            if not vid or vid.lower() in {"na", "nan", "none"} or vid in vistos:
                continue
            vistos.add(vid)
            try:
                dur_i = int(float(dur)) if dur and dur.lower() not in {"na", "nan", "none", ""} else 0
            except Exception:
                dur_i = 0
            if dur_i and dur_i > MAX_SEG:
                continue
            sc = _score_yt(q, titulo or "", dur_i)
            melhores.append((sc, vid, titulo or q, dur_i))
        if melhores:
            break
    if not melhores:
        return None
    melhores.sort(key=lambda x: -x[0])
    sc, vid, titulo, dur_i = melhores[0]
    return {
        "id": vid,
        "titulo": titulo,
        "dur": dur_i,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "alts": melhores[1:4],
    }


def _cf_hide():
    if os.name == "nt":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def matar_pid(pid):
    if not pid or os.name != "nt":
        return
    try:
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(int(pid))],
            capture_output=True,
            timeout=8,
            creationflags=_cf_hide(),
        )
    except Exception:
        pass


def matar_players_sr():
    # Só os processos criados por esta instância são encerrados pelo objeto player.
    return


class SongRequest:
    def __init__(self):
        try:
            TMP.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        self.fila = []
        self.atual = None
        self.proc = None
        self.paused = False
        self.t0 = 0.0
        self.acc = 0.0
        self.erro = ""
        self.volume = 80
        self.mutado = False
        self._vol_antes = 80
        self.saida = ""
        self.historico = ler_historico(80)
        self._tocadas = []
        self._lock = threading.RLock()
        self._stop = False
        self._spawn_t0 = 0.0
        self._retried = False
        self._visto = {}
        self._dl_sema = threading.Semaphore(1)
        self._request_sema = threading.Semaphore(1)
        self.repeat = "off"
        self.shuffle_pl = False
        self.request_limit=80
        self.playlist_limit=0
        self.notifications=[]
        from spotify_agora import iniciar_monitor
        iniciar_monitor()
        threading.Thread(target=self._loop, daemon=True).start()

    def set_repeat(self, modo: str):
        modo = (modo or "off").lower()
        if modo not in ("off", "one", "playlist"):
            modo = "off"
        self.repeat = modo

    def set_shuffle(self, on: bool):
        self.shuffle_pl = bool(on)

    def pedir(self, user: str, query: str, fonte: str = "sr") -> str:
        try:
            q = extrair_sr(query)
            if q is None:
                q = (query or "").strip()
                q = re.sub(r"^!(sr|songrequest|song)\s*", "", q, flags=re.I).strip()
            if not q:
                return "Manda !sr + nome da música ou o link do YouTube."
            if eh_playlist(q):
                return "Playlist só o admin cola no player do SR (botão playlist)."
            chave = f"{(user or '').lower()}|{q.lower()}"
            agora = time.time()
            with self._lock:
                ultimo = float(self._visto.get(chave) or 0)
                if agora - ultimo < 10:
                    return "Já peguei esse pedido."
                self._visto[chave] = agora
                is_background=fonte=='playlist'
                limit=self.playlist_limit if is_background else self.request_limit
                if limit and sum((self._fonte_de(x)=='playlist')==is_background for x in self.fila) >= limit:
                    return "Fila cheia. Espera uma sair."
                if any((x.get("q") or "").lower() == q.lower() for x in self.fila):
                    return "Essa já tá na fila."
                if self.atual and (self.atual.get("q") or "").lower() == q.lower():
                    return "Essa já tá tocando."
                item = {
                    "key":uuid.uuid4().hex,
                    "user": user,
                    "q": q,
                    "titulo": q,
                    "dur": 0,
                    "arquivo": "",
                    "status": "fila",
                    "fonte": (fonte or "sr") if (fonte or "sr") in ("sr", "voz", "playlist") else "sr",
                    "t0": agora,
                }
                pos = self._inserir_prioridade(item)
            threading.Thread(target=self._resolver, args=(item,), daemon=True).start()
            tag = {"voz": "VOZ", "playlist": "PLAYLIST"}.get(item.get("fonte"), "SR")
            return f"{tag} na fila ({pos}º). {user} pediu: {q[:80]}"
        except Exception as exc:
            self.erro = str(exc)
            return f"SR falhou: {exc}"

    def adicionar_playlist(self, url: str, user: str = "Hades") -> str:
        url = (url or "").strip()
        if not url:
            return "Cola o link da playlist do YouTube."
        if not PLAYLIST_RE.search(url):
            return "Isso não parece playlist. Tem que ter list= no link."
        ytd = _yt_cmd()
        if not ytd:
            return "yt-dlp ausente. Clica em yt-dlp."
        self.erro = "lendo playlist…"
        try:
            r = _run(
                ytd
                + [
                    "--flat-playlist",
                    "--no-warnings",
                    "--print",
                    "%(id)s\t%(title)s\t%(duration)s",
                    url,
                ],
                1800,
            )
        except Exception as exc:
            self.erro = str(exc)
            return f"Não li a playlist: {exc}"
        linhas = [ln for ln in _dec(r.stdout).splitlines() if ln.strip()]
        if not linhas:
            det = _dec(r.stderr)[-180:]
            self.erro = det or "playlist vazia"
            return "Não achei músicas nessa playlist."
        ja = set()
        with self._lock:
            for x in self.fila:
                ja.add((x.get("q") or "").lower())
                ja.add((x.get("id") or "").lower())
            if self.atual:
                ja.add((self.atual.get("q") or "").lower())
                ja.add((self.atual.get("id") or "").lower())
        added = 0
        pulou = 0
        for playlist_index,ln in enumerate(linhas,1):
            if self.playlist_limit and added >= self.playlist_limit:
                pulou += 1
                continue
            partes = (ln.split("\t") + ["", "", "0"])[:3]
            vid, titulo, dur = [p.strip() for p in partes]
            vid = re.sub(r"[^\w-]", "", vid)[:20]
            if not vid or vid.lower() in {"na", "nan", "none"}:
                pulou += 1
                continue
            q = f"https://www.youtube.com/watch?v={vid}"
            if vid.lower() in ja or q.lower() in ja:
                pulou += 1
                continue
            try:
                dur_i = int(float(dur)) if dur and dur.lower() not in {"na", "nan", "none"} else 0
            except Exception:
                dur_i = 0
            with self._lock:
                item = {
                    "key":uuid.uuid4().hex,
                    "user": user,
                    "q": q,
                    "id": vid,
                    "playlist_index": playlist_index,
                    "titulo": titulo or vid,
                    "dur": dur_i,
                    "arquivo": "",
                    "status": "fila",
                    "fonte": "playlist",
                    "genero": classificar_genero(titulo or ""),
                    "t0": time.time(),
                }
                self.fila.append(item)
                ja.add(vid.lower())
                ja.add(q.lower())
            added += 1
        if r.returncode:
            self._diagnostics().record('importacao_parcial',reason=_dec(r.stderr),code='extractor_partial')
        self._diagnostics().record('importada',reason=f'{added} faixas adicionadas; {pulou} não adicionadas.')
        self._prefetch_playlist()
        msg = f"Playlist de fundo: {added} faixas. !sr do chat fura a fila."
        if pulou:
            msg += f"  ·  {pulou} não adicionadas (quantidade escolhida, repetida ou indisponível)"
        if self.erro == "lendo playlist…": self.erro = ""
        return msg

    def _diagnostics(self):
        if not hasattr(self, '_sr_diagnostics'):self._sr_diagnostics=SRDiagnostics(PASTA/'aprendizado')
        return self._sr_diagnostics

    def _playlist_failure(self, item, error, current=False):
        detail=classify_error(error)
        item['erro']=detail['reason']
        if detail['pause']:
            _STREAM_STATUS['pausa_ate']=max(_STREAM_STATUS.get('pausa_ate',0),time.time()+30)
            item['status']='fila';item['_scheduled']=False
            self._diagnostics().record('aguardando_configuracao' if detail['code']=='audio_output' else 'aguardando_servico',item,detail['reason'],detail['code'])
            if current:self.paused=True
        else:
            item['status']='skipped'
            self._diagnostics().record('pulada',item,detail['reason'],detail['code'])
            if current:
                self._kill();self.atual=None;self.acc=0;self.paused=False
        self.erro=detail['reason']
        return detail

    def _prefetch_playlist(self):
        # Resolve only a small look-ahead, even when the playlist has 9999+ rows.
        if time.time() < _STREAM_STATUS.get('pausa_ate',0):return
        with self._lock:
            pending = [x for x in self.fila if self._fonte_de(x) == 'playlist' and x.get('status') not in ('erro','skipped')][:3]
            for item in pending:
                if item.get('status') == 'fila' and not item.get('_scheduled'):
                    item['_scheduled'] = True
                    item['t0'] = time.time()
                    threading.Thread(target=self._resolver, args=(item,), daemon=True).start()

    def _refresh_expired_streams(self):
        """Refresh queued signed URLs before selecting them for playback."""
        for item in self.fila:
            if item.get('status') != 'ok' or not item.get('id'):continue
            source=item.get('stream') or item.get('arquivo') or ''
            if not source.startswith(('https://','http://')):continue
            try:expires=float(parse_qs(urlsplit(source).query).get('expire',['0'])[0])
            except (ValueError,TypeError):expires=0
            if expires and expires <= time.time()+60:
                item.update(status='fila',stream='',arquivo='',_scheduled=False,t0=time.time())
                self._diagnostics().record('renovando_link',item,'Link de áudio expirado; renovando antes de tocar.')
                if self._fonte_de(item)!='playlist':
                    threading.Thread(target=self._resolver,args=(item,),daemon=True).start()

    def _resolver(self, item: dict):
        semaphore=self._dl_sema if self._fonte_de(item)=='playlist' else self._request_sema
        with semaphore:
            with self._lock:
                if self.atual is not item and not any(x is item for x in self.fila):return
            self._resolver_inner(item)

    def _resolver_inner(self, item: dict):
        try:
            ytd = _yt_cmd()
            if not ytd:
                item['status']='erro';item['erro']='Motor YouTube ausente. Use o ZIP completo do Kaia Chat.'
                self.erro=item['erro'];return
            q = (item.get("q") or "").strip()
            item["status"] = "busca"
            self.erro = f"buscando: {q[:60]}"
            hit = {'id':item['id'],'titulo':item['titulo'],'dur':item.get('dur') or 0} if self._fonte_de(item)=='playlist' and item.get('id') and item.get('titulo') else _buscar_youtube(q)
            if not hit:
                item["status"] = "erro"
                item["titulo"] = f"não achei: {q[:40]}"
                self.erro = f"não achei '{q[:50]}' no YouTube"
                return
            candidatos = [(hit["id"], hit["titulo"], hit.get("dur") or 0)]
            for alt in hit.get("alts") or []:
                candidatos.append((alt[1], alt[2], alt[3]))
            arq = None
            escolhido = None
            for vid, titulo, dur_i in candidatos:
                if dur_i and dur_i > MAX_SEG and self._fonte_de(item) != 'playlist':
                    continue
                item["id"] = vid
                velho = item.get("titulo") or ""
                if titulo and not _parece_link(titulo):
                    item["titulo"] = titulo
                elif not velho or _parece_link(velho):
                    item["titulo"] = _titulo_do_id(vid) or titulo or velho or vid
                item["dur"] = dur_i or _duracao_id(vid)
                item["genero"] = classificar_genero(item.get("titulo") or q)
                item["status"] = "stream"
                self.erro = f"abrindo áudio: {titulo[:50]}"
                stream = _url_stream(vid)
                if not stream:
                    detail=classify_error(_stream_erro())
                    if detail['retryable'] and not detail['pause']:
                        self._diagnostics().record('nova_tentativa',item,detail['reason'],detail['code'])
                        time.sleep(.5)
                        stream=_url_stream(vid)
                if stream:
                    item["stream"] = stream
                    item["arquivo"] = stream
                    escolhido = (vid, titulo, dur_i)
                    arq = stream
                    break
            if not arq:
                item['stream']='';item['arquivo']='';item['status']='erro'
                item['erro']=_stream_erro();self.erro=item['erro']
                if self._fonte_de(item)=='playlist':self._playlist_failure(item,item['erro'])
            else:
                item["status"] = "ok"
                if escolhido:
                    item["id"], item["titulo"], item["dur"] = escolhido
                self.erro = ""
                with self._lock:
                    if not item.get('_announced') and item.get('fonte')!='playlist' and (any(x is item for x in self.fila) or self.atual is item):
                        item['_announced']=True
                        self.notifications.append({'key':item.get('key') or uuid.uuid4().hex,'user':item.get('user') or 'Alguém','titulo':item.get('titulo') or '', 'at':time.time()})
                        self.notifications=self.notifications[-100:]
        except Exception as exc:
            item["status"] = "erro"
            item["erro"] = safe_error(exc)
            self.erro = item["erro"]
            if self._fonte_de(item)=="playlist":self._playlist_failure(item,item["erro"])

    def retry(self):
        if '429' not in _STREAM_STATUS.get('erro',''):
            _STREAM_STATUS.update(erro='',pausa_ate=0)
        with self._lock:
            if self.atual and self.proc is None:
                item=self.atual;self.atual=None;self.fila.insert(0,item)
            else:item=next((x for x in self.fila if x.get('status')=='erro'),None)
            if not item:return 'Nenhum pedido com falha para tentar novamente.'
            item.update(status='fila',stream='',arquivo='',t0=time.time(),erro='')
            self.paused=False;self.erro='Tentando obter o áudio novamente…'
        threading.Thread(target=self._resolver,args=(item,),daemon=True).start()
        return 'Nova tentativa iniciada.'

    def play_pause(self):
        if not self.atual and any(x.get('status')=='erro' for x in self.fila):
            return self.retry()
        if not self.atual:
            self.paused=False
            return
        if self.atual and self.proc is None and not self.paused:
            self._spawn(self.atual.get('stream') or self.atual.get('arquivo') or '',ss=self.acc)
            return
        try:
            with self._lock:
                if not self.atual:
                    return
                if self.paused:
                    self.atual['_recoveries']=0
                    self.paused = False
                    self.t0 = time.time()
                    self._spawn(self.atual.get("arquivo") or "", ss=self.acc)
                else:
                    self.acc = self._elapsed()
                    self.paused = True
                    self._kill()
        except Exception as exc:
            self.erro = str(exc)

    def stop(self):
        try:
            with self._lock:
                self._kill()
                self.atual = None
                self.paused = True
                self.acc = 0
                self.t0 = 0
        except Exception as exc:
            self.erro = str(exc)

    def _fonte_de(self, item) -> str:
        f = ((item or {}).get("fonte") or "sr").lower()
        return f if f in ("voz", "playlist") else "sr"

    def _eh_sr(self, item) -> bool:
        return self._fonte_de(item) != "playlist"

    def _rank(self, item) -> int:
        return {"voz": 0, "sr": 1}.get(self._fonte_de(item), 2)

    def _inserir_prioridade(self, item) -> int:
        r = self._rank(item)
        i = 0
        while i < len(self.fila):
            if self._rank(self.fila[i]) > r:
                break
            i += 1
        self.fila.insert(i, item)
        return i + 1

    def _pegar_proximo(self):
        self._refresh_expired_streams()
        agora = time.time()
        vivos = []
        for x in self.fila:
            st = x.get("status")
            if st == "skipped":continue
            if st == "erro":
                vivos.append(x)
                continue
            if st in ("fila", "busca", "baixa", "stream") and not (self._fonte_de(x) == "playlist" and st == "fila") and agora - float(x.get("t0") or agora) > 120:
                if self._fonte_de(x)=='playlist':self._playlist_failure(x,'Tempo limite ao preparar o áudio.');continue
                x["status"] = "erro"
                x["erro"] = "Tempo limite ao preparar o áudio."
                vivos.append(x)
                continue
            vivos.append(x)
        self.fila = vivos
        def _pronto(x):
            return x.get("status") == "ok" and (x.get("stream") or x.get("arquivo") or x.get("id"))

        for i, x in enumerate(self.fila):
            if self._eh_sr(x) and _pronto(x):
                return self.fila.pop(i)
        if any(self._eh_sr(x) and x.get("status") in ("fila", "busca", "baixa", "stream") for x in self.fila):
            return None
        idxs = [i for i, x in enumerate(self.fila) if _pronto(x) and self._fonte_de(x) == "playlist"]
        if self.shuffle_pl and idxs:
            import random

            i = random.choice(idxs)
            return self.fila.pop(i)
        for i, x in enumerate(self.fila):
            # Preserve background order while its head is still resolving.
            if self._fonte_de(x)=='playlist' and x.get('status') in ('fila','busca','baixa','stream'):
                return None
            if _pronto(x):
                return self.fila.pop(i)
        return None

    def skip(self):
        try:
            with self._lock:
                self._kill()
                self.atual = None
                self.paused = False
                self.acc = 0
        except Exception as exc:
            self.erro = str(exc)

    def prev(self):
        try:
            with self._lock:
                if len(self._tocadas) < 2:
                    self.acc = 0
                    if self.atual:
                        self.paused = False
                        self.t0 = time.time()
                        self._spawn(self.atual.get("arquivo") or "", ss=0)
                    return
                atual = self._tocadas.pop()
                ant = self._tocadas.pop()
                if atual and atual.get("arquivo"):
                    self.fila.insert(0, {**atual, "status": "ok"})
                self._kill()
                self.atual = ant
                self.paused = False
                self.acc = 0
                self.t0 = time.time()
                self._spawn(ant.get("arquivo") or "")
                self._tocadas.append(ant)
        except Exception as exc:
            self.erro = str(exc)

    def seek(self, seg: float):
        try:
            with self._lock:
                if not self.atual:
                    return
                dur = float(self.atual.get("dur") or 0)
                self.acc = max(0.0, min(seg, dur or seg))
                self.paused = False
                self.t0 = time.time()
                self._spawn(self.atual.get("arquivo") or "", ss=self.acc)
        except Exception as exc:
            self.erro = str(exc)

    def set_volume(self, vol: int):
        vol = max(0, min(100, int(vol)))
        try:
            with self._lock:
                self.volume = vol
                if vol > 0:
                    self.mutado = False
                if self.atual and not self.paused:
                    control=getattr(self.proc,'set_volume',None)
                    if callable(control):control(vol)
        except Exception as exc:
            self.erro = str(exc)

    def set_saida(self, nome: str):
        self.saida = (nome or "").strip()
        if self.saida.lower().startswith("padrão") or self.saida.lower().startswith("padrao"):
            self.saida = ""
        with self._lock:
            if self.atual and not self.paused:
                ss = self._elapsed()
                self.acc = ss
                self.t0 = time.time()
                self._spawn(self.atual.get("arquivo") or "", ss=ss)

    def set_limits(self, requests=80, playlist=0):
        self.request_limit=max(1,min(500,int(requests)))
        self.playlist_limit=max(0,int(playlist))
        return 'Limites atualizados; músicas já aceitas foram preservadas.'

    def edit_queue(self, group, operation, key='', target=0):
        if group not in ('sr','playlist'):raise ValueError('Fila inválida.')
        if operation not in ('remove','clear','move'):raise ValueError('Edição inválida.')
        with self._lock:
            indexes=[i for i,x in enumerate(self.fila) if (self._fonte_de(x)=='playlist')==(group=='playlist')]
            if operation=='clear':
                self.fila=[x for i,x in enumerate(self.fila) if i not in indexes]
                return 'Fila limpa; a faixa atual foi mantida.'
            source=next((i for i in indexes if self.fila[i].get('key')==key),None)
            if source is None:raise ValueError('Música não está mais na fila.')
            if operation=='remove':self.fila.pop(source);return 'Música removida.'
            rows=[self.fila[i] for i in indexes]
            old=indexes.index(source);dest=max(0,min(len(rows)-1,int(target)))
            rows.insert(dest,rows.pop(old))
            for i,row in zip(indexes,rows):self.fila[i]=row
            self.shuffle_pl=False
            return 'Ordem manual salva; aleatório desativado.'

    def mute_toggle(self):
        try:
            with self._lock:
                if self.mutado:
                    self.mutado = False
                    self.volume = self._vol_antes or 80
                else:
                    self._vol_antes = self.volume or 80
                    self.mutado = True
                    self.volume = 0
                if self.atual and not self.paused:
                    control=getattr(self.proc,'set_volume',None)
                    if callable(control):control(0 if self.mutado else self.volume)
        except Exception as exc:
            self.erro = str(exc)

    def limpar(self):
        try:
            with self._lock:
                self._kill()
                self.fila.clear()
                self.atual = None
                self.paused = False
                self.acc = 0
        except Exception as exc:
            self.erro = str(exc)

    def remover_fila(self, idx: int):
        try:
            with self._lock:
                if 0 <= idx < len(self.fila):
                    self.fila.pop(idx)
        except Exception as exc:
            self.erro = str(exc)

    def limpar_historico(self):
        with self._lock:
            self.historico = []
        salvar_historico([])

    def apagar_historico(self, idx: int):
        with self._lock:
            if 0 <= idx < len(self.historico):
                self.historico.pop(idx)
                salvar_historico(self.historico)

    def _elapsed(self) -> float:
        if not self.atual:
            return 0.0
        played = getattr(self.proc, 'played_seconds', None)
        extra = 0.0 if self.paused or self.proc is None else played if isinstance(played,(float,int)) else (time.time() - self.t0 if self.t0 else 0)
        dur = float(self.atual.get("dur") or 0)
        val = self.acc + extra
        return min(dur, val) if dur else val

    def _queue_data(self):
        signature=tuple((x.get('key'),x.get('user'),x.get('titulo'),x.get('id'),x.get('status'),x.get('fonte'),x.get('dur'),x.get('erro')) for x in self.fila)
        if getattr(self,'_queue_signature',None)!=signature:
            self._queue_signature=signature
            self._queue_revision=getattr(self,'_queue_revision',0)+1
            rows=[{'key':x.get('key'),'user':x.get('user'),'titulo':x.get('titulo') or x.get('id') or 'Faixa sem título','status':x.get('status'),'fonte':self._fonte_de(x),'dur':x.get('dur') or 0,'erro':x.get('erro') or ''} for x in self.fila]
            groups={name:[x for x in rows if x['fonte']==name] for name in ('voz','sr','playlist')}
            self._queue_cache={'rows':rows,'groups':groups,'requests':len(groups['voz'])+len(groups['sr']),'playlist':len(groups['playlist'])}
        return self._queue_cache

    def estado(self) -> dict:
        try:
            with self._lock:
                el = self._elapsed()
                dur = float((self.atual or {}).get("dur") or 0)
                queue=self._queue_data()
                return {
                    "titulo": _titulo_bonito(self.atual) if self.atual else "",
                    "user": (self.atual or {}).get("user") or "",
                    "elapsed": el,
                    "dur": dur,
                    "paused": self.paused,
                    "volume": 0 if self.mutado else self.volume,
                    "mutado": self.mutado,
                    "saida": self.saida,
                    "tempo": f"{fmt(el)} / {fmt(dur) if dur else '--:--'}" if self.atual else "--:--",
                    "fila":queue['rows'],
                    "queue_revision":self._queue_revision,
                    "fila_voz":queue['groups']['voz'],
                    "fila_sr":queue['groups']['sr'],
                    "fila_pl":queue['groups']['playlist'],
                    "fonte_atual": self._fonte_de(self.atual) if self.atual else "",
                    "erro": self.erro,
                    "notifications":list(getattr(self,'notifications',[])),
                    "diagnostics":self._diagnostics().snapshot(),
                    "request_count":queue['requests'],
                    "playlist_count":queue['playlist'],
                    "estado": 'playing' if self.atual and not self.paused and self.proc is not None and self.proc.poll() is None else 'loading' if getattr(self,'_recovering',False) and self.atual and not self.paused else 'paused' if self.atual and self.paused else 'error' if (self.atual and self.erro) or any(x.get('status')=='erro' for x in self.fila) else 'loading' if any(x.get('status') in ('fila','busca','baixa','stream') for x in self.fila) else 'idle',
                    "tem_ytdlp": bool(_YTD_CACHE.get('cmd')),
                    "tem_player": bool(_player() or _ffmpeg()),
                    "instalando": _INSTALANDO,
                    "genero": (self.atual or {}).get("genero") or "",
                    "historico": list(self.historico[:80]),
                    "stats": stats_sr(self.historico),
                    "tocando": bool(self.atual) and not self.paused and self.proc is not None and self.proc.poll() is None,
                    "repeat": self.repeat,
                    "shuffle_pl": self.shuffle_pl,
                }
        except Exception as exc:
            return {"titulo": "", "tempo": "--:--", "fila": [], "erro": str(exc), "elapsed": 0, "dur": 0}

    def _loop(self):
        while not self._stop:
            time.sleep(0.5)
            try:
                from sr_controle import consumir,publicar,dono_local
                if dono_local():consumir(self)
                if self._stop:break
                self._prefetch_playlist()
                with self._lock:
                    for ped in puxar_pedidos():
                        self.pedir(ped.get("user") or "chat", ped.get("q") or "", fonte=ped.get("fonte") or "sr")
                    if self.atual and not float(self.atual.get("dur") or 0) and self.atual.get("id"):
                        if time.time() - float(self.atual.get("_dur_try") or 0) > 8:
                            self.atual["_dur_try"] = time.time()
                            item=self.atual
                            def duration_update(target):
                                d=_duracao_id(target.get('id'))
                                if d:target['dur']=d
                            threading.Thread(target=duration_update,args=(item,),daemon=True).start()
                    if self.paused:
                        snap = self._snap()
                    else:
                        stalled=self._playback_stalled()
                        if self.atual and self.proc is not None and (self.proc.poll() is not None or stalled):
                            if not self._recover_interruption(stalled=stalled):
                                ended = self.atual
                                self._diagnostics().record('concluida',ended)
                                self.atual = None
                                self.acc = 0
                                self.proc = None
                                if ended:
                                    if self.repeat == "one":
                                        self.fila.insert(0, {**ended, "status": "ok"})
                                    elif self.repeat == "playlist" and self._fonte_de(ended) == "playlist":
                                        self.fila.append({**ended, "status": "ok"})
                        if not self.atual:
                            nxt = self._pegar_proximo()
                            if nxt:
                                self.atual = nxt
                                nxt.pop('_recoveries',None)
                                self.paused = False
                                self.acc = 0
                                self.t0 = time.time()
                                rec = {
                                    "t": time.strftime("%Y-%m-%d %H:%M:%S"),
                                    "user": nxt.get("user") or "",
                                    "titulo": nxt.get("titulo") or "",
                                    "genero": nxt.get("genero")
                                    or classificar_genero(nxt.get("titulo") or ""),
                                    "q": nxt.get("q") or "",
                                }
                                self.historico = [rec] + list(self.historico)
                                self.historico = self.historico[:200]
                                self._tocadas.append(nxt)
                                self._tocadas = self._tocadas[-30:]
                                _append_hist(rec)
                                self._spawn(nxt.get("arquivo") or "")
                                if self.proc is None:self._playlist_failure(nxt,self.erro or 'O áudio não iniciou.',current=True)
                                elif self.proc is not None:self._diagnostics().record('tocando',nxt)
                        snap = self._snap()
                now=time.monotonic()
                if now-getattr(self,'_last_publish',0)>=(1 if self.atual and not self.paused else 3):
                    self._last_publish=now
                    if dono_local():publicar(self.estado())
                    try:
                        ESTADO.parent.mkdir(parents=True, exist_ok=True)
                        ESTADO.write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")
                    except Exception:pass
            except Exception as exc:
                self.erro = str(exc)

    def _playback_stalled(self):
        """Detect a live decoder/device worker no longer delivering PCM."""
        proc=self.proc
        position=getattr(proc,'played_seconds',None)
        if self.paused or proc is None or not isinstance(position,(int,float)):
            self._progress_watch=None
            return False
        now=time.monotonic();watch=getattr(self,'_progress_watch',None)
        if watch is None or watch[0] is not proc or position>watch[1]+.01:
            self._progress_watch=(proc,position,now)
            return False
        return now-watch[2]>=25

    def _recover_interruption(self, stalled=False):
        """Do not treat an early decoder exit as the end of the song."""
        item=self.atual
        position=self._elapsed()
        duration=float(item.get('dur') or 0)
        code=self.proc.poll()
        if not (stalled or code or (duration > 0 and position < duration - 2)):
            return False
        from audio_out import ler_erro
        decoder_error=('Áudio sem progresso por 25 segundos. ' if stalled else '')+ler_erro('sr')
        self.acc=position
        self._kill()
        attempts=int(item.get('_recoveries') or 0)
        if attempts >= 3:
            self._playlist_failure(item,'Áudio interrompido antes do fim após 3 tentativas de retomada. '+decoder_error,current=True)
            return True
        self._diagnostics().record('retomando',item,f'Áudio interrompido em {position:.1f}s; tentativa {attempts+1}/3. '+decoder_error)
        item['_recoveries']=attempts+1
        self._recovering=True
        self.erro=f'Conexão de áudio interrompida em {fmt(position)}. Retomando do mesmo ponto ({attempts+1}/3)…'
        def recover():
            source=''
            try:
                source=_url_stream(item['id']) if item.get('id') else item.get('stream') or item.get('arquivo') or ''
                with self._lock:
                    if self.atual is not item or self.paused or self._stop or self.proc is not None:return
                    if source:
                        item['stream']=source;item['arquivo']=source
                        self._spawn(source,ss=position)
                    if self.proc is None:
                        self.paused=True
                        self.erro=_stream_erro() if not source else self.erro or 'Saída de áudio indisponível. Pedido preservado.'
                        self._playlist_failure(item,self.erro,current=True)
            except Exception as exc:
                with self._lock:
                    if self.atual is item and self.proc is None:
                        self.paused=True;self.erro='Falha ao retomar áudio: '+safe_error(exc)
                        self._playlist_failure(item,self.erro,current=True)
            finally:self._recovering=False
        threading.Thread(target=recover,daemon=True).start()
        return True

    def _snap(self) -> dict:
        # ========================================================
        # 1) SR REALMENTE TOCANDO -> prioridade máxima na HUD
        # ========================================================
        if self.atual:
            el = self._elapsed()
            dur = float((self.atual or {}).get("dur") or 0)

            return {
                "quando": time.time(),
                "titulo": _titulo_bonito(self.atual),
                "url": (self.atual or {}).get("url") or "",
                "user": (self.atual or {}).get("user") or "",
                "elapsed": el,
                "dur": dur,
                "paused": self.paused,
                "tocando": not self.paused and self.proc is not None and self.proc.poll() is None,
                "fonte_atual": self._fonte_de(self.atual),
                "volume": 0 if self.mutado else self.volume,
                "tempo": f"{fmt(el)} / {fmt(dur) if dur else '--:--'}",
                "fila": [
                    {
                        "user": x.get("user"),
                        "titulo": x.get("titulo"),
                        "status": x.get("status"),
                        "fonte": x.get("fonte") or "sr",
                    }
                    for x in self.fila[:20]
                ],
                "erro": self.erro,
            }

        # ========================================================
        # 2) SR VAZIO -> usa o Spotify somente como informação
        #    para a HUD. O Spotify NÃO entra na fila do !sr.
        # ========================================================
        try:
            from spotify_agora import ler_cache as spotify_agora

            sp = spotify_agora() or {}
            if sp.get("estado") in ("ERROR", "UNAVAILABLE", "RECONNECTING"):
                sp = {}

            if sp.get("titulo") and sp.get("tocando"):
                return {
                    "quando": time.time(),
                    "estado": sp.get("estado"),
                    "titulo": sp.get("titulo") or "",
                    "artista": sp.get("artista") or "",
                    "faixa": sp.get("faixa") or "",
                    "album": sp.get("album") or "",
                    "capa": sp.get("capa") or "",
                    "user": "Spotify",
                    "elapsed": float(sp.get("elapsed") or 0),
                    "dur": float(sp.get("dur") or 0),
                    "tempo": sp.get("tempo") or "--:--",
                    "paused": False,
                    "tocando": True,
                    "fonte_atual": "spotify",
                    "volume": 0 if self.mutado else self.volume,
                    "fila": [
                        {
                            "user": x.get("user"),
                            "titulo": x.get("titulo"),
                            "status": x.get("status"),
                            "fonte": x.get("fonte") or "sr",
                        }
                        for x in self.fila[:20]
                    ],
                    "erro": self.erro,
                }

            # Se o Spotify estiver pausado, mantém a informação no JSON
            # sem dizer que está tocando. Isso ajuda a HUD a não usar dado velho.
            if sp.get("titulo"):
                return {
                    "quando": time.time(),
                    "estado": sp.get("estado"),
                    "titulo": sp.get("titulo") or "",
                    "artista": sp.get("artista") or "",
                    "faixa": sp.get("faixa") or "",
                    "album": sp.get("album") or "",
                    "capa": sp.get("capa") or "",
                    "user": "Spotify",
                    "elapsed": float(sp.get("elapsed") or 0),
                    "dur": float(sp.get("dur") or 0),
                    "tempo": sp.get("tempo") or "--:--",
                    "paused": True,
                    "tocando": False,
                    "fonte_atual": "spotify",
                    "volume": 0 if self.mutado else self.volume,
                    "fila": [
                        {
                            "user": x.get("user"),
                            "titulo": x.get("titulo"),
                            "status": x.get("status"),
                            "fonte": x.get("fonte") or "sr",
                        }
                        for x in self.fila[:20]
                    ],
                    "erro": self.erro,
                }

        except Exception as exc:
            print("[spotify HUD]", exc)

        # ========================================================
        # 3) NADA TOCANDO
        # ========================================================
        return {
            "titulo": "",
            "user": "",
            "elapsed": 0.0,
            "dur": 0.0,
            "paused": False,
            "tocando": False,
            "fonte_atual": "",
            "volume": 0 if self.mutado else self.volume,
            "tempo": "--:--",
            "fila": [
                {
                    "user": x.get("user"),
                    "titulo": x.get("titulo"),
                    "status": x.get("status"),
                    "fonte": x.get("fonte") or "sr",
                }
                for x in self.fila[:20]
            ],
            "erro": self.erro,
        }

    def _spawn(self, arquivo: str, ss: float = 0.0, forcar_padrao: bool = False):
        self._kill()
        self._retried = bool(forcar_padrao)
        self._spawn_t0 = time.time()
        fonte = (arquivo or "").strip()
        if not fonte and self.atual:
            fonte = (self.atual.get("stream") or self.atual.get("arquivo") or "").strip()
        eh_url = fonte.startswith("http://") or fonte.startswith("https://")
        if not eh_url and fonte and not Path(fonte).is_file():
            vid = (self.atual or {}).get("id") or ""
            if vid:
                stream = _url_stream(vid)
                if stream:
                    fonte = stream
                    eh_url = True
                    if self.atual:
                        self.atual["stream"] = stream
                else:
                    self.erro = _stream_erro()
                    return
            else:
                self.erro = "não achei o áudio pra tocar"
                return
        if eh_url and "googlevideo.com" not in fonte and "manifest" not in fonte:
            vid = (self.atual or {}).get("id") or ""
            if vid:
                stream = _url_stream(vid)
                if stream:
                    fonte = stream
                    if self.atual:
                        self.atual["stream"] = stream
                else:
                    self.erro = _stream_erro()
                    return
        vol = 0 if self.mutado else int(self.volume)
        saida = self.saida or ""
        try:
            from audio_out import spawn as _spawn_out, ler_erro

            self.proc = _spawn_out(fonte, saida=saida, volume=vol, ss=ss, papel="sr")
            if self.proc is None:
                self.erro = ler_erro() or "Saída SR indisponível. Selecione novamente a saída da música."
            else:
                self.erro = ""
                self.t0=time.time()
        except Exception as exc:
            self.erro = str(exc)
            self.proc = None

    def _spawn_ffplay(self, arquivo: str, ss: float, vol: int):
        ply = _player()
        if not ply:
            return
        nome = Path(ply).name.lower()
        if "mpv" not in nome:
            cmd = [
                ply,
                "-nodisp",
                "-vn",
                "-autoexit",
                "-loglevel",
                "error",
                "-nostats",
                "-reconnect",
                "1",
                "-reconnect_streamed",
                "1",
                "-reconnect_delay_max",
                "4",
                "-fflags",
                "+genpts",
                "-volume",
                str(vol),
            ]
            if ss >= 0.25:
                cmd += ["-ss", f"{ss:.2f}"]
            cmd += ["-i", arquivo]
        else:
            cmd = [ply, "--no-video", "--really-quiet", "--no-terminal", f"--volume={vol}"]
            if ss >= 0.25:
                cmd += [f"--start={ss:.2f}"]
            cmd.append(arquivo)
        try:
            self.proc = subprocess.Popen(
                cmd,
                creationflags=_cf(),
                startupinfo=_si(),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as exc:
            self.erro = str(exc)
            self.proc = None

    def _kill(self):
        p = self.proc
        self.proc = None
        pid = None
        try:
            pid = getattr(p, "pid", None)
            if pid is None:
                pid = getattr(getattr(p, "_sub", None), "pid", None)
        except Exception:
            pid = None
        try:
            if p:
                p.terminate()
        except Exception:
            pass
        try:
            if p:
                p.wait(timeout=0.4)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
        matar_pid(pid)
        matar_players_sr()
        try:
            _fechar_youtube()
        except Exception:
            pass

    def encerrar(self):
        self._stop = True
        with _ACTIVE_RUNS_LOCK:pending=list(_ACTIVE_RUNS)
        for child in pending:
            try:child.kill()
            except OSError:pass
        try:
            with self._lock:
                self.paused = True
                self.atual = None
                self._kill()
        except Exception:
            try:
                self._kill()
            except Exception:
                pass
        matar_players_sr()
        try:
            desmarcar_vivo()
        except Exception:
            pass


_SR = None
_SR_LOCK = threading.Lock()
_AUTO = False


def get_sr() -> SongRequest:
    global _SR, _AUTO
    with _SR_LOCK:
        if _SR is None:
            if adquirir_vivo():_SR = SongRequest()
            else:
                from sr_controle import ProxySR
                _SR = ProxySR()
        sr = _SR
    if not _AUTO and not _yt_cmd():
        _AUTO = True

        def go():
            msg = instalar()
            sr.erro = msg

        threading.Thread(target=go, daemon=True).start()
    return sr


def _atexit_sr():
    # Importar este módulo como biblioteca não deve encerrar players externos.
    if _SR is None or getattr(_SR,'remoto',False):return
    try:
        if _SR is not None:
            _SR.encerrar()
    except Exception:
        pass
    matar_players_sr()


atexit.register(_atexit_sr)


class _Lazy:
    def __getattr__(self, name):
        return getattr(get_sr(), name)


SR = _Lazy()
