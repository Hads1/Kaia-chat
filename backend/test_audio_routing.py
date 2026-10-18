"""Routing regression tests: no real devices, music, or external requests."""
import sys,types,unittest,threading
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'vendor/sr'))
import sr_player,audio_out

class AudioRouting(unittest.TestCase):
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

if __name__=='__main__':unittest.main()
