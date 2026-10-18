"""Atalhos do SR no painel principal; estado local e comandos para o player separado."""
import tkinter as tk,json
from tkinter import ttk
from ui_theme import Card,Button,FlowFrame,COLORS
import sr_controle as control

class PainelSRIntegrado:
    def __init__(self,parent,app):
        self.app=app;self.signature=None
        box=Card(parent);box.pack(fill='x',pady=10);b=box.body
        tk.Label(b,text='Song Request · controle do processo independente',bg=COLORS['surface'],fg=COLORS['text'],font=('Segoe UI',15,'bold')).pack(anchor='w')
        self.title=tk.StringVar(value='SR desligado');self.status=tk.StringVar(value='')
        tk.Label(b,textvariable=self.title,bg=COLORS['surface'],fg=COLORS['cyan'],wraplength=700,justify='left').pack(anchor='w',pady=8)
        self.progress=ttk.Progressbar(b,maximum=100);self.progress.pack(fill='x')
        actions=FlowFrame(b,bg=COLORS['surface']);actions.pack(fill='x',pady=8)
        for label,action in [('Iniciar SR independente',lambda:self.message(control.iniciar())),('Anterior',lambda:self.command('prev')),('Tocar / pausar',lambda:self.command('play_pause')),('Próxima',lambda:self.command('skip')),('Parar',lambda:self.command('stop')),('Mudo SR',lambda:self.command('mute_toggle')),('Login / sessão YouTube',lambda:__import__('sr_youtube_sessao').painel(app.root))]:
            Button(actions,text=label,command=action).pack(side='left')
        volume=tk.Frame(b,bg=COLORS['surface']);volume.pack(fill='x')
        tk.Label(volume,text='Volume SR',bg=COLORS['surface'],fg=COLORS['muted']).pack(side='left')
        self.vol=tk.IntVar(value=80)
        tk.Scale(volume,from_=0,to=100,orient='horizontal',variable=self.vol,bg=COLORS['surface'],fg=COLORS['text'],highlightthickness=0).pack(side='left',fill='x',expand=True)
        Button(volume,text='Aplicar volume',command=lambda:self.command('set_volume',self.vol.get())).pack(side='left')
        self.repeat=tk.StringVar(value='off');ttk.Combobox(volume,textvariable=self.repeat,values=['off','one','playlist'],state='readonly',width=10).pack(side='left',padx=4)
        Button(volume,text='Repetição',command=lambda:self.command('set_repeat',self.repeat.get())).pack(side='left')
        self.shuffle=tk.BooleanVar(value=False)
        tk.Checkbutton(b,text='Embaralhar playlist',variable=self.shuffle,command=lambda:self.command('set_shuffle',self.shuffle.get()),bg=COLORS['surface'],fg=COLORS['text'],selectcolor=COLORS['bg']).pack(anchor='w')
        line=tk.Frame(b,bg=COLORS['surface']);line.pack(fill='x',pady=7)
        self.query=tk.StringVar();tk.Entry(line,textvariable=self.query).pack(side='left',fill='x',expand=True)
        Button(line,text='Pedir música',command=self.request).pack(side='left',padx=4)
        Button(line,text='Adicionar playlist',command=self.playlist).pack(side='left')
        book=ttk.Notebook(b);book.pack(fill='x',pady=8);self.tables={}
        for key,label in [('fila_sr','Pedidos SR'),('fila_voz','Pedidos por voz'),('fila_pl','Playlist'),('historico','Histórico')]:
            frame=tk.Frame(book,bg=COLORS['surface']);book.add(frame,text=label)
            table=ttk.Treeview(frame,columns=('user','titulo','estado'),show='headings',height=6)
            for col,txt,w in [('user','Usuário',110),('titulo','Música',430),('estado','Estado / gênero',140)]:table.heading(col,text=txt);table.column(col,width=w,minwidth=70)
            table.pack(fill='x');self.tables[key]=table
        self.stats=tk.StringVar();tk.Label(b,textvariable=self.stats,bg=COLORS['surface'],fg=COLORS['muted'],wraplength=700,justify='left').pack(anchor='w')
        Button(b,text='Limpar fila SR',command=lambda:self.command('limpar')).pack(anchor='w',pady=5)
        tk.Label(b,textvariable=self.status,bg=COLORS['surface'],fg=COLORS['danger'],wraplength=700,justify='left').pack(anchor='w')
    def message(self,text):self.status.set(text)
    def command(self,action,*args):
        try:self.message(control.comando(action,*args))
        except Exception as exc:self.message(str(exc)[:200])
    def request(self):
        from sr_player import enfileirar
        q=self.query.get().strip()
        if q:self.message(enfileirar('Hades',q));self.query.set('')
    def playlist(self):
        q=self.query.get().strip()
        if q:self.command('adicionar_playlist',q,'Hades')
    def refresh(self):
        st=control.estado()
        self.title.set((st.get('titulo') or 'Sem música no SR')+'\n'+(st.get('tempo') or '--:--')+' · '+('pausado' if st.get('paused') else 'tocando' if st.get('tocando') else 'parado')+' · pedido por '+(st.get('user') or '—'))
        self.progress['value']=min(100,100*float(st.get('elapsed') or 0)/float(st.get('dur'))) if st.get('dur') else 0
        signature=json.dumps({key:st.get(key,[]) for key in self.tables},sort_keys=True)
        if signature!=self.signature:
            self.signature=signature
            for key,table in self.tables.items():
                selected=table.selection();table.delete(*table.get_children())
                for i,row in enumerate(st.get(key,[])):table.insert('','end',iid=str(i),values=(row.get('user',''),row.get('titulo',''),row.get('status') or row.get('genero','')))
                for iid in selected:
                    if table.exists(iid):table.selection_add(iid)
        stats=st.get('stats') or {};self.stats.set(f"{stats.get('total',0)} no histórico · repetição: {st.get('repeat','off')} · shuffle: {'ativo' if st.get('shuffle_pl') else 'desligado'} · saída SR: {st.get('saida') or 'Padrão do Windows'}")
        if st.get('erro'):self.status.set(st['erro'])
