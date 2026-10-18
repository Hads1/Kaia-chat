"""Login oficial no navegador e importação explícita de cookies YouTube/Google."""
from pathlib import Path
import http.cookiejar,json,webbrowser,os
BASE=Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent)))
PRIVATE=BASE/'sr_auth'
LOGIN='https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'
def abrir_login():return webbrowser.open(LOGIN)
def importar(path):
    return importar_varios([path])

def importar_varios(paths):
    # Conflitos de sessão: a exportação mais recente prevalece por domínio/caminho/nome.
    jars=[]
    for src in sorted(map(Path,paths),key=lambda p:p.stat().st_mtime):
        if src.stat().st_size>5_000_000:raise ValueError('Arquivo maior que o limite de cookies.')
        jar=http.cookiejar.MozillaCookieJar(str(src));jar.load(ignore_discard=True,ignore_expires=False)
        jars.append(jar)
    PRIVATE.mkdir(exist_ok=True)
    dest=PRIVATE/'youtube_cookies.txt';out=http.cookiejar.MozillaCookieJar(str(dest))
    for jar in jars:
        for c in jar:
            host=c.domain.lstrip('.').lower()
            if host=='youtube.com' or host.endswith('.youtube.com') or host=='google.com' or host.endswith('.google.com'):out.set_cookie(c)
    count=len(list(out))
    if not count:raise ValueError('Não encontrei cookies válidos do YouTube/Google neste arquivo Netscape.')
    temp=PRIVATE/'youtube_cookies.tmp';out.save(str(temp),ignore_discard=True,ignore_expires=False);temp.replace(dest)
    try:os.chmod(dest,0o600)
    except OSError:pass
    from sr_player import configurar_cookies
    configurar_cookies(str(dest))
    try:
        from sr_controle import comando
        comando('autenticar')
    except ValueError:pass
    return f'{count} cookies YouTube/Google configurados. Use Testar acesso para conferir.'

def remover():
    from sr_player import configurar_cookies
    configurar_cookies('')
    try:
        from sr_controle import comando
        comando('autenticar')
    except ValueError:pass
    return 'Sessão desassociada do SR. O arquivo original do usuário foi preservado.'

def status():
    try:
        cfg=json.loads((BASE/'sr_youtube_config.json').read_text(encoding='utf-8'));p=Path(cfg.get('cookies_file') or '')
        return 'Arquivo de sessão configurado.' if p.is_file() else 'Sem arquivo de sessão configurado.'
    except (OSError,ValueError):return 'Sem arquivo de sessão configurado.'

def painel(parent):
    import tkinter as tk
    from tkinter import filedialog
    from ui_theme import COLORS,Button
    import threading,queue
    win=tk.Toplevel(parent);win.title('SR · sessão do YouTube');win.geometry('650x610');win.minsize(480,540);win.configure(bg=COLORS['bg'])
    tk.Label(win,text='Conectar sessão do YouTube ao SR',bg=COLORS['bg'],fg=COLORS['text'],font=('Segoe UI',16,'bold')).pack(anchor='w',padx=18,pady=15)
    tk.Label(win,text='1. Abra o login oficial e entre no YouTube pelo navegador.\n2. Exporte somente os cookies YouTube em formato Netscape.\n3. Importe o arquivo abaixo e teste uma faixa pública.\n\nA Kaia não recebe senha. O login no navegador, sozinho, não transfere a sessão ao SR. Cookies são dados privados da sessão; não os publique. Limites do YouTube podem continuar impedindo o acesso.',bg=COLORS['bg'],fg=COLORS['muted'],wraplength=600,justify='left').pack(fill='x',padx=18,pady=8)
    info=tk.StringVar(value=status());q=queue.Queue()
    def job(fn):
        info.set('Verificando…')
        def work():
            try:message=fn()
            except Exception as exc:message='Não concluído: '+str(exc)[:240]
            q.put(message)
        threading.Thread(target=work,daemon=True).start()
    def choose():
        path=filedialog.askopenfilename(parent=win,title='Cookies do YouTube (Netscape)',filetypes=[('Cookies','*.txt')])
        if path:job(lambda:importar(path))
    def test():
        from sr_player import _url_stream,_stream_erro
        return 'Áudio público resolvido; pronto para testar reprodução.' if _url_stream('jNQXAC9IVRw') else _stream_erro()
    for label,fn in [('Abrir login oficial do Google/YouTube',abrir_login),('Importar arquivo de sessão',choose),('Testar acesso (sem tocar áudio)',lambda:job(test)),('Remover sessão do SR',lambda:job(remover)),('Abrir instruções oficiais de cookies',lambda:webbrowser.open('https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies'))]:
        Button(win,text=label,command=fn).pack(anchor='w',padx=18,pady=4)
    tk.Label(win,textvariable=info,bg=COLORS['bg'],fg=COLORS['cyan'],wraplength=600,justify='left').pack(fill='x',padx=18,pady=10)
    timer=[None]
    def poll():
        try:info.set(q.get_nowait())
        except queue.Empty:pass
        timer[0]=win.after(150,poll)
    def close():
        if timer[0]:win.after_cancel(timer[0])
        win.destroy()
    win.protocol('WM_DELETE_WINDOW',close);poll()
    return win
