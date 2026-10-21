import tempfile
import threading
import unittest
from pathlib import Path
from playlist_snapshot import save_playlist, restore_playlist


def track(name, source='playlist'):
    return {'q': 'https://www.youtube.com/watch?v='+name, 'id':name, 'titulo':name, 'fonte':source, 'dur':10, 'arquivo':'private/audio.mp3', 'status':'ok'}


class Player:
    def __init__(self):
        self._lock=threading.RLock()
        self.atual=None
        self.fila=[]
        self.playlist_limit=60
        self.shuffle_pl=True
    def _fonte_de(self, item): return item['fonte']
    def _resolver(self, item): pass


class PlaylistTests(unittest.TestCase):
    def test_round_trip_order_current_and_requests(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'saved-playlist.json'
            p=Player();p.atual=track('A');p.fila=[track('X','sr'),track('B'),track('C')]
            save_playlist(p,target)
            self.assertNotIn('private/audio',target.read_text())
            restored=Player();restored.atual=track('live','sr');request=track('request','sr');restored.fila=[track('old'),request]
            restore_playlist(restored,target)
            self.assertEqual(restored.atual['titulo'],'live')
            self.assertIs(restored.fila[0],request)
            self.assertEqual([x['titulo'] for x in restored.fila[1:]],['A','B','C'])
            self.assertTrue(all(x['arquivo']=='' and x['status']=='fila' for x in restored.fila[1:]))
            self.assertFalse(restored.shuffle_pl)
            restore_playlist(p,target)
            self.assertEqual([x['titulo'] for x in p.fila],['X','B','C'])

    def test_invalid_missing_empty_and_limit_preserve_data(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'saved-playlist.json';p=Player();p.fila=[track('A'),track('B')]
            with self.assertRaises(ValueError):restore_playlist(p,target)
            save_playlist(p,target);saved=target.read_bytes();p.fila=[]
            with self.assertRaises(ValueError):save_playlist(p,target)
            self.assertEqual(target.read_bytes(),saved)
            p.fila=[track('keep','sr')];p.playlist_limit=1
            restore_playlist(p,target)
            self.assertEqual([x['titulo'] for x in p.fila],['keep','A','B'])
            target.write_text('{"version":1,"tracks":[{}]}')
            with self.assertRaises(ValueError):restore_playlist(p,target)
            self.assertEqual(p.fila[0]['titulo'],'keep')


if __name__=='__main__':unittest.main()
