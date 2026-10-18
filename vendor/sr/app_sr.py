#!/usr/bin/env python3
"""Player de Song Request — processo separado da Kaia. Lê !sr do Kick sozinho."""

import atexit
import re
import threading
from pathlib import Path
from tkinter import (
    BOTH,
    BOTTOM,
    END,
    HORIZONTAL,
    LEFT,
    RIGHT,
    TOP,
    VERTICAL,
    Canvas,
    Frame,
    IntVar,
    Label,
    OptionMenu,
    Scale,
    StringVar,
    Tk,
    X,
    Button,
    Entry,
    Listbox,
)
from tkinter import ttk
from sr_ui_utils import preencher
from ui_theme import FlowFrame

import yaml

from sr_player import extrair_sr, get_sr, instalar, matar_players_sr

BASE = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))

BASE = Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
BG = "#1b1530"
PINK = "#e89cff"
TXT = "#f7f3ff"
MUTED = "#b7a8d6"
ACCENT = "#7ee7ff"
CARD = "#2a2148"
INK = "#3a2f5c"


def _tema_kaia():
    global BG, PINK, TXT, MUTED, ACCENT, CARD, INK
    p = BASE / "aprendizado" / "layout.json"
    if not p.is_file():
        return
    try:
        import json

        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return
    BG = d.get("bg") or BG
    CARD = d.get("card") or CARD
    PINK = d.get("pink") or PINK
    TXT = d.get("txt") or TXT
    MUTED = d.get("muted") or MUTED
    ACCENT = d.get("accent") or ACCENT
    INK = d.get("chip") or INK


_tema_kaia()


def _cfg():
    try:
        return yaml.safe_load((BASE / "config.yaml").read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


class AppSR:
    def __init__(self):
        self.cfg = _cfg()
        from overlay_server import iniciar as iniciar_hud
        iniciar_hud()
        if (self.cfg.get("spotify") or {}).get("monitoring_enabled", True):
            from spotify_agora import iniciar_monitor
            iniciar_monitor()
        self.SR = get_sr()
        aud = (self.cfg.get("audio") or {})
        if aud.get("saida_sr"):
            self.SR.saida = aud.get("saida_sr")
        self.root = Tk()
        self.root.title("Kaia SR — player separado")
        self.root.configure(bg=BG)
        self.root.geometry("1080x780")
        self.root.minsize(560, 620)
        try:
            from sr_player import marcar_vivo, desmarcar_vivo

            if not getattr(self.SR,'remoto',False):marcar_vivo()
            self._desmarcar = None if getattr(self.SR,'remoto',False) else desmarcar_vivo
            self.root.protocol("WM_DELETE_WINDOW", self._fechar)
        except Exception:
            self._desmarcar = None
        self._montar()

    def _fechar(self):
        try:
            self.SR.encerrar()
        except Exception:
            pass
        try:
            if not getattr(self.SR,'remoto',False):matar_players_sr()
        except Exception:
            pass
        try:
            if self._desmarcar:
                self._desmarcar()
        except Exception:
            pass
        try:
            self.root.destroy()
        except Exception:
            pass

    def _ligar_kick(self, kick_var):
        if getattr(self.SR,'remoto',False):kick_var.set('Controle conectado ao serviço SR existente.');return
        cfg = self.cfg.get("kick") or {}
        kid = cfg.get("chatroom_id")
        slug = cfg.get("channel") or "hads1"
        if not kid:
            try:
                from kick_chat import resolve_chatroom_id

                kid = resolve_chatroom_id(slug)
            except Exception:
                kid = None
        if not kid:
            kick_var.set("kick: sem chatroom_id")
            return

        def on_msg(user, texto, meta=None):
            q = extrair_sr(texto)
            if q is None:
                return
            try:
                msg = self.SR.pedir(user, q)
            except Exception as exc:
                msg = str(exc)

            def ui():
                try:
                    kick_var.set(f"kick: !sr {user}")
                    self.SR.erro = self.SR.erro or ""
                    self.log("kick", msg)
                except Exception:
                    pass

            try:
                self.root.after(0, ui)
            except Exception:
                pass

        try:
            from kick_chat import KickChat

            from kick_chat import resolve_canal
            cid=cfg.get('channel_id') or resolve_canal(slug).get('channel_id')
            KickChat(int(kid), on_msg,channel_id=cid).start()
            kick_var.set(f"kick: ouvindo !sr  ·  {slug}")
        except Exception as exc:
            kick_var.set(f"kick: {exc}")

    def log(self, *_a):
        pass

    def _montar(self):
        SR = self.SR
        win = self.root

        def safe(fn):
            try:
                fn()
            except Exception:
                pass

        head = Frame(win, bg=BG)
        head.pack(fill=X, padx=16, pady=(14, 6))
        Label(head, text="SONG REQUEST", fg=PINK, bg=BG, font=("Segoe UI", 16, "bold")).pack(side=LEFT)
        Label(head, text="lê o chat sozinho  ·  !sr", fg=MUTED, bg=BG, font=("Segoe UI", 9)).pack(side=LEFT, padx=10)
        kick_var = StringVar(value="kick: ligando…")
        Label(head, textvariable=kick_var, fg=ACCENT, bg=BG, font=("Segoe UI", 8)).pack(side=LEFT, padx=8)
        chip = StringVar(value="parado")
        Label(head, textvariable=chip, fg="#111", bg=PINK, font=("Segoe UI", 8, "bold"), padx=10, pady=3).pack(side=RIGHT)

        card = Frame(win, bg=CARD)
        card.pack(fill=X, padx=16, pady=(0, 10))
        tit = StringVar(value="nada tocando")
        ped = StringVar(value="pede no chat  ·  !sr nome ou link")
        Label(card, textvariable=tit, fg=TXT, bg=CARD, font=("Segoe UI", 14, "bold"), wraplength=660, justify="left").pack(anchor="w", padx=16, pady=(14, 2))
        Label(card, textvariable=ped, fg=MUTED, bg=CARD, font=("Segoe UI", 9)).pack(anchor="w", padx=16)

        prog = Frame(card, bg=CARD)
        prog.pack(fill=X, padx=16, pady=(10, 4))
        t_el = StringVar(value="0:00")
        t_dur = StringVar(value="0:00")
        Label(prog, textvariable=t_el, fg=MUTED, bg=CARD, font=("Consolas", 9)).pack(side=LEFT)
        bar = Canvas(prog, height=10, bg=INK, highlightthickness=0, cursor="hand2")
        bar.pack(side=LEFT, fill=X, expand=True, padx=8)
        Label(prog, textvariable=t_dur, fg=MUTED, bg=CARD, font=("Consolas", 9)).pack(side=LEFT)

        def seek_click(ev):
            st = SR.estado()
            dur = float(st.get("dur") or 0)
            if dur <= 0:
                return
            w = max(1, bar.winfo_width())
            SR.seek(dur * (ev.x / w))

        bar.bind("<Button-1>", seek_click)

        btns = FlowFrame(card, bg=CARD)
        btns.pack(fill=X, padx=16, pady=(6, 4))

        def btn(txt, cmd, bg=INK, fg=TXT, bold=False, px=12):
            b = Button(
                btns, text=txt, command=lambda: safe(cmd), bg=bg, fg=fg, relief="flat",
                font=("Segoe UI", 11, "bold" if bold else "normal"), padx=px, pady=7, cursor="hand2",
            )
            b.pack(side=LEFT, padx=3)
            return b

        btn("⏮", SR.prev)
        btn("⏯", SR.play_pause, bg=PINK, fg="#111", bold=True, px=18)
        btn("⏹", SR.stop)
        btn("⏭", SR.skip)
        btn("🔇", SR.mute_toggle)
        btn("🔁 1", lambda: SR.set_repeat("one"))
        btn("🔁 PL", lambda: SR.set_repeat("playlist"))
        btn("➡", lambda: SR.set_repeat("off"))
        btn("🔀 PL", lambda: SR.set_shuffle(not getattr(SR, "shuffle_pl", False)))

        volf = Frame(card, bg=CARD)
        volf.pack(fill=X, padx=16, pady=(2, 8))
        Label(volf, text="VOL", fg=MUTED, bg=CARD, font=("Segoe UI", 8, "bold")).pack(side=LEFT)
        vol = IntVar(value=int(getattr(SR, "volume", 80) or 80))

        Scale(
            volf, from_=0, to=100, orient=HORIZONTAL, variable=vol, length=220,
            command=lambda v: safe(lambda: SR.set_volume(int(float(v)))),
            bg=CARD, fg=TXT, troughcolor=INK, highlightthickness=0, showvalue=True,
            sliderrelief="flat",
        ).pack(side=LEFT, padx=8)

        try:
            from audio_out import listar_saidas, testar as testar_saida

            _saidas = listar_saidas()
        except Exception:
            _saidas = [{"nome": "", "label": "Padrão do Windows"}]
            testar_saida = None
        _labs, _mapa, vistos = [], {}, set()
        for s in _saidas:
            lab = (s.get("label") or s.get("nome") or "Padrão do Windows").strip()
            if lab.lower() in vistos:
                continue
            vistos.add(lab.lower())
            _labs.append(lab)
            _mapa[lab] = s.get("nome") or ""
        if not _labs:
            _labs = ["Padrão do Windows"]
        atual_sr = getattr(SR, "saida", "") or ""
        lab_atual = "Padrão do Windows"
        for lab, nome in _mapa.items():
            if nome == atual_sr:
                lab_atual = lab
                break
        var_sr_out = StringVar(value=lab_atual if lab_atual in _labs else _labs[0])
        outf = FlowFrame(card, bg=CARD)
        outf.pack(fill=X, padx=16, pady=(0, 4))
        Label(outf, text="SAÍDA SR  (música = kaia_sr.exe no mixer)", fg=MUTED, bg=CARD, font=("Segoe UI", 8, "bold")).pack(side=LEFT)
        OptionMenu(outf, var_sr_out, *_labs).pack(side=LEFT, padx=8)

        def _aplica(*_a):
            nome = _mapa.get(var_sr_out.get(), "")
            if str(nome).lower().startswith("padrão") or str(nome).lower().startswith("padrao"):
                nome = ""
            try:
                SR.set_saida(nome)
            except Exception:
                SR.saida = nome
            try:
                raw = yaml.safe_load((BASE / "config.yaml").read_text(encoding="utf-8")) or {}
                raw.setdefault("audio", {})["saida_sr"] = nome
                (BASE / "config.yaml").write_text(yaml.safe_dump(raw, allow_unicode=True, sort_keys=False), encoding="utf-8")
            except Exception:
                pass

        try:
            var_sr_out.trace_add("write", lambda *_: _aplica())
        except Exception:
            pass
        Button(outf, text="testar", command=lambda: testar_saida and testar_saida(_mapa.get(var_sr_out.get(), "")), bg=INK, fg=TXT, relief="flat", font=("Segoe UI", 8), padx=8).pack(side=LEFT)
        def youtube_cookies():
            from tkinter import filedialog,messagebox
            path=filedialog.askopenfilename(title='Cookies do YouTube exportados por você (formato Netscape)',filetypes=[('Arquivo de cookies','*.txt'),('Todos','*.*')])
            if path:
                from sr_player import configurar_cookies
                configurar_cookies(path)
                messagebox.showinfo('YouTube','Arquivo configurado. Faça uma nova tentativa no SR; limites do YouTube ainda podem impedir o acesso.')
        Button(outf,text='YouTube: cookies…',command=youtube_cookies,bg=INK,fg=TXT,relief='flat',font=('Segoe UI',8),padx=8).pack(side=LEFT)
        Button(outf,text='Sessão YouTube',command=lambda:__import__('sr_youtube_sessao').painel(win),bg=INK,fg=TXT,relief='flat',font=('Segoe UI',8),padx=8).pack(side=LEFT)
        Label(card, text="Mixer/VoiceMeeter: música = kaia_sr.exe   ·   voz da Kaia = kaia_voz.exe   ·   nunca ffplay", fg=MUTED, bg=CARD, font=("Segoe UI", 8)).pack(anchor="w", padx=16, pady=(0, 12))

        mid = ttk.Notebook(win)
        mid.pack(fill=BOTH, expand=True, padx=16)

        def col(pai, titulo):
            f = Frame(pai, bg=BG)
            pai.add(f,text=titulo)
            Label(f, text=titulo, fg=MUTED, bg=BG, font=("Segoe UI", 8, "bold")).pack(anchor="w")
            box = Listbox(f, bg=CARD, fg=TXT, relief="flat", font=("Segoe UI", 9), height=8, selectbackground=PINK, selectforeground="#111", activestyle="none")
            box.pack(fill=BOTH, expand=True, pady=(2, 4))
            return box

        fila_voz_box = col(mid, "FILA VOZ")
        fila_sr_box = col(mid, "FILA !SR")
        fila_pl_box = col(mid, "FILA PLAYLIST")
        dirf = Frame(mid, bg=BG)
        mid.add(dirf,text='Histórico')
        Label(dirf, text="HISTÓRICO", fg=MUTED, bg=BG, font=("Segoe UI", 8, "bold")).pack(anchor="w")
        hist_box = Listbox(dirf, bg=CARD, fg=TXT, relief="flat", font=("Segoe UI", 9), height=8, selectbackground=PINK, selectforeground="#111", activestyle="none")
        hist_box.pack(fill=BOTH, expand=True, pady=(2, 4))
        hb = Frame(dirf, bg=BG)
        hb.pack(fill=X)
        Button(hb, text="apagar selecionada", command=lambda: safe(lambda: SR.apagar_historico(hist_box.curselection()[0]) if hist_box.curselection() else None), bg=INK, fg=TXT, relief="flat", font=("Segoe UI", 8), padx=8, pady=4).pack(side=LEFT)
        Button(hb, text="apagar tudo", command=lambda: safe(SR.limpar_historico), bg="#3a1520", fg="#ffb0c4", relief="flat", font=("Segoe UI", 8), padx=8, pady=4).pack(side=LEFT, padx=6)

        stats_var = StringVar(value="")
        Label(win, textvariable=stats_var, fg=ACCENT, bg=BG, font=("Segoe UI", 8), wraplength=680, justify="left").pack(anchor="w", padx=16, pady=(6, 0))
        err = StringVar(value="")
        Label(win, textvariable=err, fg="#ff8aa8", bg=BG, font=("Segoe UI", 8), wraplength=680, justify="left").pack(anchor="w", padx=16)

        Label(win, text="Admin: cola o link da playlist do YouTube e clica PLAYLIST. !sr do chat continua uma música por vez.", fg=MUTED, bg=BG, font=("Segoe UI", 8)).pack(anchor="w", padx=16, pady=(8, 0))
        addf = Frame(win, bg=BG)
        addf.pack(fill=X, padx=16, pady=(6, 14))
        ent = Entry(addf, bg=CARD, fg=TXT, insertbackground=TXT, relief="flat", font=("Segoe UI", 11))
        ent.pack(side=LEFT, fill=X, expand=True, ipady=8)

        def add_now():
            q = ent.get().strip()
            if not q:
                return
            from sr_player import eh_playlist

            if eh_playlist(q):
                ent.delete(0, END)
                err.set("lendo playlist…")

                def go():
                    msg = SR.adicionar_playlist(q, "Hades")
                    try:
                        win.after(0, lambda: err.set(msg))
                    except Exception:
                        pass

                threading.Thread(target=go, daemon=True).start()
                return
            SR.pedir("Hades", q)
            ent.delete(0, END)

        def add_playlist():
            q = ent.get().strip()
            if not q:
                err.set("Cola o link da playlist do YouTube e clica em playlist.")
                return
            ent.delete(0, END)
            err.set("lendo playlist…")

            def go():
                msg = SR.adicionar_playlist(q, "Hades")
                try:
                    win.after(0, lambda: err.set(msg))
                except Exception:
                    pass

            threading.Thread(target=go, daemon=True).start()

        ent.bind("<Return>", lambda e: add_now())
        Button(addf, text="tocar", command=add_now, bg=PINK, fg="#111", relief="flat", font=("Segoe UI", 10, "bold"), padx=16, pady=8).pack(side=LEFT, padx=8)
        Button(addf, text="playlist", command=add_playlist, bg=ACCENT, fg="#111", relief="flat", font=("Segoe UI", 10, "bold"), padx=12, pady=8).pack(side=LEFT, padx=(0, 8))

        def instala():
            err.set("instalando yt-dlp…")

            def go():
                msg = instalar()
                win.after(0, lambda: err.set(msg))

            threading.Thread(target=go, daemon=True).start()

        Button(addf, text="yt-dlp", command=instala, bg=INK, fg=TXT, relief="flat", font=("Segoe UI", 9), padx=10, pady=8).pack(side=LEFT)

        def tick():
            try:
                if not win.winfo_exists():
                    return
                st = SR.estado()
                tocando = bool(st.get("tocando"))
                pausa = bool(st.get("paused"))
                titulo = st.get("titulo") or ""
                tit.set(titulo or "nada tocando")
                ped.set(f"pedido por  {st.get('user') or 'chat'}   ·   {st.get('genero') or '—'}" if titulo else "pede no chat  ·  !sr nome ou link")
                chip.set("tocando" if tocando else ("pausa" if pausa else "parado"))
                tempo = st.get("tempo") or "0:00 / 0:00"
                partes = tempo.split("/")
                t_el.set(partes[0].strip() if partes else "0:00")
                t_dur.set(partes[1].strip() if len(partes) > 1 else "0:00")
                msg = st.get("erro") or ""
                if not st.get("tem_ytdlp"):
                    msg = msg or "yt-dlp ausente — clica em yt-dlp"
                elif not st.get("tem_player"):
                    msg = msg or "ffplay ausente — instala ffmpeg"
                err.set(msg)
                bar.delete("all")
                w = bar.winfo_width() or 400
                dur = float(st.get("dur") or 0) or 1.0
                el = float(st.get("elapsed") or 0)
                bar.create_rectangle(0, 0, w, 10, fill=INK, width=0)
                bar.create_rectangle(0, 0, max(4, int(w * el / dur)), 10, fill=PINK, width=0)
                def _fill(box, itens):
                    preencher(box,[f"{i}. [{x.get('status')}] {x.get('titulo')}" for i,x in enumerate(itens or [],1)])
                _fill(fila_voz_box, st.get("fila_voz"))
                _fill(fila_sr_box, st.get("fila_sr"))
                _fill(fila_pl_box, st.get("fila_pl"))
                stt = st.get("stats") or {}
                mg = stt.get("mais_genero") or ("—", 0)
                mu = stt.get("mais_sr") or ("—", 0)
                stats_var.set(f"{stt.get('total') or 0} no histórico   ·   gênero: {mg[0]} ({mg[1]})   ·   mais SR: {mu[0]} ({mu[1]})")
                preencher(hist_box,[f"{h.get('t','')}  {h.get('user')}: {h.get('titulo')}  [{h.get('genero') or '?'}]" for h in st.get('historico') or []])
            except Exception:
                pass
            try:
                win.after(800, tick)
            except Exception:
                pass

        tick()
        self._ligar_kick(kick_var)

    def rodar(self):
        if not getattr(self.SR,'remoto',False):atexit.register(matar_players_sr)
        try:
            self.root.mainloop()
        finally:
            try:
                self._fechar()
            except Exception:
                matar_players_sr()


if __name__ == "__main__":
    try:
        AppSR().rodar()
    except Exception:
        import traceback

        txt = traceback.format_exc()
        try:
            (BASE / "erro_sr.txt").write_text(txt, encoding="utf-8")
        except Exception:
            pass
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(0, txt[-900:], "SR nao abriu", 0x10)
        except Exception:
            print(txt)
            raise
