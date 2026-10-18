"""Saídas de áudio únicas. SR e Kaia usam dispositivos diferentes.

Não usa ffmpeg -f wasapi (muita build do Windows não tem esse muxer).
Padrão = ffplay. Dispositivo escolhido = ffmpeg PCM + sounddevice.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

PASTA = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
LAST_ERR = ""


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
            for cand in (pasta / n, pasta / f"{n}.exe"):
                if cand.is_file():
                    return str(cand)
    return ""


def _norm(nome: str) -> str:
    n = (nome or "").lower()
    n = re.sub(r"\s*\[[^\]]+\]\s*", " ", n)
    n = re.sub(
        r"\s*\((wasapi|mme|directsound|windows ds|wdm[- ]?ks|primary sound driver)[^)]*\)",
        "",
        n,
        flags=re.I,
    )
    n = re.sub(r"\s*\(\d+\s*[-–]\s*(in|out|entrada|saída|saida)[^)]*\)", "", n, flags=re.I)
    n = re.sub(r"[^a-z0-9]+", " ", n)
    return n.strip()


def listar_saidas() -> list:
    """Uma entrada por dispositivo físico. Prefere WASAPI do PortAudio."""
    out = [{"nome": "", "label": "Padrão do Windows", "idx": None}]
    seen = {""}
    ranked = []
    try:
        import sounddevice as sd

        hosts = sd.query_hostapis()
        for i, d in enumerate(sd.query_devices()):
            if int(d.get("max_output_channels") or 0) <= 0:
                continue
            nome = (d.get("name") or "").strip()
            if not nome:
                continue
            nl = nome.lower()
            if (
                nl.endswith(".exe")
                or "ffplay" in nl
                or "srplay" in nl
                or "kaia_" in nl
                or nl.startswith("python")
                or "ffmpeg" in nl
            ):
                continue
            host = ""
            try:
                host = (hosts[int(d.get("hostapi") or 0)].get("name") or "")
            except Exception:
                pass
            hl = host.lower()
            prio = 0 if "wasapi" in hl else 1 if "directsound" in hl or "dsound" in hl else 2
            ranked.append((prio, i, nome, host))
        ranked.sort()
        for _p, i, nome, host in ranked:
            key = _norm(nome)
            if not key or key in seen:
                continue
            seen.add(key)
            out.append({"nome": nome, "label": nome, "idx": i})
    except Exception:
        pass
    return out


def achar_saida(nome: str) -> str:
    nome = (nome or "").strip()
    if not nome or nome.lower().startswith("padrão") or nome.lower().startswith("padrao"):
        return ""
    want = _norm(nome)
    for d in listar_saidas():
        n = d.get("nome") or ""
        if n == nome or _norm(n) == want:
            return n
    return nome


def idx_saida(nome: str):
    nome = achar_saida(nome)
    if not nome:
        return None
    want = _norm(nome)
    for d in listar_saidas():
        n = d.get("nome") or ""
        if n == nome or _norm(n) == want:
            if d.get("idx") is None:
                return None
            try:
                return int(d["idx"])
            except Exception:
                return None
    return None


def ffmpeg_bin():
    return _bin("ffmpeg", "ffmpeg.exe")


def ffplay_bin():
    return _bin("ffplay", "ffplay.exe") or _bin("mpv", "mpv.exe")


def player_exe(papel: str = "sr") -> str:
    """Cópia do ffplay com nome próprio. Mixer do Windows vê kaia_sr.exe ou kaia_voz.exe."""
    value=str(papel).lower().strip()
    papel = 'leitura' if value=='leitura' else "sr" if value in ("sr", "musica", "song") else "voz"
    dest = PASTA / "bin" / f"kaia_{papel}.exe"
    src = _bin("ffplay", "ffplay.exe")
    mpv = False
    if not src:
        src = _bin("mpv", "mpv.exe")
        mpv = bool(src)
        if mpv:
            dest = PASTA / "bin" / f"kaia_{papel}_mpv.exe"
    if not src:
        return str(dest) if dest.is_file() else ""
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        src_sz = Path(src).stat().st_size
        if dest.is_file():
            try:
                if dest.stat().st_size == src_sz:
                    return str(dest)
            except Exception:
                return str(dest)
        tmp = dest.with_name(dest.stem + ".tmp.exe")
        shutil.copy2(src, tmp)
        try:
            os.replace(str(tmp), str(dest))
        except Exception:
            if not dest.is_file():
                shutil.copy2(src, dest)
            try:
                tmp.unlink()
            except Exception:
                pass
        return str(dest) if dest.is_file() else src
    except Exception:
        return str(dest) if dest.is_file() else src


def srplay_bin():
    return player_exe("sr")


def _popen(cmd, env=None, err_path=None, stdout=None):
    err = subprocess.DEVNULL
    if err_path:
        err_path.parent.mkdir(parents=True, exist_ok=True)
        err = open(err_path, "w", encoding="utf-8", errors="replace")
    try:
        return subprocess.Popen(
            cmd,
            creationflags=_cf(),
            startupinfo=_si(),
            stdin=subprocess.DEVNULL,
            stdout=stdout if stdout is not None else subprocess.DEVNULL,
            stderr=err,
            env=env,
        )
    except Exception:
        try:
            if err not in (subprocess.DEVNULL, None) and hasattr(err, "close"):
                err.close()
        except Exception:
            pass
        raise


class PlayerProc:
    """Parece um Popen: poll/terminate/kill/wait."""

    def __init__(self, sub=None, thread=None, stop=None, progress=None, result=None):
        self._sub = sub
        self._th = thread
        self._stop = stop or threading.Event()
        self._ret = None
        self._progress = progress
        self._result = result

    @property
    def played_seconds(self):
        return self._progress[0] if self._progress is not None else None

    def poll(self):
        if self._th is not None:
            if self._th.is_alive():return None
            if self._result is not None:return self._result[0]
        if self._sub is not None:
            code = self._sub.poll()
            if self._th is None:
                return code
            if code is None or (self._th and self._th.is_alive()):
                if self._th and self._th.is_alive():
                    return None
                return code if code is not None else 0
            return code
        if self._th is None:
            return self._ret
        return None if self._th.is_alive() else 0

    def terminate(self):
        self._stop.set()
        if self._sub is not None:
            try:
                self._sub.terminate()
            except Exception:
                pass

    def kill(self):
        self.terminate()
        if self._sub is not None:
            try:
                self._sub.kill()
            except Exception:
                pass

    def wait(self, timeout=None):
        if self._th is not None:
            self._th.join(timeout)
            if self._th.is_alive():
                raise subprocess.TimeoutExpired("player", timeout)
            return 0
        if self._sub is not None:
            return self._sub.wait(timeout)
        return 0


def _ffplay(arquivo: str, volume: int, ss: float, err_path: Path, papel: str = "sr"):
    fp = player_exe(papel)
    if not fp:
        return None
    nome = Path(fp).name.lower()
    env = os.environ.copy()
    if os.name == "nt":
        env["SDL_AUDIODRIVER"] = env.get("SDL_AUDIODRIVER") or "directsound"
    if "mpv" not in nome:
        cmd = [
            fp,
            "-nodisp",
            "-autoexit",
            "-loglevel",
            "error",
            "-nostats",
            "-volume",
            str(volume),
        ]
        if ss >= 0.25:
            cmd += ["-ss", f"{ss:.2f}"]
        cmd += ["-i", arquivo]
    else:
        cmd = [fp, "--no-video", "--really-quiet", "--no-terminal", f"--volume={volume}"]
        if ss >= 0.25:
            cmd.append(f"--start={ss:.2f}")
        cmd.append(arquivo)
    try:
        return PlayerProc(sub=_popen(cmd, env=env, err_path=err_path))
    except Exception as exc:
        global LAST_ERR
        LAST_ERR = str(exc)
        return None


def _play_sd(arquivo: str, device_idx: int, volume: int, ss: float, err_path: Path,papel=None):
    """Decodifica com ffmpeg (PCM) e toca no device do PortAudio. Sem muxer wasapi."""
    ff = ffmpeg_bin()
    if not ff:
        return None
    try:
        import numpy as np
        import sounddevice as sd
    except Exception as exc:
        global LAST_ERR
        LAST_ERR = f"sounddevice: {exc}"
        return None

    cmd = [ff, "-hide_banner", "-nostdin", "-loglevel", "error"]
    if str(arquivo).startswith(('http://','https://')):
        cmd += ['-reconnect','1','-reconnect_streamed','1','-reconnect_on_network_error','1',
                '-reconnect_on_http_error','408,429,5xx','-reconnect_delay_max','4',
                '-reconnect_max_retries','3','-rw_timeout','15000000']
    if ss >= 0.25:
        cmd += ["-ss", f"{ss:.2f}"]
    cmd += [
        "-i",
        arquivo,
        "-vn",
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-",
    ]
    stop = threading.Event()
    ready = threading.Event()
    opened = [False]
    progress = [0.0]
    result = [0]
    err_path.parent.mkdir(parents=True, exist_ok=True)

    def worker(holder):
        global LAST_ERR
        stream = None
        sub = None
        errf = None
        from sr_audio_visual import Meter
        meter=Meter() if str(papel).lower() in ('sr','musica','song') else None
        try:
            errf = open(err_path, "w", encoding="utf-8", errors="replace")
            sub = subprocess.Popen(
                cmd,
                creationflags=_cf(),
                startupinfo=_si(),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=errf,
            )
            holder[0] = sub
            gain = max(0.0, min(1.0, volume / 100.0))
            stream = sd.OutputStream(
                samplerate=48000,
                channels=2,
                dtype="float32",
                device=device_idx,
                blocksize=2048,
            )
            stream.start()
            opened[0] = True
            ready.set()
            while not stop.is_set():
                chunk = sub.stdout.read(2048 * 2 * 4)
                if not chunk:
                    break
                arr = np.frombuffer(chunk, dtype=np.float32)
                if arr.size % 2:
                    arr = arr[:-1]
                if arr.size == 0:
                    break
                playing=(arr.reshape(-1, 2) * gain).copy()
                stream.write(playing)
                progress[0] += len(playing) / 48000
                if meter:meter.publish(playing)
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass
            if not stop.is_set():
                try:result[0] = sub.wait(timeout=2)
                except subprocess.TimeoutExpired:result[0] = 1
        except Exception as exc:
            result[0] = 1
            LAST_ERR = str(exc)
            try:
                err_path.write_text(str(exc), encoding="utf-8")
            except Exception:
                pass
        finally:
            ready.set()
            if stream is not None:
                try:
                    stream.close()
                except Exception:
                    pass
            if sub is not None:
                try:
                    sub.terminate()
                    sub.wait(timeout=2)
                except Exception:
                    pass
                try:sub.stdout.close()
                except Exception:pass
            if errf is not None:
                errf.close()

    holder = [None]
    th = threading.Thread(target=worker, args=(holder,), daemon=True)
    th.start()
    ready.wait(timeout=2.5)
    if not opened[0]:
        stop.set()
        return None
    return PlayerProc(sub=holder[0], thread=th, stop=stop, progress=progress, result=result)


def spawn(arquivo: str, saida: str = "", volume: int = 80, ss: float = 0.0, papel: str = "sr"):
    """Abre o player com nome próprio: kaia_sr.exe ou kaia_voz.exe."""
    global LAST_ERR
    LAST_ERR = ""
    if not arquivo or (not Path(arquivo).is_file() and not str(arquivo).startswith(('https://','http://'))):
        LAST_ERR = "arquivo de áudio sumiu"
        return None
    vol = max(0, min(100, int(volume)))
    err_path = PASTA / "tmp_sr" / f"_player_{papel}.err"
    requested_saida=saida
    saida = achar_saida(saida)
    if str(papel).lower()=='leitura' and not saida:
        LAST_ERR='Dispositivo privado de leitura não disponível.'
        return None

    # Uma saída explícita deve prevalecer sobre o mixer do player padrão.
    if saida:
        idx = idx_saida(saida)
        if idx is not None:
            proc = _play_explicit(arquivo, idx, vol, ss, err_path, papel)
            if proc is not None:
                return proc
        LAST_ERR='Saída selecionada indisponível; áudio não enviado à saída padrão.'
        return None

    # Sem saída explícita, o exe com nome próprio permite separar no mixer:
    #   kaia_voz.exe = voz da Kaia
    #   kaia_sr.exe  = música
    proc = _ffplay(arquivo, vol, ss, err_path, papel=papel)
    if proc is not None:
        return proc

    LAST_ERR = LAST_ERR or "Instala ffmpeg com ffplay. Sem ele o SR não toca."
    return None


class DevicePlayerProc(PlayerProc):
    """Encerra o worker de voz de forma cooperativa, incluindo o decoder."""
    def terminate(self):
        self._stop.set()
        try:
            if self._sub.poll() is None:
                self._sub.stdin.write('stop\n')
                self._sub.stdin.flush()
                self._sub.wait(timeout=3)
        except Exception:
            self._sub.kill()

    def kill(self):
        self.terminate()


def _play_explicit(arquivo, device_idx, volume, ss, err_path, papel):
    global LAST_ERR
    if os.name != 'nt' or str(papel).lower() in ('sr', 'musica', 'song'):
        return _play_sd(arquivo, device_idx, volume, ss, err_path,papel=papel)
    # Python do SR permanece capturável no OBS; o TTS tem outro nome de processo.
    target = Path(sys.executable).with_name('kaia_leitura.exe' if str(papel).lower()=='leitura' else 'kaia_tts.exe')
    proc = None
    try:
        if not target.is_file():
            shutil.copy2(sys.executable, target)
        proc = subprocess.Popen(
            [str(target), str(PASTA / 'audio_device_worker.py'), arquivo,
             str(device_idx), str(volume), str(ss), str(err_path)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, creationflags=_cf(), startupinfo=_si(),
        )
        ready = threading.Event()
        result = ['']
        def read_status():
            result[0] = proc.stdout.readline().strip()
            ready.set()
        threading.Thread(target=read_status, daemon=True).start()
        ready.wait(timeout=5)
        if result[0] != 'READY':
            LAST_ERR = result[0] or 'worker de voz não inicializou'
            try:
                if err_path.exists():LAST_ERR=err_path.read_text(encoding='utf-8',errors='replace')[-400:]
            except OSError:pass
            DevicePlayerProc(sub=proc).terminate()
            return None
        return DevicePlayerProc(sub=proc)
    except Exception as exc:
        LAST_ERR = str(exc)
        if proc is not None:
            DevicePlayerProc(sub=proc).terminate()
        return None


def ler_erro() -> str:
    p = PASTA / "tmp_sr" / "_player.err"
    try:
        t = p.read_text(encoding="utf-8", errors="replace").strip()
        return (t or LAST_ERR)[-280:]
    except Exception:
        return LAST_ERR


def tocar_bloqueado(arquivo: str, saida: str = "", volume: int = 80, parar=None, papel: str = "voz") -> str:
    proc = None
    posicao = 0.0
    inicio = time.monotonic()
    try:
        while True:
            ped = (parar() or '') if callable(parar) else ''
            if ped in ('parar','pausar'):
                return ped
            if ped == 'suspender':
                if proc is not None:
                    posicao += max(0, time.monotonic()-inicio)
                    proc.kill()
                    try:proc.wait(timeout=1)
                    except Exception:pass
                    proc = None
                time.sleep(.02)
                continue
            if proc is None:
                proc = spawn(arquivo, saida=saida, volume=volume, ss=posicao, papel=papel)
                if proc is None:
                    raise RuntimeError('Não foi possível abrir a saída de áudio')
                inicio = time.monotonic()
            code=proc.poll()
            if code is not None:
                return "fim" if code==0 else "erro"
            try:
                proc.wait(timeout=0.08)
            except subprocess.TimeoutExpired:
                pass
            except Exception:
                return "fim"
    finally:
        try:
            proc.kill()
        except Exception:
            pass


def testar(saida: str) -> str:
    ff = ffmpeg_bin()
    dest = PASTA / "tmp_audio"
    dest.mkdir(parents=True, exist_ok=True)
    wav = dest / "_teste_saida.wav"
    if ff:
        try:
            subprocess.run(
                [
                    ff,
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=880:duration=0.4",
                    "-ar",
                    "48000",
                    "-ac",
                    "1",
                    str(wav),
                ],
                capture_output=True,
                timeout=20,
                creationflags=_cf(),
                startupinfo=_si(),
            )
        except Exception as exc:
            return str(exc)
    if not wav.is_file():
        return "não gerou o beep de teste"
    proc = spawn(str(wav), saida=saida, volume=70, papel="sr")
    if not proc:
        return "não abriu o player nessa saída: " + (ler_erro() or "sem detalhe")
    try:
        proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    return "ok — ouviu o beep nessa saída?"
