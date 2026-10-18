import unittest,tempfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
from sr_audio_visual import Meter
from sr_overlay_layout import validar

class RgbTests(unittest.TestCase):
    def test_energia_real_e_picos(self):
        meter=Meter();silent=meter.sample(np.zeros(2048),now=1)
        self.assertEqual(silent['energy'],0);self.assertFalse(silent['beat'])
        loud=meter.sample(np.ones(2048)*.2,now=2)
        self.assertGreater(loud['energy'],.8);self.assertTrue(loud['beat']);self.assertEqual(loud['source'],'sr_pcm')
    def test_limites_visuais_e_layout_antigo(self):
        self.assertEqual(validar({})['rgbMode'],'off')
        cfg=validar({'rgbMode':'audio','rgbSpeed':999,'rgbStrength':999})
        self.assertEqual(cfg['rgbSpeed'],60);self.assertEqual(cfg['rgbStrength'],100)
    def test_falha_visual_nao_interrompe_audio(self):
        meter=Meter()
        with patch.object(Path,'write_text',side_effect=OSError('Bloqueio')):meter.publish(np.ones(2048)*.1)

if __name__=='__main__':unittest.main()
