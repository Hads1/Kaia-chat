import unittest,queue,sys,tempfile
from pathlib import Path
from unittest.mock import patch,Mock
from leitor_chat_app import Leitor

class LeitorTests(unittest.TestCase):
 def test_recebe_exibe_e_enfileira_sem_interpretar(self):
  callback=Mock();l=Leitor({'ignorar_comandos':True},callback)
  l.receber('viewer','Kaia, como está o seu dia?',{'plataforma':'kick'})
  callback.assert_called_once();self.assertEqual(l.queue.get_nowait()[1],'Kaia, como está o seu dia?')
  self.assertNotIn('brain',sys.modules);self.assertFalse(hasattr(l,'interpretar'))
 def test_comandos_exibidos_sem_fala(self):
  callback=Mock();l=Leitor({'ignorar_comandos':True},callback);l.receber('viewer','!sr teste')
  callback.assert_called_once();self.assertTrue(l.queue.empty())
 def test_usuario_ignorado_nao_vai_ao_audio(self):
  l=Leitor({'ignorados':['Viewer']});l.receber('viewer','Oi');self.assertTrue(l.queue.empty())
 def test_audio_usa_somente_rota_leitura(self):
  with tempfile.TemporaryDirectory() as folder,patch('leitor_chat_app.BASE',Path(folder)):
   l=Leitor({'saida':'Headset','intervalo_segundos':0});l.queue.put(('viewer','Oi'))
   l.sintetizar=lambda text,path:path.write_bytes(b'audio')
   def play(*args,**kwargs):self.assertEqual(kwargs['papel'],'leitura');self.assertEqual(kwargs['saida'],'Headset');l.stop.set();return 'fim'
   with patch('audio_out.tocar_bloqueado',side_effect=play):l.worker()
   self.assertFalse(list((Path(folder)/'tmp_leitura').iterdir()))
if __name__=='__main__':unittest.main()
