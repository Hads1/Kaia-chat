def painel(parent,app):
    import tkinter as tk
    from tkinter import ttk
    from ui_theme import Card,Button,COLORS
    from sr_loopback import config,saidas,salvar
    box=Card(parent);box.pack(fill='x',pady=10);b=box.body;cfg=config()
    tk.Label(b,text='Soundbar · áudio da saída do computador',bg=COLORS['surface'],fg=COLORS['text'],font=('Segoe UI',14,'bold')).pack(anchor='w')
    tk.Label(b,text='Selecione onde você escuta a música. Mede SR, Spotify e outros sons dessa saída.\nNão grava áudio nem captura o microfone. Voz da leitura e jogos também podem aparecer se saírem nesse dispositivo.',bg=COLORS['surface'],fg=COLORS['muted'],wraplength=700,justify='left').pack(anchor='w',pady=5)
    output=tk.StringVar(value=cfg.get('device',''));enabled=tk.BooleanVar(value=cfg.get('enabled',True))
    try:values=saidas()
    except Exception:values=[]
    ttk.Combobox(b,textvariable=output,values=values,state='readonly',width=65).pack(anchor='w',pady=5)
    tk.Checkbutton(b,text='Ativar medição da saída para o HUD',variable=enabled,bg=COLORS['surface'],fg=COLORS['text'],selectcolor=COLORS['bg']).pack(anchor='w')
    def apply():salvar(enabled=enabled.get(),device=output.get());app.status.set('Soundbar: saída aplicada. Reabra Kaia/SR após esta atualização para iniciar a medição.')
    Button(b,text='Aplicar saída de áudio da soundbar',command=apply).pack(anchor='w',pady=5)
