import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

DATA = tempfile.TemporaryDirectory()
os.environ['KAIA_MEDIA_DATA'] = DATA.name
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'vendor' / 'sr'))
import sr_player
from playlist_snapshot import save_playlist, restore_playlist

class CapacityTests(unittest.TestCase):
    def player(self, limit=0):
        p=sr_player.SongRequest.__new__(sr_player.SongRequest)
        p.fila=[];p.atual=None;p._lock=threading.RLock();p.playlist_limit=limit;p.request_limit=80;p.erro='';p.shuffle_pl=False
        return p

    def import_rows(self, limit, total):
        p=self.player(limit)
        output='\n'.join(f'v{i:010d}\tTrack {i}\t3600' for i in range(total)).encode()
        with patch.object(sr_player,'_yt_cmd',return_value=['fixture']), patch.object(sr_player,'_run',return_value=SimpleNamespace(stdout=output,stderr=b'',returncode=0)), patch.object(p,'_prefetch_playlist'):
            result=p.adicionar_playlist('https://www.youtube.com/playlist?list=fixture')
        return p,result

    def test_9999_and_unlimited_preserve_long_tracks(self):
        p,_=self.import_rows(9999,10050)
        self.assertEqual(len(p.fila),9999)
        self.assertEqual(p.fila[-1]['titulo'],'Track 9998')
        p,result=self.import_rows(0,10050)
        self.assertEqual(len(p.fila),10050)
        self.assertNotIn('puladas',result)
        self.assertTrue(all(x['dur']==3600 for x in p.fila))
        self.assertNotEqual(p.erro,result)

    def test_settings_and_prefetch_are_not_thread_per_track(self):
        p=self.player();p.set_limits(80,9999);self.assertEqual(p.playlist_limit,9999)
        p.set_limits(80,0);self.assertEqual(p.playlist_limit,0)
        p.fila=[{'fonte':'playlist','status':'fila'} for _ in range(9999)]
        with patch.object(sr_player.threading,'Thread') as worker:
            p._prefetch_playlist();p._prefetch_playlist()
            self.assertEqual(worker.call_count,3)
        self.assertEqual(sum(bool(x.get('_scheduled')) for x in p.fila),3)

    def test_waiting_playlist_does_not_expire_after_100_seconds(self):
        p=self.player()
        p.fila=[{'fonte':'playlist','status':'fila','t0':1,'titulo':str(i)} for i in range(9999)]
        with patch.object(sr_player.time,'time',return_value=100000):
            self.assertIsNone(p._pegar_proximo())
        self.assertEqual(len(p.fila),9999)
        self.assertTrue(all(x['status']=='fila' for x in p.fila))

    def test_save_restore_over_old_1000_cap(self):
        p,_=self.import_rows(0,10050)
        with tempfile.TemporaryDirectory() as folder:
            snapshot=Path(folder)/'saved.json'
            save_playlist(p,snapshot)
            other=self.player()
            with patch.object(other,'_prefetch_playlist') as prefetch:
                restore_playlist(other,snapshot)
                prefetch.assert_called_once()
            self.assertEqual(len(other.fila),10050)
            self.assertEqual(other.fila[-1]['titulo'],'Track 10049')

if __name__=='__main__':unittest.main()

