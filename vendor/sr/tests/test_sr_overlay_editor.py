import unittest,tempfile,json,threading
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import requests
import sr_overlay_layout as layout
from overlay_server import Handler

class EditorTests(unittest.TestCase):
    def test_validacao_e_backup_preservam_layout(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(layout,'FILE',Path(folder)/'layout.json'):
            layout.salvar(layout.DEFAULT)
            result=layout.salvar(dict(layout.DEFAULT,width=99999,theme='retro',customCSS='#tit {font-weight:400}'))
            self.assertEqual(result['width'],1600);self.assertEqual(result['theme'],'retro')
            self.assertTrue(layout.FILE.with_suffix('.backup.json').exists())
            with self.assertRaises(ValueError):layout.salvar({'accent':'javascript:bad'})

    def test_api_somente_origem_local_e_overlay_original_inalterado(self):
        original=Path('avatar/sr.html').read_bytes()
        with tempfile.TemporaryDirectory() as folder,patch.object(layout,'FILE',Path(folder)/'layout.json'):
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{server.server_port}'
            try:
                s=requests.Session();s.trust_env=False
                self.assertEqual(s.post(base+'/api/sr-layout',json=layout.DEFAULT).status_code,403)
                self.assertEqual(s.post(base+'/api/sr-layout',headers={'Origin':'https://example.com','X-Kaia-Editor':'1'},json=layout.DEFAULT).status_code,403)
                r=s.post(base+'/api/sr-layout',headers={'Origin':base,'X-Kaia-Editor':'1'},json=dict(layout.DEFAULT,theme='minimal'))
                self.assertEqual(r.status_code,200);self.assertEqual(r.json()['theme'],'minimal')
                self.assertEqual(s.get(base+'/sr-custom.html').status_code,200)
                self.assertEqual(s.get(base+'/sr-editor.html').status_code,200)
            finally:server.shutdown();server.server_close()
        self.assertEqual(Path('avatar/sr.html').read_bytes(),original)

if __name__=='__main__':unittest.main()
