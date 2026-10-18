"""Progresso auxiliar: conflito temporário no Windows não cancela treinamento."""
import json, os, tempfile, time, logging
from pathlib import Path

def salvar(path, data):
    path=Path(path);temporary=None
    try:
        path.parent.mkdir(parents=True,exist_ok=True)
        # Cada atualização possui seu próprio arquivo; leitores só veem JSON completo.
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,prefix=path.stem+'_',suffix='.tmp',delete=False) as f:
            temporary=Path(f.name);json.dump(data,f,ensure_ascii=False);f.flush()
        for attempt in range(10):
            try:
                os.replace(temporary,path)
                return True
            except PermissionError:
                if attempt==9:raise
                time.sleep(min(.02*2**attempt,.2))
    except OSError as exc:
        logging.getLogger(__name__).warning('Progresso não atualizado; treino preservado: %s',exc)
        return False
    finally:
        if temporary is not None:
            try:temporary.unlink(missing_ok=True)
            except OSError:pass
