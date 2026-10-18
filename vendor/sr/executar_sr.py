from pathlib import Path
import os,webbrowser,tkinter as tk
from tkinter import ttk
os.chdir(Path(__import__('os').environ.get('KAIA_MEDIA_DATA', str(Path(__file__).resolve().parent))))
from app_sr import AppSR
def main():
    app=AppSR();bar=tk.Frame(app.root);bar.pack(fill='x',side='bottom')
    for title,url in [('HUD padrão','sr.html'),('HUD personalizado','sr-custom.html'),('Editor de HUD','sr-editor.html')]:
        tk.Button(bar,text=title,command=lambda u=url:webbrowser.open('http://127.0.0.1:8765/'+u)).pack(side='left')
    from sr_youtube_sessao import painel
    tk.Button(bar,text='Sessão YouTube',command=lambda:painel(app.root)).pack(side='left')
    def settings():
        from painel_sr_loopback import painel
        app.status=tk.StringVar()
        win=tk.Toplevel(app.root);win.title('Soundbar · saída do computador');painel(win,app)
        tk.Label(win,textvariable=app.status).pack()
    tk.Button(bar,text='Saída da soundbar',command=settings).pack(side='left')
    app.rodar()
if __name__=='__main__':main()
