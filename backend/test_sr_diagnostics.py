import sys,tempfile,threading,unittest,json,time
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'vendor/sr'))
import sr_player,audio_out
from sr_diagnostics import SRDiagnostics,safe_error,classify_error

class DiagnosticsTests(unittest.TestCase):
    def player(self):
        p=object.__new__(sr_player.SongRequest);p._lock=threading.RLock();p._kill=Mock();p.atual=None;p.fila=[];p.acc=0;p.paused=False;p.shuffle_pl=False
        return p
    def test_reasons_do_not_claim_generic_unavailability_is_deletion(self):
        self.assertEqual(classify_error('Video unavailable')['code'],'unavailable')
        self.assertEqual(classify_error('Video has been removed by the uploader')['code'],'removed')
        self.assertEqual(classify_error('Private video')['code'],'private')
        self.assertTrue(classify_error('HTTP 429 Too many requests')['pause'])
        self.assertNotIn('secret',safe_error('HTTP error 403 https://x.invalid/audio?token=secret'))
        self.assertNotIn('signature=',safe_error('.123&itag=18&signature=secret&ip=1.2.3.4'))
    def test_log_rotates_and_does_not_store_media_urls(self):
        with tempfile.TemporaryDirectory() as folder:
            log=SRDiagnostics(folder,max_bytes=80)
            log.record('pulada',{'id':'fixture','titulo':'Track','playlist_index':7},'https://x.invalid/?token=secret','network')
            log.record('tocando',{'id':'next','titulo':'Next'})
            self.assertTrue(log.path.with_suffix('.previous.jsonl').exists())
            self.assertNotIn('secret',log.path.with_suffix('.previous.jsonl').read_text())
            self.assertEqual(len(log.snapshot()['events']),2)
    def test_unavailable_track_is_skipped_and_next_track_remains(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(sr_player,'PASTA',Path(folder)):
            p=self.player();bad={'id':'bad','titulo':'Bad','fonte':'playlist','status':'stream'};good={'id':'good','titulo':'Good','fonte':'playlist','status':'ok','arquivo':'fixture'}
            p.atual=bad;p.fila=[good];p._playlist_failure(bad,'Video unavailable',current=True)
            self.assertIsNone(p.atual);self.assertFalse(p.paused);self.assertIs(p._pegar_proximo(),good)
            event=p._diagnostics().snapshot()['events'][-1]
            self.assertEqual(event['event'],'pulada');self.assertEqual(event['code'],'unavailable')
    def test_auth_failure_preserves_track_and_backs_off(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(sr_player,'PASTA',Path(folder)),patch.dict(sr_player._STREAM_STATUS,{'pausa_ate':0}):
            p=self.player();item={'id':'track','titulo':'Track','fonte':'playlist','status':'busca'};p.fila=[item]
            p._playlist_failure(item,'YouTube exige login')
            self.assertEqual(item['status'],'fila');self.assertEqual(len(p.fila),1)
            self.assertGreater(sr_player._STREAM_STATUS['pausa_ate'],time.time())
            self.assertEqual(p._diagnostics().snapshot()['events'][-1]['event'],'aguardando_servico')
    def test_failed_recovery_moves_to_next_playlist_track(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(sr_player,'PASTA',Path(folder)),patch.object(audio_out,'ler_erro',return_value='Server returned 403 Forbidden'):
            p=self.player();p._elapsed=lambda:85;p.proc=Mock();p.proc.poll.return_value=1
            p.atual={'id':'track','titulo':'Track','fonte':'playlist','dur':180,'_recoveries':3}
            self.assertTrue(p._recover_interruption());self.assertIsNone(p.atual);self.assertFalse(p.paused)
            self.assertIn('403',p._diagnostics().snapshot()['events'][-1]['reason'])
    def test_queue_cache_reuses_rows_until_a_track_changes(self):
        p=self.player();p.fila=[{'key':'x','titulo':'Title','fonte':'playlist','status':'fila'}]
        first=p._queue_data();revision=p._queue_revision
        self.assertIs(first,p._queue_data());self.assertEqual(revision,p._queue_revision)
        p.fila[0]['status']='ok';self.assertIsNot(first,p._queue_data());self.assertGreater(p._queue_revision,revision)
    def test_decoder_error_uses_sr_file_and_redacts_urls(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(audio_out,'PASTA',Path(folder)):
            (Path(folder)/'tmp_sr').mkdir();(Path(folder)/'tmp_sr/_player_sr.err').write_text('Server returned 403 Forbidden\nhttps://x.invalid?token=secret')
            reason=audio_out.ler_erro('sr');self.assertIn('403',reason);self.assertNotIn('secret',reason)

    def test_stuck_stream_request_does_not_block_playlist_forever(self):
        p=self.player()
        request={'id':'stuck','fonte':'sr','status':'stream','t0':time.time()-180}
        good={'id':'good','fonte':'playlist','status':'ok','arquivo':'fixture'}
        p.fila=[request,good]
        self.assertIs(p._pegar_proximo(),good)
        self.assertEqual(request['status'],'erro')
        self.assertIn(request,p.fila)

    def test_expired_link_is_renewed_instead_of_played(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(sr_player,'PASTA',Path(folder)):
            p=self.player();item={'id':'expired','fonte':'playlist','status':'ok','stream':'https://fixture.invalid/audio?expire=1'}
            p.fila=[item]
            self.assertIsNone(p._pegar_proximo())
            self.assertEqual(item['status'],'fila');self.assertEqual(item['stream'],'')
            self.assertEqual(p._diagnostics().snapshot()['events'][-1]['event'],'renovando_link')

    def test_private_video_with_sign_in_hint_does_not_pause_entire_playlist(self):
        from types import SimpleNamespace
        with patch.object(sr_player,'_yt_cmd',return_value=['fixture']),patch.object(sr_player,'_run',return_value=SimpleNamespace(returncode=1,stdout=b'',stderr=b'Private video. Sign in if you have access.')),patch.dict(sr_player._STREAM_STATUS,{'erro':'','pausa_ate':0}):
            self.assertEqual(sr_player._url_stream('fixture'),'')
            self.assertEqual(sr_player._STREAM_STATUS['pausa_ate'],0)
            self.assertEqual(classify_error(sr_player._stream_erro())['code'],'private')

    def test_background_order_waits_for_first_track(self):
        p=self.player();first={'id':'one','fonte':'playlist','status':'stream'}
        second={'id':'two','fonte':'playlist','status':'ok','arquivo':'fixture'}
        p.fila=[first,second]
        self.assertIsNone(p._pegar_proximo())
        first.update(status='ok',arquivo='fixture')
        self.assertIs(p._pegar_proximo(),first);self.assertIs(p._pegar_proximo(),second)

    def test_stalled_worker_is_detected_but_pause_is_not(self):
        p=self.player();p.proc=Mock();p.proc.played_seconds=12
        with patch.object(sr_player.time,'monotonic',side_effect=[0,24,26,27]):
            self.assertFalse(p._playback_stalled());self.assertFalse(p._playback_stalled())
            self.assertTrue(p._playback_stalled())
            p.proc.played_seconds=13;self.assertFalse(p._playback_stalled())
        p.paused=True;self.assertFalse(p._playback_stalled())

if __name__=='__main__':unittest.main()
