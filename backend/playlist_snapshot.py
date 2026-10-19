"""Local playlist snapshots contain metadata only, never downloaded audio."""
import json
import os
import threading
import time
import uuid
from pathlib import Path


def save_playlist(player, destination):
    with player._lock:
        items = ([player.atual] if player.atual and player._fonte_de(player.atual) == 'playlist' else []) + [x for x in player.fila if player._fonte_de(x) == 'playlist']
        rows = [{k: x.get(k) for k in ('q', 'id', 'titulo', 'dur', 'user')} for x in items]
    if not rows:
        raise ValueError('A playlist está vazia. A última playlist salva foi preservada.')
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps({'version': 1, 'tracks': rows}, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, target)
    return 'Playlist salva.'


def restore_playlist(player, destination):
    target = Path(destination)
    if not target.exists():
        raise ValueError('Nenhuma playlist salva neste computador.')
    data = json.loads(target.read_text(encoding='utf-8'))
    rows = data.get('tracks')
    if data.get('version') != 1 or not isinstance(rows, list) or not rows or len(rows) > 1000:
        raise ValueError('Playlist salva inválida.')
    items = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('q'), str) or not row['q'].strip() or len(row['q']) > 500:
            raise ValueError('Playlist salva inválida.')
        items.append({
            'key': uuid.uuid4().hex, 'q': row['q'], 'id': str(row.get('id') or ''),
            'titulo': str(row.get('titulo') or row['q']), 'dur': float(row.get('dur') or 0),
            'user': str(row.get('user') or 'Playlist'), 'fonte': 'playlist',
            'arquivo': '', 'status': 'fila', 't0': time.time(),
        })
    with player._lock:
        current = player.atual if player.atual and player._fonte_de(player.atual) == 'playlist' else None
        if current:
            items = [x for x in items if x['q'] != current.get('q')]
        if len(items) > player.playlist_limit:
            raise ValueError('A playlist salva ultrapassa o limite atual. Aumente o limite antes de recuperar.')
        player.fila = [x for x in player.fila if player._fonte_de(x) != 'playlist'] + items
        player.shuffle_pl = False
    for item in items:
        threading.Thread(target=player._resolver, args=(item,), daemon=True).start()
    return 'Playlist recuperada.'
