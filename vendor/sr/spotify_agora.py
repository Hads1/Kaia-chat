"""
Integração Spotify da Kaia.

Responsabilidades:
- consulta a música atual da conta Spotify;
- mantém avatar/spotify.json atualizado;
- protege a API contra chamadas excessivas;
- trata HTTP 429 / QUOTA_EXCEEDED;
- respeita Retry-After;
- preserva a última música válida durante falhas;
- mantém o relógio da música avançando localmente;
- pode ser usado pelo SR, HUD e pela própria Kaia.

IMPORTANTE:
O SR pode chamar agora() várias vezes por segundo.
Isso NÃO significa várias chamadas à API.

A própria integração controla:
    - intervalo mínimo entre chamadas;
    - cooldown;
    - bloqueio entre processos;
    - cache local.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Optional


# ============================================================
# CAMINHOS
# ============================================================

BASE = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))

AVATAR = BASE / "avatar"

CACHE = AVATAR / "spotify.json"

STATUS = AVATAR / "spotify_status.json"

API_LOCK = AVATAR / "spotify_api.lock"


# ============================================================
# CONFIGURAÇÃO
# ============================================================

# Tempo mínimo entre consultas reais à API.
#
# O sr_player pode chamar agora() a cada 0.35s.
# Mesmo assim a API será consultada no máximo
# aproximadamente uma vez a cada 30 segundos.
API_INTERVALO = 30.0


# O monitor local pode acordar mais rápido porque
# atualizar() já possui proteção contra chamadas demais.
MONITOR_INTERVALO = 5.0


# Se um processo morrer enquanto segurava o lock,
# depois desse tempo outro processo pode liberar.
LOCK_EXPIRA = 60.0


# Erros normais de conexão/API.
ERRO_COOLDOWN = 60.0


# Escalonamento específico para QUOTA_EXCEEDED.
#
# Primeira ocorrência:
# 15 minutos.
#
# Depois:
# 30 minutos.
# 1 hora.
# 2 horas.
QUOTA_BACKOFF = (
    15 * 60,
    30 * 60,
    60 * 60,
    2 * 60 * 60,
)


# ============================================================
# THREAD DO MONITOR
# ============================================================

_monitor_thread: Optional[threading.Thread] = None

_monitor_stop = threading.Event()

_monitor_lock = threading.Lock()


# ============================================================
# LOCK INTERNO
# ============================================================

_api_thread_lock = threading.RLock()


# ============================================================
# UTILIDADES
# ============================================================

def _fmt(
    seg,
) -> str:

    try:

        seg = max(
            0,
            int(
                float(
                    seg
                    or 0
                )
            )
        )

    except Exception:

        seg = 0

    return (
        f"{seg // 60}:"
        f"{seg % 60:02d}"
    )


def _agora_ts() -> float:

    return time.time()


def _vazio(
    fonte: str = "spotify",
) -> dict:

    return {
        "estado": "NO_TRACK",
        "titulo": "",
        "artista": "",
        "faixa": "",
        "album": "",
        "capa": "",

        "elapsed": 0.0,
        "dur": 0.0,

        "tempo": "--:--",

        "progress_ms": 0,
        "duration_ms": 0,

        "tocando": False,
        "paused": True,

        "fonte": fonte,
        "user": "Spotify",
    }


# ============================================================
# JSON ATÔMICO
# ============================================================

def _ler_json(
    caminho: Path,
) -> dict:

    if not caminho.is_file():

        return {}

    try:

        obj = json.loads(
            caminho.read_text(
                encoding="utf-8",
            )
        )

        if isinstance(
            obj,
            dict,
        ):

            return obj

    except Exception:

        pass

    return {}


def _gravar_json(caminho: Path, dados: dict):
    import tempfile
    nome = None
    try:
        caminho.parent.mkdir(parents=True, exist_ok=True)
        fd, nome = tempfile.mkstemp(dir=caminho.parent, prefix=caminho.name + ".", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(nome, caminho)
    except Exception as exc:
        print("[spotify] salvar JSON:", type(exc).__name__)
    finally:
        if nome:
            Path(nome).unlink(missing_ok=True)




# ============================================================
# CONFIG.YAML
# ============================================================

def _cfg() -> dict:

    try:

        import yaml

        caminho = (
            BASE
            / "config.yaml"
        )

        if not caminho.is_file():

            return {}

        raw = (
            yaml.safe_load(
                caminho.read_text(
                    encoding="utf-8",
                )
            )
            or {}
        )

        return (
            raw.get(
                "spotify"
            )
            or {}
        )

    except Exception as exc:

        print(
            "[spotify] config:",
            exc,
        )

        return {}


def _alterar_config_spotify(
    alteracoes: dict,
):

    try:

        import yaml

        caminho = (
            BASE
            / "config.yaml"
        )

        if not caminho.is_file():

            return

        raw = (
            yaml.safe_load(
                caminho.read_text(
                    encoding="utf-8",
                )
            )
            or {}
        )

        raw.setdefault(
            "spotify",
            {},
        )

        raw["spotify"].update(
            alteracoes
        )

        import tempfile
        fd, nome = tempfile.mkstemp(dir=caminho.parent, prefix="config_spotify.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(yaml.safe_dump(raw, allow_unicode=True, sort_keys=False))
                f.flush()
                os.fsync(f.fileno())
            os.replace(nome, caminho)
        finally:
            Path(nome).unlink(missing_ok=True)
        return True

    except Exception as exc:
        print("[spotify] config salvar:", type(exc).__name__)
        return False


# ============================================================
# STATUS DA API
# ============================================================

def _status() -> dict:

    st = _ler_json(
        STATUS
    )

    return {
        "ultima_chamada_api":
            float(
                st.get(
                    "ultima_chamada_api"
                )
                or 0
            ),

        "bloqueado_ate":
            float(
                st.get(
                    "bloqueado_ate"
                )
                or 0
            ),

        "quota_nivel":
            int(
                st.get(
                    "quota_nivel"
                )
                or 0
            ),

        "ultimo_erro":
            str(
                st.get(
                    "ultimo_erro"
                )
                or ""
            ),

        "ultimo_http":
            int(
                st.get(
                    "ultimo_http"
                )
                or 0
            ),
    }


def _salvar_status(
    st: dict,
):

    _gravar_json(
        STATUS,
        {
            "ultima_chamada_api":
                float(
                    st.get(
                        "ultima_chamada_api"
                    )
                    or 0
                ),

            "bloqueado_ate":
                float(
                    st.get(
                        "bloqueado_ate"
                    )
                    or 0
                ),

            "quota_nivel":
                int(
                    st.get(
                        "quota_nivel"
                    )
                    or 0
                ),

            "ultimo_erro":
                str(
                    st.get(
                        "ultimo_erro"
                    )
                    or ""
                ),

            "ultimo_http":
                int(
                    st.get(
                        "ultimo_http"
                    )
                    or 0
                ),
        },
    )


# ============================================================
# CACHE SPOTIFY.JSON
# ============================================================

def _cache_bruto() -> dict:

    return _ler_json(
        CACHE
    )


def _ajustar_tempo_cache(
    dados: dict,
) -> dict:
    """
    Faz o relógio avançar localmente sem consultar
    a API do Spotify.

    Exemplo:

    API informou:
        1:20 / 4:00

    10 segundos depois:

        1:30 / 4:00

    Isso ocorre localmente.
    """

    if not dados:

        return {}

    d = dict(
        dados
    )

    try:

        quando = float(
            d.get(
                "quando"
            )
            or 0
        )

    except Exception:

        quando = 0

    if quando <= 0:
        d.update(estado="UNAVAILABLE", tocando=False, paused=False, cache_antigo=True)
        return d
    idade = max(0.0, _agora_ts() - quando)
    if idade > 90:
        d.update(estado="UNAVAILABLE", tocando=False, paused=False, cache_antigo=True)
        return d
    d.setdefault("estado", "PLAYING" if d.get("tocando") else "PAUSED" if d.get("titulo") else "NO_TRACK")
    if (
        d.get(
            "tocando"
        )
        and d.get(
            "dur"
        )
    ):

        try:

            elapsed = float(
                d.get(
                    "elapsed"
                )
                or 0
            )

            dur = float(
                d.get(
                    "dur"
                )
                or 0
            )

            elapsed += idade

            if dur > 0:

                elapsed = min(
                    elapsed,
                    dur,
                )

            d[
                "elapsed"
            ] = elapsed

            d[
                "progress_ms"
            ] = int(
                elapsed
                * 1000
            )

            d[
                "tempo"
            ] = (
                f"{_fmt(elapsed)} / "
                f"{_fmt(dur)}"
            )

            # Se o cache ficou velho e o tempo já chegou
            # ao fim da faixa, não fica fingindo eternamente
            # que a música ainda está tocando.
            if (
                dur > 0
                and elapsed >= dur
                and idade > 10
            ):

                d[
                    "tocando"
                ] = False

                d[
                    "paused"
                ] = False
                d["estado"] = "UNAVAILABLE"

        except Exception:

            pass

    return d


def ler_cache() -> dict:
    """
    Leitura pública do spotify.json.

    NÃO consulta a internet.
    """

    return _ajustar_tempo_cache(
        _cache_bruto()
    )


def _salvar_cache(
    dados: dict,
):

    if not isinstance(
        dados,
        dict,
    ):

        return

    d = dict(
        dados
    )

    d["quando"] = _agora_ts()
    d["updated_at"] = d["quando"]
    d.setdefault("estado", "PLAYING" if d.get("tocando") else "PAUSED" if d.get("titulo") else "NO_TRACK")

    _gravar_json(
        CACHE,
        d,
    )


# ============================================================
# LOCK ENTRE PROCESSOS
# ============================================================

def _lock_velho() -> bool:

    if not API_LOCK.is_file():

        return False

    try:

        idade = (
            _agora_ts()
            - API_LOCK.stat().st_mtime
        )

        return (
            idade
            > LOCK_EXPIRA
        )

    except Exception:

        return False


def _adquirir_api_lock():

    try:

        AVATAR.mkdir(
            parents=True,
            exist_ok=True,
        )

    except Exception:

        pass

    if _lock_velho():

        try:

            API_LOCK.unlink()

        except Exception:

            pass

    try:

        fd = os.open(
            str(
                API_LOCK
            ),
            os.O_CREAT
            | os.O_EXCL
            | os.O_WRONLY,
        )

        os.write(
            fd,
            (
                f"{os.getpid()}|"
                f"{_agora_ts()}"
            ).encode(
                "utf-8"
            ),
        )

        return fd

    except FileExistsError:

        return None

    except Exception:

        return None


def _soltar_api_lock(
    fd,
):

    try:

        if fd is not None:

            os.close(
                fd
            )

    except Exception:

        pass

    try:

        if API_LOCK.is_file():

            API_LOCK.unlink()

    except Exception:

        pass


# ============================================================
# TOKEN
# ============================================================

def _refresh(
    cfg: dict,
) -> str:

    tok = (
        cfg.get(
            "access_token"
        )
        or ""
    ).strip()

    try:

        exp = float(
            cfg.get(
                "expira"
            )
            or 0
        )

    except Exception:

        exp = 0

    # Token continua válido.
    if (
        tok
        and exp
        > _agora_ts()
        + 30
    ):

        return tok

    refresh = (
        cfg.get(
            "refresh_token"
        )
        or ""
    ).strip()

    cid = (
        cfg.get(
            "client_id"
        )
        or ""
    ).strip()

    secret = (
        cfg.get(
            "client_secret"
        )
        or ""
    ).strip()

    if not (
        refresh
        and cid
        and secret
    ):

        return tok

    try:

        import requests

        r = requests.post(
            (
                "https://accounts.spotify.com"
                "/api/token"
            ),
            data={
                "grant_type":
                    "refresh_token",

                "refresh_token":
                    refresh,
            },
            auth=(
                cid,
                secret,
            ),
            timeout=10,
        )

    except Exception as exc:

        print(
            "[spotify] refresh conexão:",
            exc,
        )

        return ""

    if r.status_code >= 400:

        print(
            "[spotify] refresh:",
            r.status_code,
        )

        return ""

    try:

        j = (
            r.json()
            or {}
        )

    except Exception:

        return ""

    access = (
        j.get(
            "access_token"
        )
        or ""
    ).strip()

    if not access:

        return ""

    alteracoes = {
        "access_token":
            access,

        "expira":
            (
                _agora_ts()
                + int(
                    j.get(
                        "expires_in"
                    )
                    or 3600
                )
                - 30
            ),
    }

    novo_refresh = (
        j.get(
            "refresh_token"
        )
        or ""
    ).strip()

    if novo_refresh:

        alteracoes[
            "refresh_token"
        ] = novo_refresh

    _alterar_config_spotify(
        alteracoes
    )

    return access


def _invalidar_access_token():
    """
    Se a API responder 401 apesar de o código achar
    que o token ainda é válido, força refresh uma vez.
    """

    _alterar_config_spotify(
        {
            "access_token": "",
            "expira": 0,
        }
    )


# ============================================================
# RETRY-AFTER
# ============================================================

def _retry_after(
    resposta,
) -> float:

    try:

        bruto = (
            resposta.headers.get(
                "Retry-After"
            )
            or "0"
        )

        return max(
            0.0,
            float(
                bruto
            ),
        )

    except Exception:

        return 0.0


# ============================================================
# LEITURA DO ERRO SPOTIFY
# ============================================================

def _motivo_erro(
    resposta,
) -> tuple[str, str]:

    reason = ""
    message = ""

    try:

        j = (
            resposta.json()
            or {}
        )

        erro = (
            j.get(
                "error"
            )
            or {}
        )

        if isinstance(
            erro,
            dict,
        ):

            reason = str(
                erro.get(
                    "reason"
                )
                or ""
            )

            message = str(
                erro.get(
                    "message"
                )
                or ""
            )

    except Exception:

        pass

    if not message:

        try:

            message = (
                resposta.text[:300]
                or ""
            )

        except Exception:

            pass

    return (
        reason.strip(),
        message.strip(),
    )


# ============================================================
# API SPOTIFY
# ============================================================

def _fazer_get(
    token: str,
):

    import requests

    return requests.get(
        (
            "https://api.spotify.com"
            "/v1/me/player/currently-playing"
        ),
        headers={
            "Authorization":
                f"Bearer {token}"
        },
        timeout=8,
    )


def _api(
    tentar_refresh_401: bool = True,
) -> tuple[str, Optional[dict], float, str, int]:
    """
    Retorna:

        estado,
        dados,
        retry_after,
        detalhe,
        http_status

    estados possíveis:

        ok
        quota
        rate_limit
        sem_token
        auth
        http
        conexao
    """

    cfg = _cfg()

    tok = _refresh(
        cfg
    )

    if not tok:

        return (
            "sem_token",
            None,
            0.0,
            "Spotify sem token válido.",
            0,
        )

    try:

        r = _fazer_get(
            tok
        )

    except Exception as exc:

        return (
            "conexao",
            None,
            0.0,
            str(
                exc
            ),
            0,
        )

    # --------------------------------------------------------
    # 401 - tenta renovar o token UMA vez.
    # --------------------------------------------------------

    if (
        r.status_code == 401
        and tentar_refresh_401
    ):

        _invalidar_access_token()

        cfg = _cfg()

        novo = _refresh(
            cfg
        )

        if novo:

            try:

                r = _fazer_get(
                    novo
                )

            except Exception as exc:

                return (
                    "conexao",
                    None,
                    0.0,
                    str(
                        exc
                    ),
                    0,
                )

    # --------------------------------------------------------
    # Nenhuma música ativa.
    # Isso NÃO é erro.
    # --------------------------------------------------------

    if r.status_code == 204:

        return (
            "ok",
            _vazio(
                "spotify"
            ),
            0.0,
            "",
            204,
        )

    # --------------------------------------------------------
    # 429
    # --------------------------------------------------------

    if r.status_code == 429:

        reason, mensagem = (
            _motivo_erro(
                r
            )
        )

        espera = _retry_after(
            r
        )

        if (
            reason.upper()
            == "QUOTA_EXCEEDED"
        ):

            return (
                "quota",
                None,
                espera,
                (
                    mensagem
                    or reason
                    or "QUOTA_EXCEEDED"
                ),
                429,
            )

        return (
            "rate_limit",
            None,
            espera,
            (
                mensagem
                or reason
                or "Too many requests"
            ),
            429,
        )

    # --------------------------------------------------------
    # Outros erros HTTP
    # --------------------------------------------------------

    if r.status_code >= 400:

        reason, mensagem = (
            _motivo_erro(
                r
            )
        )

        return (
            (
                "auth"
                if r.status_code
                in (
                    401,
                    403,
                )
                else "http"
            ),
            None,
            0.0,
            (
                mensagem
                or reason
                or (
                    f"HTTP "
                    f"{r.status_code}"
                )
            ),
            int(
                r.status_code
            ),
        )

    # --------------------------------------------------------
    # JSON
    # --------------------------------------------------------

    try:

        j = (
            r.json()
            or {}
        )

    except Exception as exc:

        return (
            "http",
            None,
            0.0,
            (
                "Resposta Spotify "
                f"inválida: {exc}"
            ),
            int(
                r.status_code
            ),
        )

    item = (
        j.get(
            "item"
        )
        or {}
    )

    if not item:

        return (
            "ok",
            _vazio(
                "spotify"
            ),
            0.0,
            "",
            int(
                r.status_code
            ),
        )

    nome = str(
        item.get(
            "name"
        )
        or ""
    ).strip()

    artistas_lista = (
        item.get(
            "artists"
        )
        or []
    )

    arts = ", ".join(
        str(
            artista.get(
                "name"
            )
            or ""
        ).strip()

        for artista
        in artistas_lista

        if artista.get(
            "name"
        )
    )

    if (
        arts
        and nome
    ):

        titulo = (
            f"{arts} — {nome}"
        )

    elif nome:

        titulo = nome

    else:

        titulo = arts

    try:

        progress_ms = int(
            j.get(
                "progress_ms"
            )
            or 0
        )

    except Exception:

        progress_ms = 0

    try:

        duration_ms = int(
            item.get(
                "duration_ms"
            )
            or 0
        )

    except Exception:

        duration_ms = 0

    elapsed = (
        progress_ms
        / 1000.0
    )

    dur = (
        duration_ms
        / 1000.0
    )

    album = (
        item.get(
            "album"
        )
        or {}
    )

    album_nome = str(
        album.get(
            "name"
        )
        or ""
    ).strip()

    imagens = (
        album.get(
            "images"
        )
        or []
    )

    capa = ""

    if imagens:

        try:

            capa = str(
                imagens[0].get(
                    "url"
                )
                or ""
            )

        except Exception:

            capa = ""

    tocando = bool(
        j.get(
            "is_playing"
        )
    )

    if titulo:

        if dur > 0:

            tempo = (
                f"{_fmt(elapsed)} / "
                f"{_fmt(dur)}"
            )

        else:

            tempo = _fmt(
                elapsed
            )

    else:

        tempo = "--:--"

    dados = {
        "estado": "PLAYING" if tocando else "PAUSED",
        "titulo": titulo,
        "artista": arts,
        "faixa": nome,
        "album": album_nome,
        "capa": capa,

        "elapsed": elapsed,
        "dur": dur,
        "tempo": tempo,

        "progress_ms":
            progress_ms,

        "duration_ms":
            duration_ms,

        "tocando":
            tocando,

        "paused":
            not tocando,

        "fonte":
            "spotify",

        "user":
            "Spotify",
    }

    return (
        "ok",
        dados,
        0.0,
        "",
        int(
            r.status_code
        ),
    )


# ============================================================
# FALLBACK: JANELA DO SPOTIFY
# ============================================================

def _janela_windows() -> Optional[dict]:

    try:

        import ctypes
        from ctypes import wintypes

    except Exception:

        return None

    try:

        user32 = (
            ctypes.windll.user32
        )

    except Exception:

        return None

    titulos = []

    @ctypes.WINFUNCTYPE(
        ctypes.c_bool,
        wintypes.HWND,
        wintypes.LPARAM,
    )
    def cb(
        hwnd,
        _lp,
    ):

        try:

            if not user32.IsWindowVisible(
                hwnd
            ):

                return True

            n = (
                user32
                .GetWindowTextLengthW(
                    hwnd
                )
            )

            if n < 3:

                return True

            buf = (
                ctypes
                .create_unicode_buffer(
                    n + 1
                )
            )

            user32.GetWindowTextW(
                hwnd,
                buf,
                n + 1,
            )

            t = (
                buf.value
                or ""
            ).strip()

            if (
                "spotify"
                in t.lower()
            ):

                titulos.append(
                    t
                )

        except Exception:

            pass

        return True

    try:

        user32.EnumWindows(
            cb,
            0,
        )

    except Exception:

        return None

    for titulo_janela in titulos:

        low = (
            titulo_janela
            .lower()
            .strip()
        )

        if low in {
            "spotify",
            "spotify premium",
            "spotify free",
        }:

            continue

        limpo = (
            titulo_janela
            .replace(
                " - Spotify",
                "",
            )
            .replace(
                " – Spotify",
                "",
            )
            .replace(
                " — Spotify",
                "",
            )
            .strip()
        )

        if (
            limpo
            and "spotify"
            not in limpo.lower()
        ):

            return {
                "titulo": limpo,

                "artista": "",
                "faixa": limpo,
                "album": "",
                "capa": "",

                "elapsed": 0.0,
                "dur": 0.0,

                "tempo": "--:--",

                "progress_ms": 0,
                "duration_ms": 0,

                "tocando": True,
                "paused": False,

                "fonte": "janela",

                "user": "Spotify",
            }

    return None


# ============================================================
# ESTADO DE ERRO SEM APAGAR A MÚSICA
# ============================================================

def _estado_durante_falha(tipo: str, detalhe: str, bloqueado_ate: float) -> dict:
    anterior = ler_cache()
    d = dict(anterior) if anterior else _vazio()
    d.update(estado="UNAVAILABLE" if tipo in ("sem_token", "auth") else "ERROR",
             tocando=False, paused=False, cache_antigo=True,
             spotify_api_estado=tipo, spotify_api_erro="Spotify indisponível (" + tipo + ").",
             proxima_tentativa=bloqueado_ate)
    # Não renova timestamp da última observação válida.
    _gravar_json(CACHE, d)
    return d




# ============================================================
# COOLDOWN
# ============================================================

def _registrar_erro(
    tipo: str,
    detalhe: str,
    http_status: int = 0,
    retry_after: float = 0.0,
) -> dict:

    # Respostas/erros remotos não entram crus no JSON servido pelo HUD.
    detalhe = f"Spotify: {tipo} (HTTP {http_status})."

    st = _status()

    agora_ts = (
        _agora_ts()
    )

    if tipo == "quota":

        nivel = max(
            0,
            int(
                st.get(
                    "quota_nivel"
                )
                or 0
            ),
        )

        indice = min(
            nivel,
            len(
                QUOTA_BACKOFF
            )
            - 1,
        )

        espera = float(
            QUOTA_BACKOFF[
                indice
            ]
        )

        if retry_after > 0:

            espera = max(
                espera,
                retry_after,
            )

        st[
            "quota_nivel"
        ] = min(
            nivel + 1,
            len(
                QUOTA_BACKOFF
            )
            - 1,
        )

    elif tipo == "rate_limit":

        espera = max(
            60.0,
            float(
                retry_after
                or 0
            ),
        )

    elif tipo == "sem_token":

        # Sem credenciais não adianta martelar
        # a função a cada 0,35 segundo.
        espera = 5 * 60

    elif tipo == "auth":

        espera = 5 * 60

    else:

        espera = ERRO_COOLDOWN

    st[
        "bloqueado_ate"
    ] = (
        agora_ts
        + espera
    )

    st[
        "ultimo_erro"
    ] = detalhe

    st[
        "ultimo_http"
    ] = int(
        http_status
        or 0
    )

    _salvar_status(
        st
    )

    if tipo == "quota":

        print(
            "[spotify] QUOTA_EXCEEDED."
        )

        print(
            "[spotify] novas chamadas pausadas por "
            f"{int(espera)} segundos."
        )

    elif tipo == "rate_limit":

        print(
            "[spotify] rate limit."
        )

        print(
            "[spotify] novas chamadas pausadas por "
            f"{int(espera)} segundos."
        )

    else:

        print(
            "[spotify]",
            tipo,
            detalhe,
        )

    return _estado_durante_falha(
        tipo,
        detalhe,
        st[
            "bloqueado_ate"
        ],
    )


def _registrar_sucesso(
    http_status: int = 200,
):

    st = _status()

    st[
        "bloqueado_ate"
    ] = 0.0

    st[
        "quota_nivel"
    ] = 0

    st[
        "ultimo_erro"
    ] = ""

    st[
        "ultimo_http"
    ] = int(
        http_status
        or 200
    )

    _salvar_status(
        st
    )


# ============================================================
# ATUALIZAÇÃO CONTROLADA
# ============================================================

def _atualizar_controlado(
    forcar: bool = False,
) -> dict:
    """
    ÚNICO ponto que deve fazer consulta real à API.

    Mesmo que:
        sr_player
        Kaia
        HUD
        monitor

    chamem várias vezes, esta função controla tudo.
    """

    with _api_thread_lock:

        agora_ts = (
            _agora_ts()
        )

        st = _status()

        cache = ler_cache()

        bloqueado_ate = float(
            st.get(
                "bloqueado_ate"
            )
            or 0
        )

        # ----------------------------------------------------
        # COOLDOWN ATIVO
        # ----------------------------------------------------

        if agora_ts < bloqueado_ate:

            if cache:

                return cache

            return _estado_durante_falha(
                (
                    "cooldown"
                ),
                (
                    st.get(
                        "ultimo_erro"
                    )
                    or "Spotify em cooldown."
                ),
                bloqueado_ate,
            )

        ultima_api = float(
            st.get(
                "ultima_chamada_api"
            )
            or 0
        )

        # ----------------------------------------------------
        # INTERVALO MÍNIMO
        #
        # Mesmo "forcar" não ultrapassa isso por padrão,
        # justamente para não voltar a estourar a cota.
        # ----------------------------------------------------

        if (
            ultima_api > 0
            and (
                agora_ts
                - ultima_api
            )
            < API_INTERVALO
        ):

            if cache:

                return cache

            try:

                janela = (
                    _janela_windows()
                )

            except Exception:

                janela = None

            if janela:

                return janela

            return _vazio(
                ""
            )

        # ----------------------------------------------------
        # LOCK ENTRE PROCESSOS
        # ----------------------------------------------------

        fd = _adquirir_api_lock()

        if fd is None:

            # Outro processo da Kaia provavelmente já
            # está atualizando a API.
            if cache:

                return cache

            try:

                janela = (
                    _janela_windows()
                )

            except Exception:

                janela = None

            return (
                janela
                or _vazio(
                    ""
                )
            )

        try:

            # Muito importante:
            # relê o status DEPOIS de obter o lock,
            # pois outro processo pode ter consultado
            # a API antes deste processo conseguir entrar.
            st = _status()

            agora_ts = (
                _agora_ts()
            )

            bloqueado_ate = float(
                st.get(
                    "bloqueado_ate"
                )
                or 0
            )

            if agora_ts < bloqueado_ate:

                return (
                    ler_cache()
                    or _estado_durante_falha(
                        "cooldown",
                        (
                            st.get(
                                "ultimo_erro"
                            )
                            or "Spotify em cooldown."
                        ),
                        bloqueado_ate,
                    )
                )

            ultima_api = float(
                st.get(
                    "ultima_chamada_api"
                )
                or 0
            )

            if (
                ultima_api > 0
                and (
                    agora_ts
                    - ultima_api
                )
                < API_INTERVALO
            ):

                return (
                    ler_cache()
                    or _vazio(
                        ""
                    )
                )

            # Marca ANTES da chamada.
            #
            # Dessa forma, mesmo que existam vários
            # processos da Kaia, outro processo verá
            # que uma chamada acabou de ocorrer.
            st[
                "ultima_chamada_api"
            ] = agora_ts

            _salvar_status(
                st
            )

            (
                tipo,
                dados,
                retry_after,
                detalhe,
                http_status,
            ) = _api()

        finally:

            _soltar_api_lock(
                fd
            )

        # ----------------------------------------------------
        # SUCESSO
        # ----------------------------------------------------

        if (
            tipo == "ok"
            and dados is not None
        ):

            _registrar_sucesso(
                http_status
            )

            dados.pop(
                "spotify_api_erro",
                None,
            )

            dados.pop(
                "spotify_api_estado",
                None,
            )

            dados.pop(
                "proxima_tentativa",
                None,
            )

            dados.pop(
                "cache_antigo",
                None,
            )

            _salvar_cache(
                dados
            )

            return dados

        # ----------------------------------------------------
        # ERRO
        # ----------------------------------------------------

        return _registrar_erro(
            tipo,
            detalhe,
            http_status,
            retry_after,
        )


# ============================================================
# CONSULTA PÚBLICA
# ============================================================

def agora(
    ignorar_cache: bool = False,
) -> dict:
    """
    Principal função usada pelo restante da Kaia.

    Pode ser chamada várias vezes por segundo.

    A função NÃO consulta a API várias vezes:
    _atualizar_controlado() controla o intervalo.
    """

    cache = ler_cache()

    st = _status()

    agora_ts = (
        _agora_ts()
    )

    bloqueado = float(
        st.get(
            "bloqueado_ate"
        )
        or 0
    )

    # Durante cooldown:
    # devolve imediatamente o último estado conhecido.
    if agora_ts < bloqueado:

        if cache:
            cache.update(estado="UNAVAILABLE" if st.get("ultimo_tipo") in ("auth", "sem_token") else "ERROR",
                         tocando=False, paused=False, cache_antigo=True)
            return cache

        return _estado_durante_falha(
            "cooldown",
            (
                st.get(
                    "ultimo_erro"
                )
                or "Spotify em cooldown."
            ),
            bloqueado,
        )

    ultima_api = float(
        st.get(
            "ultima_chamada_api"
        )
        or 0
    )

    # Se já consultamos recentemente,
    # usa somente o cache.
    if (
        cache
        and ultima_api > 0
        and (
            agora_ts
            - ultima_api
        )
        < API_INTERVALO
    ):

        return cache

    # ignorar_cache continua existindo por compatibilidade,
    # porém NÃO desativa as proteções de quota.
    return _atualizar_controlado(
        forcar=ignorar_cache
    )


def atualizar() -> dict:
    """
    Solicita atualização.

    Diferentemente da versão antiga, esta função
    NÃO ignora as proteções de intervalo/cooldown.
    """

    return _atualizar_controlado(
        forcar=False
    )


def forcar_atualizacao() -> dict:
    """
    Mantido para diagnóstico.

    Ainda respeita cooldown e o intervalo mínimo,
    pois ultrapassar isso poderia recriar o problema
    de QUOTA_EXCEEDED.
    """

    return _atualizar_controlado(
        forcar=True
    )


# ============================================================
# RESPOSTA DA KAIA
# ============================================================

def frase_agora() -> Optional[str]:

    d = agora()

    faixa = str(
        d.get(
            "faixa"
        )
        or ""
    ).strip()

    artista = str(
        d.get(
            "artista"
        )
        or ""
    ).strip()

    titulo = str(
        d.get(
            "titulo"
        )
        or ""
    ).strip()

    tocando = bool(
        d.get(
            "tocando"
        )
    )

    if (
        tocando
        and titulo
    ):

        if (
            faixa
            and artista
        ):

            return (
                "No Spotify está tocando "
                f"{faixa}, de {artista}."
            )

        return (
            "No Spotify está tocando "
            f"{titulo}."
        )

    if titulo:

        if (
            faixa
            and artista
        ):

            return (
                "A última música identificada "
                "no Spotify foi "
                f"{faixa}, de {artista}."
            )

        return (
            "A última música identificada "
            "no Spotify foi "
            f"{titulo}."
        )

    return None


# ============================================================
# MONITOR CONTÍNUO
# ============================================================

def _monitor_loop():

    print(
        "[spotify] monitor iniciado"
    )

    ultimo_titulo = ""

    ultimo_estado = None

    while not _monitor_stop.is_set():

        try:

            d = atualizar()

            titulo = str(
                d.get(
                    "titulo"
                )
                or ""
            )

            tocando = bool(
                d.get(
                    "tocando"
                )
            )

            if (
                titulo
                and (
                    titulo
                    != ultimo_titulo
                    or tocando
                    != ultimo_estado
                )
            ):

                estado = (
                    "tocando"
                    if tocando
                    else "pausado"
                )

                print(
                    f"[spotify] {estado}: "
                    f"{titulo}"
                )

            ultimo_titulo = (
                titulo
            )

            ultimo_estado = (
                tocando
            )

        except Exception as exc:

            print(
                "[spotify] monitor:",
                exc,
            )

        _monitor_stop.wait(
            MONITOR_INTERVALO
        )


def iniciar_monitor() -> bool:
    """
    Inicia atualização contínua em uma
    thread de background.

    Seguro chamar mais de uma vez no mesmo processo.
    """

    if not _cfg().get("monitoring_enabled", True):
        return False

    global _monitor_thread

    with _monitor_lock:

        if (
            _monitor_thread
            and _monitor_thread.is_alive()
        ):

            return False

        _monitor_stop.clear()

        _monitor_thread = threading.Thread(
            target=_monitor_loop,
            name="KaiaSpotify",
            daemon=True,
        )

        _monitor_thread.start()

        return True


def parar_monitor():

    _monitor_stop.set()


def monitor_rodando() -> bool:

    return bool(
        _monitor_thread
        and _monitor_thread.is_alive()
    )


# ============================================================
# DIAGNÓSTICO
# ============================================================

def diagnostico() -> dict:
    """
    Não força chamada à API.

    Pode ser usado para descobrir se o sistema
    está em cooldown sem gastar requisição.
    """

    st = _status()

    agora_ts = (
        _agora_ts()
    )

    bloqueado_ate = float(
        st.get(
            "bloqueado_ate"
        )
        or 0
    )

    ultima = float(
        st.get(
            "ultima_chamada_api"
        )
        or 0
    )

    return {
        "cache":
            ler_cache(),

        "ultima_chamada_api":
            ultima,

        "segundos_desde_api":
            (
                max(
                    0,
                    agora_ts
                    - ultima,
                )
                if ultima
                else None
            ),

        "bloqueado_ate":
            bloqueado_ate,

        "cooldown_restante":
            max(
                0,
                bloqueado_ate
                - agora_ts,
            ),

        "quota_nivel":
            st.get(
                "quota_nivel"
            ),

        "ultimo_erro":
            st.get(
                "ultimo_erro"
            ),

        "ultimo_http":
            st.get(
                "ultimo_http"
            ),

        "api_intervalo":
            API_INTERVALO,

        "monitor_intervalo":
            MONITOR_INTERVALO,
    }


# ============================================================
# EXECUÇÃO DIRETA
# ============================================================

if __name__ == "__main__":

    print(
        "=========================================="
    )

    print(
        "KAIA - SPOTIFY PROTEGIDO"
    )

    print(
        "=========================================="
    )

    print()

    print(
        f"JSON: {CACHE}"
    )

    print(
        "Consulta real à API: no máximo "
        f"a cada {API_INTERVALO:.0f}s"
    )

    print(
        "Monitor local: a cada "
        f"{MONITOR_INTERVALO:.0f}s"
    )

    print()

    print(
        "Primeira leitura:"
    )

    dados = atualizar()

    print(
        json.dumps(
            dados,
            ensure_ascii=False,
            indent=2,
        )
    )

    print()

    diag = diagnostico()

    if (
        diag.get(
            "cooldown_restante"
        )
        or 0
    ) > 0:

        print(
            "Spotify em cooldown por mais "
            f"{int(diag['cooldown_restante'])} segundos."
        )

    print()

    print(
        "Monitor ativo. CTRL+C para encerrar."
    )

    iniciar_monitor()

    try:

        while True:

            time.sleep(
                1
            )

    except KeyboardInterrupt:

        parar_monitor()

        print()

        print(
            "[spotify] encerrado."
        )
