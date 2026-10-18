"""Evita reconstruir listas sem mudanças, preservando seleção e posição."""
def preencher(box,rows):
    rows=tuple(rows)
    if getattr(box,'_sr_rows',None)==rows:return False
    selected=box.curselection();scroll=box.yview()[0] if box.size() else 0
    box.delete(0,'end')
    for row in rows:box.insert('end',row)
    for i in selected:
        if i<len(rows):box.selection_set(i)
    box.yview_moveto(scroll);box._sr_rows=rows
    return True
