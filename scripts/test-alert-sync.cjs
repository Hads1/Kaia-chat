const { app } = require('electron');
const { AlertSources } = require('../alerts');
const http = require('node:http');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const wave = Buffer.alloc(44 + 48000 * 2 * 2);
wave.write('RIFF');
wave.writeUInt32LE(wave.length - 8, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(48000, 24);
wave.writeUInt32LE(96000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(wave.length - 44, 40);
let monitor, server, outer;
const events = [];
let started = 0;
const fixture = `<div id="parent" style="opacity:0"><div id="alert-text"></div></div><audio id="sound" src="/sound.wav"></audio><script>
setTimeout(()=>{document.querySelector('#alert-text').textContent='Pessoa de teste seguiu o canal';document.querySelector('#parent').style.opacity=1;document.querySelector('audio').play();},500);
setTimeout(()=>document.querySelector('#parent').style.opacity=0,1500);
</script>`;
app
  .whenReady()
  .then(async () => {
    server = http.createServer((req, res) => {
      res.setHeader(
        'Content-Type',
        req.url === '/sound.wav' ? 'audio/wav' : 'text/html',
      );
      res.end(req.url === '/sound.wav' ? wave : fixture);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    outer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<iframe allow="autoplay" src="http://127.0.0.1:${server.address().port}/"></iframe>`,
      );
    });
    await new Promise((r) => outer.listen(0, '127.0.0.1', r));
    started = Date.now();
    monitor = new AlertSources({
      status: () => {},
      event: (value) => {
        events.push({ ...value, elapsed: Date.now() - started });
      },
    });
    monitor.configure([
      {
        name: 'Fixture',
        provider: 'streamlabs',
        url: `http://127.0.0.1:${outer.address().port}/`,
        enabled: true,
        durationSeconds: 0,
      },
    ]);
    setTimeout(() => {
      try {
        if (events.length !== 1 || events[0].elapsed < 2400)
          throw Error(JSON.stringify(events));
        console.log(JSON.stringify({ passed: true, events }));
      } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
      } finally {
        monitor.close();
        server.close();
        outer.close();
        app.exit(process.exitCode || 0);
      }
    }, 4500);
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
