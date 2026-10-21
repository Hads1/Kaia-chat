"""Routing regression tests: no real devices, music, or external requests."""
import sys,types,unittest,threading,tempfile
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'vendor/sr'))
import sr_player,audio_out

class AudioRouting(unittest.TestCase):
    def setUp(self):
        folder=tempfile.TemporaryDirectory();self.addCleanup(folder.cleanup)
        for target,attribute,value in [(sr_player,'PASTA',Path(folder.name)),(audio_out,'PASTA',Path(folder.name)),(audio_out,'LAST_ERR','')]:
            context=patch.object(target,attribute,value);context.start();self.addCleanup(context.stop)
        context=patch.dict(sr_player._STREAM_STATUS,{'erro':'','pausa_ate':0});context.start();self.addCleanup(context.stop)
    def player(self):
        player=object.__new__(sr_player.SongRequest)
        player._kill=Mock();player.atual=None;player.mutado=False
        player.volume=37;player.saida='Saida exclusiva SR';player.proc=None
        player._spawn_ffplay=Mock()
        return player

    def test_stream_uses_selected_sr_output_and_volume_even_on_retry(self):
        backend=types.ModuleType('audio_out');backend.spawn=Mock(return_value=object());backend.ler_erro=lambda:''
        player=self.player()
        with patch.dict(sys.modules,{'audio_out':backend}):
            player._spawn('https://r.googlevideo.com/audio',forcar_padrao=True)
        backend.spawn.assert_called_once_with('https://r.googlevideo.com/audio',saida='Saida exclusiva SR',volume=37,ss=0.0,papel='sr')
        player._spawn_ffplay.assert_not_called()

    def test_failure_never_switches_to_system_default(self):
        backend=types.ModuleType('audio_out');backend.spawn=Mock(return_value=None);backend.ler_erro=lambda:'Saida indisponivel'
        player=self.player()
        with patch.dict(sys.modules,{'audio_out':backend}):player._spawn('https://r.googlevideo.com/audio')
        self.assertIsNone(player.proc);self.assertIn('indisponivel',player.erro)
        self.assertEqual(backend.spawn.call_count,1);player._spawn_ffplay.assert_not_called()

    def test_output_player_accepts_stream_but_never_falls_back(self):
        with patch.object(audio_out,'achar_saida',return_value='SR'),patch.object(audio_out,'idx_saida',return_value=5),patch.object(audio_out,'_play_explicit',return_value=None) as explicit,patch.object(audio_out,'_ffplay') as default:
            self.assertIsNone(audio_out.spawn('https://r.googlevideo.com/audio',saida='SR',volume=29,papel='sr'))
            explicit.assert_called_once();default.assert_not_called()

    def test_unavailable_youtube_audio_is_not_marked_as_playable(self):
        player=self.player();item={'q':'musica','titulo':'Titulo','fonte':'sr'}
        with patch.object(sr_player,'_yt_cmd',return_value=['fixture']),patch.object(sr_player,'_buscar_youtube',return_value={'id':'fixture1234','titulo':'Titulo','dur':244}),patch.object(sr_player,'_url_stream',return_value=''),patch.object(sr_player,'_stream_erro',return_value='Login necessário'):
            player._resolver_inner(item)
        self.assertEqual(item['status'],'erro');self.assertEqual(item['stream'],'');self.assertEqual(item['arquivo'],'');self.assertIn('Login',player.erro)
        player.fila=[item];player.shuffle_pl=False
        self.assertIsNone(player._pegar_proximo());self.assertEqual(len(player.fila),1)

    def test_retry_keeps_the_failed_request_and_resolves_it_again(self):
        player=self.player();player._lock=threading.RLock();player.fila=[{'status':'erro','titulo':'Titulo','stream':'','arquivo':''}]
        with patch.object(sr_player.threading,'Thread') as worker,patch.dict(sr_player._STREAM_STATUS,{'erro':'YouTube exige login','pausa_ate':9999999999}):
            player.retry();self.assertEqual(player.fila[0]['status'],'fila');worker.return_value.start.assert_called_once();self.assertEqual(sr_player._STREAM_STATUS['pausa_ate'],0)

    def test_reader_reports_audio_process_failure(self):
        proc=Mock();proc.poll.return_value=1
        with patch.object(audio_out,'spawn',return_value=proc):
            self.assertEqual(audio_out.tocar_bloqueado('fixture.wav',saida='Headset',papel='leitura'),'erro')

    def interrupted_player(self,position=85,duration=161,code=0):
        player=self.player();player._lock=threading.RLock();player._stop=False;player.paused=False
        player.atual={'id':'fixture1234','titulo':'Faixa','dur':duration,'stream':'https://old.googlevideo.com/audio'}
        player.proc=Mock();player.proc.played_seconds=position;player.proc.poll.return_value=code
        player.acc=0;player.t0=0;player._spawn=Mock(side_effect=lambda *args,**kwargs:setattr(player,'proc',Mock()));player.erro=''
        def kill():player.proc=None
        player._kill.side_effect=kill
        return player

    def test_early_clean_exit_renews_stream_and_resumes_same_position(self):
        player=self.interrupted_player();item=player.atual
        def thread(target,**kw):return types.SimpleNamespace(start=target)
        with patch.object(sr_player.threading,'Thread',side_effect=thread),patch.object(sr_player,'_url_stream',return_value='https://new.googlevideo.com/audio'):
            self.assertTrue(player._recover_interruption())
        self.assertIs(player.atual,item);player._spawn.assert_called_once_with('https://new.googlevideo.com/audio',ss=85)
        self.assertEqual(player.acc,85);self.assertEqual(item['_recoveries'],1)

    def test_natural_end_does_not_retry(self):
        player=self.interrupted_player(position=160)
        with patch.object(sr_player.threading,'Thread') as worker:
            self.assertFalse(player._recover_interruption());worker.assert_not_called()

    def test_stalled_live_worker_renews_at_last_played_sample(self):
        player=self.interrupted_player(position=12,code=None)
        def thread(target,**kw):return types.SimpleNamespace(start=target)
        with patch.object(sr_player.threading,'Thread',side_effect=thread),patch.object(sr_player,'_url_stream',return_value='https://fresh.googlevideo.com/audio'):
            self.assertTrue(player._recover_interruption(stalled=True))
        player._spawn.assert_called_once_with('https://fresh.googlevideo.com/audio',ss=12)
        self.assertFalse(player.paused)

    def test_default_player_disables_video_and_limits_network_wait(self):
        with patch.object(audio_out,'player_exe',return_value='ffplay.exe'),patch.object(audio_out,'_popen') as launch:
            audio_out._ffplay('https://fixture.invalid/audio',50,0,Path('unused.err'))
        args=launch.call_args.args[0]
        self.assertIn('-vn',args);self.assertIn('-nodisp',args)
        self.assertEqual(args[args.index('-rw_timeout')+1],'15000000')

    def test_volume_and_mute_do_not_restart_or_seek_playback(self):
        p=self.interrupted_player(position=12);original=p.proc;p.volume=80;p.mutado=False
        p.set_volume(27);original.set_volume.assert_called_with(27)
        self.assertIs(p.proc,original);self.assertEqual(p.acc,0)
        p.mute_toggle();original.set_volume.assert_called_with(0)
        p.mute_toggle();original.set_volume.assert_called_with(27)
        p._spawn.assert_not_called();p._kill.assert_not_called()

    def test_default_sr_uses_controllable_pcm_output(self):
        with patch.object(audio_out,'achar_saida',return_value=''),patch.object(audio_out,'_play_explicit',return_value='pcm') as pcm,patch.object(audio_out,'_ffplay') as fallback:
            self.assertEqual(audio_out.spawn('https://fixture.invalid/audio',volume=20,papel='sr'),'pcm')
        self.assertIsNone(pcm.call_args.args[1]);fallback.assert_not_called()

    def test_repeated_failure_logs_and_releases_queue(self):
        player=self.interrupted_player();player.atual['_recoveries']=3
        self.assertTrue(player._recover_interruption())
        self.assertFalse(player.paused);self.assertEqual(player.acc,0);self.assertIsNone(player.atual)
        player._spawn.assert_not_called()

    def test_stop_while_resolving_prevents_unwanted_restart(self):
        player=self.interrupted_player()
        def stopped(_):player.atual=None;return 'https://new.googlevideo.com/audio'
        def thread(target,**kw):return types.SimpleNamespace(start=target)
        with patch.object(sr_player.threading,'Thread',side_effect=thread),patch.object(sr_player,'_url_stream',side_effect=stopped):
            self.assertTrue(player._recover_interruption())
        player._spawn.assert_not_called()

    def test_elapsed_counts_played_samples_instead_of_network_wait(self):
        player=self.interrupted_player(position=12);player.acc=30;player.t0=sr_player.time.time()-90
        self.assertEqual(player._elapsed(),42)

    def test_audio_worker_errors_are_not_successful_completion(self):
        worker=Mock();worker.is_alive.return_value=False
        proc=audio_out.PlayerProc(thread=worker,result=[1],progress=[3.5])
        self.assertEqual(proc.poll(),1);self.assertEqual(proc.played_seconds,3.5)

    def test_separate_queues_reorder_and_remove_without_crossing_groups(self):
        p=self.player();p._lock=threading.RLock();p.shuffle_pl=True
        p.fila=[{'key':'p1','fonte':'playlist'},{'key':'r1','fonte':'sr'},{'key':'p2','fonte':'playlist'},{'key':'r2','fonte':'sr'}]
        p.edit_queue('sr','move','r2',0)
        self.assertEqual([x['key'] for x in p.fila],['p1','r2','p2','r1']);self.assertFalse(p.shuffle_pl)
        p.edit_queue('sr','remove','r1');p.edit_queue('playlist','clear')
        self.assertEqual([x['key'] for x in p.fila],['r2'])

    def test_request_is_next_even_when_background_playlist_came_first(self):
        p=self.player();p.shuffle_pl=False
        p.fila=[{'key':'p1','fonte':'playlist','status':'ok','arquivo':'a'},{'key':'r1','fonte':'sr','status':'ok','arquivo':'b'}]
        self.assertEqual(p._pegar_proximo()['key'],'r1')
        self.assertEqual(p._pegar_proximo()['key'],'p1')

    def test_limits_are_independent_and_preserve_already_accepted_tracks(self):
        p=self.player();p.fila=[{'key':'keep'}];p.set_limits(3,12)
        self.assertEqual(p.request_limit,3);self.assertEqual(p.playlist_limit,12);self.assertEqual(len(p.fila),1)

    def test_request_resolution_does_not_wait_for_background_playlist(self):
        p=self.player();p._lock=threading.RLock();p._dl_sema=threading.Semaphore(0);p._request_sema=threading.Semaphore(1)
        item={'fonte':'sr','key':'request'};p.fila=[item];p._resolver_inner=Mock()
        done=threading.Event()
        worker=threading.Thread(target=lambda:(p._resolver(item),done.set()),daemon=True);worker.start()
        self.assertTrue(done.wait(.5));p._resolver_inner.assert_called_once_with(item)

    def test_stop_holds_queue_until_explicit_play(self):
        p=self.player();p._lock=threading.RLock();p.fila=[{'status':'ok','fonte':'sr'}];p.paused=False;p.acc=4;p.t0=0
        p.stop();self.assertTrue(p.paused);self.assertEqual(len(p.fila),1)
        p.play_pause();self.assertFalse(p.paused)

if __name__=='__main__':unittest.main()
