"""Tema e componentes leves da interface oficial Kaia Evolution."""
import tkinter as tk
from tkinter import ttk
COLORS=dict(bg='#0b101b',surface='#121b2b',raised='#1b2940',text='#e6edf8',muted='#94a5bd',accent='#bfa0ff',cyan='#65ddd0',danger='#ff8295')
SPACING=16
RADIUS=14
FONT=('Segoe UI',10)

def theme(root):
    s=ttk.Style(root); s.theme_use('clam')
    s.configure('.',background=COLORS['surface'],foreground=COLORS['text'],font=FONT)
    s.configure('TFrame',background=COLORS['surface'])
    s.configure('TLabel',background=COLORS['surface'],foreground=COLORS['text'])
    s.configure('TButton',padding=(14,9),borderwidth=0,background=COLORS['raised'])
    s.map('TButton',background=[('active','#30415d'),('pressed','#40305c')])
    s.configure('TEntry',fieldbackground=COLORS['raised'],foreground=COLORS['text'],padding=8)
    s.configure('TCombobox',fieldbackground=COLORS['raised'],foreground=COLORS['text'],padding=6)
    s.map('TCombobox',fieldbackground=[('readonly',COLORS['raised'])],foreground=[('readonly',COLORS['text'])])
    s.configure('Horizontal.TScale',background=COLORS['surface'],troughcolor=COLORS['raised'],borderwidth=0)
    s.configure('Vertical.TScrollbar',background=COLORS['raised'],troughcolor=COLORS['bg'],arrowcolor=COLORS['muted'],borderwidth=0)
    s.configure('Treeview',background=COLORS['bg'],fieldbackground=COLORS['bg'],foreground=COLORS['text'],rowheight=32)
    s.configure('Treeview.Heading',background=COLORS['raised'],padding=8)

class Button(tk.Canvas):
    """API do Button Tk preservada: configure/cget/invoke, comandos e estados."""
    def __init__(self,master,**kw):
        self.opts=dict(text='',bg=COLORS['raised'],fg=COLORS['text'],state='normal',font=FONT,padx=12,pady=8,width=0)
        self.opts.update(kw); self.command=self.opts.get('command'); self.var=self.opts.get('textvariable'); self.hover=False; self.down=False
        try: background=master.cget('bg')
        except tk.TclError: background=COLORS['surface']
        super().__init__(master,bg=background,highlightthickness=0,takefocus=1,bd=0)
        self.bind('<Configure>',lambda e:self.draw()); self.bind('<Enter>',lambda e:self._state(hover=True)); self.bind('<Leave>',lambda e:self._state(hover=False,down=False))
        self.bind('<ButtonPress-1>',lambda e:self._state(down=True)); self.bind('<ButtonRelease-1>',self._release)
        self.bind('<Return>',self._keyboard); self.bind('<space>',self._keyboard)
        self.bind('<FocusIn>',lambda e:self.draw()); self.bind('<FocusOut>',lambda e:self.draw())
        if self.var: self.var.trace_add('write',lambda *_:self.draw())
        self.draw()
    def _state(self,**kw):
        self.__dict__.update(kw); self.draw()
    def _release(self,event):
        self.down=False; self.draw()
        if 0<=event.x<self.winfo_width() and 0<=event.y<self.winfo_height(): self.invoke()
    def _keyboard(self,event):
        self.invoke()
        return 'break'
    def invoke(self):
        if self.opts['state']!='disabled' and self.command: return self.command()
    def configure(self,cnf=None,**kw):
        if isinstance(cnf,dict): kw.update(cnf)
        if not kw: return self.opts
        self.opts.update(kw)
        if 'command' in kw:self.command=kw['command']
        self.draw()
    config=configure
    def cget(self,key):
        return self.opts[key] if key in self.opts else super().cget(key)
    def __getitem__(self,key):return self.cget(key)
    def __setitem__(self,key,value):self.configure(**{key:value})
    def draw(self):
        from tkinter import font
        text=self.var.get() if self.var else self.opts['text']; f=font.Font(font=self.opts['font'])
        w=max(38,f.measure(str(text))+int(self.opts['padx'])*2,int(self.opts.get('width',0))*f.measure('0'))
        h=max(34,f.metrics('linespace')+int(self.opts['pady'])*2)
        super().configure(width=w,height=h)
        w=max(w,self.winfo_width()); h=max(h,self.winfo_height()); self.delete('all'); r=min(RADIUS,h//2)
        disabled=self.opts['state']=='disabled'; bg=self.opts['bg']
        if self.hover and not disabled:bg=COLORS['raised'] if self.down else '#30415d'
        pts=[r,1,w-r,1,w-1,1,w-1,r,w-1,h-r,w-1,h-1,w-r,h-1,r,h-1,1,h-1,1,h-r,1,r,1,1]
        self.create_polygon(pts,smooth=True,fill=bg,outline=COLORS['accent'] if self.focus_get()==self else bg,width=2)
        self.create_text(w/2,h/2,text=text,font=self.opts['font'],fill=COLORS['muted'] if disabled else self.opts['fg'])

class ScrollPanel(tk.Frame):
    def __init__(self,master):
        super().__init__(master,bg=COLORS['bg'])
        self.canvas=tk.Canvas(self,bg=COLORS['bg'],highlightthickness=0); bar=ttk.Scrollbar(self,orient='vertical',command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=bar.set); bar.pack(side='right',fill='y'); self.canvas.pack(fill='both',expand=True)
        self.body=tk.Frame(self.canvas,bg=COLORS['bg']); self.item=self.canvas.create_window(0,0,window=self.body,anchor='nw')
        self.body.bind('<Configure>',lambda e:self.canvas.configure(scrollregion=self.canvas.bbox('all')))
        self.canvas.bind('<Configure>',lambda e:self.canvas.itemconfigure(self.item,width=e.width))
        self.bind_all('<MouseWheel>',self.wheel,add='+')
    def wheel(self,event):
        widget=event.widget
        while widget:
            if widget==self:self.canvas.yview_scroll(-int(event.delta/120),'units'); break
            widget=getattr(widget,'master',None)

class Card(tk.Frame):
    def __init__(self,master,**kw):
        super().__init__(master,bg=master.cget('bg'))
        self.canvas=tk.Canvas(self,bg=master.cget('bg'),highlightthickness=0)
        self.canvas.place(relwidth=1,relheight=1)
        self.body=tk.Frame(self,bg=COLORS['surface'],padx=12,pady=12)
        self.body.pack(fill='both',expand=True,padx=12,pady=12)
        self.bind('<Configure>',self.draw)
    def draw(self,event):
        w,h=event.width,event.height;r=RADIUS;self.canvas.delete('all')
        self.canvas.create_polygon([r,1,w-r,1,w-1,1,w-1,r,w-1,h-r,w-1,h-1,w-r,h-1,r,h-1,1,h-1,1,h-r,1,r,1,1],smooth=True,fill=COLORS['surface'],outline=COLORS['surface'])

class FlowFrame(tk.Frame):
    """Quebra filas antigas de botões preservando os próprios widgets."""
    def __init__(self,master,**kw):
        super().__init__(master,**kw); self.bind('<Configure>',self.layout); self.pending=False
    def layout(self,event=None):
        if self.pending:return
        self.pending=True; self.after_idle(self._layout)
    def _layout(self):
        self.pending=False; width=max(300,self.winfo_width()); x=y=10; rh=0
        for child in self.winfo_children():
            if child.winfo_manager()=='pack':child.pack_forget()
            w=child.winfo_reqwidth(); h=child.winfo_reqheight()
            if x+w>width-10 and x>10:y+=rh+8; x=10; rh=0
            child.place(x=x,y=y,width=min(w,width-20),height=h); x+=w+8; rh=max(rh,h)
        self.configure(height=y+rh+10)
